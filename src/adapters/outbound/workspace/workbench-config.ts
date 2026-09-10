import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { DEFAULT_WORKBENCH_CONFIG, isSupportedWorkbenchConfigDocument, normalizeWorkbenchConfig, type WorkbenchConfig } from "../../../core/domain/execution/workbench-config.js";
import { MODELS, type Effort, type Provider } from "../../../core/domain/execution/model-settings.js";

/** Loads project policy at the adapter seam; callers receive a safe snapshot. */
export async function loadWorkbenchConfig(root: string): Promise<WorkbenchConfig> {
	return (await loadWorkbenchConfigWithSource(root)).config;
}

export interface LoadedWorkbenchConfig {
	readonly config: WorkbenchConfig;
	readonly source: "project-yaml" | "defaults";
}

/** Persists an explicit interactive model selection in project YAML atomically. */
export async function saveWorkbenchExecutionSelection(root: string, selection: Readonly<{ provider: Provider; model: string; effort: Effort }>): Promise<void> {
	const configPath = join(root, ".www", "workbench.yaml");
	let parsed: Record<string, unknown> = {};
	try {
		const value = parseYaml(await readFile(configPath, "utf8"));
		if (!isSupportedWorkbenchConfigDocument(value)) throw new Error("지원하지 않는 Workbench YAML schema입니다.");
		parsed = value as Record<string, unknown>;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
	const models = MODELS[selection.provider] as readonly string[];
	if (!models.includes(selection.model)) throw new Error(`지원하지 않는 모델입니다: ${selection.provider}/${selection.model}`);
	const current = normalizeWorkbenchConfig(parsed);
	const next = { ...parsed, schemaVersion: 1, execution: { ...current.execution, provider: selection.provider, model: selection.model, effort: selection.effort } };
	const temporaryPath = `${configPath}.tmp-${randomUUID()}`;
	try {
		await writeFile(temporaryPath, stringifyYaml(next), { encoding: "utf8", mode: 0o600, flag: "wx" });
		await rename(temporaryPath, configPath);
	} catch (error) {
		await unlink(temporaryPath).catch(() => undefined);
		throw error;
	}
}

/** Includes provenance so a surface can distinguish project policy from safe fallback. */
export async function loadWorkbenchConfigWithSource(root: string): Promise<LoadedWorkbenchConfig> {
	try {
		const source = await readFile(join(root, ".www", "workbench.yaml"), "utf8");
		const parsed = parseYaml(source);
		if (isUnsupportedSchema(parsed) || !isSupportedWorkbenchConfigDocument(parsed)) return { config: DEFAULT_WORKBENCH_CONFIG, source: "defaults" };
		return { config: normalizeWorkbenchConfig(parsed), source: "project-yaml" };
	} catch {
		return { config: DEFAULT_WORKBENCH_CONFIG, source: "defaults" };
	}
}

function isUnsupportedSchema(value: unknown): boolean {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const version = (value as { schemaVersion?: unknown }).schemaVersion;
	return version !== undefined && version !== 1;
}
