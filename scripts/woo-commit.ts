#!/usr/bin/env bun
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import YAML from "yaml";
import type { CommitCandidate, CommitPolicy } from "../src/domain/commit-governance.js";
import { candidateDigest, CommitControlPlane } from "../src/domain/commit-governance.js";
import { assertCandidateMatchesWorktree, assertRepositoryReady, assertStagedBoundary, authorize, candidateContentDigest, changedPaths, executeCommit, loadActiveCommit, loadAuthorization, repositoryRoot, writeFailureReceipt } from "../src/infrastructure/git-commit-control.js";

function flag(args: string[], name: string): string | undefined { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; }
function required(args: string[], name: string): string { const value = flag(args, name); if (!value) throw new Error(`${name} 값이 필요합니다.`); return value; }
function loadCandidate(path: string): CommitCandidate { return JSON.parse(readFileSync(resolve(path), "utf8")) as CommitCandidate; }
function loadPolicy(root: string): CommitPolicy {
	const document = YAML.parse(readFileSync(resolve(root, ".woo/project.yaml"), "utf8"));
	return document.commit as CommitPolicy;
}

export function runWooCommit(args = process.argv.slice(2)): string {
	const command = args[0] ?? "inspect";
	const root = repositoryRoot(resolve(flag(args, "--root") ?? ".")); const policy = loadPolicy(root); const control = new CommitControlPlane(policy);
	if (command === "inspect") {
		assertRepositoryReady(root);
		return JSON.stringify({ root, branch: Bun.spawnSync(["git", "-C", root, "branch", "--show-current"]).stdout.toString().trim(), status: Bun.spawnSync(["git", "-C", root, "status", "--short", "--branch"]).stdout.toString() }, null, 2);
	}
	if (command === "fingerprint") {
		const paths = flag(args, "--paths")?.split(",").filter(Boolean) ?? changedPaths(root);
		const head = Bun.spawnSync(["git", "-C", root, "rev-parse", "HEAD"]).stdout.toString().trim();
		return JSON.stringify({ baseHead: head, paths, contentDigest: candidateContentDigest(root, paths) }, null, 2);
	}
	const candidatePath = required(args, "--candidate"); const candidate = loadCandidate(candidatePath);
	if (command === "validate") {
		const errors = control.validate(candidate, args.includes("--require-ready")); if (errors.length) throw new Error(errors.join("\n"));
		assertCandidateMatchesWorktree(root, candidate); return `VALID ${candidate.id} sha256:${candidateDigest(candidate)}`;
	}
	if (command === "render") {
		const message = control.render(candidate); const output = flag(args, "--output"); if (output) { writeFileSync(resolve(output), message); return `WROTE ${resolve(output)}`; } return message;
	}
	if (command === "authorize") return `AUTHORIZED ${candidate.id} ${authorize(root, candidate, required(args, "--actor"))}`;
	if (command === "execute") {
		const result = executeCommit(root, resolve(candidatePath), resolve(required(args, "--authorization")), policy); return `COMMITTED ${result.sha}\nRECEIPT ${result.receipt}\nNOT PUSHED`;
	}
	if (command === "hook") {
		const hook = args[1]; const active = loadActiveCommit(root); const activeCandidate = loadCandidate(active.candidatePath);
		if (active.candidateDigest !== candidateDigest(activeCandidate)) throw new Error("COMMIT_AUTH_STALE: active Candidate digest가 다릅니다.");
		loadAuthorization(active.authorizationPath, activeCandidate);
		const errors = control.validate(activeCandidate, true); if (errors.length) throw new Error(errors.join("\n"));
		if (hook === "pre-commit") assertStagedBoundary(root, activeCandidate);
		else if (hook === "commit-msg") {
			const actual = readFileSync(required(args, "--message"), "utf8"); if (actual !== control.render(activeCandidate)) throw new Error("COMMIT_MESSAGE_MISMATCH: 승인 메시지와 다릅니다.");
		} else throw new Error(`지원하지 않는 hook: ${hook}`);
		return `HOOK PASS ${hook} ${activeCandidate.id}`;
	}
	throw new Error(`알 수 없는 woo-commit 명령: ${command}`);
}

if (import.meta.main) {
	try { console.log(runWooCommit()); }
	catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		try { console.error(`FAILURE RECEIPT ${writeFailureReceipt(repositoryRoot(process.cwd()), error)}`); } catch { /* repository discovery may itself be the failure */ }
		process.exit(2);
	}
}
