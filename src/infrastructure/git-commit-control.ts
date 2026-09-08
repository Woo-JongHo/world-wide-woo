import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { CommitCandidate, CommitPolicy } from "../domain/commit-governance.js";
import { candidateDigest, canonicalJson, CommitControlPlane, sha256 } from "../domain/commit-governance.js";

export interface CommitAuthorization { schemaVersion: 1; candidateId: string; candidateDigest: string; actor: string; authorizedAt: string }
export interface ActiveCommit { candidatePath: string; authorizationPath: string; messagePath: string; candidateDigest: string }

function git(root: string, args: string[], encoding: BufferEncoding | "buffer" = "utf8"): string | Buffer {
	return execFileSync("git", ["-C", root, ...args], { encoding: encoding === "buffer" ? "buffer" : encoding, stdio: ["ignore", "pipe", "pipe"] });
}
export function repositoryRoot(cwd: string): string { return String(git(cwd, ["rev-parse", "--show-toplevel"])).trim(); }
export function gitDir(root: string): string { return resolve(root, String(git(root, ["rev-parse", "--git-dir"])).trim()); }
export function changedPaths(root: string): string[] {
	const values = new Set<string>();
	for (const args of [["diff", "--name-only", "-z"], ["diff", "--cached", "--name-only", "-z"], ["ls-files", "--others", "--exclude-standard", "-z"]]) {
		for (const path of (git(root, args, "buffer") as Buffer).toString("utf8").split("\0").filter(Boolean)) values.add(path);
	}
	return [...values].sort();
}
export function candidateContentDigest(root: string, paths: readonly string[]): string {
	const entries = [...paths].sort().map(path => {
		try { return `${path}\0${String(git(root, ["hash-object", "--no-filters", "--", path])).trim()}`; }
		catch { return `${path}\0DELETED`; }
	});
	return sha256(entries.join("\0"));
}
export function stagedPaths(root: string): string[] { return (git(root, ["diff", "--cached", "--name-only", "-z"], "buffer") as Buffer).toString("utf8").split("\0").filter(Boolean).sort(); }
export function unstagedPaths(root: string): string[] { return (git(root, ["diff", "--name-only", "-z"], "buffer") as Buffer).toString("utf8").split("\0").filter(Boolean).sort(); }

export function assertRepositoryReady(root: string): void {
	const branch = String(git(root, ["symbolic-ref", "--quiet", "--short", "HEAD"])).trim();
	if (!branch) throw new Error("COMMIT_DETACHED_HEAD: branch가 필요합니다.");
	for (const marker of ["MERGE_HEAD", "REBASE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD"]) if (existsSync(join(gitDir(root), marker))) throw new Error(`COMMIT_GIT_OPERATION_ACTIVE: ${marker}`);
}

export function assertCandidateMatchesWorktree(root: string, candidate: CommitCandidate): void {
	const head = String(git(root, ["rev-parse", "HEAD"])).trim();
	if (candidate.baseHead !== head) throw new Error(`COMMIT_AUTH_STALE: base HEAD가 바뀌었습니다. expected=${candidate.baseHead} actual=${head}`);
	const changed = new Set(changedPaths(root));
	const missing = candidate.paths.filter(path => !changed.has(path));
	if (missing.length) throw new Error(`COMMIT_PATH_MISMATCH: 변경되지 않은 후보 경로 ${missing.join(", ")}`);
	const content = candidateContentDigest(root, candidate.paths);
	if (candidate.contentDigest !== content) throw new Error(`COMMIT_AUTH_STALE: 후보 파일 내용이 바뀌었습니다. expected=${candidate.contentDigest} actual=${content}`);
}

export function assertStagedBoundary(root: string, candidate: CommitCandidate): void {
	const expected = [...candidate.paths].sort();
	const staged = stagedPaths(root);
	if (canonicalJson(staged) !== canonicalJson(expected)) throw new Error(`COMMIT_STAGE_MISMATCH: expected=${expected.join(",")} actual=${staged.join(",")}`);
	const partial = unstagedPaths(root).filter(path => expected.includes(path));
	if (partial.length) throw new Error(`COMMIT_PARTIAL_STAGE: ${partial.join(", ")}`);
}

