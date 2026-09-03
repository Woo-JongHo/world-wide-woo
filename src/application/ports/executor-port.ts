import type {
	NativeApprovalResolution,
	NativeHarnessEvent,
	NativeThreadRead,
	NativeThreadList,
	NativeThreadResume,
	NativeThreadSnapshot,
	NativeThreadStart,
	NativeThreadSummary,
	NativeTurnInterrupt,
	NativeTurnSnapshot,
	NativeTurnStart,
} from "../../domain/native-session.js";

/** Application-owned semantic boundary around a native model session host. */
export interface ExecutorPort {
	startThread(input: NativeThreadStart): Promise<NativeThreadSnapshot>;
	resumeThread(input: NativeThreadResume): Promise<NativeThreadSnapshot>;
	readThread(input: NativeThreadRead): Promise<NativeThreadSnapshot>;
	listThreads(input: NativeThreadList): Promise<readonly NativeThreadSummary[]>;
	startTurn(input: NativeTurnStart): Promise<NativeTurnSnapshot>;
	interruptTurn(input: NativeTurnInterrupt): Promise<void>;
	respondToApproval(input: NativeApprovalResolution): Promise<void>;
	subscribe(listener: (event: NativeHarnessEvent) => void): () => void;
	close(): Promise<void>;
}
