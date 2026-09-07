import type { TuiShellDependencies } from "./legacy-session-shell";

export interface RunLegacyRouterOptions {
	/** Legacy SessionRuntime session id, not a Codex App Server thread id. */
	resumeSessionId?: string;
}

export interface LegacyRouterAppDependencies {
	cwd(): string;
	createSession(cwd: string, options: RunLegacyRouterOptions): Promise<LegacyRouterShellSession>;
	runShell(dependencies: TuiShellDependencies): void;
}

export interface LegacyRouterShellSession {
	shell: TuiShellDependencies;
	close(): Promise<void>;
}

/** Explicit compatibility entry; the native Codex Workbench remains the default. */
export async function runLegacyRouter(
	options: RunLegacyRouterOptions,
	dependencies: LegacyRouterAppDependencies,
): Promise<void> {
	const cwd = dependencies.cwd();
	const session = await dependencies.createSession(cwd, options);
	let handedOff = false;
	try {
		dependencies.runShell(session.shell);
		handedOff = true;
	} finally {
		if (!handedOff) await session.close();
	}
}
