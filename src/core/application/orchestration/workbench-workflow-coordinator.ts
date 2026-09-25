import type { ProjectActivity }                               from "@/core/domain/execution/project-activity.js";
import type { RequestRuntimeRecord }                          from "@/core/domain/execution/request-runtime.js";
import { projectRequestRuntime }                              from "@/core/runtime/request-runtime.js";
import type { ExecutionRunState }                             from "@/core/runtime/execution-run.js";
import { projectRequestTodo }                                 from "@/core/domain/work/request-projections.js";
import type { TodoDocument, TodoNativePlanBinding }           from "@/core/domain/work/todos.js";
import { projectWorkFlow, projectWorkFlowFromExecutionRun }   from "@/core/domain/work/index.js";
import type {
	DplanHash,
	WorkFlowProjection,
	WorkFlowProjectionInput,
	WorkStepNarration,
} from "@/core/domain/work/index.js";
import type { WorkbenchActionResult, WorkbenchTodoSyncState } from "@/core/domain/work/workbench.js";
import type { RequestProjectionPort }                         from "@/core/ports/execution/request-projection-port.js";
import { TodoWriteConflictError }                             from "@/core/application/work/todo-ledger.js";
import { sanitizeTerminalTextExcerpt }                        from "@/core/domain/execution/terminal.js";
import type { WorkbenchCacheProjection }                      from "@/core/application/orchestration/workbench-cache-projection.js";
import { stableJson }                                         from "@/core/application/orchestration/workbench-projections.js";

const ACTION_RESULT_CHARACTER_LIMIT = 12 * 1024;

interface TodoProjectionPort {
	readonly snapshot: TodoDocument | null;
	syncNativePlan?(flow: WorkFlowProjection, binding: TodoNativePlanBinding): Promise<TodoDocument>;
	syncRequestRuntime?(request: RequestRuntimeRecord): Promise<TodoDocument>;
}

interface WorkflowCoordinatorOptions {
	readonly hash                      : DplanHash                                    ;
	readonly requestProjection?        : RequestProjectionPort                        ;
	readonly todos?                    : TodoProjectionPort                           ;
	readonly cache                     : WorkbenchCacheProjection                     ;
	readonly activities                : () => readonly ProjectActivity[]             ;
	readonly threadId                  : () => string | null                          ;
	readonly activeTurnId              : () => string | null                          ;
	readonly selectedPlanTurnId        : () => string | null                          ;
	readonly pendingPlanGoalActivityId : () => string | null                          ;
	readonly selectedExecutionRun      : () => ExecutionRunState | null               ;
	readonly stepNarrations            : () => ReadonlyMap<string, WorkStepNarration> ;
	readonly narrationRevision         : () => number                                 ;
	readonly todo                      : () => TodoDocument | null                    ;
	readonly setTodo                   : (todo: TodoDocument) => void                 ;
	readonly setError                  : (message: string) => void                    ;
	readonly setActionResult           : (result: WorkbenchActionResult) => void      ;
	readonly publish                   : () => void                                   ;
	readonly processAttachedAt         : string                                       ;
}

export class WorkbenchWorkflowCoordinator {
	private requestCache: { length: number; threadId: string | null; records: readonly RequestRuntimeRecord[] } = {
		length   : -1,
		threadId : null,
		records  : [],
	};
	private readonly requestProjectionKeys                  = new Map<string, string>()                               ;
	private requestProjectionQueue : Promise<void>          = Promise.resolve()                                       ;
	private todoSyncQueue          : Promise<void>          = Promise.resolve()                                       ;
	private todoSyncState          : WorkbenchTodoSyncState = { state: "idle", lastConfirmedAt: null, message: null } ;
	private projection: {
		sourceLength      : number             ;
		narrationRevision : number             ;
		authorityKey      : string | null      ;
		value             : WorkFlowProjection ;
	} = {
		sourceLength      : -1,
		narrationRevision : -1,
		authorityKey      : null,
		value             : projectWorkFlow([]),
	};

	public constructor(private readonly options: WorkflowCoordinatorOptions) {}

	public get todoSync(): WorkbenchTodoSyncState { return this.todoSyncState; }
	public get requestCached(): boolean { return this.requestCache.length >= 0; }

	public confirmTodo(todo: TodoDocument | null): void {
		if (todo && this.todoSyncState.state !== "blocked") {
			this.todoSyncState = immutable({ state: "confirmed", lastConfirmedAt: todo.updatedAt, message: null });
		}
	}

	public invalidateRequests(): void { this.requestCache = { ...this.requestCache, length: -1 }; }
	public invalidateFlow(): void { this.projection.sourceLength = -1; }

	public async wait(): Promise<void> {
		await this.todoSyncQueue.catch(() => undefined);
		await this.requestProjectionQueue.catch(() => undefined);
	}

