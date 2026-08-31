export type CommandStatus = "pending" | "running" | "passed" | "failed" | "cancelled";

/** A completed or in-progress command observation; execution remains outside this DTO. */
export interface CommandResultSnapshot {
	id: string;
	shell: "bash";
	command: string;
	cwd: string;
	status: CommandStatus;
	stdout: string;
	stderr: string;
	startedAt: number | undefined;
	durationMs: number | undefined;
	exitCode: number | undefined;
}

export interface CompletionSection {
	title: string;
	bullets: readonly string[];
}

/** Structured final response content, independent from its terminal presentation. */
export interface CompletionReport {
	title: string;
	sections: readonly CompletionSection[];
	verification: readonly string[];
}
