import { describe, expect, test } from "bun:test";
import { SessionMonitor } from "../src/application/session-monitor";
import type { TodoController } from "../src/application/ports";
import type { SessionRuntime, SessionSnapshot } from "../src/application/session-runtime";
import type { TodoDocument } from "../src/domain/todos";

function session(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
	return {
		id: "session-1", phase: "starting", turns: [], draft: "raw prompt must not leak", error: null, auth: null,
		settings: { provider: "openai", model: "gpt-5.4", effort: "high" }, cwd: "/work/www", projectName: "www", projectRoot: "/work/www",
		activity: null, tools: [], ...overrides, narrations: overrides.narrations ?? [],
	};
}

function observable<T>(initial: T) {
	let value = initial;
	const listeners = new Set<(value: T) => void>();
	return {
		get value() { return value; },
		get snapshot() { return value; },
		subscribe(listener: (next: T) => void) { listeners.add(listener); listener(value); return () => listeners.delete(listener); },
		emit(next: T) { value = next; for (const listener of listeners) listener(next); },
		get listenerCount() { return listeners.size; },
	};
}

function todo(items: TodoDocument["items"]): TodoDocument {
	return { version: 1, revision: 1, ownerSessionId: "session-1", storyId: null, title: "work", items, updatedAt: "2026-08-31T10:00:00.000Z" };
}

describe("SessionMonitor", () => {
	test("aggregates initial, streaming, and completed session state without raw content", () => {
		const runtimeState = observable(session());
		const todoState = observable<TodoDocument | null>(null);
		let now = 1_000;
		const monitor = new SessionMonitor(runtimeState as unknown as SessionRuntime, todoState as unknown as TodoController, () => now);

		expect(monitor.snapshot).toMatchObject({ sessionId: "session-1", phase: "starting", elapsedMs: 0, turns: { user: 0, assistant: 0, cancelled: 0 } });
		now = 1_250;
		runtimeState.emit(session({
			phase: "streaming", draft: "very secret prompt", activity: { kind: "tool", label: "파일 검사 중" },
			turns: [{ id: "u", role: "user", content: "very secret prompt", timestamp: 1 }, { id: "a", role: "assistant", content: "hidden answer", timestamp: 2 }],
			tools: [{ id: "tool-1", toolName: "read", status: "running", input: "secret argument", output: "secret output", startedAt: 2, durationMs: undefined, error: undefined }],
		}));
		expect(monitor.snapshot).toMatchObject({ phase: "streaming", activityLabel: "파일 검사 중", elapsedMs: 250, turns: { user: 1, assistant: 1, cancelled: 0 }, tools: { running: 1, active: { name: "read", status: "running" }, latest: { name: "read", status: "running" } } });
		expect(JSON.stringify(monitor.snapshot)).not.toContain("secret");

		now = 1_500;
		runtimeState.emit(session({ phase: "ready", turns: [{ id: "u", role: "user", content: "x", timestamp: 1, outcome: "cancelled" }, { id: "a", role: "assistant", content: "y", timestamp: 2, outcome: "completed" }], tools: [{ id: "tool-1", toolName: "read", status: "passed", input: "input", output: "output", startedAt: 2, durationMs: 10, error: undefined }] }));
		expect(monitor.snapshot).toMatchObject({ phase: "ready", turns: { user: 1, assistant: 1, cancelled: 1 }, tools: { running: 0, passed: 1, failed: 0, cancelled: 0, active: null, latest: { name: "read", status: "passed" } } });
	});

	test("projects Todo progress and isolates broken listeners", () => {
		const runtimeState = observable(session());
		const todoState = observable<TodoDocument | null>(null);
		const monitor = new SessionMonitor(runtimeState as unknown as SessionRuntime, todoState as unknown as TodoController, () => 10);
		const observed: number[] = [];
		monitor.subscribe(() => { throw new Error("broken"); });
		monitor.subscribe(snapshot => observed.push(snapshot.todo.completed));
		todoState.emit(todo([
			{ id: "one", content: "done", status: "completed", evidenceIds: [], details: [] },
			{ id: "two", content: "active task", status: "in_progress", evidenceIds: [], details: [] },
		]));
		expect(monitor.snapshot.todo).toEqual({
			completed: 1,
			total: 2,
			detailCompleted: 0,
			detailTotal: 0,
			activeContent: "active task",
		});
		expect(observed).toEqual([0, 1]);
	});

	test("stops receiving runtime and Todo updates after disposal", () => {
		const runtimeState = observable(session());
		const todoState = observable<TodoDocument | null>(null);
		const monitor = new SessionMonitor(runtimeState as unknown as SessionRuntime, todoState as unknown as TodoController, () => 10);
		monitor.dispose();
		runtimeState.emit(session({ phase: "error" }));
		todoState.emit(todo([{ id: "one", content: "active", status: "in_progress", evidenceIds: [], details: [] }]));
		expect(monitor.snapshot.phase).toBe("starting");
		expect(monitor.snapshot.todo.total).toBe(0);
		expect(runtimeState.listenerCount).toBe(0);
		expect(todoState.listenerCount).toBe(0);
	});
});
