import type {
	NativeApprovalResolution,
	NativeHarnessEvent,
	NativeThreadRead,
	NativeThreadList,
	NativeThreadCompact,
	NativeThreadResume,
	NativeThreadSnapshot,
	NativeThreadStart,
	NativeThreadSummary,
	NativeTurnInterrupt,
	NativeTurnSnapshot,
	NativeTurnStart,
	NativeTurnSteer,
	NativeTurnSteerResult,
} from "../../domain/execution/native-session.js";
import type { RuntimeToolDefinition, RuntimeToolHandler } from "./runtime-tool-port";
import type { NativeModelOption } from "../../domain/execution/model-settings";

/** Application-owned semantic boundary around a native model session host. */
export interface ExecutorPort {
	listModels?(): Promise<readonly NativeModelOption[]>;
	/** Register before thread creation; does not imply strict isolation support. */
	registerRuntimeTools?(definitions: readonly RuntimeToolDefinition[], handler: RuntimeToolHandler): () => void;
	startThread(input: NativeThreadStart): Promise<NativeThreadSnapshot>;
	resumeThread(input: NativeThreadResume): Promise<NativeThreadSnapshot>;
	readThread(input: NativeThreadRead): Promise<NativeThreadSnapshot>;
	listThreads(input: NativeThreadList): Promise<readonly NativeThreadSummary[]>;
	compactThread?(input: NativeThreadCompact): Promise<void>;
	startTurn(input: NativeTurnStart): Promise<NativeTurnSnapshot>;
	steerTurn?(input: NativeTurnSteer): Promise<NativeTurnSteerResult>;
	interruptTurn(input: NativeTurnInterrupt): Promise<void>;
	respondToApproval(input: NativeApprovalResolution): Promise<void>;
	subscribe(listener: (event: NativeHarnessEvent) => void): () => void;
	close(): Promise<void>;
}
