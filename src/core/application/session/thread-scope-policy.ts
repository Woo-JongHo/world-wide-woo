import type { CacheLayerObservation }               from "@/core/domain/observability/cache-telemetry.js";
import type { ProjectActivity }                     from "@/core/domain/execution/project-activity.js";
import type { RequestRuntimeRecord }                from "@/core/domain/execution/request-runtime.js";
import type { TNoteDraft }                          from "@/core/domain/work/t-notes.js";
import type { TodoDocument, TodoNativePlanBinding } from "@/core/domain/work/todos.js";
import type { WorkFlowProjection }                  from "@/core/domain/work/index.js";
import type {
	WorkbenchActivityJournal,
	WorkbenchTNoteSource,
	WorkbenchTodoSource,
} from "@/core/application/orchestration/project-workbench.js";

export interface NativeThreadScope {
	readonly threadId  : string ;
	readonly journalId : string ;
	readonly workId    : string ;
}

export type NativeThreadScopeResolver = (threadId: string) => NativeThreadScope;

/** Owns the invariant that one live source can belong to only one Native thread. */
export class NativeThreadScopePolicy {
	private bound: NativeThreadScope | null = null;

	public constructor(
		private readonly resolve: NativeThreadScopeResolver,
		private readonly ownershipLabel = "상태가",
	) {}

	public get current(): NativeThreadScope | null { return this.bound; }

	public bind(threadId: string): NativeThreadScope {
		if (this.bound?.threadId === threadId) return this.bound;
		if (this.bound) throw new Error(`${this.ownershipLabel} 이미 다른 Native thread에 묶여 있습니다.`);
		const scope = this.resolve(threadId);
		if (scope.threadId !== threadId) throw new Error("Native thread scope가 요청한 thread와 일치하지 않습니다.");
		this.bound = scope;
		return scope;
	}

	public release(scope: NativeThreadScope): void {
		if (this.bound === scope) this.bound = null;
	}
}

interface ActivityTrace {
	replace(activities: readonly ProjectActivity[]): Promise<void>;
	append(activity: ProjectActivity): Promise<void>;
}

interface ActivityJournalCacheTelemetry {
	readonly state          : "ready" | "stale" | "unobserved" ;
	readonly entries        : number | null                    ;
	readonly logicalBytes   : number | null                    ;
	readonly hits           : number | null                    ;
	readonly misses         : number | null                    ;
	readonly evictions      : number | null                    ;
	readonly lastAccessedAt : string | null                    ;
}

export interface ThreadScopedActivityJournalOptions {
	/** Enables the durable request receipts that may exist before Native returns a thread. */
	readonly intakeStreamId? : string                                               ;
	readonly createTrace?    : (scope: NativeThreadScope) => ActivityTrace          ;
	readonly cacheTelemetry? : (projectId: string) => ActivityJournalCacheTelemetry ;
}

const PRE_THREAD_INTAKE_METHODS = new Set([
	"request/submitted",
	"request/failed",
	"request/uncertain",
]);

/** Applies Native-thread ownership before delegating durable journal I/O. */
export class ThreadScopedActivityJournal implements WorkbenchActivityJournal {
	private readonly scope : NativeThreadScopePolicy                  ;
	private operations     : Promise<void>        = Promise.resolve() ;
	private boundThreadId  : string | null        = null              ;
	private trace          : ActivityTrace | null = null              ;

	public constructor(
		private readonly journal: WorkbenchActivityJournal,
		resolveScope: NativeThreadScopeResolver,
		private readonly options: ThreadScopedActivityJournalOptions = {},
	) {
		this.scope = new NativeThreadScopePolicy(resolveScope, "활동 기록이");
	}

	public get supportsRequestIntake(): boolean { return this.options.intakeStreamId !== undefined; }

	public bindThread(threadId: string): Promise<void> {
		return this.enqueue(async () => {
			if (this.boundThreadId === threadId) return;
			const scope = this.scope.bind(threadId);
			await this.adoptIntake(scope);
			const trace = this.options.createTrace?.(scope) ?? null;
			if (trace) await trace.replace(await this.journal.readAll(scope.journalId));
			this.trace         = trace    ;
			this.boundThreadId = threadId ;
		});
	}

	public hasBoundThread(): boolean { return this.scope.current !== null; }

	public async append(input: Parameters<WorkbenchActivityJournal["append"]>[0]): ReturnType<WorkbenchActivityJournal["append"]> {
		if (this.acceptsIntake(input)) {
			const intakeStreamId = this.options.intakeStreamId;
			if (intakeStreamId === undefined) throw new Error("요청 접수 stream이 구성되지 않았습니다.");
			return this.journal.append({ ...input, projectId: intakeStreamId });
		}
		const scope = this.requireScope();
		return this.enqueue(async () => {
			const result = await this.journal.append({ ...input, projectId: scope.journalId });
			if (this.trace && result.appended) await this.trace.append(result.activity);
			return result;
		});
	}

