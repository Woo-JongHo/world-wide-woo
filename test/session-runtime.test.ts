import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createModels } from "@earendil-works/pi-ai";
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import { Type } from "typebox";
import type { WwwSettings } from "../src/domain/model-settings";
import { ModelRouter } from "../src/infrastructure/model-router";
import { SessionRuntime } from "../src/application/session-runtime";
import { SessionEventStore } from "../src/infrastructure/session-store";
import type { AgentTool, ModelClient } from "../src/application/ports";
import { TodoLedger } from "../src/application/todo-ledger";
import { createProjectAgentTools } from "../src/infrastructure/agent-tools";
import { FileTodoStore } from "../src/infrastructure/todo-store";

const settings: WwwSettings = { provider: "openai", model: "gpt-5.4", effort: "high" };

async function runtimeWithResponse(response: string) {
	const faux = fauxProvider({ provider: "openai", models: [{ id: "gpt-5.4", reasoning: true }], tokensPerSecond: 100_000 });
	faux.setResponses([fauxAssistantMessage(response)]);
	const models = createModels();
	models.setProvider(faux.provider);
	const directory = await mkdtemp(join(tmpdir(), "www-runtime-"));
	const store = new SessionEventStore(directory);
	return { runtime: new SessionRuntime(settings, new ModelRouter(models), store, { cwd: "/workspace/project" }, "session-test"), store };
}

