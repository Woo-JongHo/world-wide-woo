import { expect, test } from "bun:test";
import { artifactCandidateDigest, renderArtifactCandidate, type ArtifactCandidate } from "../src/core/domain/development/artifact-control";
import { artifactPublicationCapability } from "../src/core/application/orchestration/artifact-publication-capability";
import { GitHubArtifactPublication } from "../src/adapters/outbound/development/github-artifact-publication";
import type { RequestActionIntent } from "../src/core/ports/execution/request-action-port";
import { McpLinearArtifactPublication } from "../src/adapters/outbound/development/linear-artifact-publication";
import { ObsidianArtifactPublication } from "../src/adapters/outbound/development/obsidian-artifact-publication";
import { OBSIDIAN_SECTIONS } from "../src/core/domain/development/obsidian-contract";
import { createHash } from "node:crypto";
import { mkdtemp, realpath, writeFile, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

function fixture() {
	const candidate: ArtifactCandidate = { schemaVersion: "1.0", candidateId: "ARTIFACT-CANDIDATE-TEST-PUBLISH", kind: "github-issue", sourceRevision: "fixture:1", intent: "테스트 대상의 본문을 갱신한다", target: { repository: "fixture/repo", issue: 7 }, content: { issueType: "bug", title: "진행 상태를 고친다", statement: "상태 표시가 잘못되었다", details: ["테스트 fixture의 상태 확인"] }, links: {}, expectedBefore: { title: "before", body: "before", updatedAt: "revision-1" }, validation: [{ id: "fixture", status: "pass", evidence: "simulated fixture approval, not a remote receipt" }], candidateDigest: "" };
	candidate.candidateDigest = artifactCandidateDigest(candidate);
	let state = { number: 7, html_url: "https://github.com/fixture/repo/issues/7", title: "before", body: "before", updated_at: "revision-1" };
	const calls: { method: string; body?: string | null }[] = [];
	let loseResponse = false;
	const request = (async (url: string, options: RequestInit) => {
		expect(url).toBe("https://api.github.com/repos/fixture/repo/issues/7");
		expect(options.redirect).toBe("error");
		expect(new Headers(options.headers).get("Authorization")).toBe("Bearer fixture-secret");
		calls.push({ method: options.method!, body: options.body as string });
		if (options.method === "PATCH") {
			const payload = JSON.parse(options.body as string);
			expect(Object.keys(payload).sort()).toEqual(["body", "title"]);
			state = { ...state, ...payload, updated_at: "revision-2" };
			if (loseResponse) throw new Error("response lost after remote write");
		}
		return new Response(JSON.stringify(state), { status: 200 });
	}) as unknown as typeof fetch;
	const port = new GitHubArtifactPublication(async () => "fixture-secret", request);
	const intent: RequestActionIntent = { requestId: "r", operationId: "publish", stage: "DELIVER", capability: port.capabilityId, expectedRevision: 7, arguments: { candidateId: candidate.candidateId } };
	const capability = artifactPublicationCapability(port, [candidate], [{ requestId: "r", operationId: "publish", expectedRevision: 7, candidateDigest: candidate.candidateDigest }]);
	return { candidate, capability, port, intent, calls, drift: () => { state.title = "changed externally"; }, lose: () => { loseResponse = true; } };
}

test("approved Artifact uses GET/PATCH/GET and returns an identity-bound, secret-free receipt", async () => {
	const f = fixture();
	expect(await f.capability.authorize(f.intent)).toBe(true);
	const result = await f.capability.execute(f.intent, new AbortController().signal);
	expect(result.outcome).toBe("passed");
	expect(result.delivery).toEqual({ target: "github", artifact: "https://github.com/fixture/repo/issues/7" });
	expect(f.calls.map(c => c.method)).toEqual(["GET", "PATCH", "GET"]);
	expect(JSON.parse(f.calls[1]!.body!).body).toBe(renderArtifactCandidate(f.candidate));
	expect(JSON.stringify(result)).not.toContain("fixture-secret");
});

test("different permit, unsupported target and before-state drift cannot issue a PATCH", async () => {
	const f = fixture(), signal = new AbortController().signal;
	expect(await f.capability.authorize({ ...f.intent, operationId: "other" })).toBe(false);
	await expect(f.capability.execute({ ...f.intent, expectedRevision: 8 }, signal)).rejects.toThrow("PUBLICATION_NOT_AUTHORIZED");
	expect(f.calls).toHaveLength(0);
	f.drift();
	expect((await f.capability.execute(f.intent, signal)).outcome).toBe("failed");
	expect(f.calls.map(c => c.method)).toEqual(["GET"]);
	expect(() => f.port.identity({ ...f.candidate, target: { repository: "../repo", issue: 7 } })).toThrow("GITHUB_TARGET_DENIED");
	expect(() => f.port.identity({ ...f.candidate, target: { repository: "fixture/repo", issue: null } })).toThrow("GITHUB_TARGET_DENIED");
});

test("lost publication response is recovered by GET only; candidate substitution is denied", async () => {
	const f = fixture(), signal = new AbortController().signal;
	const descriptor = f.capability.reconciliation!.prepare(f.intent);
	f.lose();
	await expect(f.capability.execute(f.intent, signal)).rejects.toThrow("response lost");
	const result = await f.capability.reconciliation!.readBack(descriptor, signal);
	expect(result.confirmed).toBe(true);
	expect(f.calls.map(c => c.method)).toEqual(["GET", "PATCH", "GET"]);
	await expect(f.capability.reconciliation!.readBack({ ...descriptor, candidateDigest: "tampered" }, signal)).rejects.toThrow("CANDIDATE_UNAVAILABLE");
	expect(f.calls).toHaveLength(3);
});

test("Linear publication uses the pinned UUID, checks project identity and never creates an issue", async () => {
	const issueId = "62bdc3c2-cb9b-428f-8e86-7e69350a400b", projectId = "fixture-project";
	const candidate: ArtifactCandidate = { ...fixture().candidate, kind: "linear-issue", target: { issueId, projectId }, content: { title: "요청 상태를 갱신한다", purpose: "상태 일치", included: ["기존 본문"], excluded: ["새 이슈"], done: ["read-back"], connections: ["fixture"] }, expectedBefore: { title: "before", description: "before", updatedAt: "1" } };
	candidate.candidateDigest = artifactCandidateDigest(candidate);
	let state = { id: "WOO-1", uuid: issueId, projectId, url: "https://linear.app/fixture/issue/WOO-1/title", title: "before", description: "before", updatedAt: "1" };
	const calls: string[] = [];
	const port = new McpLinearArtifactPublication({ callMcpTool: async input => {
		expect(input.server).toBe("fixture"); expect(input.threadId).toBe("thread");
		const args = input.arguments as Record<string, unknown>; expect(args.id).toBe(issueId); calls.push(input.tool);
		if (input.tool === "save_issue") { expect(Object.keys(args).sort()).toEqual(["description", "id", "title"]); state = { ...state, title: args.title as string, description: args.description as string, updatedAt: "2" }; }
		return { content: [{ type: "text", text: JSON.stringify(state) }] };
	} }, { server: "fixture", threadId: "thread", projectId, workspaceUrl: "https://linear.app/fixture" });
	const cap = artifactPublicationCapability(port, [candidate], []);
	const intent = { ...fixture().intent, capability: cap.id, arguments: { candidateId: candidate.candidateId } };
	expect(await cap.authorize(intent)).toBe(false);
	expect(await cap.approvalPreview!(intent)).not.toBeNull();
	const result = await cap.execute(intent, new AbortController().signal, { intent });
	expect(result.delivery).toEqual({ target: "linear", artifact: `linear:issue:${issueId}` });
	expect(calls).toEqual(["get_issue", "save_issue", "get_issue"]);
	state.projectId = "foreign";
	await expect(port.readBefore(candidate, new AbortController().signal)).rejects.toThrow("IDENTITY_MISMATCH");
	expect(() => port.identity({ ...candidate, target: { issueId, projectId: "other" } })).toThrow("TARGET_DENIED");
});

test("Obsidian publishes a complete canonical artifact with read-back and rejects traversal/symlinks", async () => {
	const dir = await realpath(await mkdtemp(join(tmpdir(), "www-obsidian-publication-")));
	try {
		const path = join(dir, "record.md"); await writeFile(path, "before");
		const candidate: ArtifactCandidate = { ...fixture().candidate, kind: "obsidian-canonical", target: { relativePath: "record.md" }, content: { properties: { title: "Runtime 기록", schema: 2 }, sections: Object.fromEntries(OBSIDIAN_SECTIONS.map(s => [s, "테스트 fixture의 실제 게시 내용"])) }, expectedBefore: { digest: `sha256:${createHash("sha256").update("before").digest("hex")}` } };
		candidate.candidateDigest = artifactCandidateDigest(candidate);
		const port = new ObsidianArtifactPublication(dir), cap = artifactPublicationCapability(port, [candidate], []);
		const intent = { ...fixture().intent, capability: cap.id, arguments: { candidateId: candidate.candidateId } };
		const signal = new AbortController().signal;
		const result = await cap.execute(intent, signal, { intent });
		expect(result.outcome).toBe("passed"); expect(result.delivery?.artifact).toBe(path);
		expect(await readFile(path, "utf8")).toBe(renderArtifactCandidate(candidate));
		expect((await cap.reconciliation!.readBack(cap.reconciliation!.prepare(intent), signal)).confirmed).toBe(true);
		expect(() => port.identity({ ...candidate, target: { relativePath: "../record.md" } })).toThrow("TARGET_DENIED");
		await symlink(path, join(dir, "link.md"));
		await expect(port.readBefore({ ...candidate, target: { relativePath: "link.md" } }, signal)).rejects.toThrow("SYMLINK_DENIED");
		await writeFile(path, "external change");
		expect((await cap.execute(intent, signal, { intent })).outcome).toBe("failed");
		expect(await readFile(path, "utf8")).toBe("external change");
	} finally { await rm(dir, { recursive: true, force: true }); }
});
