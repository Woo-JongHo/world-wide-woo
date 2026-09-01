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
		if (instruction.length === 0 || instruction !== input.instruction) throw new Error("Invalid T-note instruction");
		const packet = createTNotePacket(input.projectId, input.range, input.activities, this.clock().toISOString(), digest);
		const policy: DetachedGenerationPolicy = Object.freeze({ cwd: "", noTools: true, network: false, readOnly: true, ephemeral: true });
		const result = await this.generator.generate(Object.freeze({ packet, instruction, policy }), signal);
		assertDetachedPolicy(policy, result?.isolation);
		const text = sanitizeTNoteText(result.text, 64 * 1024);
		if (text.length === 0 || text !== result.text) throw new Error("Detached generator returned unsafe T-note text");
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
