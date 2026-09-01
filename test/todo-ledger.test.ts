import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TodoLedger, TodoWriteConflictError } from "../src/application/todo-ledger.js";
import type { SessionEvent, SessionEventInput } from "../src/domain/session-events";
import { renderTodoMarkdown, type TodoDocument } from "../src/domain/todos";
import type { WorkFlowProjection } from "../src/domain/work-steps";
import type { SessionRepository, TodoStore } from "../src/application/ports";
import { FileTodoStore } from "../src/infrastructure/todo-store.js";

class MemoryTodoStore implements TodoStore {
	public document: TodoDocument | null = null;
	public conflict = false;
	public source: string | null = null;
	public async read(): Promise<TodoDocument | null> { return this.document; }
	public async readSource(): Promise<string | null> { return this.source; }
	public async compareAndSwap(expected: number | null, next: TodoDocument): Promise<"written" | "conflict"> {
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

describe("TodoLedger", () => {
	test("mirrors a Native plan and its live execution summary as a two-level Todo", async () => {
		const fixture = ledger();
		await fixture.ledger.initialize();
		const syncNativePlan = (fixture.ledger as TodoLedger & {
			syncNativePlan(turnId: string, flow: WorkFlowProjection): Promise<TodoDocument>;
		}).syncNativePlan.bind(fixture.ledger);
		const running: WorkFlowProjection = {
			goal: "Native 계획을 Todo로 반영한다",
			steps: [{
				id: "plan:turn-1:1",
				number: 1,
				title: "계획 자동 동기화",
				status: "running",
				activityIds: ["activity-1"],
				observationCount: 0,
				narration: { what: "Todo 저장 경계를 연결합니다.", inputSummary: ["대상 파일 변경"], source: "model" },
			}, {
				id: "plan:turn-1:2",
				number: 2,
				title: "동기화 결과 검증",
				status: "pending",
				activityIds: [],
				observationCount: 0,
				narration: { what: "동기화 결과 검증", inputSummary: [], source: "plan" },
			}],
			completedCount: 0,
			currentStepNumber: 1,
			observationCount: 0,
			summary: "2단계 중 0단계를 완료했고, 현재 1단계를 진행하고 있습니다.",
		};

		const first = await syncNativePlan("turn-1", running);

		expect(first.title).toBe("Native 계획을 Todo로 반영한다");
		expect(first.items.map((item) => [item.id, item.status, item.content])).toEqual([
			["native-step-1", "in_progress", "계획 자동 동기화"],
			["native-step-2", "pending", "동기화 결과 검증"],
		]);
		expect(first.items[0]?.details).toEqual([{
			id: "native-step-1-detail-1",
			content: "대상 파일 변경",
			status: "in_progress",
			evidenceIds: ["activity-1"],
		}]);

		const unchanged = await syncNativePlan("turn-1", running);
		expect(unchanged).toBe(first);
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
