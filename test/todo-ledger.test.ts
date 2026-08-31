import { describe, expect, test } from "bun:test";
import { TodoLedger } from "../src/application/todo-ledger.js";
import type { SessionEvent, SessionEventInput } from "../src/domain/session-events";
import type { TodoDocument } from "../src/domain/todos";
import type { SessionRepository, TodoStore } from "../src/application/ports";

class MemoryTodoStore implements TodoStore {
	public document: TodoDocument | null = null;
	public conflict = false;
	public async read(): Promise<TodoDocument | null> { return this.document; }
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
	isSessionActive: (sessionId: string) => Promise<boolean> = async () => true,
) {
	return {
		ledger: new TodoLedger(
			sessionId,
			store,
			events,
			() => new Date("2026-08-31T08:00:00.000Z"),
			isSessionActive,
		),
		store,
		events,
	};
}

describe("TodoLedger", () => {
	test("creates stable IDs and refuses to overwrite unfinished or actively owned work", async () => {
		const fixture = ledger();
		await fixture.ledger.initialize();
		const created = await fixture.ledger.create("Current work", ["one", "two"]);
		expect(created.items.map((item) => item.id)).toEqual(["todo-1", "todo-2"]);
		await expect(fixture.ledger.create("Replacement", ["three"])).rejects.toThrow("unfinished");
		const other = ledger("session-2", fixture.store).ledger;
		await other.initialize();
		await expect(other.create("Replacement", ["three"])).rejects.toThrow("active session");
	});

	test("enforces owner and one active item", async () => {
		const fixture = ledger();
		await fixture.ledger.initialize();
		await fixture.ledger.create("Work", ["one", "two"]);
		const other = ledger("session-2", fixture.store).ledger;
		await other.initialize();
		await expect(other.start("todo-1")).rejects.toThrow("active session");
		await fixture.ledger.start("todo-1");
		await expect(fixture.ledger.start("todo-2")).rejects.toThrow("already active");
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
		const other = ledger("session-2", fixture.store).ledger;
		await other.initialize();
		await fixture.ledger.start("todo-1");
		expect(await other.recordEvidence("proof-1")).toBeNull();
	});

	test("takes over unfinished work only after the previous owner lease is inactive", async () => {
		const fixture = ledger();
		await fixture.ledger.initialize();
		await fixture.ledger.create("Work", ["one"]);
		await fixture.ledger.start("todo-1");
		const next = ledger("session-2", fixture.store, fixture.events, async () => false).ledger;
		await next.initialize();
		await next.recordEvidence("proof-1");
		expect(next.snapshot?.ownerSessionId).toBe("session-2");
		expect((await next.complete("todo-1")).items[0]?.status).toBe("completed");
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
