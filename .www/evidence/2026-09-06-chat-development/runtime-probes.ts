import type { ExecutorPort } from "../../../src/application/ports/executor-port";
import type {
	ActivityNarrationRequest,
	ActivityNarrator,
} from "../../../src/application/activity-narrator";
import {
	ProjectWorkbench,
	type WorkbenchActivityJournal,
	type WorkbenchTNoteSource,
	type WorkbenchTodoSource,
} from "../../../src/application/project-workbench";
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
} from "../../../src/domain/native-session";
import type {
	ProjectActivity,
	ProjectActivityAppendResult,
	ProjectActivityInput,
} from "../../../src/domain/project-activity";
import { CanonicalPromotionService, digestCanonicalDocument } from "../../../src/application/canonical-promotion";
import { ReviewService } from "../../../src/application/review-service";
import { SessionModelUsageAccumulator } from "../../../src/application/session-model-usage";
import { TodoWriteConflictError } from "../../../src/application/todo-ledger";
import { WooEntry, type WooEntryCollection } from "../../../src/application/woo-entry";
import type { TodoDocument } from "../../../src/domain/todos";
import type { WorkFlowProjection } from "../../../src/domain/work/index";
import { ProviderReviewAdapter, sha256ReviewDigest } from "../../../src/infrastructure/review-adapters";
import { TNoteService } from "../../../src/application/t-note-service";
import type { DetachedTextGenerator } from "../../../src/application/detached-text-generator";
import { FileTNoteStore } from "../../../src/infrastructure/t-note-store";
import { projectTNoteCompletionIndex, sanitizeTNoteText } from "../../../src/domain/t-notes";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

class MemoryJournal implements WorkbenchActivityJournal {
	readonly records: ProjectActivity[] = [];
	async append(input: ProjectActivityInput): Promise<ProjectActivityAppendResult> {
		const activity: ProjectActivity = {
			...input,
			schemaVersion: 1,
			id: `activity-${this.records.length + 1}`,
			sequence: this.records.length + 1,
			recordedAt: new Date(1_700_000_000_000 + this.records.length).toISOString(),
		};
		this.records.push(activity);
		return { activity, appended: true };
	}
	async readAll(): Promise<ProjectActivity[]> { return [...this.records]; }
}

class MessageCompletionGateJournal extends MemoryJournal {
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

class FakeNativeHarness implements ExecutorPort {
	private listener: ((event: NativeHarnessEvent) => void) | null = null;
	startTurnCalls = 0;
	startTurnInputs: NativeTurnStart[] = [];
	startTurnErrors = new Map<number, unknown>();
	startThreadCalls = 0;
	startThreadInputs: NativeThreadStart[] = [];
	startThreadGate: Promise<void> | null = null;
	startThreadError: unknown = null;
	startTurnGate: Promise<void> | null = null;
	uncertain = false;
	approvalResponses: NativeApprovalResolution[] = [];
	resumeCalls = 0;
	readCalls = 0;
	resumeInputs: NativeThreadResume[] = [];
	readInputs: NativeThreadRead[] = [];
	readValue: Readonly<Record<string, unknown>> = { status: { type: "idle" }, turns: [] };
	interruptInputs: NativeTurnInterrupt[] = [];
	mcpServers = [{ name: "filesystem", enabled: true, status: "ready", tools: ["read_file"] }];
	mcpEnableInputs: Array<{ name: string; enabled: boolean }> = [];
	mcpReloadCalls = 0;
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
		return { id: "thread-1", value: {} };
	}
	async readThread(input: NativeThreadRead): Promise<NativeThreadSnapshot> {
		this.readCalls += 1;
		this.readInputs.push(input);
		return { id: input.threadId, value: this.readValue };
	}
	async listThreads(_input: NativeThreadList): Promise<readonly NativeThreadSummary[]> { return []; }
	async startTurn(input: NativeTurnStart): Promise<NativeTurnSnapshot> {
		this.startTurnCalls += 1;
		this.startTurnInputs.push(input);
		if (this.startTurnGate) await this.startTurnGate;
		if (this.startTurnErrors.has(this.startTurnCalls)) throw this.startTurnErrors.get(this.startTurnCalls);
		if (this.uncertain) throw {
			state: "uncertain",
			resolution: "manual-reconcile",
			method: "turn/start",
			requestId: 7,
		};
		return { id: `turn-${this.startTurnCalls}`, threadId: "thread-1", value: {} };
	}
	async interruptTurn(input: NativeTurnInterrupt): Promise<void> { this.interruptInputs.push(input); }
	async listMcpServers() { return this.mcpServers; }
	async setMcpServerEnabled(name: string, enabled: boolean): Promise<void> {
		this.mcpEnableInputs.push({ name, enabled });
		this.mcpServers = this.mcpServers.map((server) => server.name === name ? { ...server, enabled } : server);
	}
	async reloadMcpServers(): Promise<void> { this.mcpReloadCalls += 1; }
	async respondToApproval(input: NativeApprovalResolution): Promise<void> { this.approvalResponses.push(input); }
	subscribe(listener: (event: NativeHarnessEvent) => void): () => void {
		this.listener = listener;
		return () => { this.listener = null; };
	}
	emit(event: NativeHarnessEvent): void { this.listener?.(event); }
	async close(): Promise<void> {}
}

