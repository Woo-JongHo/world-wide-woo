import { redactForExternalReview, type ReviewRedactionFinding } from "./redaction";

export const REVIEW_PACKET_VERSION = 1;

export type ReviewProvider = "anthropic" | "google";
export type ReviewSensitivity = "public" | "secret" | "credential" | "customer" | "unknown";

/** Every candidate field must be classified before it can cross providers. */
export interface ClassifiedReviewText {
	readonly value: string;
	readonly sensitivity: ReviewSensitivity;
}

export interface ReviewPacketInput {
	readonly purpose: ClassifiedReviewText;
	readonly request: ClassifiedReviewText;
	readonly context?: ClassifiedReviewText;
	readonly createdAt?: string;
}

export interface ReviewPacket {
	readonly schemaVersion: typeof REVIEW_PACKET_VERSION;
	readonly createdAt: string;
	readonly purpose: string;
	readonly request: string;
	readonly context: string;
	readonly digest: string;
}

export interface ReviewPacketPreview {
	readonly packet: ReviewPacket;
	readonly findings: readonly ReviewRedactionFinding[];
}

/** Deliberately injected: the domain never owns cryptographic infrastructure. */
export type ReviewDigester = (value: string) => string;

export interface ReviewGenerationRequest {
	readonly provider: ReviewProvider;
	readonly model: string;
	readonly version: string;
	readonly cwd: "";
	readonly tools: readonly [];
	readonly readOnly: true;
	readonly networkAccess: "provider-api-only";
	readonly input: string;
	readonly packetDigest: string;
}

export interface ReviewGenerationClient {
	generate(request: ReviewGenerationRequest): Promise<string>;
}

export interface ReviewAdapter {
	readonly provider: ReviewProvider;
	readonly model: string;
	readonly version: string;
	review(packet: ReviewPacket): Promise<ReviewDelivery>;
}

export interface ReviewDelivery {
	readonly provider: ReviewProvider;
	readonly model: string;
	readonly version: string;
	readonly transport?: "provider-api" | "claude-cli";
	readonly packetDigest: string;
	readonly sentAt: string;
	readonly receivedAt: string;
	readonly result: string;
	readonly resultDigest: string;
	readonly usage?: ReviewUsage;
}

/** Usage is recorded only when the selected transport actually reports it. */
export interface ReviewUsage {
	readonly inputTokens?: number;
	readonly outputTokens?: number;
	readonly cacheCreationInputTokens?: number;
	readonly cacheReadInputTokens?: number;
}

export interface ReviewProvenance {
	readonly provider: ReviewProvider;
	readonly model: string;
	readonly version: string;
	readonly transport?: "provider-api" | "claude-cli";
	readonly packetDigest: string;
	readonly resultDigest: string;
	readonly sentAt: string;
	readonly receivedAt: string;
	readonly usage?: ReviewUsage;
}

export function createReviewPacket(input: ReviewPacketInput, digest: ReviewDigester): ReviewPacketPreview {
	const purpose = publicProjection(input.purpose, "purpose");
	const request = publicProjection(input.request, "request");
	const context = publicProjection(input.context ?? { value: "", sensitivity: "public" }, "context", true);
	const createdAt = input.createdAt ?? new Date().toISOString();
	if (Number.isNaN(Date.parse(createdAt))) throw new Error("Review packet createdAt must be an ISO timestamp");
	const body: Omit<ReviewPacket, "digest"> = {
		schemaVersion: REVIEW_PACKET_VERSION,
		createdAt,
		purpose: purpose.text,
		request: request.text,
		context: context.text,
	};
	const packet: ReviewPacket = deepFreeze({ ...body, digest: digest(stableJson(body)) });
	if (!isDigest(packet.digest)) throw new Error("Review packet digest is invalid");
	const findings = deepFreeze([...purpose.findings, ...request.findings, ...context.findings]);
	return Object.freeze({ packet, findings });
}

export function verifyReviewPacket(packet: ReviewPacket, digest: ReviewDigester): void {
	if (!packet || packet.schemaVersion !== REVIEW_PACKET_VERSION) throw new Error("Unsupported review packet");
	if (typeof packet.createdAt !== "string" || Number.isNaN(Date.parse(packet.createdAt))) throw new Error("Invalid review packet timestamp");
	for (const [name, value] of Object.entries({ purpose: packet.purpose, request: packet.request, context: packet.context })) {
		if (typeof value !== "string") throw new Error(`Invalid review packet ${name}`);
		const redacted = redactForExternalReview(value);
		if (redacted.findings.length > 0) throw new Error("Review packet contains unredacted sensitive data");
	}
	const body = {
		schemaVersion: packet.schemaVersion,
		createdAt: packet.createdAt,
		purpose: packet.purpose,
		request: packet.request,
		context: packet.context,
	};
	if (packet.digest !== digest(stableJson(body))) throw new Error("Review packet digest does not match its contents");
}

export function reviewPacketInput(packet: ReviewPacket, digest: ReviewDigester): string {
	verifyReviewPacket(packet, digest);
	return JSON.stringify({
		packetVersion: packet.schemaVersion,
		packetDigest: packet.digest,
		purpose: packet.purpose,
		request: packet.request,
		context: packet.context,
	});
}

export function stableJson(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
	const record = value as Record<string, unknown>;
	return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}

function publicProjection(value: ClassifiedReviewText, name: string, allowEmpty = false) {
	if (!value || typeof value.value !== "string" || (!allowEmpty && value.value.trim().length === 0)) throw new Error(`Review packet ${name} is required`);
	if (value.sensitivity !== "public") throw new Error(`Review packet ${name} is denied by sensitivity classification`);
	return redactForExternalReview(value.value);
}

function isDigest(value: string): boolean {
	return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function deepFreeze<T>(value: T): T {
	if (value && typeof value === "object") {
		for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
		Object.freeze(value);
	}
	return value;
}
