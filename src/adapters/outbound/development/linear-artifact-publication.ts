import { createHash }                   from "node:crypto";
import type { ArtifactCandidate }       from "@/core/domain/development/artifact-control";
import type { ArtifactPublicationPort } from "@/core/ports/execution/artifact-publication-port";
import type { LinearMcpToolCaller }     from "@/adapters/outbound/workspace/linear-project-dashboard";

/** Existing issue content only; pinned project, workspace and immutable issue UUID. */
export class McpLinearArtifactPublication implements ArtifactPublicationPort {
	readonly capabilityId = "linear.update-approved-issue";
	constructor(private readonly caller: LinearMcpToolCaller, private readonly config: { server: string; threadId: string | (() => string | null); projectId: string; workspaceUrl: string }) {
		if (!/^https:\/\/linear\.app\/[a-zA-Z0-9_-]+$/u.test(config.workspaceUrl)) throw new Error("LINEAR_WORKSPACE_DENIED");
	}
	identity(candidate: ArtifactCandidate) {
		const { issueId, projectId } = candidate.target;
		if (candidate.kind !== "linear-issue"
			|| Object.keys(candidate.target).some(k => !["issueId", "projectId"].includes(k))
			|| projectId !== this.config.projectId
			|| typeof issueId !== "string"
			|| !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/iu.test(issueId)) throw new Error("LINEAR_TARGET_DENIED");
		return { target: "linear", artifact: `linear:issue:${issueId}` };
	}
	private async call(tool: string, args: Record<string, unknown>, signal: AbortSignal): Promise<Record<string, unknown>> {
		if (signal.aborted) throw new Error("LINEAR_INTERRUPTED");
		const threadId = typeof this.config.threadId === "function" ? this.config.threadId() : this.config.threadId;
		if (!threadId) throw new Error("LINEAR_THREAD_UNBOUND");
		const result = await this.caller.callMcpTool({ server: this.config.server, threadId, tool, arguments: args });
		if (result.isError || signal.aborted) throw new Error("LINEAR_CALL_UNCONFIRMED");
		const text = result.content.find(v => v && typeof v === "object" && "text" in v && typeof v.text === "string") as { text: string } | undefined;
		const value = result.structuredContent ?? (text ? JSON.parse(text.text) : null);
		if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("LINEAR_RESPONSE_INVALID");
		return value;
	}
	private async read(candidate: ArtifactCandidate, signal: AbortSignal) {
		this.identity(candidate);
		const result = await this.call("get_issue", { id: candidate.target.issueId }, signal);
		if (
			(result.uuid ?? result.id) !== candidate.target.issueId ||
			result.projectId !== this.config.projectId ||
			typeof result.url !== "string" ||
			!result.url.startsWith(`${this.config.workspaceUrl}/issue/`) ||
			typeof result.title !== "string" ||
			(typeof result.description !== "string" && result.description !== null) ||
			typeof result.updatedAt !== "string"
		) {
			throw new Error("LINEAR_RESPONSE_IDENTITY_MISMATCH");
		}
		return result;
	}
	async readBefore(candidate: ArtifactCandidate, signal: AbortSignal): Promise<unknown> {
		const result = await this.read(candidate, signal);
		return { title: result.title, description: result.description, updatedAt: result.updatedAt };
	}
	async write(candidate: ArtifactCandidate, body: string, signal: AbortSignal): Promise<void> {
		this.identity(candidate);
		await this.call("save_issue", { id: candidate.target.issueId, title: candidate.content.title, description: body }, signal);
	}
	async readBack(candidate: ArtifactCandidate, body: string, signal: AbortSignal) {
		const result = await this.read(candidate, signal);
		const matches = result.title === candidate.content.title && result.description === body;
		return { matches, evidence: { url: result.url, issueId: candidate.target.issueId, projectId: result.projectId, updatedAt: result.updatedAt, bodyDigest: `sha256:${createHash("sha256").update(String(result.description ?? "")).digest("hex")}`, readBack: matches } };
	}
}
