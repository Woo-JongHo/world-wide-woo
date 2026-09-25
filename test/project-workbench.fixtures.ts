import legacyJournal                                          from "./fixtures/legacy-execution-receipt.json";
import type { RuntimeToolHandler, RuntimeToolDefinition }     from "../src/core/ports/execution/runtime-tool-port";
import { REQUEST_STAGES }                                     from "../src/core/domain/execution/request-runtime";
import type { RequestRuntimeRecord }                          from "../src/core/domain/execution/request-runtime";
import { projectRequestTodo }                                 from "../src/core/domain/work/request-projections";
import { describe, expect, test }                             from "bun:test";
import type { ExecutorPort }                                  from "../src/core/ports/execution/executor-port";
import type {
	ActivityNarrationRequest,
	ActivityNarrator,
} from "../src/core/application/orchestration/activity-narrator";
import { ProjectWorkbench }                                   from "../src/core/application/orchestration/project-workbench";
import type {
	WorkbenchActivityJournal,
	WorkbenchTNoteSource,
	WorkbenchTodoSource,
} from "../src/core/application/orchestration/project-workbench";
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
	NativeTurnSteer,
	NativeTurnSteerResult,
} from "../src/core/domain/execution/native-session";
import type {
	ProjectActivity,
	ProjectActivityAppendResult,
	ProjectActivityInput,
} from "../src/core/domain/execution/project-activity";
import { CanonicalPromotionService, digestCanonicalDocument } from "../src/core/application/work/canonical-promotion";
import { ReviewService }                                      from "../src/core/application/review/review-service";
import { SessionModelUsageAccumulator }                       from "../src/core/application/session/session-model-usage";
import { TodoWriteConflictError }                             from "../src/core/application/work/todo-ledger";
import { WooEntry }                                           from "../src/core/application/orchestration/woo-entry";
import type { WooEntryCollection }                            from "../src/core/application/orchestration/woo-entry";
import type { TodoDocument }                                  from "../src/core/domain/work/todos";
import type { WorkFlowProjection }                            from "../src/core/domain/work";
import { ProviderReviewAdapter, sha256ReviewDigest }          from "../src/adapters/outbound/review/review-adapters";
import { TNoteService }                                       from "../src/core/application/work/t-note-service";
import type { DetachedTextGenerator }                         from "../src/core/application/orchestration/detached-text-generator";
import { FileTNoteStore }                                     from "../src/adapters/outbound/persistence/t-note-store";
import { projectTNoteCompletionIndex, sanitizeTNoteText }     from "../src/core/domain/work/t-notes";
import { mkdtemp, rm, writeFile, readFile, realpath }         from "node:fs/promises";
import { createHash }                                         from "node:crypto";
import { pinnedFileCapabilities }                             from "../src/adapters/outbound/workspace/pinned-file-capabilities";
import { tmpdir }                                             from "node:os";
import { join }                                               from "node:path";

export class MemoryJournal implements WorkbenchActivityJournal {
	readonly records: ProjectActivity[] = [];
	async append(input: ProjectActivityInput): Promise<ProjectActivityAppendResult> {
		const activity: ProjectActivity = {
			...input,
			schemaVersion : 1,
			id            : `activity-${this.records.length + 1}`,
			sequence      : this.records.length + 1,
			recordedAt    : new Date(1_700_000_000_000 + this.records.length).toISOString(),
		};
		this.records.push(activity);
		return { activity, appended: true };
	}
	async readAll(): Promise<ProjectActivity[]> { return [...this.records]; }
}
export class MessageCompletionGateJournal extends MemoryJournal {
	private releaseMessageCompletion: (() => void) | null = null;
	private signalMessageCompletion: (() => void) | null = null;
	readonly messageCompletionReached = new Promise<void>((resolve) => {
		this.signalMessageCompletion = resolve;
	});
	private readonly messageCompletionRelease = new Promise<void>((resolve) => {
		this.releaseMessageCompletion = resolve;
	});