	public readAll(_projectId: string): Promise<ProjectActivity[]> {
		const projectId = this.scope.current?.journalId ?? this.options.intakeStreamId;
		return projectId === undefined ? Promise.resolve([]) : this.journal.readAll(projectId);
	}

	public cacheObservation(): CacheLayerObservation | null {
		const projectId = this.scope.current?.journalId ?? this.options.intakeStreamId;
		if (projectId === undefined || this.options.cacheTelemetry === undefined) return null;
		const telemetry = this.options.cacheTelemetry(projectId);
		if (telemetry.state === "unobserved") return null;
		return {
			id             : "session-read",
			state          : telemetry.state,
			entries        : telemetry.entries,
			logicalBytes   : telemetry.logicalBytes,
			hits           : telemetry.hits,
			misses         : telemetry.misses,
			evictions      : telemetry.evictions,
			latencyMs      : null,
			lastAccessedAt : telemetry.lastAccessedAt,
		};
	}

	private acceptsIntake(input: Parameters<WorkbenchActivityJournal["append"]>[0]): boolean {
		return this.scope.current === null
			&& this.options.intakeStreamId !== undefined
			&& input.kind === "progress"
			&& PRE_THREAD_INTAKE_METHODS.has(String(input.payload.method))
			&& input.nativeRefs.threadId === undefined
			&& typeof input.payload.requestId === "string";
	}

	private async adoptIntake(scope: NativeThreadScope): Promise<void> {
		const intakeStreamId = this.options.intakeStreamId;
		if (intakeStreamId === undefined) return;
		const existing = await this.journal.readAll(scope.journalId);
		const adopted  = new Set(existing.map(activity => activity.payload.intakeActivityId));
		for (const entry of await this.journal.readAll(intakeStreamId)) {
			if (entry.projectId !== intakeStreamId || adopted.has(entry.id)) continue;
			await this.journal.append({
				...entry,
				projectId  : scope.journalId,
				nativeRefs : { ...entry.nativeRefs, threadId: scope.threadId },
				payload    : {
					...entry.payload,
					intakeActivityId : entry.id,
					intakeStreamId,
					intakeRecordedAt : entry.recordedAt,
				},
			});
		}
	}

	private requireScope(): NativeThreadScope {
		if (!this.scope.current) throw new Error("활동 기록은 Native thread에 묶인 뒤에만 추가할 수 있습니다.");
		return this.scope.current;
	}

	private enqueue<Result>(operation: () => Promise<Result>): Promise<Result> {
		const result = this.operations.then(operation);
		this.operations = result.then(() => undefined, () => undefined);
		return result;
	}
}

/** Projects Note reads and writes into the one bound Native-thread work scope. */
export class ThreadScopedTNoteSource implements WorkbenchTNoteSource {
	private readonly scope: NativeThreadScopePolicy;

	public constructor(
		private readonly source: WorkbenchTNoteSource,
		resolveScope: NativeThreadScopeResolver,
	) {
		this.scope = new NativeThreadScopePolicy(resolveScope, "Note가");
	}

	public async bindThread(threadId: string): Promise<void> { this.scope.bind(threadId); }

	public readAll(_projectId: string): Promise<readonly TNoteDraft[]> {
		return this.source.readAll(this.requireScope().workId);
	}

	public create(
		input: Parameters<WorkbenchTNoteSource["create"]>[0],
		signal?: AbortSignal,
	): ReturnType<WorkbenchTNoteSource["create"]> {
		const projectId = this.requireScope().workId;
		return this.source.create({
			...input,
			projectId,
			activities: input.activities.map(activity => ({ ...activity, projectId })),
		}, signal);
	}

	private requireScope(): NativeThreadScope {
		if (!this.scope.current) throw new Error("Note는 Native 세션이 시작된 뒤 사용할 수 있습니다.");
		return this.scope.current;
	}
}

export interface ThreadScopedTodoLedger {
	readonly snapshot: TodoDocument | null;
	initialize        ()                                                         : Promise<void>;
	dispose           ()                                                         : void;
	subscribe         (listener: (snapshot: TodoDocument | null) => void        ): () => void;
	syncNativePlan    (flow: WorkFlowProjection, binding: TodoNativePlanBinding ): Promise<TodoDocument>;
	syncRequestRuntime(request: RequestRuntimeRecord                            ): Promise<TodoDocument>;
	create            (title: string, items: readonly string[], storyId?: string): Promise<TodoDocument>;
	add               (content: string, placement: "now" | "after"              ): Promise<TodoDocument>;
	addDetails        (itemId: string, details: readonly string[]               ): Promise<TodoDocument>;
	start             (itemId: string                                           ): Promise<TodoDocument>;
	complete          (itemId: string                                           ): Promise<TodoDocument>;
	block             (itemId: string                                           ): Promise<TodoDocument>;
	reopen            (itemId: string                                           ): Promise<TodoDocument>;
	recordEvidence    (evidenceId: string                                       ): Promise<TodoDocument | null>;
}

