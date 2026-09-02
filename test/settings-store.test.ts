import { describe, expect, test } from "bun:test";
import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WwwSettings } from "../src/domain/model-settings";
import { FileSettingsStore, routerSettingsPath, settingsPath } from "../src/infrastructure/settings-store";

const codex: WwwSettings = { provider: "openai-codex", model: "gpt-5.6-sol", effort: "high" };
const claude: WwwSettings = { provider: "anthropic", model: "claude-opus-4-6", effort: "ultra" };
const google: WwwSettings = { provider: "google", model: "gemini-3.1-pro-preview", effort: "medium" };

async function store(): Promise<FileSettingsStore> {
	const directory = await mkdtemp(join(tmpdir(), "www-settings-"));
	return new FileSettingsStore(join(directory, "settings.json"));
}

describe("FileSettingsStore atomic updates", () => {
	test("keeps native and compatibility Router selections in separate files", () => {
		const root = join(tmpdir(), "www-config-test");
		const env = { WWW_CONFIG_DIR: root } as NodeJS.ProcessEnv;
		expect(settingsPath(env)).toBe(join(root, "settings.json"));
		expect(routerSettingsPath(env)).toBe(join(root, "router-settings.json"));
	});

	test("compares and swaps an exact durable selection", async () => {
		const settings = await store();
		await settings.save(codex);
		expect(await settings.compareAndSwap(codex, claude)).toBe(true);
		expect(await settings.load()).toEqual(claude);
		if (process.platform !== "win32") expect((await stat(settings.path)).mode & 0o777).toBe(0o600);
	});

	test("preserves a newer selection when expected is stale", async () => {
		const settings = await store();
		await settings.save(claude);
		expect(await settings.compareAndSwap(codex, google)).toBe(false);
		expect(await settings.load()).toEqual(claude);
	});

	test("allows only one concurrent process-shaped writer to win", async () => {
		const first = await store();
		await first.save(codex);
		const second = new FileSettingsStore(first.path);
		const results = await Promise.all([
			first.compareAndSwap(codex, claude),
			second.compareAndSwap(codex, google),
		]);
		expect(results.filter(Boolean)).toHaveLength(1);
		expect([claude, google]).toContainEqual(await first.load());
	});
});
