export async function runApp(options: { sessionId?: string } = {}): Promise<void> {
	const [
		{ RouterService, reconcileInitialRouter },
		{ SessionRuntime },
		{ AuthService }, { FileCredentialStore },
		{ ModelRouter, createModelRegistry },
		{ SessionEventStore }, { FileSettingsStore },
		{ GitHubRepositoryInsights }, { UsageService },
		{ FileProjectWorkspace }, { createProjectAgentTools },
		{ runTuiShell },
	] = await Promise.all([
		import("./application/router-service"),
		import("./application/session-runtime"),
		import("./infrastructure/auth-service"), import("./infrastructure/credential-store"),
		import("./infrastructure/model-router"),
		import("./infrastructure/session-store"), import("./infrastructure/settings-store"),
		import("./infrastructure/repository-insights"), import("./infrastructure/usage-service"),
		import("./infrastructure/project-workspace"), import("./infrastructure/agent-tools"),
		import("./presentation/tui/app-shell"),
	]);
	const settingsStore = new FileSettingsStore();
	const credentials = new FileCredentialStore();
	const registry = createModelRegistry(credentials);
	const modelRouter = new ModelRouter(registry);
	const settings = await reconcileInitialRouter(await settingsStore.load(), modelRouter, settingsStore);
	const workspace = await FileProjectWorkspace.open(process.cwd());
	const sessions = new SessionEventStore(workspace.sessionsDirectory);
	const runtime = new SessionRuntime(settings, modelRouter, sessions, { cwd: process.cwd(), root: workspace.root, projectName: workspace.name }, options.sessionId, createProjectAgentTools(workspace.root));
	const sessionLease = await FileProjectWorkspace.acquireSessionLease(workspace, runtime.id);
	try { await runtime.initialize({ resume: options.sessionId !== undefined }); } catch (error) { await sessionLease.release(); throw error; }

	runTuiShell({
		runtime,
		auth: new AuthService(registry),
		usage: new UsageService(credentials, registry),
		recentSessions: (await sessions.list()).filter(session => session.id !== runtime.id).map(({ id, updatedAt }) => ({ id, updatedAt })),
		routerSettings: new RouterService(settingsStore, runtime, settings),
		repository: new GitHubRepositoryInsights(process.cwd()),
		composerDraft: await (await import("./infrastructure/composer-draft-store")).FileComposerDraftController.create(workspace.root, runtime.id, workspace.draftsDirectory),
		releaseSessionLease: () => sessionLease.release(),
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
	const [{ SessionEventStore }, { FileProjectWorkspace }] = await Promise.all([import("./infrastructure/session-store"), import("./infrastructure/project-workspace")]);
	const workspace = await FileProjectWorkspace.open(process.cwd());
	return (await new SessionEventStore(workspace.sessionsDirectory).list()).map(({ id, updatedAt }) => ({ id, updatedAt }));
}
