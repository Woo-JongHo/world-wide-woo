import type { ProjectActivity }                                   from "@/core/domain/execution/project-activity.js";
import type { RequestRuntimeRecord }                              from "@/core/domain/execution/request-runtime.js";
import type { WorkFlowProjection, WorkStepNarration }             from "@/core/domain/work/index.js";
import {
	MAX_TNOTE_SOURCE_ACTIVITIES,
	projectActivityToTNoteSource,
	projectTNoteCompletionIndex,
} from "@/core/domain/work/t-notes.js";
import type { TNoteActivitySource, TNoteDraft, TNoteSourceRange } from "@/core/domain/work/t-notes.js";
import type {
	WorkbenchActionResult,
	WorkbenchCommandReceipt,
	WorkbenchTNote,
	WorkbenchTNoteReadState,
} from "@/core/domain/work/workbench.js";
import {
	boundCompletedTurnNoteActivities,
	resolveCompletedTurnNoteScope,
} from "@/core/application/work/completed-turn-note-scope.js";
import { validateCanonicalTNote }                                 from "@/core/application/work/t-note-service.js";
import type { ActivityNarrator }                                  from "@/core/application/orchestration/activity-narrator.js";
import { PlanActivityNarration }                                  from "@/core/application/orchestration/plan-activity-narration.js";
import { projectTNote, turnTNoteInstruction }                     from "@/core/application/orchestration/workbench-artifacts.js";

interface TNoteStore {
	bindThread?(threadId: string): Promise<void>;
	readAll(projectId: string): Promise<readonly TNoteDraft[]>;
	create(input: {
		projectId        : string                         ;
		range            : TNoteSourceRange               ;
		activities       : readonly TNoteActivitySource[] ;
		instruction      : string                         ;
		expectedQuestion : string                         ;
	}, signal?: AbortSignal): Promise<TNoteDraft>;
}

interface NoteNarrationOptions {
	readonly projectId                 : string                                                                                      ;
	readonly source?                   : TNoteStore                                                                                  ;
	readonly narrator?                 : ActivityNarrator                                                                            ;
	readonly activities                : () => readonly ProjectActivity[]                                                            ;
	readonly visibleActivities         : () => readonly ProjectActivity[]                                                            ;
	readonly threadId                  : () => string | null                                                                         ;
	readonly activeTurnId              : () => string | null                                                                         ;
	readonly selectedPlanTurnId        : () => string | null                                                                         ;
	readonly pendingPlanGoalActivityId : () => string | null                                                                         ;
	readonly requestRecords            : () => readonly RequestRuntimeRecord[]                                                       ;
	readonly currentFlow               : () => WorkFlowProjection                                                                    ;
	readonly invalidateFlow            : () => void                                                                                  ;
	readonly scheduleNarratedTodoSync  : () => void                                                                                  ;
	readonly bindTodoThread            : (threadId: string) => Promise<void>                                                         ;
	readonly closed                    : () => boolean                                                                               ;
	readonly actionResult              : () => WorkbenchActionResult | null                                                          ;
	readonly clearActionResult         : () => void                                                                                  ;
	readonly setActionResult           : (kind: WorkbenchActionResult["kind"], title: string, body: string, digest?: string) => void ;
	readonly publish                   : () => void                                                                                  ;
}

interface TNoteRequest {
	readonly turnId: string;
	readonly input: Parameters<TNoteStore["create"]>[0];
}

export class WorkbenchNoteNarration {
	private readonly notesById                         = new Map<string, TNoteDraft>()          ;
	private readonly projectedNotes : WorkbenchTNote[] = []                                     ;
	private readonly completionOrdinals                = new Map<string, number>()              ;
	private readonly automaticTurns                    = new Set<string>()                      ;
	private readonly failedAutomaticTurns              = new Set<string>()                      ;
	private readonly inFlight                          = new Map<string, Promise<TNoteDraft>>() ;
	private queue                   : Promise<void>    = Promise.resolve()                      ;
	private readonly abort                             = new AbortController()                  ;
	private readonly narrations                        = new Map<string, WorkStepNarration>()   ;
	private planNarration?          : PlanActivityNarration                                     ;
	private observedSequence                           = 0                                      ;
	private revisionValue                              = 0                                      ;
	private readStateValue          : WorkbenchTNoteReadState                                   ;
	private readGeneration                             = 0                                      ;
	private noteBinding             : Promise<void>    = Promise.resolve()                      ;
	private boundThreadId           : string | null    = null                                   ;

	public constructor(private readonly options: NoteNarrationOptions) {
		this.readStateValue = options.source?.bindThread
			? Object.freeze({ status: "unavailable", error: null, unavailableReason: "awaiting-thread" })
			: options.source
				? Object.freeze({ status: "loading", error: null })
				: Object.freeze({ status: "unavailable", error: null, unavailableReason: "not-configured" });
	}

