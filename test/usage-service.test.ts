import { describe, expect, test } from "bun:test";
import type { Credential, CredentialStore } from "@earendil-works/pi-ai";
import { UsageService } from "../src/infrastructure/usage-service";

function store(entries: Record<string, Credential | undefined>): CredentialStore {
	return {
		read: async provider => entries[provider],
		list: async () => [],
		modify: async () => undefined,
		delete: async () => undefined,
	};
}

const oauth = (access = "access-secret"): Credential => ({
	type: "oauth",
	access,
	refresh: "refresh-secret",
	expires: Date.now() + 60_000,
	metadataSecret: "must-not-leak",
});

function response(payload: unknown): Response {
	return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
}

const models = { getAuth: async () => ({}), checkAuth: async () => undefined };

describe("UsageService", () => {
	test("normalizes Codex and Claude adapter payloads without exposing credentials or raw responses", async () => {
		let requests = 0;
		const service = new UsageService(store({ "openai-codex": oauth(), anthropic: oauth() }), models, async url => {
			requests++;
			if (String(url).includes("wham")) {
				return response({ rate_limit: { primary_window: { used_percent: 20, reset_at: 1_800_000_000 }, secondary_window: { used_percent: 40, reset_after_seconds: 10 } } });
			}
			return response({ account_id: "account", email: "account@example.com", five_hour: { utilization: 25, resets_at: "2030-01-01T00:00:00Z" }, seven_day: { utilization: 50 } });
		});

		const snapshots = await service.refresh();
		expect(requests).toBe(2);
		expect(snapshots[0]).toMatchObject({
			provider: "openai-codex",
			state: "ready",
			limits: expect.arrayContaining([expect.objectContaining({ usedPercent: 20, remainingPercent: 80 })]),
		});
		expect(snapshots[1]).toMatchObject({
			provider: "anthropic",
			state: "ready",
			limits: expect.arrayContaining([expect.objectContaining({ usedPercent: 25, remainingPercent: 75 })]),
		});
		expect(JSON.stringify(snapshots)).not.toContain("secret");
		expect(JSON.stringify(snapshots)).not.toContain("account");
	});

	test("reports missing auth and Anthropic API keys without attempting quota requests", async () => {
		let fetches = 0;
		const service = new UsageService(store({ anthropic: { type: "api_key", key: "key-secret" } }), models, async () => {
			fetches++;
			return response({});
		});
		expect(await service.refresh()).toMatchObject([
			{ provider: "openai-codex", state: "auth-required", limits: [] },
			{ provider: "anthropic", state: "unsupported", limits: [] },
		]);
		expect(fetches).toBe(0);
	});

	test("coalesces concurrent refreshes and stops future polling", async () => {
		let fetches = 0;
		let release!: () => void;
		const pending = new Promise<void>(resolve => { release = resolve; });
		const service = new UsageService(store({ "openai-codex": oauth(), anthropic: undefined }), models, async () => {
			fetches++;
			await pending;
			return response({ rate_limit: { primary_window: { used_percent: 1 } } });
		});
		const first = service.refresh();
		const second = service.refresh();
		expect(first).toBe(second);
		release();
		await first;
		expect(fetches).toBe(1);

		let notifications = 0;
		const stop = service.startPolling(() => { notifications++; }, 5);
		stop();
		await new Promise(resolve => setTimeout(resolve, 20));
		expect(notifications).toBe(1);
		expect(fetches).toBe(2);
	});

	test("classifies Claude 429 responses and suppresses polling during backoff", async () => {
		let now = 1_000;
		let fetches = 0;
		const service = new UsageService(
			store({ anthropic: oauth() }),
			models,
			async () => {
				fetches++;
				return new Response("", { status: 429, headers: { "retry-after": "120" } });
			},
			() => now,
			async () => undefined,
		);

		const first = await service.refresh();
		expect(first[1]).toMatchObject({
			provider: "anthropic",
			state: "error",
			limits: [],
			issue: { kind: "rate-limit", retryAt: 121_000 },
		});
		expect(fetches).toBe(3);

		now += 30_000;
		const second = await service.refresh();
		expect(second[1]).toMatchObject({ state: "error", issue: { kind: "rate-limit" } });
		expect(fetches).toBe(3);
	});

	test("keeps the last successful Claude limits visibly stale during a 429", async () => {
		let now = 10_000;
		let limited = false;
		let fetches = 0;
		const service = new UsageService(
			store({ anthropic: oauth() }),
			models,
			async () => {
				fetches++;
				return limited
					? new Response("", { status: 429 })
					: response({ account_id: "account", email: "account@example.com", five_hour: { utilization: 25 }, seven_day: { utilization: 50 } });
			},
			() => now,
			async () => undefined,
		);

		const ready = await service.refresh();
		expect(ready[1]).toMatchObject({ state: "ready", fetchedAt: 10_000 });
		expect(ready[1].stale).toBeUndefined();
		now = 20_000;
		expect((await service.refresh())[1]).toMatchObject({ state: "ready", fetchedAt: 10_000 });
		expect(fetches).toBe(1);

		limited = true;
		now = 310_001;
		const stale = await service.refresh();
		expect(stale[1]).toMatchObject({
			state: "ready",
			stale: true,
			fetchedAt: 10_000,
			issue: { kind: "rate-limit" },
			limits: expect.arrayContaining([expect.objectContaining({ remainingPercent: 75 })]),
		});

		limited = false;
		now = 370_002;
		const recovered = await service.refresh();
		expect(recovered[1]).toMatchObject({ state: "ready", fetchedAt: 370_002 });
		expect(recovered[1].stale).toBeUndefined();
		expect(recovered[1].issue).toBeUndefined();
	});
});
