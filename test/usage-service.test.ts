import { describe, expect, test } from "bun:test";
import type { Credential, CredentialStore } from "@earendil-works/pi-ai";
import { UsageService } from "../src/adapters/outbound/observability/usage-service";

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
const noAntigravity = { configured: async () => false };

describe("UsageService", () => {
	test("prefers the running native Codex account over the separate WWW credential store", async () => {
		let registryCalls = 0;
		const service = new UsageService(
			store({}),
			{
				getAuth: async () => { registryCalls++; throw new Error("WWW auth should not be consulted for native Codex"); },
				checkAuth: async () => undefined,
			},
			async () => { throw new Error("HTTP adapter should not be used for native Codex"); },
			Date.now,
			undefined,
			noAntigravity,
			async () => ({
				provider: "openai-codex",
				state: "ready",
				fetchedAt: 1,
				limits: [{ label: "Codex 7 Days", remainingPercent: 64, status: "ok" }],
			}),
		);

		const snapshots = await service.refresh();
		expect(snapshots[0]).toMatchObject({ provider: "openai-codex", state: "ready", limits: [{ remainingPercent: 64 }] });
		expect(registryCalls).toBe(3);
	});

	test("normalizes Codex and Claude adapter payloads without exposing credentials or raw responses", async () => {
		let requests = 0;
		const service = new UsageService(store({ "openai-codex": oauth(), anthropic: oauth() }), models, async url => {
			requests++;
			if (String(url).includes("wham")) {
				return response({ rate_limit: { primary_window: { used_percent: 20, reset_at: 1_800_000_000 }, secondary_window: { used_percent: 40, reset_after_seconds: 10 } } });
			}
			return response({ account_id: "account", email: "account@example.com", five_hour: { utilization: 25, resets_at: "2030-01-01T00:00:00Z" }, seven_day: { utilization: 50 } });
		}, Date.now, undefined, noAntigravity);

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
		}, Date.now, undefined, noAntigravity);
		expect(await service.refresh()).toMatchObject([
			{ provider: "openai-codex", state: "auth-required", limits: [] },
			{ provider: "anthropic", state: "unsupported", limits: [] },
			{ provider: "google", state: "auth-required", limits: [] },
			{ provider: "zai", state: "auth-required", limits: [] },
		]);
		expect(fetches).toBe(0);
	});

	test("reports a revoked Claude subscription credential as login-required before quota lookup", async () => {
		let fetches = 0;
		const service = new UsageService(
			store({ anthropic: oauth() }),
			{
				getAuth: async provider => {
					if (provider === "anthropic") throw new Error("OAuth refresh failed: invalid_grant; Refresh token revoked");
					return {};
				},
				checkAuth: async () => undefined,
			},
			async () => { fetches++; return response({}); },
			Date.now,
			undefined,
			noAntigravity,
		);
		const snapshots = await service.refresh();
		expect(snapshots.find(item => item.provider === "anthropic")).toMatchObject({ state: "auth-required", limits: [] });
		expect(fetches).toBe(0);
	});

	test("Antigravity는 로컬 연결 상태로 두고 Z.AI의 5시간·주간 CREDIT_LIMIT를 Coding Plan 쿼터로 조회한다", async () => {
		const service = new UsageService(
			store({ zai: { type: "api_key", key: "zai-secret" } }),
			models,
			async url => {
				const value = String(url);
				if (value.includes("quota/limit")) return response({ success: true, data: { limits: [
					{ type: "CREDIT_LIMIT", unit: 3, number: 5, usage: 10_000, currentValue: 6_739, percentage: 67, remaining: 3_260, nextResetTime: 1_800_000_000 },
					{ type: "CREDIT_LIMIT", unit: 6, number: 1, usage: 60_000, currentValue: 14_400, percentage: 24, remaining: 45_600, nextResetTime: 1_800_000_000 },
				] } });
				return response({ success: true, data: {} });
			},
			Date.now,
			undefined,
			{ configured: async () => true },
		);

		const snapshots = await service.refresh();
		expect(snapshots.find(item => item.provider === "google")).toMatchObject({
			state: "unsupported",
			limits: [],
		});
		expect(snapshots.find(item => item.provider === "zai")).toMatchObject({
			state: "ready",
			limits: expect.arrayContaining([
				expect.objectContaining({ label: "Z.AI 5 Hours Credit Quota", remainingPercent: 33 }),
				expect.objectContaining({ label: "Z.AI Weekly Credit Quota", remainingPercent: 76 }),
			]),
		});
		expect(JSON.stringify(snapshots)).not.toContain("secret");
	});

	test("coalesces concurrent refreshes and stops future polling", async () => {
		let fetches = 0;
		let release!: () => void;
		const pending = new Promise<void>(resolve => { release = resolve; });
		const service = new UsageService(store({ "openai-codex": oauth(), anthropic: undefined }), models, async () => {
			fetches++;
			await pending;
			return response({ rate_limit: { primary_window: { used_percent: 1 } } });
		}, Date.now, undefined, noAntigravity);
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

	test("keeps the initial HUD loading while retrying a transient startup auth failure", async () => {
		let authAttempts = 0;
		let fetches = 0;
		const service = new UsageService(
			store({ "openai-codex": oauth(), anthropic: undefined }),
			{
				getAuth: async provider => {
					if (provider === "openai-codex" && authAttempts++ === 0) throw new Error("registry is still starting");
					return {};
				},
				checkAuth: async () => undefined,
			},
			async () => {
				fetches++;
				return response({ rate_limit: { primary_window: { used_percent: 20 } } });
			},
			Date.now,
			undefined,
			noAntigravity,
		);

		const notifications: Array<readonly { state: string }[]> = [];
		let resolveReady!: () => void;
		const ready = new Promise<void>(resolve => { resolveReady = resolve; });
		const stop = service.startPolling(snapshots => {
			notifications.push(snapshots);
			if (snapshots[0]?.state === "ready") resolveReady();
		}, 60_000);
		await ready;
		stop();

		expect(notifications.map(items => items[0]?.state)).toEqual(["loading", "ready"]);
		expect(authAttempts).toBe(2);
		expect(fetches).toBe(1);
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
			noAntigravity,
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
			noAntigravity,
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

	test("reports actual Usage Snapshot cache reuse, stale fallback, and credential-removal eviction", async () => {
		let now = 10_000;
		let limited = false;
		const entries: Record<string, Credential | undefined> = { anthropic: oauth() };
		const service = new UsageService(
			store(entries),
			models,
			async () => limited
				? new Response("", { status: 429 })
				: response({ account_id: "account", email: "account@example.com", five_hour: { utilization: 25 } }),
			() => now,
			async () => undefined,
			noAntigravity,
		);

		await service.refresh();
		expect(service.cacheMetrics()).toEqual({
			entries: 1,
			hits: 0,
			misses: 1,
			evictions: 0,
			lastAccessedAt: null,
		});

		now = 20_000;
		await service.refresh();
		expect(service.cacheMetrics()).toEqual({
			entries: 1,
			hits: 1,
			misses: 1,
			evictions: 0,
			lastAccessedAt: "1970-01-01T00:00:20.000Z",
		});

		now = 310_001;
		limited = true;
		await service.refresh();
		expect(service.cacheMetrics()).toEqual({
			entries: 1,
			hits: 2,
			misses: 2,
			evictions: 0,
			lastAccessedAt: "1970-01-01T00:05:10.001Z",
		});

		entries.anthropic = undefined;
		now = 320_000;
		await service.refresh();
		expect(service.cacheMetrics()).toEqual({
			entries: 0,
			hits: 2,
			misses: 2,
			evictions: 1,
			lastAccessedAt: "1970-01-01T00:05:10.001Z",
		});
	});
});
