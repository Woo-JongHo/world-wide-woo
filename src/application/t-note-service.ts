import { createHash, randomUUID } from "node:crypto";
import {
	createTNotePacket,
	sanitizeTNoteText,
	type TNoteActivitySource,
	type TNoteDraft,
	type TNoteDraftInput,
	type TNoteSourceRange,
} from "../domain/t-notes.js";
import { assertDetachedPolicy, type DetachedGenerationPolicy, type DetachedTextGenerator } from "./detached-text-generator.js";

export interface TNoteDraftStore {
	append(input: TNoteDraftInput): Promise<TNoteDraft>;
	readAll(projectId: string): Promise<readonly TNoteDraft[]>;
}

export interface CreateTNoteInput {
	readonly projectId: string;
	readonly range: TNoteSourceRange;
	readonly activities: readonly TNoteActivitySource[];
	readonly instruction: string;
	/** Generated 질문 must exactly match this normalized completed question. */
	readonly expectedQuestion: string;
}

/** Coordinates a redacted activity packet with an isolated text generator and append-only draft store. */
export class TNoteService {
	public constructor(
		private readonly generator: DetachedTextGenerator,
		private readonly store: TNoteDraftStore,
		private readonly clock: () => Date = () => new Date(),
		private readonly idFactory: () => string = randomUUID,
	) {}

	public async create(input: CreateTNoteInput, signal?: AbortSignal): Promise<TNoteDraft> {
		if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid T-note request");
		const instruction = sanitizeTNoteText(input.instruction, 4 * 1024);
		if (instruction.length === 0) throw new Error("Invalid T-note instruction");
		const packet = createTNotePacket(input.projectId, input.range, input.activities, this.clock().toISOString(), digest);
		const policy: DetachedGenerationPolicy = Object.freeze({ cwd: "", noTools: true, network: false, readOnly: true, ephemeral: true });
		const result = await this.generator.generate(Object.freeze({ packet, instruction, policy }), signal);
		assertDetachedPolicy(policy, result?.isolation);
		const text = result.text;
		if (typeof text !== "string" || text.length === 0 || new TextEncoder().encode(text).byteLength > 64 * 1024) {
			throw new Error("Detached generator returned unsafe T-note text");
		}
		const validation = validateCanonicalTNote(text, input.expectedQuestion);
		if (!validation.valid) throw new Error(validation.reason);
		return this.store.append(Object.freeze({
			id: this.idFactory(),
			createdAt: this.clock().toISOString(),
			packet,
			text,
			provenance: result.provenance,
		}));
	}

	public readAll(projectId: string): Promise<readonly TNoteDraft[]> {
		return this.store.readAll(projectId);
	}
}

function digest(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }

export interface CanonicalTNoteValidation {
	readonly valid: boolean;
	readonly reason: string;
}

/** Parses the three persisted fields once and rejects content unsafe for a concise human T-note. */
export function validateCanonicalTNote(text: string, expectedQuestion: string): CanonicalTNoteValidation {
	const match = /^질문:[ \t]*(\S(?:[^\r\n]*\S)?)\n왜:[ \t]*(\S(?:[^\r\n]*\S)?)\n결과:[ \t]*(\S(?:[^\r\n]*\S)?)$/u.exec(text);
	if (!match) return { valid: false, reason: "Detached generator returned malformed T-note text" };
	if (match[1] !== expectedQuestion) return { valid: false, reason: "Detached generator returned mismatched T-note question" };
	const [, , why, result] = match;
	if (hasRawEvidence(why) || hasRawEvidence(result)) {
		return { valid: false, reason: "Detached generator returned prohibited raw evidence" };
	}
	if (/(?:숨은 사고|chain[ -]?of[ -]?thought)/iu.test(why) || /(?:숨은 사고|chain[ -]?of[ -]?thought)/iu.test(result)) {
		return { valid: false, reason: "Detached generator returned hidden reasoning" };
	}
	if (/(?:다음 할 일|(?:내일|추후|후속|다음에|이후|곧|계속).{0,24}(?:하겠습니다|합니다|할 예정|할 계획|진행하겠습니다|진행합니다|처리하겠습니다|처리합니다|검토하겠습니다|검토합니다|수정하겠습니다|수정합니다|배포하겠습니다|배포합니다)|(?:하겠습니다|합니다|할 예정|할 계획|진행하겠습니다|진행합니다|처리하겠습니다|처리합니다|검토하겠습니다|검토합니다|수정하겠습니다|수정합니다|배포하겠습니다|배포합니다).{0,24}(?:내일|추후|후속|다음에|이후|곧|계속))/u.test(result)) {
		return { valid: false, reason: "Detached generator returned future action" };
	}
	return { valid: true, reason: "" };
}

function hasRawEvidence(field: string): boolean {
	return /(?:```|(?:^|\s)(?:(?:[\w.-]+\/)*[\w.-]+\.[\w-]+)\s*(?:와|및|,)\s*(?:(?:[\w.-]+\/)*[\w.-]+\.[\w-]+)|(?:^|\s)(?:FAIL|expected|received|stdout|stderr|AssertionError|assertion|stack(?: trace)?|traceback|test result)\b)/iu.test(field);
}
