import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import type { ArtifactCandidate } from "../../../core/domain/development/artifact-control";
import type { ArtifactPublicationPort } from "../../../core/ports/execution/artifact-publication-port";
import type { RequestActionIntent } from "../../../core/ports/execution/request-action-port";
import { pinnedFileCapabilities } from "../workspace/pinned-file-capabilities";

/** Replace existing canonical Markdown only. Reuses the pinned inode/content guard. */
export class ObsidianArtifactPublication implements ArtifactPublicationPort {
	readonly capabilityId = "obsidian.replace-approved-canonical";
	constructor(private readonly vaultRoot: string) {
		if (!isAbsolute(vaultRoot) || resolve(vaultRoot) !== vaultRoot || vaultRoot === "/") throw new Error("OBSIDIAN_ROOT_DENIED");
	}
	identity(candidate: ArtifactCandidate) {
		const path = candidate.target.relativePath;
		if (candidate.kind !== "obsidian-canonical" || Object.keys(candidate.target).some(k => k !== "relativePath") || typeof path !== "string" || isAbsolute(path) || path.includes("\\") || path.split("/").some(p => !p || p === "." || p === "..") || !path.endsWith(".md")) throw new Error("OBSIDIAN_TARGET_DENIED");
		return { target: "obsidian", artifact: resolve(this.vaultRoot, path) };
	}
	private intent(candidate: ArtifactCandidate, args: Record<string, unknown>, write = false): RequestActionIntent {
		return { requestId: candidate.candidateId, operationId: write ? "replace" : "read", stage: "DELIVER", capability: write ? "files.replace-approved" : "files.read-pinned", expectedRevision: 0, arguments: { path: this.identity(candidate).artifact, ...args } };
	}
	private async read(candidate: ArtifactCandidate, signal: AbortSignal) {
		if (await realpath(this.vaultRoot) !== this.vaultRoot) throw new Error("OBSIDIAN_ROOT_CHANGED");
		return pinnedFileCapabilities([this.identity(candidate).artifact])[0]!.execute(this.intent(candidate, {}), signal);
	}
	async readBefore(candidate: ArtifactCandidate, signal: AbortSignal): Promise<unknown> {
		return { digest: (await this.read(candidate, signal)).source.digest };
	}
	async write(candidate: ArtifactCandidate, body: string, signal: AbortSignal): Promise<void> {
		if (await realpath(this.vaultRoot) !== this.vaultRoot) throw new Error("OBSIDIAN_ROOT_CHANGED");
		const before = candidate.expectedBefore as { digest?: unknown };
		if (!before || typeof before.digest !== "string") throw new Error("OBSIDIAN_BEFORE_REQUIRED");
		const path = this.identity(candidate).artifact;
		const intent = this.intent(candidate, { beforeDigest: before.digest, content: body }, true);
		const cap = pinnedFileCapabilities([path], [{ requestId: intent.requestId, operationId: intent.operationId, expectedRevision: 0, path, beforeDigest: before.digest, afterDigest: `sha256:${createHash("sha256").update(body).digest("hex")}` }])[1]!;
		if ((await cap.execute(intent, signal)).outcome !== "passed") throw new Error("OBSIDIAN_WRITE_UNCONFIRMED");
	}
	async readBack(candidate: ArtifactCandidate, body: string, signal: AbortSignal) {
		const result = await this.read(candidate, signal);
		const matches = result.source.text === body;
		return { matches, evidence: { path: this.identity(candidate).artifact, bodyDigest: result.source.digest, readBack: matches } };
	}
}
