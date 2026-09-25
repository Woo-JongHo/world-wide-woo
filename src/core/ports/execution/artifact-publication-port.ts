import type { ArtifactCandidate } from "@/core/domain/development/artifact-control";

/** Updates a known, host-pinned artifact. Creating unknown remote identities is a different contract. */
export interface ArtifactPublicationPort {
	readonly capabilityId: string;
	identity  (candidate: ArtifactCandidate                                   ): { target: string; artifact: string };
	readBefore(candidate: ArtifactCandidate, signal: AbortSignal              ): Promise<unknown>;
	write     (candidate: ArtifactCandidate, body: string, signal: AbortSignal): Promise<void>;
	readBack(candidate: ArtifactCandidate, body: string, signal: AbortSignal): Promise<{
		matches: boolean;
		evidence: Readonly<Record<string, unknown>>;
	}>;
}
