import { createHash }                   from "node:crypto";
import type { ArtifactCandidate }       from "@/core/domain/development/artifact-control";
import type { ArtifactPublicationPort } from "@/core/ports/execution/artifact-publication-port";

/** Existing issue title/body only. No creates, labels, state changes, commit, push or merge. */
export class GitHubArtifactPublication implements ArtifactPublicationPort {
	readonly capabilityId = "github.update-approved-issue";
	constructor(private readonly token: () => Promise<string>, private readonly request: typeof fetch = fetch) {}
	identity(candidate: ArtifactCandidate): { target: string; artifact: string } {
		const { repository, issue } = candidate.target;
		if (candidate.kind !== "github-issue"
			|| Object.keys(candidate.target).some(k => !["repository", "issue"].includes(k))
			|| typeof repository !== "string"
			|| !/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/u.test(repository)
			|| !Number.isSafeInteger(issue)
			|| Number(issue) < 1) throw new Error("GITHUB_TARGET_DENIED");
		return { target: "github", artifact: `https://github.com/${repository}/issues/${issue}` };
	}
	private async call(candidate: ArtifactCandidate, signal: AbortSignal, body?: string): Promise<Record<string, unknown>> {
		this.identity(candidate);
		const token = await this.token();
		if (!token || signal.aborted) throw new Error("GITHUB_AUTH_UNAVAILABLE");
		const response = await this.request(`https://api.github.com/repos/${candidate.target.repository}/issues/${candidate.target.issue}`, {
			method: body === undefined ? "GET" : "PATCH", redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
			headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2026-03-10", "Content-Type": "application/json" },
			...(body === undefined ? {} : { body: JSON.stringify({ title: candidate.content.title, body }) }),
		});
		if (!response.ok) throw new Error(`GITHUB_HTTP_${response.status}`);
		const result = await response.json() as Record<string, unknown>;
		if (
			!result ||
			result.number !== candidate.target.issue ||
			result.html_url !== this.identity(candidate).artifact ||
			typeof result.title !== "string" ||
			(typeof result.body !== "string" && result.body !== null) ||
			typeof result.updated_at !== "string" ||
			result.pull_request !== undefined
		) {
			throw new Error("GITHUB_RESPONSE_IDENTITY_MISMATCH");
		}
		return result;
	}
	async readBefore(candidate: ArtifactCandidate, signal: AbortSignal): Promise<unknown> {
		const result = await this.call(candidate, signal);
		return { title: result.title, body: result.body, updatedAt: result.updated_at };
	}
	async write(candidate: ArtifactCandidate, body: string, signal: AbortSignal): Promise<void> { await this.call(candidate, signal, body); }
	async readBack(candidate: ArtifactCandidate, body: string, signal: AbortSignal) {
		const result = await this.call(candidate, signal);
		return { matches: result.title === candidate.content.title && result.body === body, evidence: { url: result.html_url, updatedAt: result.updated_at, bodyDigest: `sha256:${createHash("sha256").update(String(result.body ?? "")).digest("hex")}`, readBack: result.title === candidate.content.title && result.body === body } };
	}
}
