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

const settings: WwwSettings = { provider: "openai", model: "gpt-5.4", effort: "high" };

async function runtimeWithResponse(response: string) {
	const faux = fauxProvider({ provider: "openai", models: [{ id: "gpt-5.4", reasoning: true }], tokensPerSecond: 100_000 });
	faux.setResponses([fauxAssistantMessage(response)]);
	const models = createModels();
	models.setProvider(faux.provider);
	const directory = await mkdtemp(join(tmpdir(), "www-runtime-"));
	const store = new SessionEventStore(directory);
	return { runtime: new SessionRuntime(settings, new ModelRouter(models), store, "session-test"), store };
}

describe("SessionRuntime", () => {
	test("streams a response while preserving a replayable event trail", async () => {
		const { runtime, store } = await runtimeWithResponse("진행됐습니다.");
		const phases: string[] = [];
		const drafts: string[] = [];
		runtime.subscribe((snapshot) => {
			phases.push(snapshot.phase);
			if (snapshot.draft) drafts.push(snapshot.draft);
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

	test("rejects concurrent submissions without corrupting the transcript", async () => {
		const { runtime } = await runtimeWithResponse("첫 응답");
		await runtime.initialize();
		const first = runtime.submit("첫 질문");
		await expect(runtime.submit("두 번째 질문")).rejects.toThrow("이미 모델 응답을 처리하고 있습니다.");
		await first;
		expect(runtime.snapshot.turns).toHaveLength(2);
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
		const runtime = new SessionRuntime(settings, router, store, "auth-required");
		await runtime.initialize();

		await expect(runtime.submit("보내지면 안 됨")).rejects.toThrow("Ctrl+O");
		expect(runtime.snapshot.turns).toEqual([]);
		expect((await store.readAll("auth-required")).map((event) => event.type)).toEqual(["session.started"]);
	});

	test("resumes canonical messages from the durable event trail", async () => {
		const { runtime, store } = await runtimeWithResponse("저장된 응답");
		await runtime.initialize();
		await runtime.submit("저장해 줘");

		const models = createModels();
		const faux = fauxProvider({ provider: "openai", models: [{ id: "gpt-5.4", reasoning: true }] });
		models.setProvider(faux.provider);
		const resumed = new SessionRuntime(settings, new ModelRouter(models), store, "session-test");
		await resumed.initialize({ resume: true });

		expect(resumed.snapshot.turns.map(({ role, content }) => ({ role, content }))).toEqual([
			{ role: "user", content: "저장해 줘" },
			{ role: "assistant", content: "저장된 응답" },
		]);
		expect((await store.readAll("session-test")).at(-1)?.type).toBe("session.resumed");
	});
});
