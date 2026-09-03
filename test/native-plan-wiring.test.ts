import { describe, expect, test } from "bun:test";
import { ProjectWorkbench, type WorkbenchActivityJournal } from "../src/application/project-workbench.js";
import type { SessionRepository, TodoStore } from "../src/application/ports/index.js";
import { TodoLedger } from "../src/application/todo-ledger.js";
import type { SessionEvent, SessionEventInput } from "../src/domain/session-events.js";
import type { ProjectActivity, ProjectActivityAppendResult, ProjectActivityInput } from "../src/domain/project-activity.js";
import type { TodoDocument } from "../src/domain/todos.js";
import { CodexAppServer, type JsonLineTransport } from "../src/infrastructure/executors/codex-app-server.js";

class FakeJsonLineTransport implements JsonLineTransport {
	public readonly sent: Array<Record<string, unknown>> = [];
	public readonly responses = new Map<string, unknown[]>();
	private readonly lineListeners = new Set<(line: string) => void>();
	private readonly closeListeners = new Set<(error?: Error) => void>();

	public async send(line: string): Promise<void> {
		const message = JSON.parse(line) as Record<string, unknown>;
		this.sent.push(message);
		if (typeof message.method !== "string" || message.id === undefined) return;
		const queued = this.responses.get(message.method);
		const result = queued?.shift() ?? {};
		queueMicrotask(() => this.emit({ id: message.id, result }));
	}

	public onLine(listener: (line: string) => void): () => void {
		this.lineListeners.add(listener);
		return () => this.lineListeners.delete(listener);
	}

	public onClose(listener: (error?: Error) => void): () => void {
		this.closeListeners.add(listener);
		return () => this.closeListeners.delete(listener);
	}

	public async close(): Promise<void> {
		for (const listener of this.closeListeners) listener();
	}

	public emit(message: Record<string, unknown>): void {
		const line = JSON.stringify(message);
		for (const listener of this.lineListeners) listener(line);
	}
}

class MemoryJournal implements WorkbenchActivityJournal {
	private sequence = 0;
	public readonly records: ProjectActivity[] = [];

	public async append(input: ProjectActivityInput): Promise<ProjectActivityAppendResult> {
		const activity: ProjectActivity = {
			...input,
			schemaVersion: 1,
			id: `activity-${++this.sequence}`,
			sequence: this.sequence,
			recordedAt: new Date(1_700_000_000_000 + this.sequence).toISOString(),
		};
		this.records.push(activity);
		return { activity, appended: true };
	}

	public async readAll(): Promise<ProjectActivity[]> {
		return [...this.records];
	}
}

class MemoryTodoStore implements TodoStore {
	public document: TodoDocument | null = null;
	public compareAndSwapCalls = 0;

	public async read(): Promise<TodoDocument | null> {
		return this.document;
	}

	public async compareAndSwap(expectedRevision: number | null, next: TodoDocument): Promise<"written" | "conflict"> {
		this.compareAndSwapCalls += 1;
		if ((this.document?.revision ?? null) !== expectedRevision) return "conflict";
		this.document = next;
		return "written";
	}
}

class MemoryEvents implements SessionRepository {
	public async append(_sessionId: string, _input: SessionEventInput): Promise<SessionEvent> {
		return {} as SessionEvent;
	}

	public async readAll(_sessionId: string): Promise<SessionEvent[]> {
		return [];
	}
}

async function waitFor(assertion: () => void, attempts = 80): Promise<void> {
	let lastError: unknown;
	for (let attempt = 0; attempt < attempts; attempt += 1) {
		try {
			assertion();
			return;
		} catch (error) {
			lastError = error;
			await Bun.sleep(2);
		}
	}
	throw lastError;
}