	public get notes(): readonly WorkbenchTNote[] { return this.projectedNotes; }
	public get stepNarrations(): ReadonlyMap<string, WorkStepNarration> { return this.narrations; }
	public get revision(): number { return this.revisionValue; }
	public get readState(): WorkbenchTNoteReadState { return this.readStateValue; }

	public note               (id: string      ): TNoteDraft | undefined { return this.notesById.get(id); }
	public setObservedSequence(sequence: number): void { this.observedSequence = sequence; }
	public close              ()                : void { this.readGeneration += 1; this.abort.abort(); }
	public async wait         ()                : Promise<void> { await this.queue.catch(() => undefined); }

	public bindThread(threadId: string): Promise<void> {
		const operation = this.noteBinding.then(async () => {
			if (this.options.closed()) return;
			if (!this.options.source) {
				await this.options.bindTodoThread(threadId);
				return;
			}
			if (this.boundThreadId === threadId && this.readStateValue.status === "ready") {
				await this.options.bindTodoThread(threadId);
				return;
			}
			try {
				await this.options.source?.bindThread?.(threadId);
			} catch (error) {
				if (!this.options.closed() && this.boundThreadId === null) this.setReadState({
					status : "stale",
					error  : error instanceof Error ? error.message : String(error),
				});
				throw error;
			}
			if (this.options.closed()) return;
			this.boundThreadId = threadId;
			const generation = ++this.readGeneration;
			this.setReadState({ status: "loading", error: null });
			await this.loadBoundNotes(generation);
			if (this.options.closed() || generation !== this.readGeneration) return;
			await this.options.bindTodoThread(threadId);
		});
		this.noteBinding = operation.catch(() => undefined);
		return operation;
	}

	public async loadBoundNotes(generation = ++this.readGeneration): Promise<void> {
		if (!this.options.source) return;
		try {
			const notes = await this.options.source.readAll(this.options.projectId);
			if (this.options.closed() || generation !== this.readGeneration) return;
			for (const note of notes) this.remember(note);
			this.setReadState({ status: "ready", error: null });
		} catch (error) {
			if (this.options.closed() || generation !== this.readGeneration) return;
			this.setReadState({
				status : "stale",
				error  : error instanceof Error ? error.message : String(error),
			});
		}
	}

	private setReadState(state: WorkbenchTNoteReadState): void {
		this.readStateValue = Object.freeze(state);
		this.options.publish();
	}

	public async capture(commandId: string, activityIds: readonly string[]): Promise<WorkbenchCommandReceipt> {
		if (!this.options.source) return { state: "rejected", commandId, reason: "Notes 저장소가 연결되지 않았습니다." };
		const activities = this.options.activities();
		const uniqueIds = [...new Set(activityIds)];
		if (uniqueIds.length === 0 || uniqueIds.some(id => !activities.some(activity => activity.id === id))) {
			return { state: "rejected", commandId, reason: "Note의 source activity를 확인할 수 없습니다." };
		}
		const selected = activities.filter(activity => uniqueIds.includes(activity.id)).sort((left, right) => left.sequence - right.sequence);
		const scope = resolveCompletedTurnNoteScope(selected, { type: "exact-selection" });
		if (!scope) return { state: "rejected", commandId, reason: "Note는 완료된 질문 하나의 전체 turn 범위여야 합니다." };
		const request = this.request(scope.activities);
		let existing = this.noteForTurn(request.turnId);
		if (existing) return { state: "accepted", commandId, message: `Note #${existing.sequence}을 사용합니다.` };
		if (this.automaticTurns.has(request.turnId)) {
			await this.queue;
			existing = this.noteForTurn(request.turnId);
			if (existing) return { state: "accepted", commandId, message: `Note #${existing.sequence}을 사용합니다.` };
		}
		const draft = await this.create(request, request.turnId);
		if (!isValidTNote(draft, request)) return { state: "rejected", commandId, reason: "Note 생성 결과 형식이 올바르지 않습니다." };
		this.remember(draft);
		this.options.setActionResult("tnote", `Note #${draft.sequence}`, draft.text, draft.packet.digest);
		return { state: "accepted", commandId, message: `Note #${draft.sequence}을 만들었습니다.` };
	}

	public async captureSession(commandId: string): Promise<WorkbenchCommandReceipt> {
		const scope = resolveCompletedTurnNoteScope(this.options.visibleActivities(), { type: "latest" });
		if (!scope) return { state: "rejected", commandId, reason: "요약할 완료된 질문이 없습니다." };
		return this.capture(commandId, scope.activities.map(activity => activity.id));
	}

