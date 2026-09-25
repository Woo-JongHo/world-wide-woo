import type { WwwSettings }        from "@/core/domain/execution/model-settings";
import type { ToolResultSnapshot } from "@/core/domain/execution/output";
import type { WorkNarration }      from "@/core/domain/work/narration";
import type { ModelAuthStatus }    from "@/core/ports/index.js";

export type SessionPhase = "starting" | "ready" | "streaming" | "error";

export interface WorkspaceContext {
	cwd          : string ;
	root?        : string ;
	projectName? : string ;
}

export type SessionActivityKind = "recording" | "waiting" | "thinking" | "responding" | "tool" | "cancelling";

export interface SessionActivity {
	kind: SessionActivityKind;
	label: string;
}

export interface ConversationTurn {
	id        : string                    ;
	role      : "user" | "assistant"      ;
	content   : string                    ;
	timestamp : number                    ;
	outcome?  : "completed" | "cancelled" ;
}

export interface SessionSnapshot {
	id          : string                        ;
	phase       : SessionPhase                  ;
	turns       : readonly ConversationTurn[]   ;
	draft       : string                        ;
	error       : string | null                 ;
	auth        : ModelAuthStatus | null        ;
	settings    : WwwSettings                   ;
	cwd         : string                        ;
	projectName : string                        ;
	projectRoot : string                        ;
	activity    : SessionActivity | null        ;
	tools       : readonly ToolResultSnapshot[] ;
	narrations  : readonly WorkNarration[]      ;
}

export type SessionListener = (snapshot: SessionSnapshot) => void;
