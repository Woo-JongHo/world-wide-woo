import { isReasoningActivityPayload, type ProjectActivity } from "./project-activity.js";
import { redactForExternalReview } from "./redaction.js";

const MAX_ACTIVITIES = 100;
const MAX_ACTIVITY_BODY = 32 * 1024;
const MAX_PACKET_BYTES = 256 * 1024;
const MAX_NOTE_BYTES = 64 * 1024;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/u;
const NATIVE_IDENTIFIER_KEYS = new Set([
	"id",
	"threadid",
	"turnid",
	"itemid",
	"approvalrequestid",
	"approvalcallbackid",
	"approvalid",
	"requestid",
	"callbackid",
	"sessionid",
	"nativerefs",
]);
const MAX_NATIVE_PAYLOAD_DEPTH = 8;
const MAX_NATIVE_PAYLOAD_NODES = 128;
const MAX_NATIVE_PAYLOAD_ENTRIES = 64;

/** Structural input so T-notes can consume the activity journal without owning it. */
export interface TNoteActivitySource {
	readonly id: string;
	readonly projectId: string;
	readonly sequence: number;
	readonly occurredAt: string;
	readonly kind: string;
	readonly title: string;
	readonly body: string;
	/** Accepted only at the source boundary; native identifiers are never retained in a packet. */
	readonly nativeRefs?: readonly string[];
	/** Stable completed-turn position, retained only as packet metadata. */
	readonly completion?: TNoteCompletionMetadata;
}

export interface TNoteSourceRange {
	readonly startSequence: number;
	readonly endSequence: number;
}

export interface TNoteSourceActivity {
	readonly id: string;
	readonly sequence: number;
	readonly occurredAt: string;
	readonly kind: string;
	readonly title: string;
	readonly body: string;
}

/** Immutable, redacted source material for a detached note request. */
export interface TNotePacket {
	readonly schemaVersion: 1;
	readonly projectId: string;
	readonly range: TNoteSourceRange;
	readonly createdAt: string;
	readonly activities: readonly TNoteSourceActivity[];
	readonly completion?: TNoteCompletionMetadata;
	readonly digest: string;
}

/** Durable identity and ordinal for one completed Native turn. */
export interface TNoteCompletionMetadata {
	readonly threadId: string;
	readonly turnId: string;
	readonly number: number;
	readonly terminalActivityId: string;
}

export interface TNoteModelProvenance {
	readonly provider: string;
	readonly model: string;
	readonly version: string;
}

export interface TNoteDraftInput {
	readonly id: string;
	readonly createdAt: string;
	readonly packet: TNotePacket;
	readonly text: string;
	readonly provenance: TNoteModelProvenance;
}

/** Append-only persisted T-note. `sequence` is assigned by the draft store. */
export interface TNoteDraft extends TNoteDraftInput {
	readonly schemaVersion: 1;
	readonly sequence: number;
}

/** Public, immutable T-note fields used by the Workbench transcript. */
export interface TNoteCompletionRecord {
	readonly id: string;
	readonly sourceActivityIds: readonly string[];
	readonly completion?: TNoteCompletionMetadata;
}

/** Minimal journal shape needed to assign completed-question indices. */
export interface TNoteCompletionActivity {
	readonly id: string;
	readonly sequence: number;
	readonly nativeRefs: {
		readonly threadId?: string;
		readonly turnId?: string;
	};
	readonly payload: {
		readonly method?: string;
	};
}

/**
 * A Native turn owns its number, rather than a vault note's append sequence.
 * Thus replay, note truncation, and presentation ordering cannot renumber a
 * completed question.
 */
export interface TNoteCompletionIndex {
	readonly threadId: string;
	readonly turnId: string;
	readonly number: number;
	readonly terminalActivityId: string;
	readonly noteId: string | null;
	readonly sourceActivityIds: readonly string[];
}