	public async captureRange(commandId: string, startSequence: number, endSequence: number): Promise<WorkbenchCommandReceipt> {
		if (!Number.isSafeInteger(startSequence)
			|| !Number.isSafeInteger(endSequence)
			|| startSequence < 1
			|| endSequence < startSequence) {
			return { state: "rejected", commandId, reason: "Note sequence 범위가 올바르지 않습니다." };
		}
		const selected = this.options.activities().filter(activity => activity.sequence >= startSequence && activity.sequence <= endSequence);
		if (selected.length !== endSequence - startSequence + 1 || selected[0]?.sequence !== startSequence || selected.at(-1)?.sequence !== endSequence) {
			return { state: "rejected", commandId, reason: "요청한 Note sequence 범위가 activity journal에서 연속되지 않습니다." };
		}
		return this.capture(commandId, selected.map(activity => activity.id));
	}

	public scheduleAutomatic(turnId: string): void {
		if (!this.options.source
			|| this.options.closed()
			|| this.abort.signal.aborted
			|| this.automaticTurns.has(turnId)
			|| this.failedAutomaticTurns.has(turnId)) return;
		const scope = resolveCompletedTurnNoteScope(this.options.visibleActivities(), { type: "turn", turnId });
		if (!scope || this.hasNoteFor(scope.activities)) return;
		this.automaticTurns.add(turnId);
		const request = this.request(scope.activities);
		this.options.setActionResult("tnote", "완료 보고 작성 중", "요청은 완료되었습니다. 검증 근거를 포함한 Report를 Chat 타임라인에 저장하고 있습니다.");
		this.queue = this.queue.catch(() => undefined).then(async () => {
			try {
				const draft = await this.create(request, turnId);
				if (this.options.closed() || this.abort.signal.aborted) return;
				if (!isValidTNote(draft, request)) throw new Error("Note 생성 결과 형식이 올바르지 않습니다.");
				this.remember(draft);
				this.failedAutomaticTurns.delete(turnId);
				this.options.setActionResult("tnote", `완료 보고 #${draft.sequence}`, "검증 근거를 포함한 Report를 Chat 타임라인에 저장했습니다.");
			} catch {
				if (this.options.closed() || this.abort.signal.aborted) return;
				this.failedAutomaticTurns.add(turnId);
				const action = this.options.actionResult();
				if (action?.kind === "tnote" && action.title === "완료 보고 작성 중") {
					this.options.clearActionResult();
					this.options.publish();
				}
			} finally {
				this.automaticTurns.delete(turnId);
			}
		});
	}

	public reconcileAutomatic(): void {
		const turnIds = new Set<string>();
		for (const activity of this.options.visibleActivities()) {
			if (activity.payload.method === "turn/completed" && activity.phase === "completed" && activity.nativeRefs.turnId) turnIds.add(activity.nativeRefs.turnId);
		}
		for (const turnId of turnIds) this.scheduleAutomatic(turnId);
	}

	public scheduleNarrations(): void {
		const narrator = this.options.narrator;
		if (!narrator || this.options.closed() || this.abort.signal.aborted) return;
		this.planNarration ??= new PlanActivityNarration(narrator, this.abort.signal, (stepId, result) => {
			if (result) {
				this.narrations.set(stepId, immutable({ what: result.what, ...(result.why ? { why: result.why } : {}), inputSummary: result.inputSummary, source: "model" as const }));
				this.revisionValue += 1;
				this.options.invalidateFlow();
				this.options.scheduleNarratedTodoSync();
			}
			this.options.publish();
		});
		this.planNarration.select(this.options.activeTurnId() ?? this.options.selectedPlanTurnId());
		const context = this.narrationContext();
		for (const activity of this.options.activities()) {
			if (activity.sequence <= this.observedSequence) continue;
			this.observedSequence = activity.sequence;
			if (context && activity.nativeRefs.threadId === this.options.threadId()) this.planNarration.observe(activity, context);
		}
	}

	public planSnapshot(): { planActivities: readonly import("@/core/domain/work/workbench.js").PlanActivity[]; planActivityStatus: "disabled" | "pending" | "ready" | "unavailable" } {
		const context = this.narrationContext();
		if (this.planNarration && context) return this.planNarration.snapshot(context.stepId);
		return { planActivities: [], planActivityStatus: this.options.narrator ? "pending" : "disabled" };
	}