	override async append(input: ProjectActivityInput): Promise<ProjectActivityAppendResult> {
		if (input.kind === "message" && input.phase === "completed") {
			this.signalMessageCompletion?.();
			await this.messageCompletionRelease;
		}
		return super.append(input);
	}

	release(): void {
		this.releaseMessageCompletion?.();
	}
}

export class ToolObservationGateJournal extends MemoryJournal {
	private releaseTool : (() => void) | null = null                                                            ;
	private signalTool  : (() => void) | null = null                                                            ;
	readonly toolReached                      = new Promise<void>((resolve) => { this.signalTool = resolve; })  ;
	private readonly toolRelease              = new Promise<void>((resolve) => { this.releaseTool = resolve; }) ;

	override async append(input: ProjectActivityInput): Promise<ProjectActivityAppendResult> {
		if (input.kind === "tool" && input.phase === "started") {
			this.signalTool?.();
			await this.toolRelease;
		}
		return super.append(input);
	}

	release(): void { this.releaseTool?.(); }
}

export class ApprovalPreparationGateJournal extends MemoryJournal {
	private releasePreparation : (() => void) | null = null                                                                   ;
	private signalPreparation  : (() => void) | null = null                                                                   ;
	readonly preparationReached                      = new Promise<void>((resolve) => { this.signalPreparation = resolve; })  ;
	private readonly preparationRelease              = new Promise<void>((resolve) => { this.releasePreparation = resolve; }) ;

	override async append(input: ProjectActivityInput): Promise<ProjectActivityAppendResult> {
		if (input.payload.method === "governance/decision-prepared") {
			this.signalPreparation?.();
			await this.preparationRelease;
		}
		return super.append(input);
	}

	release(): void { this.releasePreparation?.(); }
}

