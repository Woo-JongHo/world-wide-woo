import type { TerminalCommandResult, TerminalCommandUpdate } from "@/core/domain/execution/terminal";

/** Executes a command explicitly submitted by the user, outside the agent tool surface. */
export interface TerminalCommandExecutor {
	execute(
		command: string,
		cwd: string,
		signal: AbortSignal,
		onUpdate: (update: TerminalCommandUpdate) => void,
	): Promise<TerminalCommandResult>;
}