export function authorize(root: string, candidate: CommitCandidate, actor: string): string {
	if (!actor.trim()) throw new Error("COMMIT_AUTH_REQUIRED: 승인자 이름이 필요합니다.");
	const directory = join(root, ".www/runtime/commit"); mkdirSync(directory, { recursive: true });
	const path = join(directory, `${candidate.id}.authorization.json`);
	const value: CommitAuthorization = { schemaVersion: 1, candidateId: candidate.id, candidateDigest: candidateDigest(candidate), actor: actor.trim(), authorizedAt: new Date().toISOString() };
	writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
	return path;
}

export function loadAuthorization(path: string, candidate: CommitCandidate): CommitAuthorization {
	const value = JSON.parse(readFileSync(path, "utf8")) as CommitAuthorization;
	if (value.schemaVersion !== 1 || value.candidateId !== candidate.id || value.candidateDigest !== candidateDigest(candidate) || !value.actor || Number.isNaN(Date.parse(value.authorizedAt))) throw new Error("COMMIT_AUTH_STALE: 승인이 현재 Candidate와 다릅니다.");
	return value;
}

export function activeCommitPath(root: string): string { return join(gitDir(root), "woo", "active.json"); }
export function loadActiveCommit(root: string): ActiveCommit {
	const path = activeCommitPath(root); if (!existsSync(path)) throw new Error("COMMIT_CONTROL_REQUIRED: `bun run commit:control -- execute`를 사용하세요.");
	return JSON.parse(readFileSync(path, "utf8")) as ActiveCommit;
}

export function writeReceipt(root: string, candidate: CommitCandidate, authorization: CommitAuthorization, commitSha: string, message: string): string {
	const now = new Date().toISOString();
	const receipt: Record<string, unknown> = {
		schemaVersion: "1.0", receiptId: randomUUID(), runId: randomUUID(), candidateId: candidate.id,
		skill: { name: "woo-commit", version: "0.1.0" }, capability: "commit", intentId: candidate.intent,
		status: "succeeded", stage: "verify", actor: { kind: "human", provider: null, model: null },
		context: { projectId: "world-wide-woo", repository: root, branch: String(git(root, ["branch", "--show-current"])).trim(), head: commitSha, issueIds: candidate.refs.filter(ref => /^WOO-\d+$/u.test(ref)), unitIds: candidate.refs.filter(ref => /^Code-\d{3}$/u.test(ref)) },
		input: { digest: candidateDigest(candidate), refs: candidate.refs }, decision: { type: candidate.type, scope: candidate.scope, impactedScopes: candidate.impactedScopes ?? [], atomicity: candidate.axes },
		validation: candidate.validations, authorization, execution: { tool: "git", argvDigest: sha256("git commit --cleanup=verbatim -F <message>"), exitCode: 0, startedAt: now, finishedAt: now },
		result: { commitSha, treeSha: String(git(root, ["show", "-s", "--format=%T", commitSha])).trim(), messageDigest: sha256(message), files: candidate.paths, publication: "local-only" },
		failure: null, evidence: [{ id: "commit-object", kind: "git-object", uri: `git:${commitSha}`, digest: sha256(String(git(root, ["cat-file", "commit", commitSha]))) }], nextCapabilities: ["pr"]
	};
	receipt.receiptDigest = sha256(canonicalJson(receipt));
	const directory = join(root, ".www/receipts/commit"); mkdirSync(directory, { recursive: true });
	const path = join(directory, `${commitSha}.json`); writeFileSync(path, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 }); return path;
}

