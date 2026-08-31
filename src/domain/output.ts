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

/** A presentation-independent observation of a tool result; execution remains outside this DTO. */
export interface GenericToolResultSnapshot {
	id: string;
	toolName: string;
	status: CommandStatus;
	/** Display-safe projection; raw tool arguments must never enter this DTO. */
	input: string;
	/** Display-safe projection; raw provider/tool payloads must never enter this DTO. */
	output: string;
	startedAt: number | undefined;
	durationMs: number | undefined;
	error: string | undefined;
}

/** A presentation-independent observation of a textual diff result. */
export interface DiffResultSnapshot {
	id: string;
	title: string;
	status: CommandStatus;
	diff: string;
	startedAt: number | undefined;
	durationMs: number | undefined;
	error: string | undefined;
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
