import { DEFAULT_SETTINGS, type WwwSettings } from "./core/domain/model-settings.js";
import { buildPiExecutionSystemPrompt, type ExecutionLane } from "./adapters/outbound/executors/factory.js";
import { createProjectWorkbenchSession } from "./adapters/outbound/project-workbench-session.js";
import { FileDevelopmentMapSource } from "./adapters/outbound/development-map-source.js";
import { ObservabilityHistorySource } from "./adapters/outbound/observability-history-source.js";
import { GitTelemetrySource } from "./adapters/outbound/git-telemetry-source.js";
import { homedir } from "node:os"; import { join } from "node:path";
export { listNativeThreads } from "./adapters/outbound/native-thread-discovery.js";
export interface RunAppOptions { resumeThreadId?: string; executionLane?: ExecutionLane }
export async function runApp(options: RunAppOptions = {}): Promise<void> {
	const { FileSettingsStore } = await import("./adapters/outbound/settings-store");
	const { runProjectWorkbenchShell } = await import("./adapters/inbound/tui/workbench-shell");
	const settingsStore = new FileSettingsStore();
	const settings = await settingsStore.load();
	let persistedSettings = settings;
	const executionLane = options.executionLane ?? "codex";
	const project = await createProjectWorkbenchSession(process.cwd(), {
		resumeThreadId: options.resumeThreadId,
		executionLane,
		provider: executionLane === "pi" ? settings.provider : "openai-codex",
		model: executionLane === "pi" ? settings.model : codexInteractiveModel(settings),
		effort: settings.effort,
		systemPrompt: executionLane === "pi" ? buildPiExecutionSystemPrompt(process.cwd()) : undefined,
		persistModelSelection: async (selection) => {
			if (executionLane === "pi") throw new Error("Pi Phase A 모델 변경은 새 Workbench에서만 적용할 수 있습니다.");
			const next: WwwSettings = { provider: "openai-codex", ...selection };
			const saved = await settingsStore.compareAndSwap(persistedSettings, next);
			if (!saved) throw new Error("다른 WWW 프로세스가 모델 설정을 먼저 변경했습니다. 다시 선택하세요.");
			persistedSettings = next;
		},
	});
	try {
		const { createProjectAuthController } = await import("./adapters/outbound/project-auth"); runProjectWorkbenchShell({
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
	const { AuthService } = await import("./adapters/outbound/auth-service");
	const { FileCredentialStore } = await import("./adapters/outbound/credential-store");
	const { createModelRegistry } = await import("./adapters/outbound/model-router");
	const { runAuthCommand } = await import("./adapters/inbound/cli/auth-command");
	const registry = createModelRegistry(new FileCredentialStore());
	await runAuthCommand(new AuthService(registry), args);
}
/** Legacy SessionRuntime archive only. Native Codex threads are resumed by their opaque id. */
export async function listSessions(): Promise<Array<{ id: string; updatedAt: string }>> {
	const { listProjectSessions } = await import("./adapters/outbound/project-session");
	return listProjectSessions(process.cwd());
}