export function projectTNoteCompletionIndex(
	activities: readonly TNoteCompletionActivity[],
	notes: readonly TNoteCompletionRecord[],
): readonly TNoteCompletionIndex[] {
	const notesByTerminalActivity = new Map<string, TNoteCompletionRecord>();
	for (const note of notes) {
		for (const activityId of note.sourceActivityIds) notesByTerminalActivity.set(activityId, note);
	}
	const completed = activities
		.filter((activity) => activity.payload.method === "turn/completed"
			&& typeof activity.nativeRefs.threadId === "string"
			&& typeof activity.nativeRefs.turnId === "string")
		.sort((left, right) => left.sequence - right.sequence);
	const numbers = new Map<string, number>();
	return Object.freeze(completed.map((activity) => {
		const threadId = activity.nativeRefs.threadId!;
		const turnId = activity.nativeRefs.turnId!;
		const note = notesByTerminalActivity.get(activity.id);
		const metadata = completionFor(note);
		const projectedNumber = (numbers.get(threadId) ?? 0) + 1;
		const number = metadata?.threadId === threadId && metadata.turnId === turnId
			&& metadata.terminalActivityId === activity.id
			? metadata.number
			: projectedNumber;
		numbers.set(threadId, Math.max(numbers.get(threadId) ?? 0, number));
		return Object.freeze({
			threadId,
			turnId,
			number,
			terminalActivityId: activity.id,
			noteId: note?.id ?? null,
			sourceActivityIds: Object.freeze([...(note?.sourceActivityIds ?? [])]),
		});
	}));
}

export type TNotePacketDigest = (canonicalPacket: string) => string;

/**
 * Default adapter for the replayable ProjectActivity journal. Consumers with a
 * richer presentation can supply their own structural source instead, but this
 * keeps the T-note boundary independent from the active-chat event shape.
 */
export function projectActivityToTNoteSource(activity: ProjectActivity): TNoteActivitySource {
	return {
		id: activity.id,
		projectId: activity.projectId,
		sequence: activity.sequence,
		occurredAt: activity.recordedAt,
		kind: `${activity.kind}.${activity.phase}`,
		title: `${activity.kind} ${activity.phase}`,
		body: isReasoningActivityPayload(activity.payload)
			? canonicalJson({ classification: "reasoning", content: "[redacted]" })
			: canonicalJson(redactNativePayload(activity.payload)),
	};
}

export function createTNotePacket(
	projectId: string,
	range: TNoteSourceRange,
	activities: readonly TNoteActivitySource[],
	createdAt: string,
	calculateDigest: TNotePacketDigest,
): TNotePacket {
	assertId(projectId, "project id");
	assertRange(range);
	assertDate(createdAt, "packet timestamp");
	if (!Array.isArray(activities) || activities.length < 1 || activities.length > MAX_ACTIVITIES) {
		throw new Error(`T-note source range must contain between 1 and ${MAX_ACTIVITIES} activities`);
	}

	const projected = activities.map((activity) => projectActivity(activity, projectId, range));
	assertStrictlyIncreasingSequences(projected, range);
	const completion = completionFor(activities.at(-1));
	const material = {
		schemaVersion: 1 as const,
		projectId,
		range: { ...range },
		createdAt,
		activities: projected,
		...(completion ? { completion } : {}),
	};
	const canonicalMaterial = canonicalJson(material);
	if (utf8ByteLength(canonicalMaterial) > MAX_PACKET_BYTES) {
		throw new Error("T-note source packet is too large");
	}
	const digest = calculateDigest(canonicalMaterial);
	if (typeof digest !== "string" || !DIGEST_PATTERN.test(digest)) throw new Error("Invalid T-note packet digest");
	return freezePacket({ ...material, digest });
}

