import { MODELS, PROVIDERS, type WwwSettings } from "../domain/model-settings";
import type { ModelClient, RouterSettingsController, SettingsRepository } from "./ports";
import type { SessionRuntime } from "./session-runtime";

/** Serializes durable selection writes before publishing them to the active session. */
export class RouterService implements RouterSettingsController {
	private writeChain: Promise<void> = Promise.resolve();

	constructor(
		private readonly settings: SettingsRepository,
		private readonly session: Pick<SessionRuntime, "updateSettings">,
	) {}

	update(selection: WwwSettings): Promise<void> {
		const operation = this.writeChain.then(async () => {
			await this.settings.save(selection);
			await this.session.updateSettings(selection);
		});
		this.writeChain = operation.catch(() => undefined);
		return operation;
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
