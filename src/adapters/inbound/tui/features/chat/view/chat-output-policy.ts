import type { CommandStatus } from "@/core/domain/execution/output";
import { semantic }           from "@/adapters/inbound/tui/foundation/theme/theme";

/** Character budget shared by public native-tool projection and its Chat renderers. */
export const CHAT_PUBLIC_OUTPUT_MAX_CHARS = 2_400;

/** Default number of terminal output lines that follow a live command. */
export const CHAT_TERMINAL_OUTPUT_CHUNK_LINES = 5;

/** Parsing budget for syntax-aware structured output. */
export const CHAT_STRUCTURED_DISPLAY_MAX_BYTES = 64 * 1024;
export const CHAT_STRUCTURED_DISPLAY_MAX_LINES = 2_000;

const STATUS_LABEL: Record<CommandStatus, string> = {
	pending   : "PENDING",
	running   : "RUNNING",
	passed    : "PASSED",
	failed    : "FAILED",
	cancelled : "CANCELLED",
};

const STATUS_COLOR: Record<CommandStatus, (text: string) => string> = {
	pending   : semantic.toolPending,
	running   : semantic.toolRunning,
	passed    : semantic.toolPassed,
	failed    : semantic.toolFailed,
	cancelled : semantic.toolCancelled,
};

const STATUS_SYMBOL: Record<CommandStatus, string> = {
	pending   : "•",
	running   : "•",
	passed    : "✔",
	failed    : "✘",
	cancelled : "⚠",
};

const STATUS_SURFACE: Record<CommandStatus, (text: string) => string> = {
	pending   : semantic.executionSurfacePending,
	running   : semantic.executionSurfacePending,
	passed    : semantic.executionSurfacePassed,
	failed    : semantic.executionSurfaceFailed,
	cancelled : semantic.executionSurfaceCancelled,
};

export interface WorkStepStatusPresentation {
	label   : string                   ;
	text    : string                   ;
	symbol  : string                   ;
	border  : (text: string) => string ;
	surface : (text: string) => string ;
}

export function workStepStatusPresentation(status: CommandStatus): WorkStepStatusPresentation {
	return {
		label   : STATUS_LABEL[status],
		text    : STATUS_COLOR[status](STATUS_LABEL[status]),
		symbol  : STATUS_COLOR[status](STATUS_SYMBOL[status]),
		border  : STATUS_COLOR[status],
		surface : STATUS_SURFACE[status],
	};
}

export function workStepStatusSymbol(status: CommandStatus): string {
	return STATUS_SYMBOL[status];
}
