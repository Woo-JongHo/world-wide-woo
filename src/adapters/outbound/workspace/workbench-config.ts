import { randomUUID }                                                 from "node:crypto";
import { readFile, rename, unlink, writeFile }                        from "node:fs/promises";
import { join }                                                       from "node:path";
import { parse as parseYaml, stringify as stringifyYaml }             from "yaml";
import {
	DEFAULT_WORKBENCH_CONFIG,
	isSupportedWorkbenchConfigDocument,
	normalizeWorkbenchConfig,
} from "@/core/domain/execution/workbench-config.js";
import type { WorkbenchConfig }                                       from "@/core/domain/execution/workbench-config.js";
import { MODELS, modelEfforts, nativeModelEfforts, nativeModelNames } from "@/core/domain/execution/model-settings.js";
import type { Effort, NativeModelCatalog, Provider }                  from "@/core/domain/execution/model-settings.js";

/** Loads project policy at the adapter seam; callers receive a safe snapshot. */
export async function loadWorkbenchConfig(root: string): Promise<WorkbenchConfig> {
	return (await loadWorkbenchConfigWithSource(root)).config;
}

export interface LoadedWorkbenchConfig {
	readonly config: WorkbenchConfig;
	readonly source: "project-yaml" | "defaults";
}

export interface WorkbenchExecutionSelection {
	readonly provider : Provider ;
	readonly model    : string   ;
	readonly effort   : Effort   ;
}

/** Persists an explicit interactive model selection in project YAML atomically. */
export async function saveWorkbenchExecutionSelection(
	root: string,
	selection: WorkbenchExecutionSelection,
	catalog?: NativeModelCatalog,
): Promise<void> {
	const configPath = join(root, ".www", "workbench.yaml");
	const parsed = await readWorkbenchConfigDocument(configPath);
	validateWorkbenchExecutionSelection(selection, catalog);
	const current = normalizeWorkbenchConfig(parsed);
	const next = {
		...parsed,
		schemaVersion: 1,
		execution: { ...current.execution, ...selection },
	};
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
		if (isUnsupportedSchema(parsed) || !isSupportedWorkbenchConfigDocument(parsed)) {
			return defaultWorkbenchConfig();
		}
		return { config: normalizeWorkbenchConfig(parsed), source: "project-yaml" };
	} catch {
		return defaultWorkbenchConfig();
	}
}

async function readWorkbenchConfigDocument(configPath: string): Promise<Record<string, unknown>> {
	try {
		const value = parseYaml(await readFile(configPath, "utf8"));
		if (!isSupportedWorkbenchConfigDocument(value)) {
			throw new Error("지원하지 않는 Workbench YAML schema입니다.");
		}
		return value as Record<string, unknown>;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
		throw error;
	}
}

function validateWorkbenchExecutionSelection(
	selection: WorkbenchExecutionSelection,
	catalog: NativeModelCatalog | undefined,
): void {
	const models = selection.provider === "openai-codex"
		? nativeModelNames(catalog)
		: MODELS[selection.provider];
	if (!models.includes(selection.model)) {
		throw new Error(`지원하지 않는 모델입니다: ${selection.provider}/${selection.model}`);
	}
	const efforts = selection.provider === "openai-codex"
		? nativeModelEfforts(selection.model, catalog)
		: modelEfforts(selection.provider, selection.model);
	if (!efforts.includes(selection.effort)) {
		throw new Error(`지원하지 않는 추론 강도입니다: ${selection.model}/${selection.effort}`);
	}
}

function defaultWorkbenchConfig(): LoadedWorkbenchConfig {
	return { config: DEFAULT_WORKBENCH_CONFIG, source: "defaults" };
}

function isUnsupportedSchema(value: unknown): boolean {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const version = (value as { schemaVersion?: unknown }).schemaVersion;
	return version !== undefined && version !== 1;
}
