import      { readFile, realpath            } from "node:fs/promises"                                                 ;
import      { dirname, resolve              } from "node:path"                                                        ;
import      { validateArtifactCandidate     } from "@/core/domain/development/artifact-control"                       ;
import type { ArtifactCandidate             } from "@/core/domain/development/artifact-control"                       ;
import      { artifactPublicationCapability } from "@/core/application/orchestration/artifact-publication-capability" ;
import type { RequestActionCapability       } from "@/core/ports/execution/request-action-port"                       ;
import type { ExecutorPort                  } from "@/core/ports/execution/executor-port"                             ;
import      { GitHubArtifactPublication     } from "@/adapters/outbound/development/github-artifact-publication"      ;
import      { pinnedFileCapabilities        } from "@/adapters/outbound/workspace/pinned-file-capabilities"           ;

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
/** Explicit host input, snapshotted once before Native starts. Never loaded from model output. */
export async function loadRequestCapabilityConfig(path: string): Promise<(native: ExecutorPort, threadId: () => string | null) => readonly RequestActionCapability[]> {
	const canonical = await realpath(path), base = dirname(canonical);
	const raw = await readFile(canonical, "utf8");
	if (Buffer.byteLength(raw) > 256 * 1024) throw new Error("RUNTIME_CONFIG_TOO_LARGE");
	const config: unknown = JSON.parse(raw);
	if (!object(config) || config.schemaVersion !== 1 || Object.keys(config).some(k => !["schemaVersion", "files", "candidates"].includes(k))) throw new Error("RUNTIME_CONFIG_INVALID");
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
	if (candidates.some(candidate => candidate.kind !== "github-issue")) throw new Error("RUNTIME_PUBLICATION_KIND_UNSUPPORTED");
	return () => {
		const capabilities = [...pinnedFileCapabilities(files)]                        ;
		const groups       = (kind: string) => candidates.filter(c => c.kind === kind) ;
		if (groups("github-issue").length) capabilities.push(artifactPublicationCapability(new GitHubArtifactPublication(async () => process.env.GITHUB_TOKEN ?? ""), groups("github-issue"), []));
		return capabilities;
	};
}
