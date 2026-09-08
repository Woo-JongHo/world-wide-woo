import { describe, expect, test } from "bun:test";
import { ProjectWorkbench, type WorkbenchActivityJournal } from "../src/core/application/project-workbench.js";
import type { SessionRepository, TodoStore } from "../src/core/ports/index.js";
import { TodoLedger } from "../src/core/application/todo-ledger.js";
import type { SessionEvent, SessionEventInput } from "../src/core/domain/session-events.js";
import type { ProjectActivity, ProjectActivityAppendResult, ProjectActivityInput } from "../src/core/domain/project-activity.js";
import type { TodoDocument } from "../src/core/domain/todos.js";
import { CodexAppServer, type JsonLineTransport } from "../src/adapters/outbound/executors/codex-app-server.js";

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
	test("projects a completed public numbered Plan reply when Native emits no structured plan and carries it into manual execution", async () => {
		const transport = new FakeJsonLineTransport();
		transport.responses.set("mcpServerStatus/list", [{ data: [], nextCursor: null }]);
		transport.responses.set("thread/start", [{ thread: { id: "thread-root", turns: [] } }]);
		transport.responses.set("turn/start", [
			{ turn: { id: "turn-plan", items: [] } },
			{ turn: { id: "turn-execute", items: [] } },
		]);
		const server = await CodexAppServer.connectTransport(transport);
		const journal = new MemoryJournal();
		const store = new MemoryTodoStore();
		const ledger = new TodoLedger("public-plan-fallback", store, new MemoryEvents(), () => new Date("2026-09-07T00:00:00.000Z"));
		await ledger.initialize();
		const todos = Object.assign(ledger, { importLegacy: async (): Promise<string | null> => null });
		const workbench = new ProjectWorkbench(server, journal, {
			projectId: "public-plan-fallback",
			cwd: "/workspace/public-plan-fallback",
			todos,
		});

		try {
			await waitFor(() => expect(workbench.snapshot.phase).toBe("ready"));
			await workbench.dispatch({ type: "session.mode", mode: "plan" });
			await workbench.dispatch({ type: "chat.send", text: "3단계 계획을 세워줘" });
			transport.emit({
				method: "item/completed",
				params: {
					threadId: "thread-root",
					turnId: "turn-plan",
					item: {
						id: "answer-plan",
						type: "agentMessage",
						text: "3단계 Plan입니다.\n\n1. 현재 상태를 확인합니다.\n2. 필요한 변경을 적용합니다.\n3. 결과를 검증합니다.\n\n파일은 수정하지 않겠습니다.",
					},
				},
			});
			transport.emit({
				method: "item/completed",
				params: {
					threadId: "thread-root",
					turnId: "turn-plan",
					item: { id: "plan-action", type: "commandExecution", command: "cat README.md package.json" },
				},
			});
			transport.emit({
				method: "item/completed",
				params: {
					threadId: "thread-root",
					turnId: "turn-plan",
					item: { id: "final-answer", type: "agentMessage", text: "제품 이름과 버전이 일치합니다." },
				},
			});
			transport.emit({
				method: "turn/completed",
				params: { threadId: "thread-root", turn: { id: "turn-plan", status: "completed", error: null } },
			});

			await waitFor(() => {
				expect(ledger.snapshot?.items.map(({ content, status }) => ({ content, status }))).toEqual([
					{ content: "현재 상태를 확인합니다.", status: "in_progress" },
					{ content: "필요한 변경을 적용합니다.", status: "pending" },
					{ content: "결과를 검증합니다.", status: "pending" },
				]);
			});
			const fallback = journal.records.find((activity) => activity.payload.method === "turn/plan/public-fallback");
			expect(fallback).toMatchObject({
				kind: "progress",
				phase: "completed",
				nativeRefs: { threadId: "thread-root", turnId: "turn-plan", itemId: "public-plan-fallback:turn-plan" },
				payload: { source: "public-assistant-response" },
			});
			expect(journal.records.some((activity) => activity.payload.source === "public-user-request")).toBe(false);
			const planTurnAction = journal.records.find((activity) => activity.nativeRefs.itemId === "plan-action");
			expect(planTurnAction).toBeDefined();
			expect(workbench.snapshot.workFlow.steps[0]?.observationCount).toBe(1);
			expect(await workbench.dispatch({ type: "trace.select", activityId: planTurnAction!.id })).toMatchObject({
				state: "accepted",
				selection: { state: "selected", attribution: { planAssociation: "inferred" } },
			});

			await workbench.dispatch({ type: "session.mode", mode: "manual" });
			await workbench.dispatch({ type: "chat.send", text: "계획대로 실행해줘" });
			transport.emit({
				method: "item/completed",
				params: {
					threadId: "thread-root",
					turnId: "turn-execute",
					item: { id: "manual-action", type: "commandExecution", command: "apply_patch target.ts" },
				},
			});
			await waitFor(() => expect(workbench.snapshot.workFlow.steps[0]?.activityIds).toHaveLength(1));
			const action = journal.records.find((activity) => activity.nativeRefs.itemId === "manual-action");
			expect(action).toBeDefined();
			expect(workbench.snapshot.workFlow.source?.turnId).toBe("turn-execute");
			expect(await workbench.dispatch({ type: "trace.select", activityId: action!.id })).toMatchObject({
				state: "accepted",
				selection: { state: "selected", attribution: { planAssociation: "inferred" } },
			});
		} finally {
			await workbench.close();
		}
	});

	test("keeps a structured Native plan authoritative over a public numbered reply", async () => {
		const transport = new FakeJsonLineTransport();
		transport.responses.set("mcpServerStatus/list", [{ data: [], nextCursor: null }]);
		transport.responses.set("thread/start", [{ thread: { id: "thread-root", turns: [] } }]);
		transport.responses.set("turn/start", [{ turn: { id: "turn-plan", items: [] } }]);
		const server = await CodexAppServer.connectTransport(transport);
		const journal = new MemoryJournal();
		const store = new MemoryTodoStore();
		const ledger = new TodoLedger("structured-plan-priority", store, new MemoryEvents());
		await ledger.initialize();
		const workbench = new ProjectWorkbench(server, journal, {
			projectId: "structured-plan-priority",
			cwd: "/workspace/structured-plan-priority",
			todos: Object.assign(ledger, { importLegacy: async (): Promise<string | null> => null }),
		});
		try {
			await waitFor(() => expect(workbench.snapshot.phase).toBe("ready"));
			await workbench.dispatch({ type: "session.mode", mode: "plan" });
			await workbench.dispatch({ type: "chat.send", text: "2단계 계획을 세워줘" });
			transport.emit({
				method: "turn/plan/updated",
				params: {
					threadId: "thread-root",
					turnId: "turn-plan",
					plan: [{ step: "Native 계획", status: "inProgress" }, { step: "Native 검증", status: "pending" }],
				},
			});
			transport.emit({
				method: "item/completed",
				params: {
					threadId: "thread-root",
					turnId: "turn-plan",
					item: { id: "answer-plan", type: "agentMessage", text: "계획입니다.\n1. 공개 목록 A\n2. 공개 목록 B" },
				},
			});
			transport.emit({
				method: "turn/completed",
				params: { threadId: "thread-root", turn: { id: "turn-plan", status: "completed", error: null } },
			});
			await waitFor(() => expect(ledger.snapshot?.items).toHaveLength(2));
			expect(ledger.snapshot?.items.map((item) => item.content)).toEqual(["Native 계획", "Native 검증"]);
			expect(journal.records.some((activity) => activity.payload.method === "turn/plan/public-fallback")).toBe(false);
		} finally {
			await workbench.close();
		}
	});

	test("keeps one honest pending goal when a completed Plan turn executes tools without any plan body", async () => {
		const transport = new FakeJsonLineTransport();
		transport.responses.set("mcpServerStatus/list", [{ data: [], nextCursor: null }]);
		transport.responses.set("thread/start", [{ thread: { id: "thread-root", turns: [] } }]);
		transport.responses.set("turn/start", [{ turn: { id: "turn-plan", items: [] } }]);
		const server = await CodexAppServer.connectTransport(transport);
		const journal = new MemoryJournal();
		const store = new MemoryTodoStore();
		const ledger = new TodoLedger("missing-plan-body", store, new MemoryEvents());
		await ledger.initialize();
		const workbench = new ProjectWorkbench(server, journal, {
			projectId: "missing-plan-body",
			cwd: "/workspace/missing-plan-body",
			todos: Object.assign(ledger, { importLegacy: async (): Promise<string | null> => null }),
		});
		try {
			await waitFor(() => expect(workbench.snapshot.phase).toBe("ready"));
			await workbench.dispatch({ type: "session.mode", mode: "plan" });
			await workbench.dispatch({ type: "chat.send", text: "현재 구조를 점검해줘" });
			transport.emit({
				method: "item/completed",
				params: {
					threadId: "thread-root",
					turnId: "turn-plan",
					item: { id: "observed-command", type: "commandExecution", command: "rg --files src" },
				},
			});
			transport.emit({
				method: "turn/completed",
				params: { threadId: "thread-root", turn: { id: "turn-plan", status: "completed", error: null } },
			});
			await waitFor(() => expect(ledger.snapshot?.items).toHaveLength(1));
			expect(ledger.snapshot).toMatchObject({
				title: "현재 구조를 점검해줘",
				source: { rootExecution: { model: "codex", runId: "turn-plan" } },
				items: [{ content: "계획 본문 미수신", status: "pending" }],
			});
			const fallback = journal.records.find((activity) => activity.payload.source === "public-user-request");
			expect(fallback).toMatchObject({
				nativeRefs: { threadId: "thread-root", turnId: "turn-plan", itemId: "missing-plan-fallback:turn-plan" },
				payload: { method: "turn/plan/public-fallback", source: "public-user-request" },
			});
			const activity = journal.records.find((candidate) => candidate.nativeRefs.itemId === "observed-command");
			expect(activity).toBeDefined();
			expect(workbench.snapshot.workFlow.steps[0]).toMatchObject({
				activityIds: [],
				observationCount: 1,
				association: { observationActivityIds: [activity!.id] },
			});
			expect(await workbench.dispatch({ type: "trace.select", activityId: activity!.id })).toMatchObject({
				state: "accepted",
				selection: { state: "selected", attribution: { planAssociation: "inferred" } },
			});
		} finally {
			await workbench.close();
		}
	});

	test("projects the Test2 numbered-heading Native plan and associates the earlier Bash activity", async () => {
		const transport = new FakeJsonLineTransport();
		transport.responses.set("mcpServerStatus/list", [{ data: [], nextCursor: null }]);
		transport.responses.set("thread/start", [{ thread: { id: "thread-root", turns: [] } }]);
		transport.responses.set("turn/start", [{ turn: { id: "turn-test2", items: [] } }]);
		const server = await CodexAppServer.connectTransport(transport);
		const journal = new MemoryJournal();
		const store = new MemoryTodoStore();
		const ledger = new TodoLedger("test2-heading-plan", store, new MemoryEvents());
		await ledger.initialize();
		const workbench = new ProjectWorkbench(server, journal, {
			projectId: "test2-heading-plan",
			cwd: "/workspace/test2-heading-plan",
			todos: Object.assign(ledger, { importLegacy: async (): Promise<string | null> => null }),
		});
		try {
			await waitFor(() => expect(workbench.snapshot.phase).toBe("ready"));
			await workbench.dispatch({ type: "session.mode", mode: "plan" });
			await workbench.dispatch({ type: "chat.send", text: "README.md와 package.json을 읽고 제품명과 버전을 비교하는 3단계 계획을 세워줘. 파일은 수정하지 마." });
			transport.emit({ method: "item/started", params: { threadId: "thread-root", turnId: "turn-test2", item: { id: "answer", type: "agentMessage", text: "" } } });
			transport.emit({ method: "item/completed", params: { threadId: "thread-root", turnId: "turn-test2", item: { id: "answer", type: "agentMessage", text: "두 파일의 실제 내용을 확인한 뒤, 불일치 처리까지 포함한 3단계 계획으로 정리하겠습니다. 파일은 읽기만 하겠습니다." } } });
			transport.emit({ method: "item/started", params: { threadId: "thread-root", turnId: "turn-test2", item: { id: "bash", type: "commandExecution", command: "pwd && sed -n '1,220p' README.md && sed -n '1,220p' package.json", status: "inProgress" } } });
			transport.emit({ method: "item/completed", params: { threadId: "thread-root", turnId: "turn-test2", item: { id: "bash", type: "commandExecution", command: "pwd && sed -n '1,220p' README.md && sed -n '1,220p' package.json", status: "completed", exitCode: 0 } } });
			transport.emit({ method: "item/started", params: { threadId: "thread-root", turnId: "turn-test2", item: { id: "turn-test2-plan", type: "plan", text: "" } } });
			transport.emit({
				method: "item/completed",
				params: {
					threadId: "thread-root",
					turnId: "turn-test2",
					item: {
						id: "turn-test2-plan",
						type: "plan",
						text: [
							"# 제품명·버전 비교 계획",
							"",
							"## 1. 값 추출",
							"",
							"- README 제품명과 버전을 확인한다.",
							"- package.json 제품명과 버전을 확인한다.",
							"",
							"## 2. 의미 비교",
							"",
							"- 표시명과 패키지 식별자를 비교한다.",
							"",
							"## 3. 결과 보고",
							"",
							"- 파일을 수정하지 않고 결과만 보고한다.",
						].join("\n"),
					},
				},
			});
			transport.emit({ method: "turn/completed", params: { threadId: "thread-root", turn: { id: "turn-test2", status: "completed", error: null } } });

			await waitFor(() => expect(ledger.snapshot?.items).toHaveLength(3));
			expect(ledger.snapshot?.items.map(({ content, status }) => ({ content, status }))).toEqual([
				{ content: "값 추출", status: "in_progress" },
				{ content: "의미 비교", status: "pending" },
				{ content: "결과 보고", status: "pending" },
			]);
			expect(journal.records.some((activity) => activity.payload.source === "public-user-request")).toBe(false);
			const bash = journal.records.find((activity) => activity.nativeRefs.itemId === "bash" && activity.phase === "completed");
			expect(bash).toBeDefined();
			expect(workbench.snapshot.workFlow.steps[0]?.observationCount).toBeGreaterThan(0);
			expect(await workbench.dispatch({ type: "trace.select", activityId: bash!.id })).toMatchObject({
				state: "accepted",
				selection: { state: "selected", attribution: { planAssociation: "inferred" } },
			});
		} finally {
			await workbench.close();
		}
	});

	test("projects the Test2 numbered list beneath a step-count heading without treating the heading as a step", async () => {
		const transport = new FakeJsonLineTransport();
		transport.responses.set("mcpServerStatus/list", [{ data: [], nextCursor: null }]);
		transport.responses.set("thread/start", [{ thread: { id: "thread-root", turns: [] } }]);
		transport.responses.set("turn/start", [{ turn: { id: "turn-test2-list", items: [] } }]);
		const server = await CodexAppServer.connectTransport(transport);
		const journal = new MemoryJournal();
		const store = new MemoryTodoStore();
		const ledger = new TodoLedger("test2-numbered-list-plan", store, new MemoryEvents());
		await ledger.initialize();
		const workbench = new ProjectWorkbench(server, journal, {
			projectId: "test2-numbered-list-plan",
			cwd: "/workspace/test2-numbered-list-plan",
			todos: Object.assign(ledger, { importLegacy: async (): Promise<string | null> => null }),
		});
		try {
			await waitFor(() => expect(workbench.snapshot.phase).toBe("ready"));
			await workbench.dispatch({ type: "session.mode", mode: "plan" });
			await workbench.dispatch({ type: "chat.send", text: "README.md와 package.json을 비교하는 3단계 계획을 세워줘." });
			transport.emit({ method: "item/started", params: { threadId: "thread-root", turnId: "turn-test2-list", item: { id: "turn-test2-list-plan", type: "plan", text: "" } } });
			transport.emit({
				method: "item/completed",
				params: {
					threadId: "thread-root",
					turnId: "turn-test2-list",
					item: {
						id: "turn-test2-list-plan",
						type: "plan",
						text: [
							"# 제품명·버전 비교 계획",
							"",
							"## 3단계",
							"",
							"1. README.md에서 제품명과 버전 관련 표현을 추출한다.",
							"2. package.json에서 패키지명과 현재 버전을 추출해 대조한다.",
							"3. 제품명 일치 여부와 버전 표현의 의미 차이를 보고한다.",
							"",
							"## 검증 및 전제",
							"",
							"- 파일은 읽기만 하며 수정하지 않는다.",
						].join("\n"),
					},
				},
			});
			transport.emit({ method: "turn/completed", params: { threadId: "thread-root", turn: { id: "turn-test2-list", status: "completed", error: null } } });

			await waitFor(() => expect(ledger.snapshot?.items).toHaveLength(3));
			expect(workbench.snapshot.workFlow.steps.map(({ title, status }) => ({ title, status }))).toEqual([
				{ title: "README.md에서 제품명과 버전 관련 표현을 추출한다.", status: "running" },
				{ title: "package.json에서 패키지명과 현재 버전을 추출해 대조한다.", status: "pending" },
				{ title: "제품명 일치 여부와 버전 표현의 의미 차이를 보고한다.", status: "pending" },
			]);
			expect(ledger.snapshot?.items.map((item) => item.status)).toEqual(["in_progress", "pending", "pending"]);
			expect(workbench.snapshot.workFlow.steps.map((step) => step.title)).not.toContain("3단계");
			expect(journal.records.some((activity) => activity.payload.source === "public-user-request")).toBe(false);
		} finally {
			await workbench.close();
		}
	});

	test("projects the Test2 top-level numbered Native plan and associates the earlier Bash activity", async () => {
		const transport = new FakeJsonLineTransport();
		transport.responses.set("mcpServerStatus/list", [{ data: [], nextCursor: null }]);
		transport.responses.set("thread/start", [{ thread: { id: "thread-root", turns: [] } }]);
		transport.responses.set("turn/start", [{ turn: { id: "turn-test2-top-level", items: [] } }]);
		const server = await CodexAppServer.connectTransport(transport);
		const journal = new MemoryJournal();
		const store = new MemoryTodoStore();
		const ledger = new TodoLedger("test2-top-level-numbered-plan", store, new MemoryEvents());
		await ledger.initialize();
		const workbench = new ProjectWorkbench(server, journal, {
			projectId: "test2-top-level-numbered-plan",
			cwd: "/workspace/test2-top-level-numbered-plan",
			todos: Object.assign(ledger, { importLegacy: async (): Promise<string | null> => null }),
		});
		try {
			await waitFor(() => expect(workbench.snapshot.phase).toBe("ready"));
			await workbench.dispatch({ type: "session.mode", mode: "plan" });
			await workbench.dispatch({ type: "chat.send", text: "README.md와 package.json을 읽고 제품명과 버전을 비교하는 3단계 계획을 세워줘. 파일은 수정하지 마." });
			transport.emit({ method: "item/started", params: { threadId: "thread-root", turnId: "turn-test2-top-level", item: { id: "answer", type: "agentMessage", text: "" } } });
			transport.emit({ method: "item/completed", params: { threadId: "thread-root", turnId: "turn-test2-top-level", item: { id: "answer", type: "agentMessage", text: "두 파일을 확인한 뒤 비교 계획을 정리하겠습니다." } } });
			transport.emit({ method: "item/started", params: { threadId: "thread-root", turnId: "turn-test2-top-level", item: { id: "bash", type: "commandExecution", command: "sed -n '1,220p' README.md package.json", status: "inProgress" } } });
			transport.emit({ method: "item/completed", params: { threadId: "thread-root", turnId: "turn-test2-top-level", item: { id: "bash", type: "commandExecution", command: "sed -n '1,220p' README.md package.json", status: "completed", exitCode: 0 } } });
			transport.emit({ method: "item/started", params: { threadId: "thread-root", turnId: "turn-test2-top-level", item: { id: "turn-test2-top-level-plan", type: "plan", text: "" } } });
			transport.emit({
				method: "item/completed",
				params: {
					threadId: "thread-root",
					turnId: "turn-test2-top-level",
					item: {
						id: "turn-test2-top-level-plan",
						type: "plan",
						text: [
							"# 제품명·버전 비교 계획",
							"",
							"1. **표기 추출**",
							"   - README: 제품명 `World Wide Woo (WWW)`, 계획된 공개 릴리스 `v0.1.0`",
							"   - package.json: 패키지명 `world-wide-woo`, 현재 버전 `0.0.15`",
							"",
							"2. **의미 비교**",
							"   - 제품명과 패키지 식별자의 의미를 비교한다.",
							"",
							"3. **결과 정리**",
							"   - 파일을 수정하지 않고 비교 결과만 보고한다.",
						].join("\n"),
					},
				},
			});
			transport.emit({ method: "turn/completed", params: { threadId: "thread-root", turn: { id: "turn-test2-top-level", status: "completed", error: null } } });

			await waitFor(() => expect(ledger.snapshot?.items).toHaveLength(3));
			expect(workbench.snapshot.workFlow.steps.map(({ title, status }) => ({ title, status }))).toEqual([
				{ title: "표기 추출", status: "running" },
				{ title: "의미 비교", status: "pending" },
				{ title: "결과 정리", status: "pending" },
			]);
			expect(workbench.snapshot.workFlow.steps.map((step) => step.title)).not.toContain(expect.stringContaining("README:"));
			expect(journal.records.some((activity) => activity.payload.source === "public-user-request")).toBe(false);
			const bash = journal.records.find((activity) => activity.nativeRefs.itemId === "bash" && activity.phase === "completed");
			expect(bash).toBeDefined();
			expect(await workbench.dispatch({ type: "trace.select", activityId: bash!.id })).toMatchObject({
				state: "accepted",
				selection: { state: "selected", attribution: { planAssociation: "inferred" } },
			});
		} finally {
			await workbench.close();
		}
	});

	test.each([
		["manual mode", "manual", "completed", true],
		["failed Plan turn", "plan", "failed", true],
		["Plan turn without observed work", "plan", "completed", false],
	] as const)("does not create a missing-plan goal for %s", async (_label, mode, status, emitWork) => {
		const transport = new FakeJsonLineTransport();
		transport.responses.set("mcpServerStatus/list", [{ data: [], nextCursor: null }]);
		transport.responses.set("thread/start", [{ thread: { id: "thread-root", turns: [] } }]);
		transport.responses.set("turn/start", [{ turn: { id: "turn-guard", items: [] } }]);
		const server = await CodexAppServer.connectTransport(transport);
		const journal = new MemoryJournal();
		const store = new MemoryTodoStore();
		const ledger = new TodoLedger("missing-plan-guard", store, new MemoryEvents());
		await ledger.initialize();
		const workbench = new ProjectWorkbench(server, journal, {
			projectId: "missing-plan-guard",
			cwd: "/workspace/missing-plan-guard",
			todos: Object.assign(ledger, { importLegacy: async (): Promise<string | null> => null }),
		});
		try {
			await waitFor(() => expect(workbench.snapshot.phase).toBe("ready"));
			await workbench.dispatch({ type: "session.mode", mode });
			await workbench.dispatch({ type: "chat.send", text: "현재 구조를 점검해줘" });
			if (emitWork) {
				transport.emit({
					method: "item/completed",
					params: {
						threadId: "thread-root",
						turnId: "turn-guard",
						item: { id: "guard-command", type: "commandExecution", command: "pwd" },
					},
				});
			}
			transport.emit({
				method: "turn/completed",
				params: { threadId: "thread-root", turn: { id: "turn-guard", status, error: status === "failed" ? { message: "failed" } : null } },
			});
			await Bun.sleep(15);
			expect(journal.records.some((activity) => activity.payload.source === "public-user-request")).toBe(false);
			expect(store.document).toBeNull();
		} finally {
			await workbench.close();
		}
	});

	test.each([
		["일반 번호 목록", "세 가지 장점을 알려줘", "장점은 다음과 같습니다.\n1. 빠릅니다.\n2. 단순합니다.\n3. 안정적입니다.", "completed"],
		["불연속 번호 계획", "3단계 계획을 세워줘", "계획입니다.\n1. 첫 단계\n3. 셋째 단계", "completed"],
		["실패한 계획 turn", "2단계 계획을 세워줘", "계획입니다.\n1. 첫 단계\n2. 둘째 단계", "failed"],
		["중단된 계획 turn", "2단계 계획을 세워줘", "계획입니다.\n1. 첫 단계\n2. 둘째 단계", "interrupted"],
	] as const)("does not project %s", async (_label, request, answer, status) => {
		const transport = new FakeJsonLineTransport();
		transport.responses.set("mcpServerStatus/list", [{ data: [], nextCursor: null }]);
		transport.responses.set("thread/start", [{ thread: { id: "thread-root", turns: [] } }]);
		transport.responses.set("turn/start", [{ turn: { id: "turn-plan", items: [] } }]);
		const server = await CodexAppServer.connectTransport(transport);
		const journal = new MemoryJournal();
		const store = new MemoryTodoStore();
		const ledger = new TodoLedger("fallback-negative", store, new MemoryEvents());
		await ledger.initialize();
		const workbench = new ProjectWorkbench(server, journal, {
			projectId: "fallback-negative",
			cwd: "/workspace/fallback-negative",
			todos: Object.assign(ledger, { importLegacy: async (): Promise<string | null> => null }),
		});
		try {
			await waitFor(() => expect(workbench.snapshot.phase).toBe("ready"));
			await workbench.dispatch({ type: "session.mode", mode: "plan" });
			await workbench.dispatch({ type: "chat.send", text: request });
			transport.emit({
				method: "item/completed",
				params: { threadId: "thread-root", turnId: "turn-plan", item: { id: "answer", type: "agentMessage", text: answer } },
			});
			transport.emit({
				method: "turn/completed",
				params: { threadId: "thread-root", turn: { id: "turn-plan", status, error: status === "failed" ? { message: "failed" } : null } },
			});
			await Bun.sleep(10);
			expect(journal.records.some((activity) => activity.payload.method === "turn/plan/public-fallback")).toBe(false);
			expect(store.document).toBeNull();
		} finally {
			await workbench.close();
		}
	});

	test("accepts only the known root turn's completed plan item at the Workbench and Todo boundaries", async () => {
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

			// Actual App Server shape observed by the native probe: the completed item owns
			// the full Markdown plan; turn/plan/updated may never be emitted.
			transport.emit({
				method: "item/completed",
				params: {
					threadId: "thread-root",
					turnId: "turn-root",
					item: {
						id: "plan-root",
						type: "plan",
						text: "1. [in progress] root plan\n2. [pending] verify result\n3. [completed] record result\n4. [failed] failed result\n5. [cancelled] cancelled result",
					},
				},
			});
			await waitFor(() => {
				expect(workbench.snapshot.workFlow).toMatchObject({
					source: { turnId: "turn-root", algorithm: "dplan-v1" },
					steps: [
						{ title: "root plan", status: "running" },
						{ title: "verify result", status: "pending" },
						{ title: "record result", status: "completed" },
						{ title: "failed result", status: "failed" },
						{ title: "cancelled result", status: "cancelled" },
					],
				});
				expect(ledger.snapshot?.items).toHaveLength(5);
			});

			transport.emit({
				method: "item/completed",
				params: {
					threadId: "thread-root",
					turnId: "turn-root",
					item: {
						id: "plan-root-korean",
						type: "plan",
						text: [
							"# 작업공간 확인 계획 — 완료",
							"",
							"1. **README.md 읽기 — 완료**",
							"   - 프로젝트 목적과 실행 방법을 확인했습니다.",
							"2. **현재 디렉터리 확인 — 완료**",
							"   - 작업공간 경계를 확인했습니다.",
							"3. **후속 작업 대기 — 대기**",
							"4. **검증 실행 — 진행 중**",
							"5. **실패 사례 기록 — 실패**",
							"6. **취소 사례 기록 — 취소**",
						].join("\n"),
					},
				},
			});
			await waitFor(() => {
				expect(workbench.snapshot.workFlow.steps.map(({ title, status }) => ({ title, status }))).toEqual([
					{ title: "README.md 읽기", status: "completed" },
					{ title: "현재 디렉터리 확인", status: "completed" },
					{ title: "후속 작업 대기", status: "pending" },
					{ title: "검증 실행", status: "running" },
					{ title: "실패 사례 기록", status: "failed" },
					{ title: "취소 사례 기록", status: "cancelled" },
				]);
				expect(ledger.snapshot?.items).toHaveLength(6);
			});
			expect(journal.records.find((activity) => activity.nativeRefs.itemId === "plan-root")?.payload)
				.toMatchObject({ method: "item/completed", params: { item: { type: "plan" } } });
			const rootStep = workbench.snapshot.workFlow.steps[0]!;
			const rootTodo = ledger.snapshot!.items[0]!;
			const rootTodos = ledger.snapshot!.items;
			expect(rootTodo.id).toBe(`native-${rootStep.identity.value.slice(0, 48)}`);
			expect(rootTodo.details[0]?.id).toBe(`${rootTodo.id}-detail-1`);
			const stableTodoRevision = ledger.snapshot!.revision;

			transport.emit({
				method: "item/completed",
				params: {
					turnId: "turn-root",
					item: {
						id: "plan-item-root",
						type: "plan",
						text: "## Plan\n1. [completed] README.md 읽기\n   - 상세 bullet은 무시한다.\n* **구현하기** — in progress",
					},
				},
			});
			await waitFor(() => {
				expect(workbench.snapshot.workFlow.steps.map(({ title, status }) => ({ title, status }))).toEqual([
					{ title: "README.md 읽기", status: "completed" },
					{ title: "구현하기", status: "running" },
				]);
				expect(ledger.snapshot?.revision).toBeGreaterThan(stableTodoRevision);
				expect(ledger.snapshot?.items.map((item) => item.status)).toEqual(["completed", "in_progress"]);
				expect(ledger.snapshot?.items[1]?.content).toBe("구현하기");
			});
			const markdownSteps = workbench.snapshot.workFlow.steps;
			const markdownTodo = ledger.snapshot!;
			const writesBeforeMalformedPlan = store.compareAndSwapCalls;

			transport.emit({
				method: "item/completed",
				params: {
					turnId: "turn-root",
					item: { id: "malformed-plan", type: "plan", text: "1. missing status" },
				},
			});
			await waitFor(() => expect(workbench.snapshot.workFlow.rejections).toEqual(expect.arrayContaining([
				expect.objectContaining({ kind: "revision", activityId: expect.any(String) }),
			])));
			await Bun.sleep(10);
			expect(workbench.snapshot.workFlow.steps).toEqual(markdownSteps);
			expect(ledger.snapshot).toEqual(markdownTodo);
			expect(store.compareAndSwapCalls).toBe(writesBeforeMalformedPlan);
			const stableTodoWrites = store.compareAndSwapCalls;
			transport.emit({
				method: "item/completed",
				params: {
					threadId: "thread-root",
					turnId: "turn-root",
					item: { id: "plan-malformed", type: "plan", text: "arbitrary unmarked instructions" },
				},
			});
			transport.emit({
				method: "item/completed",
				params: {
					threadId: "thread-root",
					turnId: "turn-root",
					item: { id: "plan-empty", type: "plan", text: "  \n" },
				},
			});

			// Register a distinct child turn with the same live adapter, then emit its plan item.
			await server.startTurn({ threadId: "thread-child", text: "child work" });
			transport.emit({
				method: "item/completed",
				params: {
					threadId: "thread-child",
					turnId: "turn-child",
					item: { id: "plan-child", type: "plan", text: "1. [in progress] child plan" },
				},
			});
			transport.emit({
				method: "item/completed",
				params: {
					turnId: "turn-child",
					item: { id: "child-plan", type: "plan", text: "1. child completed plan — running" },
				},
			});
			transport.emit({
				method: "item/started",
				params: {
					turnId: "turn-child",
					item: { id: "child-command", type: "commandExecution", command: "touch child-only" },
				},
			});
			// A foreign turn on the root thread must not replace the selected root plan either.
			transport.emit({
				method: "item/completed",
				params: {
					threadId: "thread-root",
					turnId: "turn-unknown",
					item: { id: "plan-unknown", type: "plan", text: "1. [in progress] unknown plan" },
				},
			});
			transport.emit({
				method: "item/completed",
				params: {
					turnId: "turn-unknown",
					item: { id: "unknown-plan", type: "plan", text: "1. unknown completed plan — running" },
				},
			});

			await waitFor(() => expect(journal.records.some(activity =>
				activity.nativeRefs.turnId === "turn-unknown"
				&& activity.payload.method === "item/completed")).toBe(true));
			await Bun.sleep(10);
			expect(workbench.snapshot.workFlow).toMatchObject({
				source: { turnId: "turn-root" },
				steps: markdownSteps.map((step) => ({ id: step.id, title: step.title })),
			});
			expect(workbench.snapshot.workFlow.steps.map((step) => step.title)).not.toContain("child plan");
			expect(workbench.snapshot.workFlow.steps.map((step) => step.title)).not.toContain("unknown plan");
			expect(workbench.snapshot.workFlow.rejections).toEqual(expect.arrayContaining([
				expect.objectContaining({ code: "source_turn_mismatch" }),
				expect.objectContaining({ code: "non_string_entry" }),
				expect.objectContaining({ code: "blank_entry" }),
			]));
			expect(ledger.snapshot).toEqual(markdownTodo);
			expect(store.compareAndSwapCalls).toBe(stableTodoWrites);
			expect(journal.records).toEqual(expect.arrayContaining([
				expect.objectContaining({ nativeRefs: expect.objectContaining({ threadId: "thread-child", turnId: "turn-child" }) }),
				expect.objectContaining({ nativeRefs: expect.objectContaining({ turnId: "turn-unknown" }) }),
			]));
		} finally {
			await workbench.close();
		}
	});
});
