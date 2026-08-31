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
});
