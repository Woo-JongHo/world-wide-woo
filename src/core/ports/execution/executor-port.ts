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
} from "@/core/domain/execution/native-session.js";
import type { RuntimeToolDefinition, RuntimeToolHandler } from "@/core/ports/execution/runtime-tool-port";
import type { NativeModelOption }                         from "@/core/domain/execution/model-settings";
import type { UsageSnapshot }                             from "@/core/ports/observability/usage-monitor-port";

/** Application-owned semantic boundary around a native model session host. */
export interface ExecutorPort {
	listModels?(): Promise<readonly NativeModelOption[]>;
	/** Read the active native account's display-safe subscription limits, when supported. */
	readAccountUsage?(): Promise<UsageSnapshot>;
	/** Register before thread creation; does not imply strict isolation support. */
	registerRuntimeTools?(definitions: readonly RuntimeToolDefinition[], handler: RuntimeToolHandler): () => void;
	startThread (input: NativeThreadStart ): Promise<NativeThreadSnapshot>;
	resumeThread(input: NativeThreadResume): Promise<NativeThreadSnapshot>;
	readThread  (input: NativeThreadRead  ): Promise<NativeThreadSnapshot>;
	listThreads (input: NativeThreadList  ): Promise<readonly NativeThreadSummary[]>;
	compactThread?(input: NativeThreadCompact): Promise<void>;
	startTurn(input: NativeTurnStart): Promise<NativeTurnSnapshot>;
	steerTurn?(input: NativeTurnSteer): Promise<NativeTurnSteerResult>;
	interruptTurn    (input: NativeTurnInterrupt                   ): Promise<void>;
	respondToApproval(input: NativeApprovalResolution              ): Promise<void>;
	subscribe        (listener: (event: NativeHarnessEvent) => void): () => void;
	close            ()                                             : Promise<void>;
}
