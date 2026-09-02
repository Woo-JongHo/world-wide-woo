import { RouterService, reconcileInitialRouter } from "./application/router-service";
import { AuthService } from "./infrastructure/auth-service";
import { FileComposerDraftController } from "./infrastructure/composer-draft-store";
import { FileCredentialStore } from "./infrastructure/credential-store";
import { ModelRouter, createModelRegistry } from "./infrastructure/model-router";
import { createProjectSession } from "./infrastructure/project-session";
import { GitHubRepositoryInsights } from "./infrastructure/repository-insights";
import { FileSettingsStore, routerSettingsPath } from "./infrastructure/settings-store";
import { UsageService } from "./infrastructure/usage-service";
import { runTuiShell, type TuiShellDependencies } from "./presentation/tui/legacy-session-shell";

export interface RunLegacyRouterOptions {
	/** Legacy SessionRuntime session id, not a Codex App Server thread id. */
	resumeSessionId?: string;
}

export interface LegacyRouterAppDependencies {
	cwd(): string;
	createSettingsStore(): FileSettingsStore;
	createCredentialStore(): FileCredentialStore;
	runShell(dependencies: TuiShellDependencies): void;
}

const productionDependencies: LegacyRouterAppDependencies = {
	cwd: () => process.cwd(),
	createSettingsStore: () => new FileSettingsStore(routerSettingsPath()),
	createCredentialStore: () => new FileCredentialStore(),
	runShell: runTuiShell,
};

/** Explicit compatibility entry; the native Codex Workbench remains the default. */
export async function runLegacyRouter(
	options: RunLegacyRouterOptions = {},
	dependencies: LegacyRouterAppDependencies = productionDependencies,
): Promise<void> {
	const cwd = dependencies.cwd();
	const settingsStore = dependencies.createSettingsStore();
	const credentials = dependencies.createCredentialStore();
	const registry = createModelRegistry(credentials);
	const modelRouter = new ModelRouter(registry);
	const settings = await reconcileInitialRouter(await settingsStore.load(), modelRouter, settingsStore);
	const project = await createProjectSession(
		cwd,
		settings,
		modelRouter,
		options.resumeSessionId,
	);
	const { workspace, runtime, todos, monitor, planning, releaseSessionLease } = project;
	let handedOff = false;
	try {
		const composerDraft = await FileComposerDraftController.create(
			workspace.root,
			runtime.id,
			workspace.draftsDirectory,
		);
		dependencies.runShell({
			runtime,
			auth: new AuthService(registry),
			usage: new UsageService(credentials, registry),
			routerSettings: new RouterService(settingsStore, runtime, settings),
			repository: new GitHubRepositoryInsights(cwd),
			composerDraft,
			releaseSessionLease,
			todos,
			monitor,
			planning,
		});
		handedOff = true;
	} finally {
		if (!handedOff) {
			monitor.dispose();
			try {
				await runtime.close();
			} finally {
				await releaseSessionLease();
			}
		}
	}
}
