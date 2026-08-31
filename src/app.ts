export async function runApp(options: { sessionId?: string } = {}): Promise<void> {
	const [
		{ RouterService, reconcileInitialRouter },
		{ SessionRuntime },
		{ AuthService },
		{ FileCredentialStore },
		{ ModelRouter, createModelRegistry },
		{ SessionEventStore },
		{ FileSettingsStore },
		{ UsageService },
		{ runTuiShell },
	] = await Promise.all([
		import("./application/router-service"),
		import("./application/session-runtime"),
		import("./infrastructure/auth-service"),
		import("./infrastructure/credential-store"),
		import("./infrastructure/model-router"),
		import("./infrastructure/session-store"),
		import("./infrastructure/settings-store"),
		import("./infrastructure/usage-service"),
		import("./presentation/tui/app-shell"),
	]);
	const settingsStore = new FileSettingsStore();
	const storedSettings = await settingsStore.load();
	const credentials = new FileCredentialStore();
	const registry = createModelRegistry(credentials);
	const modelRouter = new ModelRouter(registry);
	const settings = await reconcileInitialRouter(storedSettings, modelRouter, settingsStore);
	const sessions = new SessionEventStore();
	const runtime = new SessionRuntime(settings, modelRouter, sessions, options.sessionId);
	await runtime.initialize({ resume: options.sessionId !== undefined });
	const recentSessions = await sessions.list();

	runTuiShell({
		runtime,
		auth: new AuthService(registry),
		usage: new UsageService(credentials, registry),
		recentSessions: recentSessions
			.filter((session) => session.id !== runtime.id)
			.map(({ id, updatedAt }) => ({ id, updatedAt })),
		routerSettings: new RouterService(settingsStore, runtime),
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
	const { SessionEventStore } = await import("./infrastructure/session-store");
	return (await new SessionEventStore().list()).map(({ id, updatedAt }) => ({ id, updatedAt }));
}
