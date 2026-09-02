import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TodoIdentityCollisionError, TodoLedger, TodoNativeSourceError, TodoWriteConflictError } from "../src/application/todo-ledger.js";
import type { SessionEvent, SessionEventInput } from "../src/domain/session-events";
import { renderTodoMarkdown, type TodoDocument } from "../src/domain/todos";
import type { SemanticWorkStep, WorkFlowProjection } from "../src/domain/work-steps";
import type { SessionRepository, TodoStore } from "../src/application/ports";
import { FileTodoStore } from "../src/infrastructure/todo-store.js";

class MemoryTodoStore implements TodoStore {
	public document: TodoDocument | null = null;
	public conflict = false;
	public source: string | null = null;
	public compareAndSwapCalls = 0;
	public async read(): Promise<TodoDocument | null> { return this.document; }
	public async readSource(): Promise<string | null> { return this.source; }
	public async compareAndSwap(expected: number | null, next: TodoDocument): Promise<"written" | "conflict"> {
		this.compareAndSwapCalls += 1;
		if (this.conflict || (this.document?.revision ?? null) !== expected) return "conflict";
		this.document = next;
		return "written";
	}
}

class MemoryEvents implements SessionRepository {
	public readonly inputs: SessionEventInput[] = [];
	public async append(_sessionId: string, input: SessionEventInput): Promise<SessionEvent> {
		this.inputs.push(input);
		return {} as SessionEvent;
	}
	public async readAll(_sessionId: string): Promise<SessionEvent[]> { return []; }
}

function ledger(
	sessionId = "session-1",
	store = new MemoryTodoStore(),
	events = new MemoryEvents(),
) {
	return {
		ledger: new TodoLedger(
			sessionId,
			store,
			events,
			() => new Date("2026-08-31T08:00:00.000Z"),
		),
		store,
		events,
	};
}

function nativeIdentity(value: string): SemanticWorkStep["identity"] {
	const revision = nativeRevision(value);
	return { kind: "deterministic-derived", value, originRevision: revision };
}

function nativeRevision(value: string): SemanticWorkStep["currentRevision"] {
	return {
		sourceRevisionKeyDigest: value,
		activityId: `activity-${value}`,
		sequence: 1,
		sourceDigest: `sha256:${value}`,
	};
}

function nativeStep(
	identityValue: string,
	index: number,
	overrides: Partial<Pick<SemanticWorkStep, "title" | "status" | "activityIds" | "observationCount" | "narration">> = {},
): SemanticWorkStep {
	const identity = nativeIdentity(identityValue);
	const currentRevision = nativeRevision(identityValue);
	return {
		id: identity.value,
		identity,
		currentRevision,
		reconciliation: { kind: "minted", evidence: { kind: "mint", tokenDigest: identityValue, sourceRevisionOrdinal: 1, sourcePosition: index } },
		association: null,
		number: index + 1,
		title: `Step ${index + 1}`,
		status: index === 0 ? "running" : "pending",
		activityIds: [],
		observationCount: 0,
		narration: { what: `Step ${index + 1}`, inputSummary: [], source: "plan" },
		...overrides,
	};
}

function nativeFlow(identities: readonly string[]): WorkFlowProjection {
	const revision = nativeRevision("f".repeat(64));
	return {
		source: {
			kind: "native-plan-derived",
			expectedThreadKeyDigest: "f".repeat(64),
			turnId: "turn-native",
			currentRevision: revision,
			algorithm: "dplan-v1",
		},
		retirements: [],
		orphans: [],
		rejections: [],
		goal: "Native plan",
		steps: identities.map((identity, index) => nativeStep(identity, index)),
		completedCount: 0,
		currentStepNumber: 1,
		observationCount: 0,
		summary: "",
	};
}

