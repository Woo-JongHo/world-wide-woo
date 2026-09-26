import type { AuthInteraction, AuthType } from "@earendil-works/pi-ai";
import type { Provider }                  from "@/core/domain/execution/model-settings";

export type ProviderAuthState =
	| { state: "configured"; provider: Provider; source: string; type: AuthType }
	| { state: "required"; provider: Provider }
	| { state: "failed"; provider: Provider; message: string };

export interface AuthController {
	/** 현재 provider의 즉시 조회 결과다. `failed`는 이전 인증 상태를 보존했다는 뜻이 아니다. */
	methods(provider: Provider                                              ): AuthType[];
	status (provider: Provider, signal?: AbortSignal                        ): Promise<ProviderAuthState>;
	login  (provider: Provider, type: AuthType, interaction: AuthInteraction): Promise<ProviderAuthState>;
	logout (provider: Provider, signal?: AbortSignal                        ): Promise<void>;
}
