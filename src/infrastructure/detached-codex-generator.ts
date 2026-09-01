import type { Context, Models, ModelsSimpleStreamOptions } from "@earendil-works/pi-ai";
import { validateTNotePacket, type TNoteModelProvenance } from "../domain/t-notes";
import type { DetachedGenerationPolicy, DetachedTextGenerationRequest, DetachedTextGenerator } from "../application/detached-text-generator";

export const DETACHED_CODEX_PROVIDER = "openai-codex";

/** The only pi-ai capabilities the detached T-note boundary may receive. */
export type PiDetachedCodexModels = Pick<Models, "getModel" | "streamSimple">;

/**
 * A single, packet-only Codex completion for T-notes.
 *
 * This deliberately uses pi-ai rather than the Codex App Server: its Context
 * has no cwd, project root, native thread, or tool execution surface. The
 * provider API request is required transport for the completion; `networkCalls`
 * below counts model-initiated network/tool actions, never that API transport.
 */
export class PiDetachedCodexGenerator implements DetachedTextGenerator {
	public constructor(
		private readonly models: PiDetachedCodexModels,
		private readonly modelId: string,
		private readonly version: string = modelId,
	) {
		if (!nonEmptyText(modelId) || !nonEmptyText(version)) throw new Error("Detached Codex model and version are required");
	}

	public async generate(request: DetachedTextGenerationRequest, signal?: AbortSignal): Promise<{
		readonly text: string;
		readonly provenance: TNoteModelProvenance;
		readonly isolation: {
			readonly appliedPolicy: DetachedGenerationPolicy;
			readonly projectRootVisible: false;
			readonly toolCalls: 0;
			readonly networkCalls: 0;
			readonly filesystemWrites: 0;
		};
	}> {
		assertPacketOnlyRequest(request);
		const model = this.models.getModel(DETACHED_CODEX_PROVIDER, this.modelId);
		if (!model) throw new Error(`Detached Codex model is not available: ${DETACHED_CODEX_PROVIDER}/${this.modelId}`);

		const context: Context = {
			systemPrompt: "You create a concise summary of the user-bori conversation from only the supplied immutable T-note packet. Include execution details only when they directly support a user request. Cover goals, decisions, results, verification, remaining work, and risks. Ignore unrelated session startup, environment initialization, MCP, authentication, and account-status activity. Do not infer omitted project data, list raw events chronologically, or call tools. Return text only.",
			messages: [{ role: "user", content: detachedInput(request), timestamp: Date.now() }],
			tools: [],
		};
		const options: ModelsSimpleStreamOptions = Object.freeze({ toolChoice: "none", signal });
		const response = await this.models.streamSimple(model, context, options).result();
		if (response.stopReason === "toolUse" || response.content.some(block => block.type === "toolCall")) {
			throw new Error("Detached Codex generator rejected a tool call");
		}
		if (response.stopReason === "error" || response.stopReason === "aborted") {
			throw new Error(response.errorMessage ?? "Detached Codex generation failed");
		}

		return Object.freeze({
			text: response.content.filter(block => block.type === "text").map(block => block.text).join(""),
			provenance: Object.freeze({ provider: DETACHED_CODEX_PROVIDER, model: this.modelId, version: this.version }),
			isolation: Object.freeze({
				appliedPolicy: freezePolicy(request.policy),
				projectRootVisible: false,
				toolCalls: 0,
				networkCalls: 0,
				filesystemWrites: 0,
			}),
		});
	}
}

function assertPacketOnlyRequest(request: DetachedTextGenerationRequest): void {
	if (!request || typeof request !== "object" || !nonEmptyText(request.instruction) || utf8Bytes(request.instruction) > 4 * 1024) throw new Error("Detached Codex request is invalid");
	const policy = request.policy;
	if (!policy || policy.cwd !== "" || policy.noTools !== true || policy.network !== false || policy.readOnly !== true || policy.ephemeral !== true) {
		throw new Error("Detached Codex request is not packet-only");
	}
	// Validation also bounds and copies the packet; the caller's immutable input is never mutated.
	validateTNotePacket(request.packet);
}

function detachedInput(request: DetachedTextGenerationRequest): string {
	const packet = validateTNotePacket(request.packet);
	const input = stableJson({ instruction: request.instruction, packet, schemaVersion: 1 });
	if (utf8Bytes(input) > 270 * 1024) throw new Error("Detached Codex packet input is too large");
	return input;
}

function freezePolicy(policy: DetachedGenerationPolicy): DetachedGenerationPolicy {
	return Object.freeze({ cwd: policy.cwd, noTools: policy.noTools, network: policy.network, readOnly: policy.readOnly, ephemeral: policy.ephemeral });
}

function nonEmptyText(value: string): boolean {
	return typeof value === "string" && value.trim().length > 0;
}

function stableJson(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
	const record = value as Record<string, unknown>;
	return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}

function utf8Bytes(value: string): number {
	return new TextEncoder().encode(value).byteLength;
}
