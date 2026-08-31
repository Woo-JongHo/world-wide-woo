import { MODELS, PROVIDERS, type WwwSettings } from "../domain/model-settings";
import type { AtomicSettingsRepository, ModelClient, RouterSettingsController, SettingsRepository } from "./ports";
import type { SessionRuntime } from "./session-runtime";

/** Serializes durable selection writes before publishing them to the active session. */
export class RouterService implements RouterSettingsController {
	private writeChain: Promise<void> = Promise.resolve();

	constructor(
		private readonly settings: AtomicSettingsRepository,
		private readonly session: Pick<SessionRuntime, "updateSettings">,
		private current: WwwSettings,
	) {}

	update(selection: WwwSettings): Promise<void> {
		const operation = this.writeChain.then(async () => {
			const previous = this.current;
			if (!(await this.settings.compareAndSwap(previous, selection))) {
				await this.synchronizeObservedSettings();
				throw new Error("다른 WWW 프로세스의 모델 설정을 반영했습니다. 모델 화면을 다시 확인하세요.");
			}
			try {
				await this.session.updateSettings(selection);
			} catch (error) {
				try {
					if (!(await this.settings.compareAndSwap(selection, previous))) {
						await this.synchronizeObservedSettings();
						throw new Error("다른 WWW 프로세스의 새 설정을 반영하고 rollback하지 않았습니다.");
					}
				} catch (rollbackError) {
					throw new AggregateError([error, rollbackError], "모델 설정 적용과 rollback에 모두 실패했습니다.");
				}
				throw error;
			}
			this.current = { ...selection };
		});
		this.writeChain = operation.catch(() => undefined);
		return operation;
	}

	private async synchronizeObservedSettings(): Promise<void> {
		const observed = await this.settings.load();
		await this.session.updateSettings(observed);
		this.current = { ...observed };
	}

	async flush(): Promise<void> {
		await this.writeChain;
	}
}

/**
 * Keeps an exact model selection while moving it to the sole authenticated
 * Router that exposes that model. This resolves the common openai vs
 * openai-codex credential split without silently changing models.
 */
export async function reconcileInitialRouter(
	selection: WwwSettings,
	models: Pick<ModelClient, "checkAuth">,
	settings: SettingsRepository,
): Promise<WwwSettings> {
	if ((await models.checkAuth(selection)).configured) return selection;
	const candidates: WwwSettings[] = [];
	for (const provider of PROVIDERS) {
		if (provider === selection.provider || !(MODELS[provider] as readonly string[]).includes(selection.model)) continue;
		if ((await models.checkAuth({ provider })).configured) candidates.push({ ...selection, provider });
	}
	if (candidates.length !== 1) return selection;
	await settings.save(candidates[0]);
	return candidates[0];
}
