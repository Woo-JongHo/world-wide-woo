import type { AuthInteraction, AuthType, Models } from "@earendil-works/pi-ai";
import type { AuthController, ProviderAuthState } from "@/core/ports";
import type { Provider }                          from "@/core/domain/execution/model-settings";
import { isInvalidOAuthRefresh }                  from "@/adapters/outbound/authentication/oauth-refresh-error.js";

export class AuthService implements AuthController {
	constructor(private readonly models: Pick<Models, "checkAuth" | "getProvider" | "login" | "logout">) {}

	methods(provider: Provider): AuthType[] {
		const auth = this.models.getProvider(provider)?.auth;
		if (!auth) return [];
		const methods: AuthType[] = [];
		if (auth.oauth) methods.push("oauth");
		if (auth.apiKey?.login) methods.push("api_key");
		return methods;
	}

	async status(provider: Provider, signal?: AbortSignal): Promise<ProviderAuthState> {
		try {
			const auth = await this.models.checkAuth(provider, signal ? { signal } : {});
			return auth
				? { state: "configured", provider, source: auth.source ?? auth.type, type: auth.type }
				: { state: "required", provider };
		} catch (error) {
			// A revoked Claude subscription refresh token is recoverable by signing in
			// again.  Do not present that as an opaque provider failure in the picker.
			if (provider === "anthropic" && isInvalidOAuthRefresh(error)) return { state: "required", provider };
			return { state: "failed", provider, message: error instanceof Error ? error.message : String(error) };
		}
	}

	async login(provider: Provider, type: AuthType, interaction: AuthInteraction): Promise<ProviderAuthState> {
		if (!this.methods(provider).includes(type)) throw new Error(`${provider}은(는) ${type} 로그인을 지원하지 않습니다.`);
		await this.models.login(provider, type, interaction);
		return this.status(provider, interaction.signal);
	}

	async logout(provider: Provider, signal?: AbortSignal): Promise<void> {
		await this.models.logout(provider, signal ? { signal } : {});
	}
}
