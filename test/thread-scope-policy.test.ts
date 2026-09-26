import { expect, test } from "bun:test";

import {
	NativeThreadScopePolicy,
	ThreadScopedActivityJournal,
	ThreadScopedTNoteSource,
	ThreadScopedTodoSource,
} from "../src/core/application/session/thread-scope-policy.js";
import type {
	ProjectActivity,
	ProjectActivityAppendResult,
	ProjectActivityInput,
} from "../src/core/domain/execution/project-activity.js";
import type { WorkbenchActivityJournal } from "../src/core/application/orchestration/project-workbench.js";
import type { TodoDocument }             from "../src/core/domain/work/todos.js";

class MemoryJournal implements WorkbenchActivityJournal {
	public readonly activities = new Map<string, ProjectActivity[]>();

	public async append(input: ProjectActivityInput): Promise<ProjectActivityAppendResult> {
		const stream   = this.activities.get(input.projectId) ?? [];
		const activity = {
			...input,
			schemaVersion : 1 as const,
			id            : `${input.projectId}-${stream.length + 1}`,
			sequence      : stream.length + 1,
			recordedAt    : new Date(0).toISOString(),
		};
		stream.push(activity);
		this.activities.set(input.projectId, stream);
		return { activity, appended: true };
	}

	public async readAll(projectId: string): Promise<ProjectActivity[]> {
		return [...(this.activities.get(projectId) ?? [])];
	}
}

class ConcurrentAdoptionJournal extends MemoryJournal {
	public adoptionAppends                       = 0               ;
	public readonly adoptionStarted : Promise<void>                ;
	private signalAdoptionStarted   : () => void = () => undefined ;

	public constructor(private readonly adoptionGate: Promise<void>) {
		super();
		this.adoptionStarted = new Promise(resolve => { this.signalAdoptionStarted = resolve; });
	}

	public override async append(input: ProjectActivityInput): Promise<ProjectActivityAppendResult> {
		if (input.payload.intakeActivityId !== undefined) {
			this.adoptionAppends += 1;
			if (this.adoptionAppends === 1) {
				this.signalAdoptionStarted();
				await this.adoptionGate;
			}
		}
		return super.append(input);
	}
}

const activity = (method: string, requestId = "request-1"): ProjectActivityInput => ({
	projectId    : "caller-supplied",
	kind         : "progress",
	phase        : "completed",
	provider     : "native",
	nativeRefs   : {},
	sourceDigest : `sha256:${"1".repeat(64)}`,
	payload      : { method, requestId },
});

const resolveScope = (threadId: string) => ({
	threadId,
	journalId : `journal-${threadId}`,
	workId    : `work-${threadId}`,
});

test("Native thread scope permits idempotent same-thread bind and rejects a different thread", () => {
	const policy = new NativeThreadScopePolicy(resolveScope);

	const first = policy.bind("thread-a");
	expect(first).toEqual({ threadId: "thread-a", journalId: "journal-thread-a", workId: "work-thread-a" });
	expect(policy.bind("thread-a")).toBe(first);
	expect(() => policy.bind("thread-b")).toThrow("이미 다른 Native thread");
});

test("pre-thread intake accepts only durable request intake methods", async () => {
	const store   = new MemoryJournal();
	const journal = new ThreadScopedActivityJournal(store, resolveScope, { intakeStreamId: "request-intake" });

	for (const method of ["request/submitted", "request/failed", "request/uncertain"] as const) {
		await expect(journal.append(activity(method))).resolves.toMatchObject({ appended: true });
	}
	for (const method of ["request/queued", "request/started", "thread/start"] as const) {
		await expect(journal.append(activity(method))).rejects.toThrow("Native thread에 묶인 뒤에만");
	}
	expect((await store.readAll("request-intake")).map(entry => entry.payload.method)).toEqual([
		"request/submitted",
		"request/failed",
		"request/uncertain",
	]);
});

