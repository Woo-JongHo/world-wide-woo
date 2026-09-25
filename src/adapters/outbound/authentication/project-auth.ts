import type { AuthController }    from "@/core/ports/index.js";
import { AuthService }            from "@/adapters/outbound/authentication/auth-service.js";
import { FileCredentialStore }    from "@/adapters/outbound/authentication/credential-store.js";
import { createModelRegistry }    from "@/adapters/outbound/authentication/model-router.js";
import { ProviderAuthController } from "@/adapters/outbound/authentication/antigravity-auth.js";

export function createProjectAuthController(): AuthController {
	const credentials = new FileCredentialStore();
	return new ProviderAuthController(new AuthService(createModelRegistry(credentials)));
}