	private request(selected: readonly ProjectActivity[]): TNoteRequest {
		const terminal = selected.at(-1)               ;
		const first    = selected[0]                   ;
		const turnId   = terminal?.nativeRefs.turnId   ;
		const threadId = terminal?.nativeRefs.threadId ;
		if (!terminal
			|| !first
			|| !turnId
			|| !threadId) throw new Error("완료된 turn의 Native 참조가 없습니다.");
		const scope = resolveCompletedTurnNoteScope(selected, { type: "turn", turnId });
		if (!scope) throw new Error("완료된 turn의 Note 범위를 확인할 수 없습니다.");
		const number = this.completionOrdinal(threadId, turnId);
		return {
			turnId,
			input: {
				projectId: this.options.projectId,
				range: { startSequence: first.sequence, endSequence: terminal.sequence },
				activities: boundCompletedTurnNoteActivities(selected, MAX_TNOTE_SOURCE_ACTIVITIES).map(activity => ({
					...projectActivityToTNoteSource(activity),
					...(activity.id === terminal.id ? { completion: { threadId, turnId, number, terminalActivityId: terminal.id } } : {}),
				})),
				instruction: turnTNoteInstruction(scope.question),
				expectedQuestion: scope.question,
			},
		};
	}

	private completionOrdinal(threadId: string, turnId: string): number {
		const key = `${threadId}:${turnId}`;
		const reserved = this.completionOrdinals.get(key);
		if (reserved) return reserved;
		const durableMaximum = [...this.notesById.values()].map(note => note.packet.completion)
			.filter((completion): completion is NonNullable<typeof completion> => completion?.threadId === threadId)
			.reduce((maximum, completion) => Math.max(maximum, completion.number), 0);
		const visibleMaximum = projectTNoteCompletionIndex(this.options.visibleActivities(), [...this.notesById.values()].map(note => ({
			id: note.id,
			sourceActivityIds: note.packet.activities.map(activity => activity.id),
			...(note.packet.completion === undefined ? {} : { completion: note.packet.completion }),
		}))).filter(completion => completion.threadId === threadId && completion.turnId !== turnId)
			.reduce((maximum, completion) => Math.max(maximum, completion.number), 0);
		const number = Math.max(durableMaximum, visibleMaximum) + 1;
		this.completionOrdinals.set(key, number);
		return number;
	}

	private async create(request: TNoteRequest, turnId?: string): Promise<TNoteDraft> {
		const source = this.options.source;
		if (!source) throw new Error("Notes 저장소가 연결되지 않았습니다.");
		if (!turnId) return source.create(request.input, this.abort.signal);
		const current = this.inFlight.get(turnId);
		if (current) return current;
		this.automaticTurns.add(turnId);
		const pending = source.create(request.input, this.abort.signal);
		this.inFlight.set(turnId, pending);
		try { return await pending; }
		finally { this.inFlight.delete(turnId); this.automaticTurns.delete(turnId); }
	}

	private noteForTurn(turnId: string): TNoteDraft | undefined {
		const scope = resolveCompletedTurnNoteScope(this.options.visibleActivities(), { type: "turn", turnId });
		const terminalActivityId = scope?.activities.at(-1)?.id;
		return terminalActivityId ? [...this.notesById.values()].find(note => note.packet.activities.some(activity => activity.id === terminalActivityId)) : undefined;
	}

	private hasNoteFor(activities: readonly ProjectActivity[]): boolean {
		const terminalActivityId = activities.at(-1)?.id;
		return Boolean(terminalActivityId && [...this.notesById.values()].some(note => note.packet.activities.some(activity => activity.id === terminalActivityId)));
	}

	private remember(note: TNoteDraft): void {
		if (this.notesById.has(note.id)) return;
		this.notesById.set(note.id, note);
		if (note.packet.completion) this.completionOrdinals.set(`${note.packet.completion.threadId}:${note.packet.completion.turnId}`, note.packet.completion.number);
		this.projectedNotes.push(immutable(projectTNote(note)));
	}

	private narrationContext(): { turnId: string; stepId: string; stepTitle: string; goal: string } | undefined {
		const turnId = this.options.activeTurnId() ?? this.options.selectedPlanTurnId();
		if (!turnId || this.options.pendingPlanGoalActivityId()) return undefined;
		const request = this.options.requestRecords().find(record => record.turnId === turnId && record.threadId === this.options.threadId());
		if (request) {
			const stage = request.stages.find(candidate => candidate.status === "running") ?? [...request.stages].reverse().find(candidate => candidate.status !== "pending");
			return stage ? { turnId, stepId: stage.id, stepTitle: stage.goal, goal: request.objective } : undefined;
		}
		const flow = this.options.currentFlow();
		const step = flow.steps.find(candidate => candidate.status === "running") ?? [...flow.steps].reverse().find(candidate => candidate.status !== "pending");
		return step ? { turnId, stepId: step.id, stepTitle: step.title, goal: flow.goal } : undefined;
	}
}

function isValidTNote(draft: TNoteDraft, request: TNoteRequest): boolean {
	return validateCanonicalTNote(draft.text, request.input.expectedQuestion, { allowLegacy: true, allowRuntimeTestSummary: true }).valid;
}

function immutable<T>(value: T): T {
	return deepFreeze(structuredClone(value));
}

function deepFreeze<T>(value: T): T {
	if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
	for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
	return Object.freeze(value);
}
