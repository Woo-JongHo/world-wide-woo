import { readFile, realpath } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { validateArtifactCandidate, type ArtifactCandidate } from "../../../core/domain/development/artifact-control";
import { artifactPublicationCapability } from "../../../core/application/orchestration/artifact-publication-capability";
import type { RequestActionCapability } from "../../../core/ports/execution/request-action-port";
import type { ExecutorPort } from "../../../core/ports/execution/executor-port";
import { GitHubArtifactPublication } from "../development/github-artifact-publication";
import { McpLinearArtifactPublication } from "../development/linear-artifact-publication";
import { ObsidianArtifactPublication } from "../development/obsidian-artifact-publication";
import { pinnedFileCapabilities } from "./pinned-file-capabilities";
import type { LinearMcpToolCaller } from "./linear-project-dashboard";

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
/** Explicit host input, snapshotted once before Native starts. Never loaded from model output. */
export async function loadRequestCapabilityConfig(path: string): Promise<(native: ExecutorPort, threadId: () => string | null) => readonly RequestActionCapability[]> {
	const canonical = await realpath(path), base = dirname(canonical);
	const raw = await readFile(canonical, "utf8");
	if (Buffer.byteLength(raw) > 256 * 1024) throw new Error("RUNTIME_CONFIG_TOO_LARGE");
	const config: unknown = JSON.parse(raw);
	if (!object(config) || config.schemaVersion !== 1 || Object.keys(config).some(k => !["schemaVersion", "files", "candidates", "linear", "obsidianRoot"].includes(k))) throw new Error("RUNTIME_CONFIG_INVALID");
	const paths = (key: string): string[] => {
		const values = config[key] ?? [];
		if (!Array.isArray(values) || values.length > 128 || values.some(p => typeof p !== "string" || !p.trim())) throw new Error("RUNTIME_CONFIG_PATHS_INVALID");
		return values.map(p => resolve(base, p));
	};
	const files = await Promise.all(paths("files").map(p => realpath(p)));
	const candidates = await Promise.all(paths("candidates").map(async p => {
		const text = await readFile(p, "utf8");
		if (Buffer.byteLength(text) > 256 * 1024) throw new Error("RUNTIME_CANDIDATE_TOO_LARGE");
		const candidate = JSON.parse(text) as ArtifactCandidate;
		if (validateArtifactCandidate(candidate).length) throw new Error("RUNTIME_CANDIDATE_INVALID");
		return candidate;
	}));
	if (candidates.some(c => !["github-issue", "linear-issue", "obsidian-canonical"].includes(c.kind))) throw new Error("RUNTIME_PUBLICATION_KIND_UNSUPPORTED");
	let linear: { server: string; projectId: string; workspaceUrl: string } | undefined;
	if (config.linear !== undefined) {
		const value = config.linear;
		if (!object(value) || Object.keys(value).sort().join() !== "projectId,server,workspaceUrl" || ![value.server, value.projectId, value.workspaceUrl].every(v => typeof v === "string" && !!v.trim())) throw new Error("RUNTIME_LINEAR_CONFIG_INVALID");
		linear = value as typeof linear;
	}
	if (config.obsidianRoot !== undefined && typeof config.obsidianRoot !== "string") throw new Error("RUNTIME_OBSIDIAN_CONFIG_INVALID");
	const vault = typeof config.obsidianRoot === "string" ? await realpath(resolve(base, config.obsidianRoot)) : undefined;
	return (native, threadId) => {
		const capabilities = [...pinnedFileCapabilities(files)];
		const groups = (kind: string) => candidates.filter(c => c.kind === kind);
		if (groups("github-issue").length) capabilities.push(artifactPublicationCapability(new GitHubArtifactPublication(async () => process.env.GITHUB_TOKEN ?? ""), groups("github-issue"), []));
		if (groups("linear-issue").length) {
			const caller = native as ExecutorPort & Partial<LinearMcpToolCaller>;
			if (!linear || typeof caller.callMcpTool !== "function") throw new Error("RUNTIME_LINEAR_UNAVAILABLE");
			capabilities.push(artifactPublicationCapability(new McpLinearArtifactPublication({ callMcpTool: input => caller.callMcpTool!(input) }, { ...linear, threadId }), groups("linear-issue"), []));
		}
		if (groups("obsidian-canonical").length) {
			if (!vault) throw new Error("RUNTIME_OBSIDIAN_UNAVAILABLE");
			capabilities.push(artifactPublicationCapability(new ObsidianArtifactPublication(vault), groups("obsidian-canonical"), []));
		}
		return capabilities;
	};
}