export function validateTNoteDraft(value: TNoteDraft, calculateDigest?: TNotePacketDigest): TNoteDraft {
	if (!value || typeof value !== "object" || Array.isArray(value) || value.schemaVersion !== 1) throw new Error("Invalid T-note draft");
	assertId(value.id, "T-note id");
	if (!Number.isSafeInteger(value.sequence) || value.sequence < 1) throw new Error("Invalid T-note sequence");
	assertDate(value.createdAt, "T-note timestamp");
	const packet = validateTNotePacket(value.packet, calculateDigest);
	const text = sanitizeTNoteText(value.text, MAX_NOTE_BYTES);
	if (text.length === 0 || text !== value.text) throw new Error("Invalid T-note text");
	const provenance = validateProvenance(value.provenance);
	return freezeDraft({
		schemaVersion: 1,
		id: value.id,
		sequence: value.sequence,
		createdAt: value.createdAt,
		packet,
		text,
		provenance,
	});
}

export function validateTNotePacket(value: TNotePacket, calculateDigest?: TNotePacketDigest): TNotePacket {
	if (!value || typeof value !== "object" || Array.isArray(value) || value.schemaVersion !== 1) throw new Error("Invalid T-note packet");
	assertId(value.projectId, "project id");
	assertRange(value.range);
	assertDate(value.createdAt, "packet timestamp");
	if (!Array.isArray(value.activities) || value.activities.length < 1 || value.activities.length > MAX_ACTIVITIES) {
		throw new Error("Invalid T-note packet activities");
	}
	const activities = value.activities.map((activity) => projectPacketActivity(activity, value.projectId, value.range));
	assertStrictlyIncreasingSequences(activities, value.range);
	if (typeof value.digest !== "string" || !DIGEST_PATTERN.test(value.digest)) throw new Error("Invalid T-note packet digest");
	const completion = completionFor(value);
	const material = {
		schemaVersion: 1 as const,
		projectId: value.projectId,
		range: { ...value.range },
		createdAt: value.createdAt,
		activities,
		...(completion ? { completion } : {}),
	};
	const canonicalMaterial = canonicalJson(material);
	if (calculateDigest && calculateDigest(canonicalMaterial) !== value.digest) throw new Error("T-note packet digest mismatch");
	if (utf8ByteLength(canonicalMaterial) > MAX_PACKET_BYTES) throw new Error("T-note source packet is too large");
	return freezePacket({ ...material, digest: value.digest });
}

export function createTNoteDraft(input: TNoteDraftInput, sequence: number, calculateDigest?: TNotePacketDigest): TNoteDraft {
	if (!Number.isSafeInteger(sequence) || sequence < 1) throw new Error("Invalid T-note sequence");
	return validateTNoteDraft({ ...input, schemaVersion: 1, sequence }, calculateDigest);
}

/** Removes terminal controls and credentials before material reaches a persisted packet. */
export function sanitizeTNoteText(value: string, maximumBytes: number): string {
	if (typeof value !== "string" || !Number.isSafeInteger(maximumBytes) || maximumBytes < 1) throw new Error("Invalid T-note text");
	// Redact customer labels first: a path expression may legally contain spaces,
	// and otherwise could consume the label while leaving its value behind.
	const protectedMarkers = protectRedactionMarkers(redactCustomerIdentifiers(value));
	const localPathsRedacted = redactLocalPaths(protectedMarkers.text);
	return truncateUtf8(restoreRedactionMarkers(redactForExternalReview(localPathsRedacted).text, protectedMarkers.markers), maximumBytes);
}

function projectActivity(activity: TNoteActivitySource, projectId: string, range: TNoteSourceRange): TNoteSourceActivity {
	if (!activity || typeof activity !== "object" || Array.isArray(activity)) throw new Error("Invalid T-note source activity");
	if (activity.projectId !== projectId) throw new Error("T-note activities must belong to one project");
	return projectPacketActivity({
		id: activity.id,
		sequence: activity.sequence,
		occurredAt: activity.occurredAt,
		kind: activity.kind,
		title: activity.title,
		body: activity.body,
	}, projectId, range);
}