test("intake adoption is idempotent and preserves provenance", async () => {
	const store   = new MemoryJournal();
	const journal = new ThreadScopedActivityJournal(store, resolveScope, { intakeStreamId: "request-intake" });

	await journal.append(activity("request/submitted"));
	await journal.bindThread("thread-a");
	await journal.bindThread("thread-a");

	const adopted = await store.readAll("journal-thread-a");
	expect(adopted).toHaveLength(1);
	expect(adopted[0]).toMatchObject({
		projectId   : "journal-thread-a",
		nativeRefs  : { threadId: "thread-a" },
		payload     : {
			intakeActivityId : "request-intake-1",
			intakeStreamId   : "request-intake",
			intakeRecordedAt : new Date(0).toISOString(),
		},
	});
	await expect(journal.bindThread("thread-b")).rejects.toThrow("이미 다른 Native thread");
});

test("concurrent same-thread Activity binds adopt intake and rebuild trace once", async () => {
	let releaseFirstAdoption: () => void = () => undefined                                                   ;
	const adoptionGate                   = new Promise<void>(resolve => { releaseFirstAdoption = resolve; }) ;
	const store                          = new ConcurrentAdoptionJournal(adoptionGate)                       ;
	let traceReplacements                = 0                                                                 ;
	const journal = new ThreadScopedActivityJournal(store, resolveScope, {
		intakeStreamId : "request-intake",
		createTrace    : () => ({
			replace: async () => { traceReplacements += 1; },
			append : async () => undefined,
		}),
	});

	await journal.append(activity("request/submitted"));
	const firstBind  = journal.bindThread("thread-a");
	const secondBind = journal.bindThread("thread-a");
	await store.adoptionStarted;
	releaseFirstAdoption();

	await expect(Promise.all([firstBind, secondBind])).resolves.toEqual([undefined, undefined]);
	expect(store.adoptionAppends).toBe(1);
	expect(await store.readAll("journal-thread-a")).toHaveLength(1);
	expect(traceReplacements).toBe(1);
});

test("Activity append waits for an in-flight trace rebuild and reaches the rebuilt trace", async () => {
	let releaseTraceReplace : () => void = () => undefined                                                  ;
	let signalTraceStarted  : () => void = () => undefined                                                  ;
	const traceReplaceGate               = new Promise<void>(resolve => { releaseTraceReplace = resolve; }) ;
	const traceStarted                   = new Promise<void>(resolve => { signalTraceStarted = resolve; })  ;
	const traceOrder        : string[]   = []                                                               ;
	const journal = new ThreadScopedActivityJournal(new MemoryJournal(), resolveScope, {
		createTrace: () => ({
			replace: async () => {
				traceOrder.push("replace:start");
				signalTraceStarted();
				await traceReplaceGate;
				traceOrder.push("replace:end");
			},
			append: async appended => { traceOrder.push(`append:${appended.id}`); },
		}),
	});

	const binding = journal.bindThread("thread-a");
	await traceStarted;
	const appending = journal.append(activity("thread/start"));
	releaseTraceReplace();

	const [, result] = await Promise.all([binding, appending]);
	expect(result.appended).toBe(true);
	expect(traceOrder).toEqual(["replace:start", "replace:end", `append:${result.activity.id}`]);
});

test("Activity append preserves the canonical result and recovers after a trace append failure", async () => {
	const store = new MemoryJournal();
	let traceAppendAttempts = 0;
	const journal = new ThreadScopedActivityJournal(store, resolveScope, {
		createTrace: () => ({
			replace : async () => undefined,
			append  : async () => {
				traceAppendAttempts += 1;
				if (traceAppendAttempts === 1) throw new Error("fixture trace append failure");
			},
		}),
	});

	await journal.bindThread("thread-a");
	await expect(journal.append(activity("item/started", "request-1"))).rejects.toThrow("fixture trace append failure");
	expect(await store.readAll("journal-thread-a")).toHaveLength(1);

	const recovered = await journal.append(activity("item/completed", "request-2"));
	expect(recovered).toMatchObject({ appended: true, activity: { id: "journal-thread-a-2" } });
	expect(traceAppendAttempts).toBe(2);
});

test("concurrent different-thread Activity bind is rejected after the first binding", async () => {
	const journal   = new ThreadScopedActivityJournal(new MemoryJournal(), resolveScope) ;
	const firstBind = journal.bindThread("thread-a")                                     ;
	const otherBind = journal.bindThread("thread-b")                                     ;

	await expect(firstBind).resolves.toBeUndefined();
	await expect(otherBind).rejects.toThrow("활동 기록이 이미 다른 Native thread");
});

