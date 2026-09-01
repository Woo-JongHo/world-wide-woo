import { DEFAULT_SETTINGS, type WwwSettings } from "./domain/model-settings.js";
import { createProjectWorkbenchSession } from "./infrastructure/project-workbench-session.js";
export { listNativeThreads } from "./infrastructure/native-thread-discovery.js";

export interface RunAppOptions {
	/** Opaque Codex App Server thread id, not a legacy WWW session id. */
	resumeThreadId?: string;
}

/** Native 3-pane workbench is the default `www` entrypoint. */
export async function runApp(options: RunAppOptions = {}): Promise<void> {
	const [{ FileSettingsStore }, { runProjectWorkbenchShell }] = await Promise.all([
		import("./infrastructure/settings-store"),
		import("./presentation/tui/workbench-shell"),
	]);
	const settings = await new FileSettingsStore().load();
	const project = await createProjectWorkbenchSession(process.cwd(), {
		resumeThreadId: options.resumeThreadId,
		model: codexInteractiveModel(settings),
		effort: settings.effort,
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

/** Chat is always native Codex; router settings only select a Codex model when applicable. */
export function codexInteractiveModel(settings: WwwSettings): string {
	return settings.provider === "openai-codex" ? settings.model : DEFAULT_SETTINGS.model;
}

export async function runAuth(args: string[]): Promise<void> {
	const [{ AuthService }, { FileCredentialStore }, { createModelRegistry }, { runAuthCommand }] = await Promise.all([
		import("./infrastructure/auth-service"),
		import("./infrastructure/credential-store"),
		import("./infrastructure/model-router"),
		import("./presentation/cli/auth-command"),
	]);
	const registry = createModelRegistry(new FileCredentialStore());
	await runAuthCommand(new AuthService(registry), args);
}

/** Legacy SessionRuntime archive only. Native Codex threads are resumed by their opaque id. */
export async function listSessions(): Promise<Array<{ id: string; updatedAt: string }>> {
	const { listProjectSessions } = await import("./infrastructure/project-session");
	return listProjectSessions(process.cwd());
}
