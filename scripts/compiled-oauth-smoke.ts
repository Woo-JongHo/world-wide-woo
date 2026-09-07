import { FileCredentialStore } from "../src/system/adapters/credential-store.js";
import { createModelRegistry } from "../src/system/adapters/model-router.js";

const registry = createModelRegistry(new FileCredentialStore());
const auth = await registry.getAuth("openai-codex");
if (!auth || auth.source !== "OAuth" || typeof auth.auth.apiKey !== "string" || auth.auth.apiKey.length === 0) {
	throw new Error("OpenAI Codex OAuth auth derivation was not available");
}
console.log("openai-codex OAuth auth derivation: PASS");

const model = registry.getModel("openai-codex", "gpt-5.6-luna");
if (!model) throw new Error("OpenAI Codex smoke model was not available");
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => new Response('{"error":{"message":"compiled smoke"}}', {
	status: 401,
	headers: { "content-type": "application/json" },
});
try {
	const result = await registry.streamSimple(model, {
		messages: [{ role: "user", content: "compiled module smoke", timestamp: 0 }],
		tools: [],
	}, { toolChoice: "none", transport: "sse" }).result();
	if (result.errorMessage?.includes("Cannot find module")) throw new Error(result.errorMessage);
	console.log("openai-codex T-note provider module load: PASS");
} finally {
	globalThis.fetch = originalFetch;
}
