import { DEFAULT_SETTINGS, type WwwSettings } from "./domain/model-settings.js";
import { createProjectWorkbenchSession } from "./infrastructure/project-workbench-session.js";
export { listNativeThreads } from "./infrastructure/native-thread-discovery.js";

export interface RunAppOptions {
	/** Opaque Codex App Server thread id, not a legacy WWW session id. */
	resumeThreadId?: string;
}

export async function runApp(options: RunAppOptions = {}): Promise<void> {
	const { FileSettingsStore } = await import("./infrastructure/settings-store");
	const { runProjectWorkbenchShell } = await import("./presentation/tui/workbench-shell");
	const settingsStore = new FileSettingsStore();
	const settings = await settingsStore.load();
	let persistedSettings = settings;
	const project = await createProjectWorkbenchSession(process.cwd(), {
		resumeThreadId: options.resumeThreadId,
		model: codexInteractiveModel(settings),
		effort: settings.effort,
		persistModelSelection: async (selection) => {
			const next: WwwSettings = { provider: "openai-codex", ...selection };
			const saved = await settingsStore.compareAndSwap(persistedSettings, next);
			if (!saved) throw new Error("다른 WWW 프로세스가 모델 설정을 먼저 변경했습니다. 다시 선택하세요.");
			persistedSettings = next;
		},
	});
	try {
		runProjectWorkbenchShell({
			workbench: project.workbench,
			cwd: project.workspace.root,
			usage: project.usage,
			composerDraft: project.composerDraft,
			releaseSessionLease: project.releaseSessionLease,
		});
	} catch (error) {
		await project.close();
		throw error;
	}
}

export function codexInteractiveModel(settings: WwwSettings): string {
	return settings.provider === "openai-codex" ? settings.model : DEFAULT_SETTINGS.model;
}

export async function runAuth(args: string[]): Promise<void> {
	const { AuthService } = await import("./infrastructure/auth-service");
	const { FileCredentialStore } = await import("./infrastructure/credential-store");
	const { createModelRegistry } = await import("./infrastructure/model-router");
	const { runAuthCommand } = await import("./presentation/cli/auth-command");
	const registry = createModelRegistry(new FileCredentialStore());
	await runAuthCommand(new AuthService(registry), args);
}

/** Legacy SessionRuntime archive only. Native Codex threads are resumed by their opaque id. */
export async function listSessions(): Promise<Array<{ id: string; updatedAt: string }>> {
	const { listProjectSessions } = await import("./infrastructure/project-session");
	return listProjectSessions(process.cwd());
}