export function writeFailureReceipt(root: string, error: unknown, stage = "execute"): string {
	const message = error instanceof Error ? error.message : String(error);
	const match = /^([A-Z][A-Z0-9_]+):\s*(.*)$/su.exec(message);
	const now = new Date().toISOString();
	const receipt: Record<string, unknown> = {
		schemaVersion: "1.0", receiptId: randomUUID(), runId: randomUUID(), candidateId: null,
		skill: { name: "woo-commit", version: "0.1.0" }, capability: "commit", intentId: null,
		status: "blocked", stage, actor: { kind: "runtime", provider: null, model: null },
		context: { repository: root }, input: { digest: sha256(message), refs: [] }, decision: null, validation: [], authorization: null,
		execution: { tool: "woo-commit", argvDigest: sha256(process.argv.join("\0")), exitCode: 2, startedAt: now, finishedAt: now }, result: null,
		failure: { code: match?.[1] ?? "COMMIT_RUNTIME_FAILED", stage, reason: match?.[2] ?? message, blocking: true, retryable: !/DETACHED_HEAD|GIT_OPERATION_ACTIVE/u.test(message), recovery: { capability: "commit", action: "inspect-failure-and-rebuild-candidate" }, evidence: [] },
		evidence: [], nextCapabilities: ["commit"]
	};
	receipt.receiptDigest = sha256(canonicalJson(receipt));
	const directory = join(root, ".www/receipts/commit/failures"); mkdirSync(directory, { recursive: true });
	const path = join(directory, `${receipt.receiptId}.json`); writeFileSync(path, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 }); return path;
}

export function verifyRecordedCommit(root: string, candidate: CommitCandidate, message: string, commit = "HEAD"): string {
	const sha = String(git(root, ["rev-parse", commit])).trim();
	const object = git(root, ["cat-file", "commit", sha], "buffer") as Buffer;
	const boundary = object.indexOf(Buffer.from("\n\n"));
	if (boundary < 0) throw new Error("COMMIT_POST_VERIFY_FAILED: commit object에 메시지 경계가 없습니다.");
	const actualMessage = object.subarray(boundary + 2).toString("utf8");
	if (actualMessage !== message) throw new Error("COMMIT_POST_VERIFY_FAILED: commit message가 Candidate와 다릅니다.");
	const actualPaths = (git(root, ["diff-tree", "--root", "--no-commit-id", "--name-only", "-r", "-z", sha], "buffer") as Buffer).toString("utf8").split("\0").filter(Boolean).sort();
	if (canonicalJson(actualPaths) !== canonicalJson([...candidate.paths].sort())) throw new Error("COMMIT_POST_VERIFY_FAILED: commit tree 경로가 Candidate와 다릅니다.");
	return sha;
}

export function executeCommit(root: string, candidatePath: string, authorizationPath: string, policy: CommitPolicy): { sha: string; receipt: string } {
	assertRepositoryReady(root);
	const candidate = JSON.parse(readFileSync(candidatePath, "utf8")) as CommitCandidate;
	const control = new CommitControlPlane(policy); const errors = control.validate(candidate, true); if (errors.length) throw new Error(errors.join("\n"));
	assertCandidateMatchesWorktree(root, candidate); const authorization = loadAuthorization(authorizationPath, candidate);
	git(root, ["add", "--", ...candidate.paths]); assertStagedBoundary(root, candidate);
	const directory = join(root, ".www/runtime/commit"); mkdirSync(directory, { recursive: true });
	const messagePath = join(directory, `${candidate.id}.message.txt`); const message = control.render(candidate); writeFileSync(messagePath, message);
	const activePath = activeCommitPath(root); mkdirSync(dirname(activePath), { recursive: true });
	writeFileSync(activePath, `${JSON.stringify({ candidatePath: resolve(candidatePath), authorizationPath: resolve(authorizationPath), messagePath, candidateDigest: candidateDigest(candidate) }, null, 2)}\n`, { mode: 0o600 });
	try { git(root, ["commit", "--cleanup=verbatim", "-F", messagePath]); }
	finally { rmSync(activePath, { force: true }); }
	const sha = verifyRecordedCommit(root, candidate, message); return { sha, receipt: writeReceipt(root, candidate, authorization, sha, message) };
}