function projectPacketActivity(activity: TNoteSourceActivity, _projectId: string, range: TNoteSourceRange): TNoteSourceActivity {
	if (!activity || typeof activity !== "object" || Array.isArray(activity)) throw new Error("Invalid T-note source activity");
	assertId(activity.id, "activity id");
	if (!Number.isSafeInteger(activity.sequence) || activity.sequence < range.startSequence || activity.sequence > range.endSequence) {
		throw new Error("T-note activity is outside the selected range");
	}
	assertDate(activity.occurredAt, "activity timestamp");
	const kind = sanitizeTNoteText(activity.kind, 120);
	const title = sanitizeTNoteText(activity.title, 2 * 1024);
	const body = sanitizeTNoteText(activity.body, MAX_ACTIVITY_BODY);
	if (kind.length === 0 || title.length === 0 || body !== activity.body && body.length === 0) throw new Error("Invalid T-note activity text");
	return Object.freeze({ id: activity.id, sequence: activity.sequence, occurredAt: activity.occurredAt, kind, title, body });
}

function assertStrictlyIncreasingSequences(activities: readonly TNoteSourceActivity[], range: TNoteSourceRange): void {
	if (activities.some((activity, index) => index > 0 && activity.sequence <= activities[index - 1]!.sequence)) {
		throw new Error("T-note activities must be sorted with strictly increasing unique sequences");
	}
	if (activities[0]?.sequence !== range.startSequence || activities.at(-1)?.sequence !== range.endSequence) {
		throw new Error("T-note range bounds do not match selected activities");
	}
}

function validateProvenance(value: TNoteModelProvenance): TNoteModelProvenance {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid T-note model provenance");
	const provider = sanitizeTNoteText(value.provider, 120);
	const model = sanitizeTNoteText(value.model, 240);
	const version = sanitizeTNoteText(value.version, 240);
	if (!provider || !model || !version || provider !== value.provider || model !== value.model || version !== value.version) throw new Error("Invalid T-note model provenance");
	return Object.freeze({ provider, model, version });
}

function assertRange(range: TNoteSourceRange): void {
	if (!range || typeof range !== "object" || !Number.isSafeInteger(range.startSequence) || !Number.isSafeInteger(range.endSequence)
		|| range.startSequence < 1 || range.endSequence < range.startSequence) {
		throw new Error("Invalid T-note source range");
	}
}

function assertId(value: string, label: string): void {
	if (typeof value !== "string" || !ID_PATTERN.test(value)) throw new Error(`Invalid ${label}`);
}

function assertDate(value: string, label: string): void {
	if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new Error(`Invalid ${label}`);
}

function completionFor(value: unknown): TNoteCompletionMetadata | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
	const completion = (value as { completion?: unknown }).completion;
	if (!completion || typeof completion !== "object" || Array.isArray(completion)) return undefined;
	const candidate = completion as Partial<TNoteCompletionMetadata>;
	const number = candidate.number;
	if (typeof candidate.threadId !== "string" || !ID_PATTERN.test(candidate.threadId)
		|| typeof candidate.turnId !== "string" || !ID_PATTERN.test(candidate.turnId)
		|| typeof candidate.terminalActivityId !== "string" || !ID_PATTERN.test(candidate.terminalActivityId)
		|| typeof number !== "number" || !Number.isSafeInteger(number) || number < 1) {
		return undefined;
	}
	return Object.freeze({
		threadId: candidate.threadId,
		turnId: candidate.turnId,
		number,
		terminalActivityId: candidate.terminalActivityId,
	});
}

