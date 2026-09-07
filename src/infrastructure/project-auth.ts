import type { AuthController } from "../application/ports/index.js";
import { AuthService } from "./auth-service.js";
import { FileCredentialStore } from "./credential-store.js";
import { createModelRegistry } from "./model-router.js";

export function createProjectAuthController(): AuthController {
	const credentials = new FileCredentialStore();
	return new AuthService(createModelRegistry(credentials));
}