describe("TodoLedger", () => {
	test("mirrors a Native plan and its live execution summary as a two-level Todo", async () => {
		const fixture = ledger();
		await fixture.ledger.initialize();
		const syncNativePlan = fixture.ledger.syncNativePlan.bind(fixture.ledger);
		const running: WorkFlowProjection = {
			...nativeFlow(["a".repeat(64), "b".repeat(64)]),
			goal: "Native 계획을 Todo로 반영한다",
		steps: [nativeStep("a".repeat(64), 0, {
				title: "계획 자동 동기화",
				status: "running",
				activityIds: ["activity-1"],
				narration: {
					what: "Todo 저장 경계를 연결합니다.",
					why: "진행 상황을 코드가 아닌 문장으로 보여주기 위해서입니다.",
					inputSummary: ["command: sed -n '1,200p' src/application/todo-ledger.ts"],
					source: "model",
				},
		}), nativeStep("b".repeat(64), 1, {
				title: "동기화 결과 검증",
				status: "pending",
				narration: { what: "동기화 결과 검증", inputSummary: [], source: "plan" },
			})],
			summary: "2단계 중 0단계를 완료했고, 현재 1단계를 진행하고 있습니다.",
		};

		const first = await syncNativePlan(running);

		expect(first.title).toBe("Native 계획을 Todo로 반영한다");
		expect(first.items.map((item) => [item.id, item.status, item.content])).toEqual([
			[`native-${"a".repeat(48)}`, "in_progress", "Todo 저장 경계를 연결합니다."],
			[`native-${"b".repeat(48)}`, "pending", "동기화 결과 검증"],
		]);
		expect(first.items[0]?.details).toEqual([{
			id: `native-${"a".repeat(48)}-detail-1`,
			content: "진행 상황을 코드가 아닌 문장으로 보여주기 위해서입니다.",
			status: "in_progress",
			evidenceIds: ["activity-1"],
		}]);

		const unchanged = await syncNativePlan(running);
		expect(unchanged).toBe(first);
		expect(fixture.events.inputs).toHaveLength(1);
	});

	test("uses coarse semantic narration when a narrator is pending, fails, or returns null reasons", async () => {
		const fixture = ledger();
		await fixture.ledger.initialize();
		const syncNativePlan = fixture.ledger.syncNativePlan.bind(fixture.ledger);
		const document = await syncNativePlan({
			...nativeFlow(["c".repeat(64), "d".repeat(64), "e".repeat(64), "f".repeat(64)]),
			goal: "bun test src/application/todo-ledger.ts",
			steps: [nativeStep("c".repeat(64), 0, {
				title: "src/application/todo-ledger.ts 변경",
				status: "running",
				narration: { what: "command: bun test --filter todo", why: null as unknown as string, inputSummary: [], source: "model" },
			}), nativeStep("d".repeat(64), 1, {
				title: "args: {\"path\":\"src/domain/work-steps.ts\"}",
				status: "pending",
				narration: { what: "src/domain/work-steps.ts 변경", inputSummary: [], source: "fallback" },
			}), nativeStep("e".repeat(64), 2, {
				title: "apply_patch src/domain/work-steps.ts",
				status: "pending",
				narration: { what: "args: --path src/domain/work-steps.ts", why: "path: src/domain/work-steps.ts", inputSummary: [], source: "fallback" },
			}), nativeStep("f".repeat(64), 3, {
				title: "todo-ledger.ts 수정",
				status: "pending",
				narration: {
					what: "검증 전에 `bun test --filter todo`를 실행합니다.",
					why: "package.json 변경이 필요한지 확인합니다.",
					inputSummary: [],
					source: "model",
				},
			})],
			summary: "",
		});

		expect(document.title).toBe("현재 요청");
		expect(document.items.map((item) => [item.content, item.details[0]?.content])).toEqual([
			["작업을 진행합니다.", "요청을 안전하게 처리하고 결과를 확인하기 위해서입니다."],
			["작업을 진행합니다.", "요청을 안전하게 처리하고 결과를 확인하기 위해서입니다."],
			["작업을 진행합니다.", "요청을 안전하게 처리하고 결과를 확인하기 위해서입니다."],
			["작업을 진행합니다.", "요청을 안전하게 처리하고 결과를 확인하기 위해서입니다."],
		]);
		expect(JSON.stringify(document)).not.toMatch(/(?:bun test|apply_patch|args:|command:|src\/(?:application|domain)|todo-ledger\.ts|package\.json)/u);
	});

	test("keeps deterministic Native Todo IDs across insertion, reorder, edit, and replay", async () => {
		const fixture = ledger();
		await fixture.ledger.initialize();
		const alpha = "a".repeat(64);
		const beta = "b".repeat(64);
		const gamma = "c".repeat(64);
		const first = await fixture.ledger.syncNativePlan(nativeFlow([alpha, beta]));
		const inserted = await fixture.ledger.syncNativePlan(nativeFlow([gamma, beta, alpha]));
		const editedFlow: WorkFlowProjection = {
			...nativeFlow([gamma, beta, alpha]),
			steps: nativeFlow([gamma, beta, alpha]).steps.map((step, index) =>
				index === 2 ? { ...step, title: "Step 1 edited", narration: { ...step.narration, what: "Step 1 edited" } } : step),
		};
		const edited = await fixture.ledger.syncNativePlan(editedFlow);
		const replay = await fixture.ledger.syncNativePlan(editedFlow);

		expect(first.items.map(item => item.id)).toEqual([`native-${alpha.slice(0, 48)}`, `native-${beta.slice(0, 48)}`]);
		expect(inserted.items.map(item => item.id)).toEqual([`native-${gamma.slice(0, 48)}`, `native-${beta.slice(0, 48)}`, `native-${alpha.slice(0, 48)}`]);
		expect(edited.items.map(item => item.id)).toEqual(inserted.items.map(item => item.id));
		expect(replay).toBe(edited);
		expect(fixture.events.inputs).toHaveLength(3);
	});

	test("rejects invalid identities and truncated-prefix collisions before writes or events", async () => {
		const fixture = ledger();
		await fixture.ledger.initialize();
		const valid = "a".repeat(64);
		const baseline = await fixture.ledger.syncNativePlan(nativeFlow([valid]));
		const prefix = "b".repeat(48);
		const colliding = nativeFlow([`${prefix}${"c".repeat(16)}`, `${prefix}${"d".repeat(16)}`]);
		const baselineCasCalls = fixture.store.compareAndSwapCalls;

		await expect(fixture.ledger.syncNativePlan(colliding)).rejects.toEqual(expect.objectContaining({
			name: "TodoIdentityCollisionError",
			code: "id_collision",
		} satisfies Partial<TodoIdentityCollisionError>));
		await expect(fixture.ledger.syncNativePlan(nativeFlow(["invalid"]))).rejects.toEqual(expect.objectContaining({
			name: "TodoIdentityCollisionError",
			code: "invalid_identity",
		} satisfies Partial<TodoIdentityCollisionError>));
		expect(fixture.ledger.snapshot).toBe(baseline);
		expect(fixture.store.document).toBe(baseline);
		expect(fixture.store.compareAndSwapCalls).toBe(baselineCasCalls);
		expect(fixture.events.inputs).toHaveLength(1);
	});

	test("fails closed for missing or forged Native source authority before writes or events", async () => {
		const fixture = ledger();
		await fixture.ledger.initialize();
		const valid = "a".repeat(64);
		const baseline = await fixture.ledger.syncNativePlan(nativeFlow([valid]));
		const source = nativeFlow([valid]).source!;
		const forgedSources: readonly unknown[] = [
			null,
			{ ...source, kind: "forged" },
			{ ...source, algorithm: "dplan-v2" },
			{ ...source, turnId: "" },
			{ ...source, turnId: 42 },
			{ ...source, expectedThreadKeyDigest: "f".repeat(63) },
			{ ...source, currentRevision: { ...source.currentRevision, sourceRevisionKeyDigest: "g".repeat(64) } },
			{ ...source, currentRevision: { ...source.currentRevision, activityId: "" } },
			{ ...source, currentRevision: { ...source.currentRevision, sequence: 0 } },
			{ ...source, currentRevision: { ...source.currentRevision, sourceDigest: `sha256:${"g".repeat(64)}` } },
			{ ...source, currentRevision: null },
		];
		const baselineCasCalls = fixture.store.compareAndSwapCalls;

		for (const forgedSource of forgedSources) {
			await expect(fixture.ledger.syncNativePlan({
				...nativeFlow([valid]),
				source: forgedSource as WorkFlowProjection["source"],
			})).rejects.toEqual(expect.objectContaining({
				name: "TodoNativeSourceError",
				code: "invalid_source",
			} satisfies Partial<TodoNativeSourceError>));
		}
		expect(fixture.ledger.snapshot).toBe(baseline);
		expect(fixture.store.document).toBe(baseline);
		expect(fixture.store.compareAndSwapCalls).toBe(baselineCasCalls);
		expect(fixture.events.inputs).toHaveLength(1);
	});

	test("creates stable IDs, refuses unfinished replacement, and shares project work across sessions", async () => {
		const fixture = ledger();
		await fixture.ledger.initialize();
		const created = await fixture.ledger.create("Current work", ["one", "two"]);
		expect(created.items.map((item) => item.id)).toEqual(["todo-1", "todo-2"]);
		await expect(fixture.ledger.create("Replacement", ["three"])).rejects.toThrow("unfinished");
		const other = ledger("session-2", fixture.store).ledger;
		await expect(other.initialize()).resolves.toBeUndefined();
		expect(other.snapshot).toEqual(created);
	});

	test("enforces one active item across shared sessions", async () => {
		const fixture = ledger();
		await fixture.ledger.initialize();
		await fixture.ledger.create("Work", ["one", "two"]);
		const other = ledger("session-2", fixture.store).ledger;
		await other.initialize();
		await other.start("todo-1");
		await expect(other.start("todo-2")).rejects.toThrow("already active");
	});

	test("requires unique evidence recorded while active before completion", async () => {
		const fixture = ledger();
		await fixture.ledger.initialize();
		await fixture.ledger.create("Work", ["one"]);
		await fixture.ledger.start("todo-1");
		await expect(fixture.ledger.complete("todo-1")).rejects.toThrow("requires evidence");
		await fixture.ledger.recordEvidence("proof-1");
		await expect(fixture.ledger.recordEvidence("proof-1")).resolves.toBeNull();
		const completed = await fixture.ledger.complete("todo-1");
		expect(completed.items[0]).toMatchObject({ status: "completed", evidenceIds: ["proof-1"] });
	});

	test("runs one-level detail work with stable IDs and records evidence on the active detail", async () => {
		const fixture = ledger();
		await fixture.ledger.initialize();
		const created = await fixture.ledger.create("Work", ["parent"]);
		expect(created.items[0]?.details).toEqual([]);
		const detailed = await fixture.ledger.addDetails("todo-1", ["first", "second"]);
		expect(detailed.items[0]?.details.map(detail => detail.id)).toEqual(["todo-1-detail-1", "todo-1-detail-2"]);
		await fixture.ledger.addDetails("todo-1", ["third"]);
		expect(fixture.ledger.snapshot?.items[0]?.details.map(detail => detail.id)).toEqual(["todo-1-detail-1", "todo-1-detail-2", "todo-1-detail-3"]);
		await expect(fixture.ledger.start("todo-1-detail-1")).rejects.toThrow("active parent");
		await fixture.ledger.start("todo-1");
		await fixture.ledger.start("todo-1-detail-1");
		await expect(fixture.ledger.start("todo-1-detail-2")).rejects.toThrow("already active");
		await fixture.ledger.recordEvidence("detail-proof");
		expect(fixture.ledger.snapshot?.items[0]?.evidenceIds).toEqual([]);
		expect(fixture.ledger.snapshot?.items[0]?.details[0]?.evidenceIds).toEqual(["detail-proof"]);
		await fixture.ledger.complete("todo-1-detail-1");
		await fixture.ledger.start("todo-1-detail-2");
		await fixture.ledger.recordEvidence("second-proof");
		await fixture.ledger.complete("todo-1-detail-2");
		await fixture.ledger.start("todo-1-detail-3");
		await fixture.ledger.recordEvidence("third-proof");
		await fixture.ledger.complete("todo-1-detail-3");
		await expect(fixture.ledger.complete("todo-1")).resolves.toMatchObject({ items: [{ status: "completed" }] });
	});

	test("blocks and reopens details, blocks an active detail with its parent, and requires every detail for parent completion", async () => {
		const fixture = ledger();
		await fixture.ledger.initialize();
		await fixture.ledger.create("Work", ["parent"]);
		await fixture.ledger.addDetails("todo-1", ["first", "second"]);
		await fixture.ledger.start("todo-1");
		await fixture.ledger.start("todo-1-detail-1");
		await expect(fixture.ledger.complete("todo-1")).rejects.toThrow("all details");
		const blocked = await fixture.ledger.block("todo-1");
		expect(blocked.items[0]?.status).toBe("blocked");
		expect(blocked.items[0]?.details[0]?.status).toBe("blocked");
		await fixture.ledger.reopen("todo-1");
		await fixture.ledger.reopen("todo-1-detail-1");
		expect(fixture.ledger.snapshot?.items[0]?.status).toBe("pending");
		expect(fixture.ledger.snapshot?.items[0]?.details[0]?.status).toBe("pending");
		await expect(fixture.ledger.addDetails("todo-1", Array.from({ length: 7 }, (_, index) => `extra ${index}`))).rejects.toThrow("limit");
	});

	test("blocks pending or active items and reopens only blocked items", async () => {
		const fixture = ledger();
		await fixture.ledger.initialize();
		await fixture.ledger.create("Work", ["one"]);
		const blocked = await fixture.ledger.block("todo-1");
		expect(blocked.items[0]?.status).toBe("blocked");
		const reopened = await fixture.ledger.reopen("todo-1");
		expect(reopened.items[0]?.status).toBe("pending");
		await expect(fixture.ledger.reopen("todo-1")).rejects.toThrow("blocked");
	});

	test("does not record evidence for another owner or without an active item", async () => {
		const fixture = ledger();
		await fixture.ledger.initialize();
		await fixture.ledger.create("Work", ["one"]);
		expect(await fixture.ledger.recordEvidence("proof-1")).toBeNull();
		await fixture.ledger.start("todo-1");
	});

	test("accepts a project Todo created by another session", async () => {
		const fixture = ledger();
		await fixture.ledger.initialize();
		await fixture.ledger.create("Work", ["one"]);
		const next = ledger("session-2", fixture.store, fixture.events).ledger;
		await expect(next.initialize()).resolves.toBeUndefined();
		expect(next.snapshot?.title).toBe("Work");
	});

	test("caps evidence and Todo rewrites at eight observations per active item", async () => {
		const fixture = ledger();
		await fixture.ledger.initialize();
		await fixture.ledger.create("Work", ["one"]);
		await fixture.ledger.start("todo-1");
		for (let index = 0; index < 10; index += 1) await fixture.ledger.recordEvidence(`proof-${index}`);
		expect(fixture.ledger.snapshot?.items[0]?.evidenceIds).toHaveLength(8);
		expect(fixture.events.inputs).toHaveLength(10);
	});

	test("queues work after the active item or interrupts it now without losing order", async () => {
		const fixture = ledger();
		await fixture.ledger.initialize();
		await fixture.ledger.create("Work", ["one", "two"]);
		await fixture.ledger.start("todo-1");
		const queued = await fixture.ledger.add("three", "after");
		expect(queued.items.map(item => [item.id, item.status])).toEqual([
			["todo-1", "in_progress"],
			["todo-3", "pending"],
			["todo-2", "pending"],
		]);
		const interrupted = await fixture.ledger.add("urgent", "now");
		expect(interrupted.items.map(item => [item.id, item.status])).toEqual([
			["todo-4", "in_progress"],
			["todo-1", "pending"],
			["todo-3", "pending"],
			["todo-2", "pending"],
		]);
	});

	test("reloads and emits the durable document after a CAS conflict", async () => {
		const fixture = ledger();
		await fixture.ledger.initialize();
		await fixture.ledger.create("Work", ["one"]);
		const durable = { ...fixture.store.document!, revision: 8, title: "Written elsewhere" } as TodoDocument;
		fixture.store.document = durable;
		const snapshots: (TodoDocument | null)[] = [];
		fixture.ledger.subscribe((snapshot) => snapshots.push(snapshot));
		await expect(fixture.ledger.start("todo-1")).rejects.toThrow("concurrently");
		expect(fixture.ledger.snapshot).toEqual(durable);
		expect(snapshots).toEqual([durable]);
	});

	test("reports the exact current source and pending patch on a CAS conflict", async () => {
		const fixture = ledger();
		await fixture.ledger.initialize();
		await fixture.ledger.create("Work", ["one"]);
		fixture.store.conflict = true;
		fixture.store.source = "# externally edited source\r\n";
		try {
			await fixture.ledger.start("todo-1");
			throw new Error("expected conflict");
		} catch (error) {
			expect(error).toBeInstanceOf(TodoWriteConflictError);
			const conflict = error as TodoWriteConflictError;
			expect(conflict.currentSource).toBe(fixture.store.source);
			expect(conflict.pending.items[0]?.status).toBe("in_progress");
		}
	});

	test("reflects a debounced external file edit in the live ledger snapshot", async () => {
		const directory = await mkdtemp(join(tmpdir(), "www-todo-ledger-watch-"));
		const path = join(directory, "Todo.md");
		const ledger = new TodoLedger("session-1", new FileTodoStore(path), new MemoryEvents());
		try {
			await ledger.initialize();
			const created = await ledger.create("Local", ["one"]);
			await Bun.sleep(100);
			await writeFile(path, renderTodoMarkdown({
				...created,
				revision: 1,
				title: "Edited in Obsidian",
				updatedAt: "2026-08-31T08:01:00.000Z",
			}));
			await Bun.sleep(140);
			expect(ledger.snapshot?.title).toBe("Edited in Obsidian");
			expect(ledger.snapshot?.revision).toBe(1);
		} finally {
			ledger.dispose();
			await rm(directory, { recursive: true, force: true });
		}
	});

	test("appends one sanitized todo.updated event and isolates broken listeners", async () => {
		const fixture = ledger();
		fixture.ledger.subscribe(() => { throw new Error("broken listener"); });
		await fixture.ledger.initialize();
		const created = await fixture.ledger.create("Token: 'sk-secret-value'", ["one"]);
		expect(fixture.events.inputs).toHaveLength(1);
		expect(fixture.events.inputs[0]).toMatchObject({ type: "todo.updated", metadata: { todo: created } });
		expect(fixture.events.inputs[0]?.metadata?.todo).toEqual(created);
	});
});
