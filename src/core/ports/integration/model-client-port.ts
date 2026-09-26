import type { AssistantMessageEventStream, AuthCheck, Context } from "@earendil-works/pi-ai";
import type { WwwSettings }                                     from "@/core/domain/execution/model-settings";

export interface ModelAuthStatus {
	configured : boolean           ;
	source?    : string            ;
	type?      : AuthCheck["type"] ;
}

export interface ModelClient {
	checkAuth(settings: Pick<WwwSettings, "provider">): Promise<ModelAuthStatus>;
	stream(settings: WwwSettings, context: Context, signal?: AbortSignal): AssistantMessageEventStream;
}
