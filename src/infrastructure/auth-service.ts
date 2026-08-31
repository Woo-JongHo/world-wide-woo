import type {
	AuthInteraction,
	AuthType,
	Models,
} from "@earendil-works/pi-ai";
import type { AuthController, ProviderAuthState } from "../application/ports";
import type { Provider } from "../domain/model-settings";

export class AuthService implements AuthController {
	constructor(private readonly models: Pick<Models, "checkAuth" | "getProvider" | "login" | "logout">) {}

	methods(provider: Provider): AuthType[] {
		const auth = this.models.getProvider(provider)?.auth;
		if (!auth) return [];
		return [
			...(auth.oauth ? ["oauth" as const] : []),
			...(auth.apiKey?.login ? ["api_key" as const] : []),
		];
	}

	async status(provider: Provider, signal?: AbortSignal): Promise<ProviderAuthState> {
		try {
			const auth = await this.models.checkAuth(provider, { signal });
			return auth
				? { state: "configured", provider, source: auth.source ?? auth.type, type: auth.type }
				: { state: "required", provider };
		} catch (error) {
			return { state: "failed", provider, message: error instanceof Error ? error.message : String(error) };
		}
	}

	async login(provider: Provider, type: AuthType, interaction: AuthInteraction): Promise<ProviderAuthState> {
		if (!this.methods(provider).includes(type)) throw new Error(`${provider}은(는) ${type} 로그인을 지원하지 않습니다.`);
		await this.models.login(provider, type, interaction);
		return this.status(provider, interaction.signal);
	}

	async logout(provider: Provider, signal?: AbortSignal): Promise<void> {
		await this.models.logout(provider, { signal });
	}
}
