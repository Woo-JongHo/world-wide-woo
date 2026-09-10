import { describe, expect, test } from "bun:test";
import { DEFAULT_WORKBENCH_CONFIG, normalizeWorkbenchConfig } from "../src/core/domain/execution/workbench-config";
import { loadWorkbenchConfig, loadWorkbenchConfigWithSource, saveWorkbenchExecutionSelection } from "../src/adapters/outbound/workspace/workbench-config";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("Workbench YAML configuration", () => {
	test("normalizes supported execution policy and rejects unsafe values to defaults", () => {
		const config = normalizeWorkbenchConfig({ execution: { provider: "openai-codex", model: "gpt-5.6-terra", effort: "high", approvalPolicy: "never", sandbox: "read-only" }, limits: { contextCharacters: 9000 } });
		expect(config.execution.model).toBe("gpt-5.6-terra");
		expect(config.execution.sandbox).toBe("read-only");
		expect(config.limits.contextCharacters).toBe(9000);
		expect(config.retry.maxRetries).toBe(2);
		expect(config.delegation.detailActivities).toBe(8);
		expect(config.evaluation.requireVerification).toBe(true);
		expect(config.orchestration.maxAgentRounds).toBe(24);
		expect(config.review).toEqual({ provider: "anthropic", model: "claude-opus" });
		expect(config.hud).toEqual({ showUsage: true, showContext: true });
		expect(config.narrator).toEqual({ model: "gpt-5.6-luna" });
		expect(config.slash).toEqual({ mcp: true, clear: true, compact: true });
		expect(config.linear).toBeNull();
		expect(config.display.tnoteVisibleLimit).toBe(20);
		expect(normalizeWorkbenchConfig({ evaluation: { requireVerification: false } }).evaluation.requireVerification).toBe(false);
		expect(normalizeWorkbenchConfig({ retry: { enabled: false, maxRetries: 99, baseDelayMs: -4 } }).retry).toEqual({ enabled: false, maxRetries: 8, baseDelayMs: 0 });
		expect(normalizeWorkbenchConfig({ orchestration: { maxAgentRounds: 99 } }).orchestration.maxAgentRounds).toBe(64);
		expect(normalizeWorkbenchConfig({ schemaVersion: 2, execution: { model: "gpt-5.6-terra" } })).toEqual(DEFAULT_WORKBENCH_CONFIG);
		expect(normalizeWorkbenchConfig({ review: { provider: "google", model: "not-a-model" } }).review).toEqual({ provider: "google", model: "gemini" });
		expect(normalizeWorkbenchConfig({ display: { tnoteVisibleLimit: 999 } }).display.tnoteVisibleLimit).toBe(100);
		expect(normalizeWorkbenchConfig({ hud: { showUsage: false, showContext: false } }).hud).toEqual({ showUsage: false, showContext: false });
		expect(normalizeWorkbenchConfig({ slash: { mcp: false, clear: false, compact: false } }).slash).toEqual({ mcp: false, clear: false, compact: false });
		expect(normalizeWorkbenchConfig({ linear: { server: " linear-woo ", projectId: " project ", projectName: " World Wide Woo " } }).linear).toEqual({ server: "linear-woo", projectId: "project", projectName: "World Wide Woo" });
		expect(normalizeWorkbenchConfig({ tnote: { model: "claude-opus-4-6" } }).tnote.model).toBe("gpt-5.6-luna");
		expect(normalizeWorkbenchConfig({ narrator: { model: "gpt-5.6-terra" } }).narrator.model).toBe("gpt-5.6-terra");
		expect(normalizeWorkbenchConfig({ execusion: { model: "gpt-5.6-terra" } })).toEqual(DEFAULT_WORKBENCH_CONFIG);
		const invalid = normalizeWorkbenchConfig({ execution: { provider: "unknown", model: "unknown", effort: "unknown", approvalPolicy: "unsafe", sandbox: "unsafe" }, limits: { contextCharacters: -1 } });
		expect(invalid).toEqual(DEFAULT_WORKBENCH_CONFIG);
	});

	test("loads project YAML and falls back safely when it is absent or malformed", async () => {
		const root = await mkdtemp(join(tmpdir(), "www-config-"));
		await mkdir(join(root, ".www"));
		await writeFile(join(root, ".www", "workbench.yaml"), "execution:\n  model: gpt-5.6-luna\n  effort: low\n");
		expect((await loadWorkbenchConfig(root)).execution.model).toBe("gpt-5.6-luna");
		expect((await loadWorkbenchConfigWithSource(root)).source).toBe("project-yaml");
		await writeFile(join(root, ".www", "workbench.yaml"), "execution: [broken");
		expect(await loadWorkbenchConfig(root)).toEqual(DEFAULT_WORKBENCH_CONFIG);
		expect((await loadWorkbenchConfigWithSource(join(root, "missing"))).source).toBe("defaults");
		await writeFile(join(root, ".www", "workbench.yaml"), "schemaVersion: 2\nexecution:\n  model: gpt-5.6-terra\n");
		expect((await loadWorkbenchConfigWithSource(root)).source).toBe("defaults");
		await writeFile(join(root, ".www", "workbench.yaml"), "execusion:\n  model: gpt-5.6-terra\n");
		expect((await loadWorkbenchConfigWithSource(root)).source).toBe("defaults");
	});

	test("persists a validated model selection atomically in project YAML", async () => {
		const root = await mkdtemp(join(tmpdir(), "www-config-save-"));
		await mkdir(join(root, ".www"));
		await writeFile(join(root, ".www", "workbench.yaml"), "execution:\n  model: gpt-5.6-sol\n  effort: medium\nhud:\n  showUsage: false\n");
		await saveWorkbenchExecutionSelection(root, { provider: "openai-codex", model: "gpt-5.6-terra", effort: "high" });
		const loaded = await loadWorkbenchConfig(root);
		expect(loaded.execution).toMatchObject({ provider: "openai-codex", model: "gpt-5.6-terra", effort: "high" });
		expect(loaded.hud.showUsage).toBe(false);
		await expect(saveWorkbenchExecutionSelection(root, { provider: "openai-codex", model: "not-a-model", effort: "high" })).rejects.toThrow("지원하지 않는 모델");
	});

	test("loads every live project policy section from the checked-in Workbench YAML", async () => {
		const loaded = await loadWorkbenchConfigWithSource(process.cwd());
		expect(loaded.source).toBe("project-yaml");
		expect(loaded.config.execution.model).toBe("gpt-5.6-sol");
		expect(loaded.config.tnote.model).toBe("gpt-5.6-luna");
		expect(loaded.config.narrator.model).toBe("gpt-5.6-luna");
		expect(loaded.config.review).toEqual({ provider: "anthropic", model: "claude-opus" });
		expect(loaded.config.hud).toEqual({ showUsage: true, showContext: true });
		expect(loaded.config.slash).toEqual({ mcp: true, clear: true, compact: true });
		expect(loaded.config.linear).toEqual({ server: "linear-woo", projectId: "5639ee1c-a6cd-44cf-9ed6-82ee9c5fc3db", projectName: "World Wide Woo" });
	});
});
