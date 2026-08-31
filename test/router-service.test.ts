import { describe, expect, test } from "bun:test";
import { reconcileInitialRouter, RouterService } from "../src/application/router-service";
import type { WwwSettings } from "../src/domain/model-settings";

const codex: WwwSettings = { provider: "openai-codex", model: "gpt-5.6-sol", effort: "high" };
const claude: WwwSettings = { provider: "anthropic", model: "claude-opus-4-6", effort: "ultra" };

describe("RouterService", () => {
	test("serializes durable writes before active-session publication", async () => {
		const operations: string[] = [];
		const service = new RouterService(
			{
				load: async () => codex,
				save: async (settings) => {
					operations.push(`save:${settings.provider}`);
					await Bun.sleep(2);
				},
				compareAndSwap: async (_expected, settings) => {
					operations.push(`save:${settings.provider}`);
					await Bun.sleep(2);
					return true;
				},
			},
			{ updateSettings: async (settings) => { operations.push(`publish:${settings.provider}`); } },
			codex,
		);
		await Promise.all([service.update(codex), service.update(claude)]);
		await service.flush();
		expect(operations).toEqual([
			"save:openai-codex",
			"publish:openai-codex",
			"save:anthropic",
			"publish:anthropic",
		]);
	});

	test("continues processing after a failed settings write", async () => {
		let writes = 0;
		const published: string[] = [];
		const service = new RouterService(
			{
				load: async () => codex,
				save: async () => {
					writes++;
					if (writes === 1) throw new Error("disk full");
				},
				compareAndSwap: async () => {
					writes++;
					if (writes === 1) throw new Error("disk full");
					return true;
				},
			},
			{ updateSettings: async (settings) => { published.push(settings.provider); } },
			codex,
		);
		await expect(service.update(codex)).rejects.toThrow("disk full");
		await service.update(claude);
		expect(published).toEqual(["anthropic"]);
	});

	test("rolls durable settings back when active-session publication fails", async () => {
		const saved: WwwSettings[] = [];
		const service = new RouterService(
			{
				load: async () => codex,
				save: async (settings) => { saved.push(settings); },
				compareAndSwap: async (_expected, settings) => {
					saved.push(settings);
					return true;
				},
			},
			{ updateSettings: async () => { throw new Error("session unavailable"); } },
			codex,
		);

		await expect(service.update(claude)).rejects.toThrow("session unavailable");
		expect(saved).toEqual([claude, codex]);
	});

	test("synchronizes an external model selection so a later retry can succeed", async () => {
		let durable = claude;
		const published: WwwSettings[] = [];
		const service = new RouterService(
			{
				load: async () => durable,
				save: async settings => { durable = settings; },
				compareAndSwap: async (expected, next) => {
					if (durable.provider !== expected.provider || durable.model !== expected.model || durable.effort !== expected.effort) {
						return false;
					}
					durable = next;
					return true;
				},
			},
			{ updateSettings: async settings => { published.push(settings); } },
			codex,
		);
		await expect(service.update(claude)).rejects.toThrow("다른 WWW 프로세스");
		expect(published).toEqual([claude]);
		await service.update({ ...claude, effort: "medium" });
		expect(published.at(-1)).toEqual({ ...claude, effort: "medium" });
	});

	test("moves an exact model to the sole authenticated Router", async () => {
		const saved: WwwSettings[] = [];
		const selected: WwwSettings = { provider: "openai", model: "gpt-5.4", effort: "ultra" };
		const result = await reconcileInitialRouter(
			selected,
			{ checkAuth: async ({ provider }) => ({ configured: provider === "openai-codex" }) },
			{ load: async () => selected, save: async (settings) => { saved.push(settings); } },
		);
		expect(result).toEqual({ provider: "openai-codex", model: "gpt-5.4", effort: "ultra" });
		expect(saved).toEqual([result]);
	});

	test("does not switch models or guess between unauthenticated Routers", async () => {
		const selected: WwwSettings = { provider: "openai", model: "gpt-5.4", effort: "ultra" };
		const result = await reconcileInitialRouter(
			selected,
			{ checkAuth: async () => ({ configured: false }) },
			{ load: async () => selected, save: async () => { throw new Error("must not save"); } },
		);
		expect(result).toEqual(selected);
	});
});
