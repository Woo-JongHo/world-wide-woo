import { renderArtifactCandidate, validateArtifactCandidate, type ArtifactCandidate } from "../../domain/development/artifact-control";
import type { ArtifactPublicationPort } from "../../ports/execution/artifact-publication-port";
import type { RequestActionCapability, RequestActionIntent } from "../../ports/execution/request-action-port";

export interface ArtifactPublicationPermit {
	readonly requestId: string;
	readonly operationId: string;
	readonly expectedRevision: number;
	readonly candidateDigest: string;
}

/** Stage policy stays in RequestController; existing Artifact Control owns publication content. */
export function artifactPublicationCapability(
	port: ArtifactPublicationPort,
	candidates: readonly ArtifactCandidate[],
	permits: readonly ArtifactPublicationPermit[],
): RequestActionCapability {
	const pinned = structuredClone(candidates), approvals = structuredClone(permits);
	if (new Set(pinned.map(c => c.candidateId)).size !== pinned.length) throw new Error("DUPLICATE_ARTIFACT_CANDIDATE");
	for (const candidate of pinned) {
		if (validateArtifactCandidate(candidate).length) throw new Error("INVALID_ARTIFACT_CANDIDATE");
		port.identity(candidate);
	}
	const candidateFor = (intent: RequestActionIntent) => {
		if (Object.keys(intent.arguments).length !== 1 || typeof intent.arguments.candidateId !== "string") return undefined;
		return pinned.find(c => c.candidateId === intent.arguments.candidateId);
	};
	const allowed = (intent: RequestActionIntent, candidate: ArtifactCandidate) => approvals.some(p => p.requestId === intent.requestId && p.operationId === intent.operationId && p.expectedRevision === intent.expectedRevision && p.candidateDigest === candidate.candidateDigest);
	const readBack = async (candidate: ArtifactCandidate, signal: AbortSignal) => {
		const result = await port.readBack(structuredClone(candidate), renderArtifactCandidate(candidate), signal);
		if (signal.aborted) throw new Error("PUBLICATION_INTERRUPTED");
		return { confirmed: result.matches, summary: result.matches ? "Artifact read-back confirmed" : "Artifact read-back unresolved", source: { ...result.evidence, candidateId: candidate.candidateId, candidateDigest: candidate.candidateDigest }, delivery: port.identity(candidate) };
	};
	return {
		id: port.capabilityId, effect: "publish",
		description: "Publish one host-pinned Artifact Candidate after one-action approval, stale-before check and read-back. Does not grant arbitrary remote mutations.",
		inputSchema: { type: "object", properties: { candidateId: { type: "string", enum: pinned.map(c => c.candidateId) } }, required: ["candidateId"], additionalProperties: false },
		authorize: async intent => { const candidate = candidateFor(intent); return !!candidate && allowed(intent, candidate); },
		approvalPreview: async intent => { const candidate = candidateFor(intent); return candidate ? { summary: `Publish ${port.identity(candidate).artifact}`, detail: `Candidate ${candidate.candidateId}\nDigest ${candidate.candidateDigest}\n${renderArtifactCandidate(candidate)}` } : null; },
		reconciliation: {
			prepare: intent => { const candidate = candidateFor(intent); if (!candidate) throw new Error("CANDIDATE_UNAVAILABLE"); return { candidateId: candidate.candidateId, candidateDigest: candidate.candidateDigest }; },
			readBack: async (descriptor, signal) => {
				const candidate = pinned.find(c => c.candidateId === descriptor.candidateId && c.candidateDigest === descriptor.candidateDigest);
				if (!candidate) throw new Error("CANDIDATE_UNAVAILABLE");
				return readBack(candidate, signal);
			},
		},
		execute: async (intent, signal, grant) => {
			const candidate = candidateFor(intent);
			if (!candidate || !(allowed(intent, candidate) || grant && JSON.stringify(grant.intent) === JSON.stringify(intent)) || signal.aborted) throw new Error("PUBLICATION_NOT_AUTHORIZED");
			const before = await port.readBefore(structuredClone(candidate), signal);
			if (before === undefined || validateArtifactCandidate(candidate, before).length || signal.aborted) return { outcome: "failed", summary: "ARTIFACT_BEFORE_STALE", source: { candidateId: candidate.candidateId, candidateDigest: candidate.candidateDigest, mutationDispatched: false } };
			await port.write(structuredClone(candidate), renderArtifactCandidate(candidate), signal);
			const result = await readBack(candidate, signal);
			if (!result.confirmed) throw new Error("PUBLICATION_UNCERTAIN");
			return { outcome: "passed", summary: result.summary, source: result.source, delivery: result.delivery };
		},
	};
}