function canonicalJson(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
	const record = value as Record<string, unknown>;
	return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

/** Keeps a bounded, identifier-free record of native event data for detached summarization. */
function redactNativePayload(value: unknown): unknown {
	const seen = new Set<object>();
	let remainingNodes = MAX_NATIVE_PAYLOAD_NODES;
	const project = (candidate: unknown, depth: number): unknown => {
		if (candidate === null || typeof candidate === "string" || typeof candidate === "number" || typeof candidate === "boolean") return candidate;
		if (typeof candidate !== "object" || depth > MAX_NATIVE_PAYLOAD_DEPTH || remainingNodes-- <= 0) return "[redacted:source-limit]";
		if (seen.has(candidate)) return "[redacted:cycle]";
		seen.add(candidate);
		if (Array.isArray(candidate)) {
			const entries: unknown[] = [];
			for (let index = 0; index < Math.min(candidate.length, MAX_NATIVE_PAYLOAD_ENTRIES); index += 1) entries.push(project(candidate[index], depth + 1));
			if (candidate.length > entries.length) entries.push("[redacted:source-limit]");
			return entries;
		}
		const record = candidate as Readonly<Record<string, unknown>>;
		const projected: Record<string, unknown> = {};
		let entries = 0;
		for (const key in record) {
			if (!Object.prototype.hasOwnProperty.call(record, key)) continue;
			if (entries >= MAX_NATIVE_PAYLOAD_ENTRIES) {
				projected.omitted = "[redacted:source-limit]";
				break;
			}
			entries += 1;
			const normalizedKey = key.replace(/[-_]/gu, "").toLowerCase();
			if (NATIVE_IDENTIFIER_KEYS.has(normalizedKey) || /reasoning|thought|analysis/iu.test(normalizedKey)) continue;
			projected[key] = project(record[key], depth + 1);
		}
		return projected;
	};
	return project(value, 0);
}

function freezePacket(packet: Omit<TNotePacket, "activities"> & { activities: readonly TNoteSourceActivity[] }): TNotePacket {
	return Object.freeze({ ...packet, range: Object.freeze({ ...packet.range }), activities: Object.freeze(packet.activities.map(activity => Object.freeze({ ...activity }))) });
}

function freezeDraft(draft: TNoteDraft): TNoteDraft {
	return Object.freeze({ ...draft, packet: validateTNotePacket(draft.packet), provenance: Object.freeze({ ...draft.provenance }) });
}

function utf8ByteLength(value: string): number { return new TextEncoder().encode(value).byteLength; }

function truncateUtf8(value: string, maximumBytes: number): string {
	if (utf8ByteLength(value) <= maximumBytes) return value;
	let result = "";
	for (const character of value) {
		if (utf8ByteLength(result + character) > maximumBytes) break;
		result += character;
	}
	return result;
}

function redactCustomerIdentifiers(value: string): string {
	return value.replace(/(?:\b(?:customer|client|tenant|account|organization|company)[ _-]?(?:id|name|number)?\s*[:=#]\s*(?:"[^"]+"|'[^']+'|[^\s,;]+)|(?:고객(?:사)?|클라이언트|테넌트|거래처)\s*(?:ID|아이디|명|이름|번호)?\s*[:=#]\s*(?:"[^"]+"|'[^']+'|[^\s,;]+))/giu, "[redacted:customer-identifier]");
}

function redactLocalPaths(value: string): string {
	return value.replace(/(?:file:\/\/\/|~\/|\.\.?\/|\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._@ -]+)+|[A-Za-z]:\\(?:[^\\\r\n]+\\)*[^\\\r\n]*)/gu, "[redacted:local-path]");
}

function protectRedactionMarkers(value: string): { text: string; markers: readonly string[] } {
	const markers: string[] = [];
	const text = value.replace(/\[redacted:[a-z-]+\]/giu, (marker) => {
		const index = markers.push(marker) - 1;
		return `\uE000${index}\uE001`;
	});
	return { text, markers };
}

function restoreRedactionMarkers(value: string, markers: readonly string[]): string {
	return value.replace(/\uE000(\d+)\uE001/gu, (_whole, index: string) => markers[Number.parseInt(index, 10)] ?? "[redacted]");
}
