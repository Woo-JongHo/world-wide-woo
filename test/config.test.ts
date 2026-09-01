import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DEFAULT_SETTINGS, normalizeSettings } from "../src/domain/model-settings";
import { FileSettingsStore } from "../src/infrastructure/settings-store";

const paths: string[] = [];
afterEach(async () => {
	await Promise.all(paths.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function temporarySettingsPath(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "www-settings-"));
	paths.push(directory);
	return join(directory, "nested", "settings.json");
}

describe("model settings", () => {
	test("uses defaults when no settings file exists", async () => {
		expect(await new FileSettingsStore(await temporarySettingsPath()).load()).toEqual(DEFAULT_SETTINGS);
	});

	test("normalizes an unsupported provider, model, and effort", () => {
		expect(normalizeSettings({ provider: "unknown", model: "fake", effort: "maximum" })).toEqual(DEFAULT_SETTINGS);
	});

	test("rejects a model that belongs to another provider", () => {
		expect(normalizeSettings({ provider: "anthropic", model: "gpt-5.4", effort: "high" })).toEqual({
			provider: "anthropic",
			model: "claude-opus-4-6",
			effort: "high",
		});
	});

	test("saves and loads a valid selection", async () => {
		const path = await temporarySettingsPath();
		const settings = { provider: "google", model: "gemini-3-flash-preview", effort: "medium" } as const;
		const store = new FileSettingsStore(path);
		await store.save(settings);
		expect(await store.load()).toEqual(settings);
		expect(JSON.parse(await readFile(path, "utf8"))).toEqual(settings);
		if (process.platform !== "win32") {
			expect((await stat(dirname(path))).mode & 0o777).toBe(0o700);
			expect((await stat(path)).mode & 0o777).toBe(0o600);
		}
	});

	test("reports a malformed settings file instead of silently resetting it", async () => {
		const path = await temporarySettingsPath();
		const store = new FileSettingsStore(path);
		await store.save(DEFAULT_SETTINGS);
		await writeFile(path, "{not-json");
		await expect(store.load()).rejects.toThrow(`설정 파일의 JSON이 올바르지 않습니다: ${path}`);
	});
});