describe("Native Plan transport-to-Todo wiring", () => {
	test("accepts only the known root turn's threadless plan at the Workbench and Todo boundaries", async () => {
		const transport = new FakeJsonLineTransport();
		transport.responses.set("mcpServerStatus/list", [{ data: [], nextCursor: null }]);
		transport.responses.set("thread/start", [{ thread: { id: "thread-root", turns: [] } }]);
		transport.responses.set("turn/start", [
			{ turn: { id: "turn-root", items: [] } },
			{ turn: { id: "turn-child", items: [] } },
		]);
		const server = await CodexAppServer.connectTransport(transport);
		const journal = new MemoryJournal();
		const store = new MemoryTodoStore();
		const ledger = new TodoLedger("native-plan-wiring", store, new MemoryEvents(), () => new Date("2026-09-02T00:00:00.000Z"));
		await ledger.initialize();
		const todos = Object.assign(ledger, { importLegacy: async (): Promise<string | null> => null });
		const workbench = new ProjectWorkbench(server, journal, {
			projectId: "native-plan-wiring",
			cwd: "/workspace/native-plan-wiring",
			todos,
		});

		try {
			await waitFor(() => expect(workbench.snapshot.phase).toBe("ready"));
			await expect(workbench.dispatch({ type: "chat.send", text: "Native Plan을 Todo에 반영" }))
				.resolves.toMatchObject({ state: "accepted" });
			expect(workbench.snapshot).toMatchObject({ threadId: "thread-root", activeTurnId: "turn-root" });

			// Official App Server shape: turn/plan/updated only guarantees { turnId, plan }.
			transport.emit({
				method: "turn/plan/updated",
				params: { turnId: "turn-root", plan: [{ step: "root plan", status: "inProgress" }] },
			});
			await waitFor(() => {
				expect(workbench.snapshot.workFlow).toMatchObject({
					source: { turnId: "turn-root", algorithm: "dplan-v1" },
					steps: [{ title: "root plan" }],
				});
				expect(ledger.snapshot?.items).toHaveLength(1);
			});
			const rootStep = workbench.snapshot.workFlow.steps[0]!;
			const rootTodo = ledger.snapshot!.items[0]!;
			expect(rootTodo.id).toBe(`native-${rootStep.identity.value.slice(0, 48)}`);
			expect(rootTodo.details[0]?.id).toBe(`${rootTodo.id}-detail-1`);
			const stableTodoRevision = ledger.snapshot!.revision;
			const stableTodoWrites = store.compareAndSwapCalls;

			// Register a distinct child turn with the same live adapter, then emit only its turn id.
			await server.startTurn({ threadId: "thread-child", text: "child work" });
			transport.emit({
				method: "turn/plan/updated",
				params: { turnId: "turn-child", plan: [{ step: "child plan", status: "inProgress" }] },
			});
			transport.emit({
				method: "item/started",
				params: {
					turnId: "turn-child",
					item: { id: "child-command", type: "commandExecution", command: "touch child-only" },
				},
			});
			// This turn has no observed owner, so it must not be adopted as the root plan source.
			transport.emit({
				method: "turn/plan/updated",
				params: { turnId: "turn-unknown", plan: [{ step: "unknown plan", status: "inProgress" }] },
			});

			await waitFor(() => expect(journal.records.some(activity =>
				activity.nativeRefs.turnId === "turn-unknown"
				&& activity.payload.method === "turn/plan/updated")).toBe(true));
			await Bun.sleep(10);
			expect(workbench.snapshot.workFlow).toMatchObject({
				source: { turnId: "turn-root" },
				steps: [{ id: rootStep.id, title: "root plan" }],
			});
			expect(workbench.snapshot.workFlow.steps.map((step) => step.title)).not.toContain("child plan");
			expect(workbench.snapshot.workFlow.steps.map((step) => step.title)).not.toContain("unknown plan");
			expect(workbench.snapshot.workFlow.rejections).toEqual(expect.arrayContaining([
				expect.objectContaining({ code: "source_turn_mismatch" }),
			]));
			expect(ledger.snapshot).toEqual(expect.objectContaining({ revision: stableTodoRevision, items: [rootTodo] }));
			expect(store.compareAndSwapCalls).toBe(stableTodoWrites);
			expect(journal.records).toEqual(expect.arrayContaining([
			expect.objectContaining({ nativeRefs: { threadId: "thread-child", turnId: "turn-child" } }),
			expect.objectContaining({ nativeRefs: { turnId: "turn-unknown" } }),
		]));
		} finally {
			await workbench.close();
		}
	});
});
