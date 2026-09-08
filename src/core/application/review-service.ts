import {
	createReviewPacket,
	type ReviewAdapter,
	type ReviewDelivery,
	type ReviewDigester,
	type ReviewPacketInput,
	type ReviewPacketPreview,
	type ReviewProvenance,
} from "../domain/review";

export interface ApprovedReview {
	readonly packet: ReviewPacketPreview["packet"];
	readonly acceptedDigest: string;
	readonly provider: ReviewAdapter["provider"];
}

/** Narrow persistence port; composition owns the local destination. */
export interface ReviewProvenanceStore {
	append(record: ReviewProvenance): Promise<void>;
}

/**
 * Keeps external reviews deliberately separate from the interactive chat
 * router. It only accepts an immutable preview and the digest the user saw.
 */
export class ReviewService {
	private readonly records: ReviewProvenance[] = [];

	constructor(
		private readonly adapters: ReadonlyMap<ReviewAdapter["provider"], ReviewAdapter>,
		private readonly digest: ReviewDigester,
		private readonly store?: ReviewProvenanceStore,
	) {}

	preview(input: ReviewPacketInput): ReviewPacketPreview {
		return createReviewPacket(input, this.digest);
	}

	async send(approval: ApprovedReview): Promise<ReviewDelivery> {
		if (approval.acceptedDigest !== approval.packet.digest) {
			throw new Error("Review transmission requires approval of the exact preview digest");
		}
		const adapter = this.adapters.get(approval.provider);
		if (!adapter) throw new Error(`No review adapter configured for ${approval.provider}`);
		const delivery = await adapter.review(approval.packet);
		if (delivery.packetDigest !== approval.packet.digest || delivery.provider !== adapter.provider || delivery.model !== adapter.model || delivery.version !== adapter.version) {
			throw new Error("Review adapter returned invalid provenance");
		}
		const record = Object.freeze({
			provider: delivery.provider,
			model: delivery.model,
			version: delivery.version,
			...(delivery.transport ? { transport: delivery.transport } : {}),
			packetDigest: delivery.packetDigest,
			resultDigest: delivery.resultDigest,
			sentAt: delivery.sentAt,
			receivedAt: delivery.receivedAt,
			...(delivery.usage ? { usage: delivery.usage } : {}),
		});
		await this.store?.append(record);
		this.records.push(record);
		return delivery;
	}

	provenance(): readonly ReviewProvenance[] {
		return Object.freeze(this.records.map(record => Object.freeze({ ...record })));
	}
}
