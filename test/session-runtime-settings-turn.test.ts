import      { expect, test                       } from "bun:test"                                        ;
import      { mkdtemp                            } from "node:fs/promises"                                ;
import      { tmpdir                             } from "node:os"                                         ;
import      { join                               } from "node:path"                                       ;
import      { createModels                       } from "@earendil-works/pi-ai"                           ;
import      { fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai/providers/faux"            ;
import type { WwwSettings                        } from "@/core/domain/execution/model-settings"          ;
import type { SessionRepository                  } from "@/core/ports/persistence/session-repository"     ;
import      { SessionRuntime                     } from "@/core/application/session/session-runtime"      ;
import      { ModelRouter                        } from "@/adapters/outbound/authentication/model-router" ;
import      { SessionEventStore                  } from "@/adapters/outbound/persistence/session-store"   ;

test("active turn keeps its model settings until completion", async () => {
	const settings: WwwSettings = { provider: "openai", model: "gpt-5.4", effort: "high" }                                                ;
	const faux                  = fauxProvider({ provider: "openai", models: [{ id: "gpt-5.4", reasoning: true }], tokensPerSecond: 20 }) ;
	faux.setResponses([fauxAssistantMessage("진행 중인 응답을 충분히 길게 유지합니다.")]);
	const models = createModels();
	models.setProvider(faux.provider);
	const store   = new SessionEventStore(await mkdtemp(join(tmpdir(), "www-runtime-settings-")))                                ;
	const runtime = new SessionRuntime(settings, new ModelRouter(models), store, { cwd: "/workspace/project" }, "settings-turn") ;
	await runtime.initialize();

	const submission = runtime.submit("응답해 줘");
	await expect(runtime.updateSettings({ ...settings, model: "other" })).rejects.toThrow("작업 처리 중에는 모델 설정을 변경할 수 없습니다.");
	expect(runtime.settings).toEqual(settings);
	expect((await store.readAll("settings-turn")).some(event => event.type === "model.changed")).toBe(false);
	runtime.abort();
	await submission;
});

test("model setting save blocks a new turn until the prompt is updated", async () => {
	const settings: WwwSettings = { provider: "openai", model: "gpt-5.4", effort: "high" }                                                     ;
	const faux                  = fauxProvider({ provider: "openai", models: [{ id: "gpt-5.4", reasoning: true }], tokensPerSecond: 100_000 }) ;
	faux.setResponses([fauxAssistantMessage("완료")]);
	const models = createModels();
	models.setProvider(faux.provider);
	const baseStore              = new SessionEventStore(await mkdtemp(join(tmpdir(), "www-runtime-settings-race-"))) ;
	let releaseSave : () => void = () => {}                                                                           ;
	let saveStarted : () => void = () => {}                                                                           ;
	const saveGate               = new Promise<void>(resolve => { releaseSave = resolve; })                           ;
	const saveReached            = new Promise<void>(resolve => { saveStarted = resolve; })                           ;
	const store: SessionRepository = {
		readAll: sessionId => baseStore.readAll(sessionId),
		append: async (sessionId, input) => {
			if (input.type === "model.changed") {
				saveStarted();
				await saveGate;
			}
			return baseStore.append(sessionId, input);
		},
	};
	const runtime = new SessionRuntime(settings, new ModelRouter(models), store, { cwd: "/workspace/project" }, "settings-race");
	await runtime.initialize();

	const updating = runtime.updateSettings({ ...settings, model: "other" });
	await saveReached;
	await expect(runtime.submit("새 요청")).rejects.toThrow("모델 설정 변경 중에는 메시지를 보낼 수 없습니다.");
	await expect(runtime.updateSettings(settings)).rejects.toThrow("작업 처리 중에는 모델 설정을 변경할 수 없습니다.");
	expect(runtime.snapshot.turns).toHaveLength(0);
	releaseSave();
	await updating;
	expect(runtime.settings.model).toBe("other");
});