describe("SessionRuntime", () => {
	test("streams a response while preserving a replayable event trail", async () => {
		const { runtime, store } = await runtimeWithResponse("진행됐습니다.");
		const phases: string[] = [];
		const drafts: string[] = [];
		const activities: string[] = [];
		runtime.subscribe((snapshot) => {
			phases.push(snapshot.phase);
			if (snapshot.draft) drafts.push(snapshot.draft);
			if (snapshot.activity) activities.push(snapshot.activity.kind);
		});

		await runtime.initialize();
		await runtime.submit("진행돼?");

		expect(runtime.snapshot.phase).toBe("ready");
		expect(runtime.snapshot.turns.map(({ role, content }) => ({ role, content }))).toEqual([
			{ role: "user", content: "진행돼?" },
			{ role: "assistant", content: "진행됐습니다." },
		]);
		expect(phases).toContain("streaming");
		expect(drafts.at(-1)).toBe("진행됐습니다.");
		expect(activities).toContain("waiting");
		expect(activities).toContain("responding");
		const events = await store.readAll("session-test");
		expect(events.map((event) => event.type)).toEqual([
			"session.started",
			"turn.started",
			"message.user",
			"message.assistant.started",
			"message.assistant.completed",
			"turn.completed",
		]);
		expect(events.find((event) => event.type === "message.assistant.completed")?.body).toBe("진행됐습니다.");
	});

	test("grounds location questions in the exact active workspace path", async () => {
		const faux = fauxProvider({
			provider: "openai",
			models: [{ id: "gpt-5.4", reasoning: true }],
			tokensPerSecond: 100_000,
		});
		faux.setResponses([fauxAssistantMessage("/workspace/world-wide-woo")]);
		const models = createModels();
		models.setProvider(faux.provider);
		const base = new ModelRouter(models);
		let systemPrompt = "";
		const router: ModelClient = {
			checkAuth: settings => base.checkAuth(settings),
			stream: (selection, context, signal) => {
				systemPrompt = context.systemPrompt ?? "";
				return base.stream(selection, context, signal);
			},
		};
		const store = new SessionEventStore(await mkdtemp(join(tmpdir(), "www-runtime-cwd-")));
		const runtime = new SessionRuntime(
			settings,
			router,
			store,
			{ cwd: "/workspace/world-wide-woo" },
			"cwd-test",
		);
		await runtime.initialize();
		await runtime.submit("지금 경로 위치가 어디야?");

		expect(systemPrompt).toContain('현재 작업 디렉토리는 "/workspace/world-wide-woo"');
		expect(systemPrompt).toContain('활성 Router는 "openai", 모델 ID는 "gpt-5.4", 추론 강도는 "high"');
		expect(systemPrompt).toContain("pwd 실행을 사용자에게 요구하지 마세요");
		expect(systemPrompt).toContain("ChatGPT라고 뭉뚱그리거나 모델 ID를 볼 수 없다고 답하지 마세요");
		expect(systemPrompt).toContain("물리적 위치나 GPS를 명시적으로 물은 경우에만");
		expect((await store.readAll("cwd-test"))[0]?.metadata).toMatchObject({
			workspace: { cwd: "/workspace/world-wide-woo" },
		});
	});

	test("rejects concurrent submissions without corrupting the transcript", async () => {
		const { runtime } = await runtimeWithResponse("첫 응답");
		await runtime.initialize();
		const first = runtime.submit("첫 질문");
		await expect(runtime.submit("두 번째 질문")).rejects.toThrow("이미 모델 응답을 처리하고 있습니다.");
		await first;
		expect(runtime.snapshot.turns).toHaveLength(2);
	});

	test("commits a cancelled assistant item without polluting model context", async () => {
		const faux = fauxProvider({
			provider: "openai",
			models: [{ id: "gpt-5.4", reasoning: true }],
			tokensPerSecond: 20,
		});
		faux.setResponses([fauxAssistantMessage("중단 전까지 보존해야 하는 충분히 긴 응답입니다.")]);
		const models = createModels();
		models.setProvider(faux.provider);
		const directory = await mkdtemp(join(tmpdir(), "www-runtime-cancel-"));
		const store = new SessionEventStore(directory);
		const runtime = new SessionRuntime(settings, new ModelRouter(models), store, { cwd: "/workspace/project" }, "cancel-test");
		await runtime.initialize();

		let resolveDraft!: () => void;
		const draftSeen = new Promise<void>((resolve) => {
			resolveDraft = resolve;
		});
		const unsubscribe = runtime.subscribe((snapshot) => {
			if (snapshot.draft) resolveDraft();
		});
		const submission = runtime.submit("길게 답해 줘");
		await draftSeen;
		expect(runtime.abort()).toBe(true);
		await submission;
		unsubscribe();

		expect(runtime.snapshot.phase).toBe("ready");
		expect(runtime.snapshot.error).toBeNull();
		expect(runtime.snapshot.turns.at(-1)?.role).toBe("assistant");
		expect(runtime.snapshot.turns.at(-1)?.content.length).toBeGreaterThan(0);
		const events = await store.readAll("cancel-test");
		expect(events.map(({ type }) => type)).toContain("message.assistant.cancelled");
		expect(events.map(({ type }) => type)).not.toContain("message.assistant.failed");
		expect(events.at(-1)).toMatchObject({ type: "turn.completed", status: "blocked", body: "cancelled" });
	});

	test("executes a real tool call, returns its result to the model, and persists the card", async () => {
		const faux = fauxProvider({
			provider: "openai",
			models: [{ id: "gpt-5.4", reasoning: true }],
			tokensPerSecond: 100_000,
		});
		faux.setResponses([
			fauxAssistantMessage(
				[fauxToolCall("read", { path: "src/app.ts" }, { id: "tool-read" })],
				{ stopReason: "toolUse", timestamp: 10 },
			),
			(context) => {
				expect(context.messages.at(-1)).toMatchObject({
					role: "toolResult",
					toolCallId: "tool-read",
					isError: false,
				});
				return fauxAssistantMessage("src/app.ts를 읽었습니다.", { timestamp: 30 });
			},
		]);
		const models = createModels();
		models.setProvider(faux.provider);
		const directory = await mkdtemp(join(tmpdir(), "www-runtime-tool-"));
		const store = new SessionEventStore(directory);
		const tool: AgentTool = {
			definition: {
				name: "read",
				description: "프로젝트 파일 읽기",
				parameters: Type.Object({ path: Type.String() }),
			},
			execute: async (arguments_) => ({
				modelContent: "export async function main() {}",
				isError: false,
				snapshot: {
					id: "adapter-id",
					toolName: "read",
					status: "passed",
					input: JSON.stringify(arguments_),
					output: "export async function main() {}",
					startedAt: 20,
					durationMs: 2,
					error: undefined,
				},
			}),
		};
		const runtime = new SessionRuntime(
			settings,
			new ModelRouter(models),
			store,
			{ cwd: "/workspace/project" },
			"tool-test",
			[tool],
		);
		await runtime.initialize();
		await runtime.submit("src/app.ts를 읽어");

		expect(runtime.snapshot.turns.at(-1)?.content).toBe("src/app.ts를 읽었습니다.");
		expect(runtime.snapshot.tools).toEqual([
			expect.objectContaining({ id: "tool-read", toolName: "read", status: "passed" }),
		]);
		const events = await store.readAll("tool-test");
		expect(events.map(event => event.type)).toEqual(expect.arrayContaining([
			"command.started",
			"command.output",
			"command.completed",
		]));

		const resumed = new SessionRuntime(
			settings,
			new ModelRouter(models),
			store,
			{ cwd: "/workspace/project" },
			"tool-test",
			[tool],
		);
		await resumed.initialize({ resume: true });
		expect(resumed.snapshot.tools).toEqual([
			expect.objectContaining({ id: "tool-read", toolName: "read", status: "passed" }),
		]);
	});

	test("retries a transient overloaded provider response before failing the turn", async () => {
		const faux = fauxProvider({
			provider: "openai",
			models: [{ id: "gpt-5.4", reasoning: true }],
			tokensPerSecond: 100_000,
		});
		faux.setResponses([
			fauxAssistantMessage("", { stopReason: "error", errorMessage: "Our servers are currently overloaded." }),
			fauxAssistantMessage("재시도 성공"),
		]);
		const models = createModels();
		models.setProvider(faux.provider);
		const runtime = new SessionRuntime(
			settings,
			new ModelRouter(models),
			new SessionEventStore(await mkdtemp(join(tmpdir(), "www-runtime-retry-"))),
			{ cwd: "/workspace/project" },
			"retry-test",
		);
		await runtime.initialize();
		await runtime.submit("다시 시도해");
		expect(faux.state.callCount).toBe(2);
		expect(runtime.snapshot.phase).toBe("ready");
		expect(runtime.snapshot.turns.at(-1)?.content).toBe("재시도 성공");
	});

	test("writes terminal tool results for every parallel call when aborted", async () => {
		const faux = fauxProvider({
			provider: "openai",
			models: [{ id: "gpt-5.4", reasoning: true }],
			tokensPerSecond: 100_000,
		});
		faux.setResponses([
			fauxAssistantMessage([
				fauxToolCall("read", { path: "one" }, { id: "tool-one" }),
				fauxToolCall("read", { path: "two" }, { id: "tool-two" }),
			], { stopReason: "toolUse" }),
		]);
		const models = createModels();
		models.setProvider(faux.provider);
		const store = new SessionEventStore(await mkdtemp(join(tmpdir(), "www-runtime-multi-abort-")));
		const tool: AgentTool = {
			definition: { name: "read", description: "read", parameters: Type.Object({ path: Type.String() }) },
			execute: async (arguments_, signal) => new Promise((resolve) => {
				const finish = () => resolve({
					modelContent: "취소됨",
					isError: true,
					snapshot: {
						id: "adapter",
						toolName: "read",
						status: "cancelled",
						input: JSON.stringify(arguments_),
						output: "",
						startedAt: Date.now(),
						durationMs: 0,
						error: "취소됨",
					},
				});
				if (signal.aborted) finish();
				else signal.addEventListener("abort", finish, { once: true });
			}),
		};
		const runtime = new SessionRuntime(
			settings,
			new ModelRouter(models),
			store,
			{ cwd: "/workspace/project" },
			"multi-abort",
			[tool],
		);
		await runtime.initialize();
		const running = new Promise<void>((resolve) => {
			const unsubscribe = runtime.subscribe(snapshot => {
				if (snapshot.tools.some(item => item.status === "running")) {
					unsubscribe();
					resolve();
				}
			});
		});
		const submission = runtime.submit("둘 다 읽어");
		await running;
		runtime.abort();
		await submission;

		expect(runtime.snapshot.tools.map(item => [item.id, item.status])).toEqual([
			["tool-one", "cancelled"],
			["tool-two", "cancelled"],
		]);
		const terminal = (await store.readAll("multi-abort")).filter(event => event.type === "command.completed");
		expect(terminal.map(event => event.itemId)).toEqual(["tool-one", "tool-two"]);
	});

	test("drops an incomplete persisted tool round from resumed model context", async () => {
		const faux = fauxProvider({
			provider: "openai",
			models: [{ id: "gpt-5.4", reasoning: true }],
			tokensPerSecond: 100_000,
		});
		faux.setResponses([
			(context) => {
				expect(context.messages.some(message => message.role === "toolResult")).toBe(false);
				expect(context.messages.some(message =>
					message.role === "assistant" && message.content.some(item => item.type === "toolCall"),
				)).toBe(false);
				return fauxAssistantMessage("복구 후 계속");
			},
		]);
		const models = createModels();
		models.setProvider(faux.provider);
		const store = new SessionEventStore(await mkdtemp(join(tmpdir(), "www-runtime-incomplete-tool-")));
		const turnId = "turn-incomplete";
		const assistant = fauxAssistantMessage([
			fauxToolCall("read", { path: "one" }, { id: "call-one" }),
			fauxToolCall("read", { path: "two" }, { id: "call-two" }),
		], { stopReason: "toolUse", timestamp: 2 });
		await store.append("incomplete-tool", {
			category: "system", type: "session.started", status: "passed", title: "start", body: "",
		});
		await store.append("incomplete-tool", {
			category: "action", type: "turn.started", status: "running", title: "turn", body: "read", turnId,
		});
		await store.append("incomplete-tool", {
			category: "action", type: "message.user", status: "passed", title: "user", body: "read", turnId, itemId: "user",
		});
		await store.append("incomplete-tool", {
			category: "answer", type: "message.assistant.completed", status: "passed", title: "assistant", body: "",
			turnId, itemId: "assistant", metadata: { message: assistant },
		});
		await store.append("incomplete-tool", {
			category: "command", type: "command.completed", status: "passed", title: "read", body: "",
			turnId,
			itemId: "call-one",
			metadata: {
				snapshot: {
					id: "call-one", toolName: "read", status: "passed", input: "one", output: "one",
					startedAt: 3, durationMs: 1,
				},
				message: {
					role: "toolResult", toolCallId: "call-one", toolName: "read",
					content: [{ type: "text", text: "one" }], isError: false, timestamp: 4,
				},
			},
		});
		const runtime = new SessionRuntime(
			settings,
			new ModelRouter(models),
			store,
			{ cwd: "/workspace/project" },
			"incomplete-tool",
		);
		await runtime.initialize({ resume: true });
		expect(runtime.snapshot.tools).toEqual([]);
		await runtime.submit("계속");
		expect(runtime.snapshot.turns.at(-1)?.content).toBe("복구 후 계속");
	});

	test("drives a thin project Todo from model intent through real tool evidence", async () => {
		const faux = fauxProvider({
			provider: "openai",
			models: [{ id: "gpt-5.4", reasoning: true }],
			tokensPerSecond: 100_000,
		});
		faux.setResponses([
			fauxAssistantMessage([fauxToolCall("todo_write", {
				operation: "init",
				title: "Todo 기능",
				storyId: "ST-001",
				items: ["파일 확인", "Pane 연결", "검증"],
			}, { id: "todo-init" })], { stopReason: "toolUse" }),
			fauxAssistantMessage([fauxToolCall("todo_write", {
				operation: "start",
				itemId: "todo-1",
			}, { id: "todo-start" })], { stopReason: "toolUse" }),
			fauxAssistantMessage([fauxToolCall("read", {
				path: "sample.txt",
			}, { id: "read-evidence" })], { stopReason: "toolUse" }),
			fauxAssistantMessage([fauxToolCall("todo_write", {
				operation: "done",
				itemId: "todo-1",
			}, { id: "todo-done" })], { stopReason: "toolUse" }),
			fauxAssistantMessage("첫 항목을 완료했습니다."),
		]);
		const models = createModels();
		models.setProvider(faux.provider);
		const root = await mkdtemp(join(tmpdir(), "www-runtime-live-todo-"));
		await writeFile(join(root, "sample.txt"), "evidence\n");
		const store = new SessionEventStore(join(root, "sessions"));
		const todos = new TodoLedger("live-todo", new FileTodoStore(join(root, "Todo.md")), store);
		await todos.initialize();
		const tools = createProjectAgentTools(root, { todos, sshConfigPath: join(root, "missing-ssh-config") });
		const runtime = new SessionRuntime(
			settings,
			new ModelRouter(models),
			store,
			{ cwd: root, root, projectName: "live-todo" },
			"live-todo",
			tools,
			todos,
		);
		await runtime.initialize();
		await runtime.submit("Todo 기능을 구현해");

		expect(todos.snapshot?.items.map(item => [item.id, item.status])).toEqual([
			["todo-1", "completed"],
			["todo-2", "pending"],
			["todo-3", "pending"],
		]);
		expect(runtime.snapshot.turns.at(-1)?.content).toBe("첫 항목을 완료했습니다.");
		const events = await store.readAll("live-todo");
		const evidence = events.find(event => event.type === "command.completed" && event.itemId === "read-evidence");
		if (!evidence) throw new Error("Missing read evidence event");
		expect(todos.snapshot?.items[0]?.evidenceIds).toEqual([evidence.id]);
		expect(events.filter(event => event.type === "todo.updated")).toHaveLength(4);
	});

	test("blocks unauthenticated turns before they enter the transcript", async () => {
		const directory = await mkdtemp(join(tmpdir(), "www-runtime-auth-"));
		const store = new SessionEventStore(directory);
		const router = {
			checkAuth: async () => ({ configured: false }),
			stream: () => {
				throw new Error("must not dispatch");
			},
		};
		const runtime = new SessionRuntime(settings, router, store, { cwd: "/workspace/project" }, "auth-required");
		await runtime.initialize();

		await expect(runtime.submit("보내지면 안 됨")).rejects.toThrow("Ctrl+O");
		expect(runtime.snapshot.turns).toEqual([]);
		expect((await store.readAll("auth-required")).map((event) => event.type)).toEqual(["session.started"]);
	});

	test("isolates a broken observer from durable model-setting commits", async () => {
		const { runtime, store } = await runtimeWithResponse("응답");
		await runtime.initialize();
		expect(() => runtime.subscribe(() => { throw new Error("observer failed"); })).not.toThrow();
		await runtime.updateSettings({ ...settings, effort: "ultra" });
		expect(runtime.snapshot.settings.effort).toBe("ultra");
		expect((await store.readAll("session-test")).at(-1)?.type).toBe("model.changed");
	});

	test("resumes canonical messages from the durable event trail", async () => {
		const { runtime, store } = await runtimeWithResponse("저장된 응답");
		await runtime.initialize();
		await runtime.submit("저장해 줘");

		const models = createModels();
		const faux = fauxProvider({ provider: "openai", models: [{ id: "gpt-5.4", reasoning: true }] });
		models.setProvider(faux.provider);
		const resumed = new SessionRuntime(settings, new ModelRouter(models), store, { cwd: "/workspace/project" }, "session-test");
		await resumed.initialize({ resume: true });

		expect(resumed.snapshot.turns.map(({ role, content }) => ({ role, content }))).toEqual([
			{ role: "user", content: "저장해 줘" },
			{ role: "assistant", content: "저장된 응답" },
		]);
		expect((await store.readAll("session-test")).at(-1)?.type).toBe("session.resumed");
	});
});