export class FakeNativeHarness implements ExecutorPort {
	private listener      : ((event: NativeHarnessEvent) => void) | null = null                                                                           ;
	startTurnCalls                                                       = 0                                                                              ;
	startTurnInputs       : NativeTurnStart[]                            = []                                                                             ;
	steerTurnInputs       : NativeTurnSteer[]                            = []                                                                             ;
	steerTurn?            : (input: NativeTurnSteer) => Promise<NativeTurnSteerResult>                                                                    ;
	startTurnErrors                                                      = new Map<number, unknown>()                                                     ;
	startThreadCalls                                                     = 0                                                                              ;
	startThreadInputs     : NativeThreadStart[]                          = []                                                                             ;
	startThreadGate       : Promise<void> | null                         = null                                                                           ;
	startThreadError      : unknown                                      = null                                                                           ;
	startTurnGate         : Promise<void> | null                         = null                                                                           ;
	uncertain                                                            = false                                                                          ;
	approvalResponses     : NativeApprovalResolution[]                   = []                                                                             ;
	approvalResponseError : unknown                                      = null                                                                           ;
	resumeCalls                                                          = 0                                                                              ;
	resumeThreadId        : string | null                                = null                                                                           ;
	readThreadId          : string | null                                = null                                                                           ;
	readCalls                                                            = 0                                                                              ;
	resumeInputs          : NativeThreadResume[]                         = []                                                                             ;
	readInputs            : NativeThreadRead[]                           = []                                                                             ;
	readValue             : Readonly<Record<string, unknown>>            = { status: { type: "idle" }, turns: [] }                                        ;
	interruptInputs       : NativeTurnInterrupt[]                        = []                                                                             ;
	mcpServers                                                           = [{ name: "filesystem", enabled: true, status: "ready", tools: ["read_file"] }] ;
	mcpEnableInputs       : Array<{ name: string; enabled: boolean }>    = []                                                                             ;
	mcpReloadCalls                                                       = 0                                                                              ;
	compactThreadIds      : string[]                                     = []                                                                             ;
	listModelCalls                                                       = 0                                                                              ;
	async startThread(input: NativeThreadStart): Promise<NativeThreadSnapshot> {
		this.startThreadCalls += 1;
		this.startThreadInputs.push(input);
		if (this.startThreadGate) await this.startThreadGate;
		if (this.startThreadError) throw this.startThreadError;
		return { id: "thread-1", value: {} };
	}
	async resumeThread(input: NativeThreadResume): Promise<NativeThreadSnapshot> {
		this.resumeCalls += 1;
		this.resumeInputs.push(input);
		return { id: this.resumeThreadId ?? input.threadId, value: {} };
	}
	async readThread(input: NativeThreadRead): Promise<NativeThreadSnapshot> {
		this.readCalls += 1;
		this.readInputs.push(input);
		return { id: this.readThreadId ?? input.threadId, value: this.readValue };
	}
	async listThreads(_input: NativeThreadList): Promise<readonly NativeThreadSummary[]> { return []; }
	async listModels() {
		this.listModelCalls += 1;
		return [
			{ model: "gpt-5.6-sol", displayName: "GPT-5.6 Sol", efforts: ["high"] as const, defaultEffort: "high" as const },
			{ model: "gpt-5.6-terra", displayName: "GPT-5.6 Terra", efforts: ["medium", "high"] as const, defaultEffort: "medium" as const },
		];
	}
	async startTurn(input: NativeTurnStart): Promise<NativeTurnSnapshot> {
		this.startTurnCalls += 1;
		this.startTurnInputs.push(input);
		if (this.startTurnGate) await this.startTurnGate;
		if (this.startTurnErrors.has(this.startTurnCalls)) throw this.startTurnErrors.get(this.startTurnCalls);
		if (this.uncertain) throw {
			state      : "uncertain",
			resolution : "manual-reconcile",
			method     : "turn/start",
			requestId  : 7,
		};
		return { id: `turn-${this.startTurnCalls}`, threadId: "thread-1", value: {} };
	}
	enableSteering(): void {
		this.steerTurn = async (input) => {
			this.steerTurnInputs.push(input);
			return { turnId: input.expectedTurnId };
		};
	}
	async interruptTurn(input: NativeTurnInterrupt): Promise<void> { this.interruptInputs.push(input); }
	async listMcpServers() { return this.mcpServers; }
	async setMcpServerEnabled(name: string, enabled: boolean): Promise<void> {
		this.mcpEnableInputs.push({ name, enabled });
		this.mcpServers = this.mcpServers.map((server) => server.name === name ? { ...server, enabled } : server);
	}
	async reloadMcpServers(): Promise<void> { this.mcpReloadCalls += 1; }
	async compactThread(input: { threadId: string }): Promise<void> { this.compactThreadIds.push(input.threadId); }
	async respondToApproval(input: NativeApprovalResolution): Promise<void> {
		this.approvalResponses.push(input);
		if (this.approvalResponseError) throw this.approvalResponseError;
	}
	subscribe(listener: (event: NativeHarnessEvent) => void): () => void {
		this.listener = listener;
		return () => { this.listener = null; };
	}
	emit(event: NativeHarnessEvent): void { this.listener?.(event); }
	async close(): Promise<void> {}
}

export class FakeActivityNarrator implements ActivityNarrator {
	readonly calls: ActivityNarrationRequest[] = [];
	async narrate(request: ActivityNarrationRequest) {
		this.calls.push(request);
		return {
			what         : "의미 Step과 Live Notes의 회귀 테스트를 실행합니다.",
			why          : "Read 작업은 숨기고 실제 검증만 단계로 남는지 확인하기 위해서입니다.",
			inputSummary : ["work-flow 관련 테스트"],
		};
	}
}

export function todoDocument(revision = 0): TodoDocument {
	return {
		version: 1,
		revision,
		ownerSessionId : "workbench",
		storyId        : null,
		title          : "작업",
		updatedAt      : "2026-09-01T00:00:00.000Z",
		items          : [{ id: "todo-1", content: "구현", status: "in_progress", evidenceIds: [], details: [] }],
	};
}

export async function ready(workbench: ProjectWorkbench): Promise<void> {
	if (workbench.snapshot.phase !== "loading") return;
	await new Promise<void>((resolve) => {
		const unsubscribe = workbench.subscribe((snapshot) => {
			if (snapshot.phase === "loading") return;
			unsubscribe();
			resolve();
		});
	});
}