	public records(): readonly RequestRuntimeRecord[] {
		const activities = this.options.activities();
		const threadId = this.options.threadId();
		if (this.requestCache.length === activities.length && this.requestCache.threadId === threadId) {
			this.options.cache.hit("context");
			return this.requestCache.records;
		}
		const startedAt = performance.now();
		const records = projectRequestRuntime(activities, threadId);
		this.options.cache.miss("context", performance.now() - startedAt, this.requestCache.length >= 0);
		this.requestCache = { length: activities.length, threadId, records };
		return records;
	}

	public currentFlow(): WorkFlowProjection {
		const activities            = this.options.activities()                ;
		const input                 = this.planProjectionInput()               ;
		const run                   = this.options.selectedExecutionRun()      ;
		const narrationRevision     = this.options.narrationRevision()         ;
		const pendingGoalActivityId = this.options.pendingPlanGoalActivityId() ;
		const threadId              = this.options.threadId()                  ;
		const authorityKey = input
			? stableJson(["kind" in input ? "pending-goal" : "selected-root-turn", input.expectedThreadKey, !("kind" in input) ? input.selectedTurnId : null, pendingGoalActivityId])
			: null;
		if (this.projection.sourceLength === activities.length
			&& this.projection.narrationRevision === narrationRevision
			&& this.projection.authorityKey === authorityKey) return this.projection.value;
		const projection = run
			? projectWorkFlowFromExecutionRun(run, this.options.stepNarrations(), input, activities)
			: projectWorkFlow(activities, this.options.stepNarrations(), input);
		const pendingGoal = pendingGoalActivityId && threadId && input && !("kind" in input)
			? projectWorkFlow(activities, new Map(), { kind: "pending-goal", expectedThreadKey: threadId, hash: this.options.hash }).goal
			: null;
		this.projection = {
			sourceLength: activities.length,
			narrationRevision,
			authorityKey,
			value: pendingGoal ? { ...projection, goal: pendingGoal } : projection,
		};
		return this.projection.value;
	}

	public projectedTodo(executionRun: ExecutionRunState | null, flow: WorkFlowProjection): TodoDocument | null {
		const activities = this.options.activities()                                                                                                                                   ;
		const threadId   = this.options.threadId()                                                                                                                                     ;
		const request    = [...this.records()].reverse().find(record => record.turnId === (this.options.activeTurnId() ?? this.options.selectedPlanTurnId())) ?? this.records().at(-1) ;
		if (request) return projectRequestTodo(request, this.options.todo()?.ownerSessionId ?? threadId ?? "pending", activities.length);
		return flow.source?.authority === "native-checklist" && executionRun ? this.executionTodo(executionRun, flow) : null;
	}

	public scheduleNativeTodoSync(activity: ProjectActivity): void {
		if (this.records().length) { this.scheduleRequestProjections(); return; }
		const sync = this.options.todos?.syncNativePlan?.bind(this.options.todos);
		if (!sync) return;
		const flow = this.currentFlow();
		const source = flow.source;
		if (!source || source.authority !== "native-checklist" || source.turnId !== this.options.activeTurnId()) return;
		if (activity.nativeRefs.threadId !== this.options.threadId() || activity.nativeRefs.turnId !== source.turnId) return;
		const method = typeof activity.payload.method === "string" ? activity.payload.method : "";
		const item = typeof activity.payload.params === "object" && activity.payload.params !== null
			? (activity.payload.params as { item?: { type?: unknown } }).item
			: undefined;
		const isPlanActivity = method === "turn/plan/updated" || method === "item/completed"
			&& typeof item?.type === "string" && item.type.toLowerCase() === "plan";
		const updatesPlan = isPlanActivity && source.currentRevision.activityId === activity.id;
		const contributesExecution = flow.steps.some(step => step.activityIds.includes(activity.id));
		if (updatesPlan || contributesExecution) this.enqueueNativeTodoSync(sync, flow);
	}

	public scheduleNarratedTodoSync(): void {
		if (this.records().length) return;
		const sync = this.options.todos?.syncNativePlan?.bind(this.options.todos);
		if (!sync) return;
		const flow = this.currentFlow();
		if (!flow.source
			|| flow.source.authority !== "native-checklist"
			|| flow.source.turnId !== this.options.activeTurnId()
			|| flow.steps.length === 0) return;
		this.enqueueNativeTodoSync(sync, flow);
	}

	public scheduleRequestProjections(): void {
		const records = this.records();
		const selected = [...records].reverse().find(record => record.turnId === this.options.activeTurnId() && record.turnId !== null) ?? records.at(-1);
		for (const request of records) {
			const key = JSON.stringify(request);
			if (this.requestProjectionKeys.get(request.requestId) === key) continue;
			this.requestProjectionKeys.set(request.requestId, key);
			if (this.options.requestProjection) this.requestProjectionQueue = this.requestProjectionQueue.then(async () => {
				try { await this.options.requestProjection?.capture(request); }
				catch {
					this.requestProjectionKeys.delete(request.requestId);
					this.options.setError("Request Projection 저장 실패: 원본 Activity journal은 유지됩니다.");
					this.options.publish();
				}
			});
			const syncRequest = this.options.todos?.syncRequestRuntime?.bind(this.options.todos);
			if (request === selected && syncRequest) this.enqueueRequestTodoSync(request, syncRequest);
		}
	}