export interface ThreadTodoBinding {
	readonly ledger: ThreadScopedTodoLedger;
	importLegacy(): Promise<string | null>;
}

/** Owns Todo binding, retry, and same-thread invariants independently of file layout. */
export class ThreadScopedTodoSource implements WorkbenchTodoSource {
	private readonly scope     : NativeThreadScopePolicy                                                            ;
	private binding            : Promise<void>                 = Promise.resolve()                                  ;
	private ledger             : ThreadScopedTodoLedger | null = null                                               ;
	private todoBinding        : ThreadTodoBinding | null      = null                                               ;
	private ledgerSubscription : (() => void) | null           = null                                               ;
	private readonly listeners                                 = new Set<(snapshot: TodoDocument | null) => void>() ;

	public constructor(
		resolveScope: NativeThreadScopeResolver,
		private readonly createBinding: (scope: NativeThreadScope) => ThreadTodoBinding,
	) {
		this.scope = new NativeThreadScopePolicy(resolveScope, "Todo가");
	}

	public get snapshot(): TodoDocument | null { return this.ledger?.snapshot ?? null; }

	public bindThread(threadId: string): Promise<void> {
		const operation = this.binding.then(async () => {
			if (this.scope.current?.threadId === threadId) return;
			const scope       = this.scope.bind(threadId) ;
			const todoBinding = this.createBinding(scope) ;
			const ledger      = todoBinding.ledger        ;
			this.todoBinding        = todoBinding                                       ;
			this.ledger             = ledger                                            ;
			this.ledgerSubscription = ledger.subscribe(snapshot => this.emit(snapshot)) ;
			try {
				await ledger.initialize();
			} catch (error) {
				this.clearLedger();
				this.scope.release(scope);
				throw error;
			}
		});
		this.binding = operation.catch(() => undefined);
		return operation;
	}

	public subscribe(listener: (snapshot: TodoDocument | null) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	/** Keeps the Workbench's observed input/turn binding intact at the storage boundary. */
	public syncNativePlan(flow: WorkFlowProjection, binding: TodoNativePlanBinding): Promise<TodoDocument> {
		if (!flow.source) throw new Error("Native plan source authority is required for Todo sync");
		return this.requireLedger().syncNativePlan(flow, binding);
	}

	public syncRequestRuntime(request: RequestRuntimeRecord): Promise<TodoDocument> {
		return this.requireLedger().syncRequestRuntime(request);
	}

	public create        (title: string, items: readonly string[], storyId?: string): Promise<TodoDocument> { return this.requireLedger().create(title, items, storyId); }
	public add           (content: string, placement: "now" | "after"              ): Promise<TodoDocument> { return this.requireLedger().add(content, placement); }
	public addDetails    (itemId: string, details: readonly string[]               ): Promise<TodoDocument> { return this.requireLedger().addDetails(itemId, details); }
	public start         (itemId: string                                           ): Promise<TodoDocument> { return this.requireLedger().start(itemId); }
	public complete      (itemId: string                                           ): Promise<TodoDocument> { return this.requireLedger().complete(itemId); }
	public block         (itemId: string                                           ): Promise<TodoDocument> { return this.requireLedger().block(itemId); }
	public reopen        (itemId: string                                           ): Promise<TodoDocument> { return this.requireLedger().reopen(itemId); }
	public recordEvidence(evidenceId: string                                       ): Promise<TodoDocument | null> { return this.requireLedger().recordEvidence(evidenceId); }

	public async importLegacy(): Promise<string | null> {
		const todoBinding = this.requireBinding();
		const imported    = await todoBinding.importLegacy();
		if (imported) await todoBinding.ledger.initialize();
		return imported;
	}

	public dispose(): void {
		this.clearLedger();
		this.listeners.clear();
	}

	private clearLedger(): void {
		this.ledgerSubscription?.();
		this.ledgerSubscription = null;
		this.ledger?.dispose();
		this.ledger      = null;
		this.todoBinding = null;
	}

	private requireLedger(): ThreadScopedTodoLedger {
		if (!this.ledger) throw new Error("Todo는 첫 질문으로 Native 세션이 시작된 뒤 사용할 수 있습니다.");
		return this.ledger;
	}

	private requireBinding(): ThreadTodoBinding {
		if (!this.todoBinding) throw new Error("Todo 경로는 Native 세션이 시작된 뒤 사용할 수 있습니다.");
		return this.todoBinding;
	}

	private emit(snapshot: TodoDocument | null): void {
		for (const listener of this.listeners) {
			try { listener(snapshot); } catch { /* A view cannot break Todo state. */ }
		}
	}
}
