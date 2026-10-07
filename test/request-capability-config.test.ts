import      { artifactCandidateDigest          } from "../src/core/domain/development/artifact-control"              ;
import type { ArtifactCandidate                } from "../src/core/domain/development/artifact-control"              ;
import      { expect, test                     } from "bun:test"                                                     ;
import      { mkdtemp, realpath, writeFile, rm } from "node:fs/promises"                                             ;
import      { tmpdir                           } from "node:os"                                                      ;
import      { join                             } from "node:path"                                                    ;
import      { loadRequestCapabilityConfig      } from "../src/adapters/outbound/workspace/request-capability-config" ;
import type { ExecutorPort                     } from "../src/core/ports/execution/executor-port"                    ;

test("Runtime config snapshots explicit files once, exposes their argument contract and defaults to no write grant", async () => {
	const root = await realpath(await mkdtemp(join(tmpdir(), "www-runtime-config-")));
	try {
		await writeFile(join(root, "file.txt"), "fixture");
		const path = join(root, "runtime.json");
		await writeFile(path, JSON.stringify({ schemaVersion: 1, files: ["file.txt"] }));
		const factory = await loadRequestCapabilityConfig(path);
		await writeFile(path, JSON.stringify({ schemaVersion: 1, files: ["other.txt"] }));
		const caps = factory({} as ExecutorPort, () => null);
		expect(caps.map(c => c.id)).toEqual(["files.read-pinned", "files.replace-approved"]);
		expect(caps[0]!.inputSchema).toMatchObject({
			properties: { path: { enum: [join(root, "file.txt")] } },
		});
		const intent = { requestId: "r", operationId: "read", stage: "GROUND" as const, capability: caps[0]!.id, expectedRevision: 1, arguments: { path: join(root, "file.txt") } };
		expect((await caps[0]!.execute(intent, new AbortController().signal)).source.text           ).toBe("fixture") ;
		expect(await caps[1]!.authorize(intent)                                                     ).toBe(false    ) ;
		expect(await caps[0]!.authorize({ ...intent, arguments: { path: join(root, "other.txt") } })).toBe(false    ) ;
		for (const bad of [{ schemaVersion: 2 }, { schemaVersion: 1, shell: true }, { schemaVersion: 1, files: [null] }, { schemaVersion: 1, linear: { server: "x", projectId: "project", workspaceUrl: "https://example.invalid" } }, { schemaVersion: 1, obsidianRoot: "." }]) {
			await writeFile(path, JSON.stringify(bad));
			await expect(loadRequestCapabilityConfig(path)).rejects.toThrow();
		}
	} finally { await rm(root, { recursive: true, force: true }); }
});

for (const kind of ["linear-issue", "linear-project", "linear-project-comment", "linear-project-update", "obsidian-canonical"]) test(`Runtime rejects removed ${kind} publication`, async () => {
 const root = await realpath(await mkdtemp(join(tmpdir(), "www-runtime-removed-")));
 try {
  const candidate = { schemaVersion: "1.0", candidateId: "ARTIFACT-CANDIDATE-REMOVED", kind, sourceRevision: "fixture", intent: "removed", target: { id: "fixture" }, content: {}, links: {}, expectedBefore: null, validation: [{ id: "fixture", status: "pass", evidence: "fixture" }], candidateDigest: "" };
  candidate.candidateDigest = artifactCandidateDigest(candidate as ArtifactCandidate);
  await writeFile(join(root, "candidate.json"), JSON.stringify(candidate));
  await writeFile(join(root, "runtime.json"), JSON.stringify({ schemaVersion: 1, candidates: ["candidate.json"] }));
  await expect(loadRequestCapabilityConfig(join(root, "runtime.json"))).rejects.toThrow("RUNTIME_CANDIDATE_INVALID");
 } finally { await rm(root, { recursive: true, force: true }); }
});

test("Runtime retains approval-bound GitHub issue publication and refuses an unsupported PR adapter", async () => {
 const root = await realpath(await mkdtemp(join(tmpdir(), "www-runtime-github-")));
 try {
  const candidate: ArtifactCandidate = { schemaVersion: "1.0", candidateId: "ARTIFACT-CANDIDATE-GITHUB", kind: "github-issue", sourceRevision: "fixture", intent: "update issue", target: { repository: "fixture/repo", issue: 7 }, content: { issueType: "bug", title: "진행 표시를 고친다", statement: "진행 표시가 멈춘다", details: ["fixture"] }, links: {}, expectedBefore: null, validation: [{ id: "fixture", status: "pass", evidence: "local fixture" }], candidateDigest: "" };
  candidate.candidateDigest = artifactCandidateDigest(candidate);
  await writeFile(join(root, "candidate.json"), JSON.stringify(candidate));
  await writeFile(join(root, "runtime.json"), JSON.stringify({ schemaVersion: 1, candidates: ["candidate.json"] }));
  const caps        = (await loadRequestCapabilityConfig(join(root, "runtime.json")))({} as ExecutorPort, () => null) ;
  const publication = caps.find(cap => cap.id === "github.update-approved-issue")                                     ;
  expect(publication).toBeDefined();
  expect(await publication!.authorize({ requestId: "fixture", operationId: "publish", stage: "DELIVER", capability: publication!.id, expectedRevision: 1, arguments: { candidateId: candidate.candidateId } })).toBe(false);
  candidate.kind            = "github-pr"                                                                                                                                           ;
  candidate.content         = { title: "진행 표시를 고친다", summary: "표시 갱신 수정", before: "멈춘다", after: "갱신한다", checks: ["fixture"], risk: "low", rollback: "revert" } ;
  candidate.links           = { receipt: "fixture.json" }                                                                                                                           ;
  candidate.candidateDigest = artifactCandidateDigest(candidate)                                                                                                                    ;
  await writeFile(join(root, "candidate.json"), JSON.stringify(candidate));
  await expect(loadRequestCapabilityConfig(join(root, "runtime.json"))).rejects.toThrow("RUNTIME_PUBLICATION_KIND_UNSUPPORTED");
 } finally { await rm(root, { recursive: true, force: true }); }
});
