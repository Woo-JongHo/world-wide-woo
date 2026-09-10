import { DEFAULT_SETTINGS, type WwwSettings } from "./core/domain/execution/model-settings.js";
import { buildPiExecutionSystemPrompt, type ExecutionLane } from "./adapters/outbound/execution/factory.js";
import { createProjectWorkbenchSession } from "./adapters/outbound/workspace/project-workbench-session.js";
import { FileDevelopmentMapSource } from "./adapters/outbound/development/development-map-source.js";
import { ObservabilityHistorySource } from "./adapters/outbound/observability/observability-history-source.js";
import { GitTelemetrySource } from "./adapters/outbound/git/git-telemetry-source.js";
import { saveWorkbenchExecutionSelection } from "./adapters/outbound/workspace/workbench-config.js";
import { homedir } from "node:os"; import { join } from "node:path";
export { listNativeThreads } from "./adapters/outbound/workspace/native-thread-discovery.js";
export interface RunAppOptions { resumeThreadId?: string; executionLane?: ExecutionLane }
export async function runApp(options: RunAppOptions = {}): Promise<void> {
	const { FileSettingsStore } = await import("./adapters/outbound/persistence/settings-store");
	const { runProjectWorkbenchShell } = await import("./adapters/inbound/tui/shell/workbench-shell");
	const settingsStore = new FileSettingsStore();
	const settings = await settingsStore.load();
	const executionLane = options.executionLane ?? "codex";
	const project = await createProjectWorkbenchSession(process.cwd(), {
		resumeThreadId: options.resumeThreadId,
		executionLane,
		// Project YAML owns the native Codex policy.  The legacy settings store is
		// still used by the compatibility/Pi lane and for explicit model changes,
		// but must not silently override `.www/workbench.yaml` on startup.
		...(executionLane === "pi" ? { provider: settings.provider, model: settings.model, effort: settings.effort } : {}),
		systemPrompt: executionLane === "pi" ? buildPiExecutionSystemPrompt(process.cwd()) : undefined,
		persistModelSelection: async (selection) => {
			if (executionLane === "pi") throw new Error("Pi Phase A 모델 변경은 새 Workbench에서만 적용할 수 있습니다.");
			const next: WwwSettings = { provider: "openai-codex", ...selection };
			await saveWorkbenchExecutionSelection(process.cwd(), next);
		},
	});
	try {
		const { createProjectAuthController } = await import("./adapters/outbound/authentication/project-auth"); runProjectWorkbenchShell({
			workbench: project.workbench, cwd: project.workspace.root, usage: project.usage, auth: createProjectAuthController(),
			developmentMapSource: new FileDevelopmentMapSource(project.workspace.root),
			development: project.development,
			observabilityHistorySource: new ObservabilityHistorySource(join(project.workspace.root, ".www", "runtime", "activity")),
			gitTelemetrySource: new GitTelemetrySource(), homeDirectory: homedir(),
			composerDraft: project.composerDraft, releaseSessionLease: project.releaseSessionLease,
		});
	} catch (error) {
		await project.close();
		throw error;
	}
}
export function codexInteractiveModel(settings: WwwSettings): string { return settings.provider === "openai-codex" ? settings.model : DEFAULT_SETTINGS.model; }
export async function runAuth(args: string[]): Promise<void> {
	const { createProjectAuthController } = await import("./adapters/outbound/authentication/project-auth");
	const { runAuthCommand } = await import("./adapters/inbound/cli/auth-command");
	await runAuthCommand(createProjectAuthController(), args);
}
/** Legacy SessionRuntime archive only. Native Codex threads are resumed by their opaque id. */
export async function listSessions(): Promise<Array<{ id: string; updatedAt: string }>> {
	const { listProjectSessions } = await import("./adapters/outbound/workspace/project-session");
	return listProjectSessions(process.cwd());
}