class FakeActivityNarrator implements ActivityNarrator {
	readonly calls: ActivityNarrationRequest[] = [];
	async narrate(request: ActivityNarrationRequest) {
		this.calls.push(request);
		return {
			what: "의미 Step과 Live T-notes의 회귀 테스트를 실행합니다.",
			why: "Read 작업은 숨기고 실제 검증만 단계로 남는지 확인하기 위해서입니다.",
			inputSummary: ["work-flow 관련 테스트"],
		};
	}
}

function todoDocument(revision = 0): TodoDocument {
	return {
		version: 1,
		revision,
		ownerSessionId: "workbench",
		storyId: null,
		title: "작업",
		updatedAt: "2026-09-01T00:00:00.000Z",
		items: [{ id: "todo-1", content: "구현", status: "in_progress", evidenceIds: [], details: [] }],
	};
}

async function ready(workbench: ProjectWorkbench): Promise<void> {
	if (workbench.snapshot.phase !== "loading") return;
	await new Promise<void>((resolve) => {
		const unsubscribe = workbench.subscribe((snapshot) => {
			if (snapshot.phase === "loading") return;
			unsubscribe();
			resolve();
		});
	});
}


// Investigation probes reuse the existing fake provider/journal. These are not live-provider or TUI acceptance tests.
async function settle(predicate: () => boolean): Promise<void> {
 const deadline = Date.now() + 2000;
 while (!predicate()) { if (Date.now() > deadline) throw new Error("probe setup did not settle"); await Bun.sleep(5); }
}
async function start() {
 const native = new FakeNativeHarness(); const journal = new MemoryJournal();
 const workbench = new ProjectWorkbench(native, journal, {projectId:"chat-progress-probe",cwd:process.cwd()});
 await ready(workbench); await workbench.dispatch({type:"chat.send",content:"fixture request"});
 return {native,journal,workbench};
}
function event(native: FakeNativeHarness, method: string, threadId: string, itemId?: string, params: Record<string,unknown> = {}) {
 native.emit({type:"notification",method,refs:{threadId,turnId:"turn-1",...(itemId?{itemId}:{})},params});
}
const results = [];
{
 const {native,journal,workbench}=await start();
 event(native,"item/agentMessage/delta","thread-1","missing-final",{delta:"partial answer"});
 await settle(()=>workbench.snapshot.draft==="partial answer");
 const before=workbench.snapshot.draft;
 event(native,"turn/completed","thread-1",undefined,{turn:{id:"turn-1",status:"completed"}});
 await settle(()=>journal.records.some(r=>r.payload.method==="turn/completed") && workbench.snapshot.draft==="");
 results.push({issue:"WOO-688",scenario:"turn completes without final message observation",draftBefore:before,draftAfter:workbench.snapshot.draft,assistantMessages:workbench.snapshot.chat.filter(m=>m.role==="assistant").map(m=>m.content),error:workbench.snapshot.error,requirementMet:workbench.snapshot.chat.some(m=>m.content.includes(before))});
 await workbench.close();
}
{
 const {native,workbench}=await start();
 event(native,"item/completed","thread-1","same-item",{item:{type:"agentMessage",text:"root answer"}});
 await settle(()=>workbench.snapshot.chat.some(m=>m.content==="root answer"));
 event(native,"item/completed","child-thread","child-item",{item:{type:"agentMessage",text:"child answer"}});
 await settle(()=>workbench.snapshot.activities.some(a=>a.nativeRefs.itemId==="child-item"));
 event(native,"item/completed","child-thread","same-item",{item:{type:"agentMessage",text:"child collision"}});
 await settle(()=>workbench.snapshot.activities.some(a=>a.nativeRefs.threadId==="child-thread" && a.nativeRefs.itemId==="same-item"));
 const messages=workbench.snapshot.chat.map(m=>({id:m.id,content:m.content}));
 results.push({issue:"WOO-690",scenario:"child message and cross-thread item ID collision",rootThread:workbench.snapshot.threadId,messages,requirementMet:messages.some(m=>m.content==="root answer")&&!messages.some(m=>m.content.startsWith("child"))});
 await workbench.close();
}
{
 const {native,workbench}=await start();
 event(native,"item/completed","thread-1","finished",{item:{type:"agentMessage",text:"final answer"}});
 await settle(()=>workbench.snapshot.chat.some(m=>m.content==="final answer"));
 event(native,"item/agentMessage/delta","thread-1","finished",{delta:"late delta"});
 await settle(()=>workbench.snapshot.draft.length>0);
 results.push({issue:"WOO-688",scenario:"late delta after completed item",draftAfterCompleted:workbench.snapshot.draft,assistantMessages:workbench.snapshot.chat.filter(m=>m.role==="assistant").map(m=>m.content),requirementMet:workbench.snapshot.draft===""});
 await workbench.close();
}
console.log(JSON.stringify({probeType:"fake-provider-state-observation",results},null,2));
