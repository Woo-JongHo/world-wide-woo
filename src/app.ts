export async function runApp(options: { sessionId?: string } = {}): Promise<void> {
	const [
		{ RouterService, reconcileInitialRouter },
		{ AuthService }, { FileCredentialStore },
		{ ModelRouter, createModelRegistry },
		{ FileSettingsStore },
		{ GitHubRepositoryInsights }, { UsageService },
		{ createProjectSession },
		{ runTuiShell },
	] = await Promise.all([
		import("./application/router-service"),
		import("./infrastructure/auth-service"), import("./infrastructure/credential-store"),
		import("./infrastructure/model-router"),
		import("./infrastructure/settings-store"),
		import("./infrastructure/repository-insights"), import("./infrastructure/usage-service"),
		import("./infrastructure/project-session"),
		import("./presentation/tui/app-shell"),
	]);
	const settingsStore = new FileSettingsStore();
	const credentials = new FileCredentialStore();
	const registry = createModelRegistry(credentials);
	const modelRouter = new ModelRouter(registry);
	const settings = await reconcileInitialRouter(await settingsStore.load(), modelRouter, settingsStore);
	const project = await createProjectSession(process.cwd(), settings, modelRouter, options.sessionId);
	const { workspace, runtime, todos, releaseSessionLease } = project;

	runTuiShell({
		runtime,
		auth: new AuthService(registry),
		usage: new UsageService(credentials, registry),
		routerSettings: new RouterService(settingsStore, runtime, settings),
		repository: new GitHubRepositoryInsights(process.cwd()),
		composerDraft: await (await import("./infrastructure/composer-draft-store")).FileComposerDraftController.create(workspace.root, runtime.id, workspace.draftsDirectory),
		releaseSessionLease,
		todos,
	});
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

export async function listSessions(): Promise<Array<{ id: string; updatedAt: string }>> {
	const { listProjectSessions } = await import("./infrastructure/project-session");
	return listProjectSessions(process.cwd());
}