test("Note and Todo sources reuse one thread scope and reject cross-thread rebinds", async () => {
	const noteReads: string[] = [];
	const notes = new ThreadScopedTNoteSource({
		readAll: async projectId => { noteReads.push(projectId); return []; },
		create: async () => { throw new Error("not used"); },
	}, resolveScope);
	expect(() => notes.readAll("ignored")).toThrow("Native 세션이 시작된 뒤");
	await notes.bindThread("thread-a");
	await notes.bindThread("thread-a");
	await notes.readAll("ignored");
	expect(noteReads).toEqual(["work-thread-a"]);
	await expect(notes.bindThread("thread-b")).rejects.toThrow("이미 다른 Native thread");

	let created = 0;
	const todos = new ThreadScopedTodoSource(resolveScope, () => {
		created += 1;
		return { ledger: new EmptyTodoLedger(), importLegacy: async () => null };
	});
	await todos.bindThread("thread-a");
	await todos.bindThread("thread-a");
	expect(created).toBe(1);
	await expect(todos.bindThread("thread-b")).rejects.toThrow("이미 다른 Native thread");
	todos.dispose();
});

test("Todo bind cleans one failed initialization and retries the same thread", async () => {
	const ledgers: TrackingInitializationTodoLedger[] = [];
	const todos = new ThreadScopedTodoSource(resolveScope, () => {
		const ledger = new TrackingInitializationTodoLedger(ledgers.length === 0);
		ledgers.push(ledger);
		return { ledger, importLegacy: async () => null };
	});

	await expect(todos.bindThread("thread-a")).rejects.toThrow("fixture initialize failure");
	expect(ledgers).toHaveLength(1);
	expect(ledgers[0]).toMatchObject({ initializes: 1, unsubscribes: 1, disposes: 1 });

	await todos.bindThread("thread-a");
	await todos.bindThread("thread-a");
	expect(ledgers).toHaveLength(2);
	expect(ledgers[1]).toMatchObject({ initializes: 1, unsubscribes: 0, disposes: 0 });
	todos.dispose();
});

class EmptyTodoLedger {
	public readonly snapshot: TodoDocument | null = null;

	public async initialize        ()                                                  : Promise<void> {}
	public dispose                 ()                                                  : void {}
	public subscribe               (_listener: (snapshot: TodoDocument | null) => void): () => void { return () => undefined; }
	public async syncNativePlan    ()                                                  : Promise<TodoDocument> { throw new Error("not used"); }
	public async syncRequestRuntime()                                                  : Promise<TodoDocument> { throw new Error("not used"); }
	public async create            ()                                                  : Promise<TodoDocument> { throw new Error("not used"); }
	public async add               ()                                                  : Promise<TodoDocument> { throw new Error("not used"); }
	public async addDetails        ()                                                  : Promise<TodoDocument> { throw new Error("not used"); }
	public async start             ()                                                  : Promise<TodoDocument> { throw new Error("not used"); }
	public async complete          ()                                                  : Promise<TodoDocument> { throw new Error("not used"); }
	public async block             ()                                                  : Promise<TodoDocument> { throw new Error("not used"); }
	public async reopen            ()                                                  : Promise<TodoDocument> { throw new Error("not used"); }
	public async recordEvidence    ()                                                  : Promise<TodoDocument | null> { throw new Error("not used"); }
}

class TrackingInitializationTodoLedger extends EmptyTodoLedger {
	public initializes  = 0 ;
	public unsubscribes = 0 ;
	public disposes     = 0 ;

	public constructor(private readonly failInitialization: boolean) { super(); }

	public override async initialize(): Promise<void> {
		this.initializes += 1;
		if (this.failInitialization) throw new Error("fixture initialize failure");
	}

	public override dispose(): void { this.disposes += 1; }

	public override subscribe(_listener: (snapshot: TodoDocument | null) => void): () => void {
		return () => { this.unsubscribes += 1; };
	}
}
