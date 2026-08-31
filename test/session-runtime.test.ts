import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createModels } from "@earendil-works/pi-ai";
import { fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai/providers/faux";
import type { WwwSettings } from "../src/domain/model-settings";
import { ModelRouter } from "../src/infrastructure/model-router";
import { SessionRuntime } from "../src/application/session-runtime";
import { SessionEventStore } from "../src/infrastructure/session-store";
import type { ModelClient } from "../src/application/ports";

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