	public enqueueNativeTodoSync(sync: NonNullable<TodoProjectionPort["syncNativePlan"]>, flow: WorkFlowProjection): void {
		const binding = this.nativeTodoBinding(flow);
		this.todoSyncState = immutable({
			state           : "syncing",
			lastConfirmedAt : this.todoSyncState.lastConfirmedAt ?? this.options.todo()?.updatedAt ?? null,
			message         : null,
		});
		this.options.publish();
		this.todoSyncQueue = this.todoSyncQueue.catch(() => undefined).then(async () => {
			try {
				const document = await sync(flow, binding);
				this.todoSyncState = immutable({ state: "confirmed", lastConfirmedAt: document.updatedAt, message: null });
				this.options.publish();
			} catch (error) {
				const body = error instanceof TodoWriteConflictError
					? "다른 편집과 충돌했습니다. 저장된 내용을 유지하며 다음 계획 관측 때 다시 확인합니다."
					: "계획을 저장하지 못했습니다. 대화는 계속되며 다음 계획 관측 때 다시 시도합니다.";
				this.todoSyncState = immutable({ state: "blocked", lastConfirmedAt: this.todoSyncState.lastConfirmedAt ?? this.options.todo()?.updatedAt ?? null, message: body });
				this.options.setActionResult(immutable({ kind: "todo", title: "Todo 자동 동기화 보류", body: sanitizeTerminalTextExcerpt(body, ACTION_RESULT_CHARACTER_LIMIT, "head-tail"), createdAt: new Date().toISOString() }));
				this.options.publish();
			}
		});
	}

	private enqueueRequestTodoSync(request: RequestRuntimeRecord, sync: NonNullable<TodoProjectionPort["syncRequestRuntime"]>): void {
		this.todoSyncState = immutable({ state: "syncing", lastConfirmedAt: this.todoSyncState.lastConfirmedAt, message: null });
		this.todoSyncQueue = this.todoSyncQueue.catch(() => undefined).then(async () => {
			try {
				const document = await sync(request);
				this.options.setTodo(immutable(document));
				this.todoSyncState = immutable({ state: "confirmed", lastConfirmedAt: document.updatedAt, message: null });
			} catch {
				this.requestProjectionKeys.delete(request.requestId);
				this.todoSyncState = immutable({ state: "blocked", lastConfirmedAt: this.todoSyncState.lastConfirmedAt, message: "7단계 Todo 저장 실패. 대화는 계속되며 다음 관측에서 재시도합니다." });
			}
			this.options.publish();
		});
	}

	private executionTodo(run: ExecutionRunState, flow: WorkFlowProjection): TodoDocument {
		const previous = this.options.todo();
		return immutable({
			version        : 1,
			revision       : previous?.revision ?? 0,
			ownerSessionId : previous?.ownerSessionId ?? run.threadId,
			storyId        : previous?.storyId ?? null,
			title          : run.objective,
			items: flow.steps.map(step => ({
				id          : step.id,
				content     : step.title,
				status      : step.status === "running" ? "in_progress" as const : step.status === "failed" || step.status === "cancelled" ? "blocked" as const : step.status,
				evidenceIds : step.activityIds,
				details     : [],
			})),
			updatedAt: run.activities.at(-1)?.recordedAt ?? previous?.updatedAt ?? this.options.processAttachedAt,
			...(previous?.source ? { source: previous.source } : {}),
		});
	}

	private planProjectionInput(): WorkFlowProjectionInput | undefined {
		const threadId = this.options.threadId();
		if (!threadId) return undefined;
		const selectedPlanTurnId = this.options.selectedPlanTurnId();
		if (!selectedPlanTurnId) return { kind: "pending-goal", expectedThreadKey: threadId, hash: this.options.hash };
		return { expectedThreadKey: threadId, selectedTurnId: selectedPlanTurnId, hash: this.options.hash };
	}

	private nativeTodoBinding(flow: WorkFlowProjection): TodoNativePlanBinding {
		const source = flow.source;
		if (!source) throw new Error("Native plan source authority is required for Todo binding");
		const threadId = this.options.threadId();
		const request = [...this.options.activities()].reverse().find(activity =>
			activity.nativeRefs.threadId === threadId
			&& activity.nativeRefs.turnId === source.turnId
			&& activity.payload.method === "request/started"
			&& typeof activity.payload.requestId === "string"
		);
		const requestId = typeof request?.payload.requestId === "string" ? request.payload.requestId : null;
		const model = typeof request?.payload.model === "string" && request.payload.model.trim() ? request.payload.model : null;
		return {
			input: request && requestId ? { activityId: request.id, requestId, sourceDigest: request.sourceDigest } : null,
			rootExecution: { provider: null, model, agentId: null, threadId, runId: source.turnId },
		};
	}
}

function immutable<T>(value: T): T {
	return deepFreeze(structuredClone(value));
}

function deepFreeze<T>(value: T): T {
	if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
	for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
	return Object.freeze(value);
}
