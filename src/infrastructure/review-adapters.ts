import { createHash } from "node:crypto";
import type { Context, Models, ModelsSimpleStreamOptions } from "@earendil-works/pi-ai";
import {
	reviewPacketInput,
	stableJson,
	verifyReviewPacket,
	type ReviewAdapter,
	type ReviewDelivery,
	type ReviewDigester,
	type ReviewGenerationClient,
	type ReviewPacket,
	type ReviewProvider,
} from "../domain/review";
import { redactForExternalReview } from "../domain/redaction";
import type { SessionModelUsageObservation } from "../application/session-model-usage.js";

export const CLAUDE_OPUS_REVIEW_MODEL = "claude-opus-5";
export const GEMINI_REVIEW_MODEL = "gemini-3.1-pro-preview";

const MODEL_ALIASES: Readonly<Record<ReviewProvider, Readonly<Record<string, string>>>> = Object.freeze({
	anthropic: Object.freeze({ "claude-opus": CLAUDE_OPUS_REVIEW_MODEL, [CLAUDE_OPUS_REVIEW_MODEL]: CLAUDE_OPUS_REVIEW_MODEL }),
	google: Object.freeze({ gemini: GEMINI_REVIEW_MODEL, [GEMINI_REVIEW_MODEL]: GEMINI_REVIEW_MODEL }),
});

export interface ReviewModelSelection {
	readonly model?: string;
	readonly version?: string;
}

export interface ReviewAdapterOptions {
	readonly anthropic?: ReviewModelSelection;
	readonly google?: ReviewModelSelection;
}

/** The only pi-ai surface review dispatch may use: model resolution and one stream. */
export type PiReviewModels = Pick<Models, "getModel" | "streamSimple">;

export function sha256ReviewDigest(value: string): string {
	return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Production generation bridge for detached reviews. It creates a fresh,
 * tool-free single-message context for every packet and never receives a cwd
 * or filesystem capability.
 */
export class PiReviewGenerationClient implements ReviewGenerationClient {
	constructor(
		private readonly models: PiReviewModels,
		private readonly observeUsage?: (observation: SessionModelUsageObservation) => void,
	) {}

	async generate(request: import("../domain/review").ReviewGenerationRequest): Promise<string> {
		assertDetachedRequest(request);
		const model = this.models.getModel(request.provider, request.model);
		if (!model) throw new Error(`Review model is not available: ${request.provider}/${request.model}`);
		const context: Context = {
			systemPrompt: "You are an independent read-only reviewer. Review only the supplied redacted packet. Do not call tools, access files, infer omitted project data, or request credentials.",
			messages: [{ role: "user", content: request.input, timestamp: Date.now() }],
			tools: [],
		};
		const options: ModelsSimpleStreamOptions = { toolChoice: "none" };
		const stream = this.models.streamSimple(model, context, options);
		const response = await stream.result();
		const totalTokens = response.usage?.totalTokens;
		if (this.observeUsage && Number.isSafeInteger(totalTokens) && (totalTokens ?? -1) >= 0) {
			try { this.observeUsage({ model: request.model, effort: null, totalTokens: totalTokens! }); } catch { /* Telemetry cannot invalidate a review response. */ }
		}
		if (response.stopReason === "toolUse" || response.content.some(block => block.type === "toolCall")) {
			throw new Error("Review providers may not return tool calls");
		}
		if (response.stopReason === "error" || response.stopReason === "aborted") {
			throw new Error(response.errorMessage ?? "Review provider failed");
		}
		return response.content.filter(block => block.type === "text").map(block => block.text).join("");
	}
}

/**
 * A narrow adapter: packet text is its sole input, no project path or tools
 * can cross this boundary, and only the provider API client is invoked.
 */
export class ProviderReviewAdapter implements ReviewAdapter {
	constructor(
		readonly provider: ReviewProvider,
		readonly model: string,
		readonly version: string,
		private readonly client: ReviewGenerationClient,
		private readonly digest: ReviewDigester = sha256ReviewDigest,
		private readonly clock: () => Date = () => new Date(),
	) {
		if (resolveModel(provider, model) !== model) throw new Error(`Unsupported ${provider} review model`);
		if (typeof version !== "string" || version.trim().length === 0) throw new Error("Review adapter version is required");
	}

	async review(packet: ReviewPacket): Promise<ReviewDelivery> {
		verifyReviewPacket(packet, this.digest);
		const sentAt = this.clock().toISOString();
		const input = reviewPacketInput(packet, this.digest);
		const result = await this.client.generate(Object.freeze({
			provider: this.provider,
			model: this.model,
			version: this.version,
			cwd: "",
			tools: [] as [],
			readOnly: true,
			networkAccess: "provider-api-only",
			input,
			packetDigest: packet.digest,
		}));
		if (typeof result !== "string") throw new Error("Review provider returned a non-text result");
		const safeResult = redactForExternalReview(result).text;
		const receivedAt = this.clock().toISOString();
		return Object.freeze({
			provider: this.provider,
			model: this.model,
			version: this.version,
			packetDigest: packet.digest,
			sentAt,
			receivedAt,
			result: safeResult,
			resultDigest: this.digest(safeResult),
		});
	}
}

export function createReviewAdapters(client: ReviewGenerationClient, options: ReviewAdapterOptions = {}, digest: ReviewDigester = sha256ReviewDigest): ReadonlyMap<ReviewProvider, ReviewAdapter> {
	const anthropic = createAdapter("anthropic", options.anthropic, client, digest);
	const google = createAdapter("google", options.google, client, digest);
	return new Map<ReviewProvider, ReviewAdapter>([[anthropic.provider, anthropic], [google.provider, google]]);
}

function createAdapter(provider: ReviewProvider, selection: ReviewModelSelection | undefined, client: ReviewGenerationClient, digest: ReviewDigester): ProviderReviewAdapter {
	const fallback = provider === "anthropic" ? CLAUDE_OPUS_REVIEW_MODEL : GEMINI_REVIEW_MODEL;
	const model = resolveModel(provider, selection?.model ?? fallback);
	const version = selection?.version ?? model;
	return new ProviderReviewAdapter(provider, model, version, client, digest);
}

function resolveModel(provider: ReviewProvider, requested: string): string {
	const resolved = MODEL_ALIASES[provider][requested];
	if (!resolved) throw new Error(`Unsupported ${provider} review model: ${requested}`);
	return resolved;
}

function assertDetachedRequest(request: import("../domain/review").ReviewGenerationRequest): void {
	if (request.cwd !== "" || request.readOnly !== true || request.networkAccess !== "provider-api-only" || request.tools.length !== 0) {
		throw new Error("Review generation request is not detached");
	}
}

export function immutableReviewRecord(value: ReviewDelivery): string {
	return stableJson({
		provider: value.provider,
		model: value.model,
		version: value.version,
		packetDigest: value.packetDigest,
		resultDigest: value.resultDigest,
		sentAt: value.sentAt,
		receivedAt: value.receivedAt,
	});
}
