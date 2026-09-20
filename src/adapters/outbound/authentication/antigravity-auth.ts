import type { AuthInteraction, AuthType } from "@earendil-works/pi-ai";
import type { Provider } from "../../../core/domain/execution/model-settings.js";
import type { AuthController, ProviderAuthState } from "../../../core/ports/index.js";
import { SystemAntigravityLocalAuthSource, type AntigravityLocalAuthSource } from "./antigravity-local-auth.js";

/**
 * Antigravity owns its Google session. WWW only observes that local session;
 * it neither invokes the retired Gemini CLI flow nor reads Keychain.
 */
export class ProviderAuthController implements AuthController {
	constructor(
		private readonly base: AuthController,
		private readonly antigravity: AntigravityLocalAuthSource = new SystemAntigravityLocalAuthSource(),
	) {}

	methods(provider: Provider): AuthType[] {
		return this.base.methods(provider);
	}

	async status(provider: Provider, signal?: AbortSignal): Promise<ProviderAuthState> {
		if (provider === "google" && await this.antigravity.configured()) {
			return { state: "configured", provider, source: "Antigravity · 로컬 구독", type: "oauth" };
		}
		return this.base.status(provider, signal);
	}

	login(provider: Provider, type: AuthType, interaction: AuthInteraction): Promise<ProviderAuthState> {
		return this.base.login(provider, type, interaction);
	}

	logout(provider: Provider, signal?: AbortSignal): Promise<void> {
		return this.base.logout(provider, signal);
	}
}
