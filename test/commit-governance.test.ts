import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CommitCandidate, CommitPolicy } from "../src/core/commit/commit-governance";
import { candidateDigest, CommitControlPlane } from "../src/core/commit/commit-governance";
import { assertCandidateMatchesWorktree, assertStagedBoundary, authorize, candidateContentDigest, changedPaths, executeCommit } from "../src/adapters/outbound/git/git-commit-control";
import { CommitReceiptStore } from "../src/adapters/outbound/persistence/commit-receipt-store";

const policy: CommitPolicy = { messageProfile: "korean-result", subjectMaxLength: 72, subjectSoftLength: 50, requireScope: true, requireType: true, requireHumanAuthorization: true, fullFileStagingOnly: true, protectedBranches: ["dev", "main"], allowedTypes: ["feat", "fix", "perf", "refactor", "test", "docs", "build", "ci", "chore", "revert"], scopes: { commit: "커밋" } };
function candidate(overrides: Partial<CommitCandidate> = {}): CommitCandidate {
	return { schemaVersion: "1.0", id: "COMMIT-CANDIDATE-TEST-1", intent: "commit control pilot", type: "feat", scope: "commit", baseHead: "1".repeat(40), contentDigest: "2".repeat(64), state: "complete", decision: "ready", result: "승인된 변경만 커밋한다", why: "직접 커밋의 규칙 우회를 막는다.", paths: ["change.txt"], axes: { samePurpose: { result: "pass", evidence: "한 목적" }, rollbackTogether: { result: "pass", evidence: "함께 복구" }, sharedValidation: { result: "pass", evidence: "한 검증" }, oneHeadline: { result: "pass", evidence: "한 제목" } }, validations: [{ id: "UNIT", class: "deterministic", severity: "blocking", expected: "pass", result: "pass", evidence: "targeted test pass" }], boundaries: ["로컬 commit만 포함"], refs: ["WOO-747", "Code-014"], blockers: [], next: null, ...overrides };
}

describe("woo-commit contract", () => {
	test("99_www는 type과 scope를 metadata로 보존하고 한국어 결과 제목을 렌더링한다", () => {
		const control = new CommitControlPlane(policy), value = candidate();
		expect(control.validate(value, true)).toEqual([]);
		expect(control.render(value)).toBe("승인된 변경만 커밋한다\n");
	});
	test("여러 경로는 body와 Candidate digest를 요구한다", () => {
		const control = new CommitControlPlane(policy), value = candidate({ paths: ["one", "two"] });
		const message = control.render(value);
		expect(message).toContain("이유:\n"); expect(message).toContain(candidateDigest(value));
	});
	test("blocking 검증 실패와 모호한 결과를 차단한다", () => {
		const control = new CommitControlPlane(policy);
		expect(control.validate(candidate({ result: "수정" }), true)).toContain("result: 구체적인 완료 상태를 설명해야 합니다.");
		const value = candidate(); value.validations[0]!.result = "not-run";
		expect(control.validate(value, true).some(error => error.includes("blocking"))).toBeTrue();
	});
	test("Agent Hook이 직접 Git mutation을 차단하고 Woo Runtime은 허용한다", () => {
		const hook = join(import.meta.dir, "../scripts/woo-agent-hook.ts");
		const blocked = spawnSync("bun", [hook], { input: JSON.stringify({ command: "git commit -m direct" }), encoding: "utf8" });
		expect(blocked.status).toBe(2); expect(blocked.stdout).toContain("COMMIT_CONTROL_REQUIRED");
		const allowed = spawnSync("bun", [hook], { input: JSON.stringify({ command: "bun run commit:control -- execute" }), encoding: "utf8" });
		expect(allowed.status).toBe(0);
	});
});

const roots: string[] = []; afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
describe("staged boundary", () => {
	test("NFD/NFC로 보이는 같은 변경 경로는 Git 추적 경로 하나로 고정한다", () => {
		const root = mkdtempSync(join(tmpdir(), "woo-commit-unicode-")); roots.push(root);
		execFileSync("git", ["init", "-q", root]); execFileSync("git", ["-C", root, "config", "user.name", "Woo Test"]); execFileSync("git", ["-C", root, "config", "user.email", "test@example.invalid"]);
		const tracked = "vault/01_프로젝트".normalize("NFD"), alias = "vault/01_프로젝트".normalize("NFC");
		mkdirSync(join(root, "vault"), { recursive: true }); writeFileSync(join(root, tracked), "tracked\n"); execFileSync("git", ["-C", root, "add", "--", tracked]); execFileSync("git", ["-C", root, "commit", "-qm", "base"]); rmSync(join(root, tracked));
		writeFileSync(join(root, alias), "ignored alias\n"); writeFileSync(join(root, ".gitignore"), "vault/\n");
		expect(changedPaths(root).map(path => path.normalize("NFC"))).toEqual([".gitignore", alias]);
	});
	test("후보 경로의 unstaged hunk와 추가 staged 파일을 차단한다", () => {
		const root = mkdtempSync(join(tmpdir(), "woo-commit-")); roots.push(root);
		execFileSync("git", ["init", "-q", root]); execFileSync("git", ["-C", root, "config", "user.name", "Woo Test"]); execFileSync("git", ["-C", root, "config", "user.email", "test@example.invalid"]);
		writeFileSync(join(root, "change.txt"), "base\n"); execFileSync("git", ["-C", root, "add", "change.txt"]); assertStagedBoundary(root, candidate());
		writeFileSync(join(root, "change.txt"), "after stage\n"); expect(() => assertStagedBoundary(root, candidate())).toThrow("COMMIT_PARTIAL_STAGE");
	});
	test("직접 commit을 막고 승인된 executor만 commit과 Receipt를 만든다", () => {
		const root = mkdtempSync(join(tmpdir(), "woo-commit-e2e-")); roots.push(root);
		for (const directory of ["src/core/commit", "src/adapters/outbound/git", "scripts", ".woo", ".githooks", ".www/runtime/commit"]) mkdirSync(join(root, directory), { recursive: true });
		const project = join(import.meta.dir, "..");
		for (const path of ["src/core/commit/commit-governance.ts", "src/adapters/outbound/git/git-commit-control.ts", "scripts/woo-commit.ts", ".woo/project.yaml", ".githooks/pre-commit", ".githooks/prepare-commit-msg", ".githooks/commit-msg", ".githooks/post-commit", ".githooks/pre-push"]) copyFileSync(join(project, path), join(root, path));
		execFileSync("chmod", ["+x", ...["pre-commit", "prepare-commit-msg", "commit-msg", "post-commit", "pre-push"].map(name => join(root, ".githooks", name))]);
		execFileSync("git", ["init", "-q", root]); execFileSync("git", ["-C", root, "config", "user.name", "Woo Test"]); execFileSync("git", ["-C", root, "config", "user.email", "test@example.invalid"]);
		writeFileSync(join(root, "base"), "base\n"); execFileSync("git", ["-C", root, "add", "base"]); execFileSync("git", ["-C", root, "commit", "-qm", "base"]); execFileSync("git", ["-C", root, "config", "core.hooksPath", ".githooks"]);
		writeFileSync(join(root, "change.txt"), "controlled\n"); execFileSync("git", ["-C", root, "add", "change.txt"]);
		expect(() => execFileSync("git", ["-C", root, "commit", "-m", "direct"], { stdio: "pipe" })).toThrow(); execFileSync("git", ["-C", root, "reset", "-q"]);
		const head = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
		const value = candidate({ baseHead: head, contentDigest: candidateContentDigest(root, ["change.txt"]) }); const candidatePath = join(root, ".www/runtime/commit/candidate.json"); writeFileSync(candidatePath, JSON.stringify(value));
		const authorizationPath = authorize(root, value, "Woo Test"); const result = executeCommit(root, candidatePath, authorizationPath, policy);
		expect(readFileSync(join(root, ".www/receipts/commit", `${result.sha}.json`), "utf8")).toContain(result.sha);
		const store = new CommitReceiptStore(root, join(root, "receipts.sqlite")); expect(store.rebuild().receipts).toBe(2); expect(store.query(result.sha)).not.toBeNull(); store.close();
		expect(execFileSync("git", ["-C", root, "show", "-s", "--format=%s", "HEAD"], { encoding: "utf8" }).trim()).toBe("승인된 변경만 커밋한다");
		execFileSync("git", ["-C", root, "config", "woo.receiptBaseline", result.sha]);
		writeFileSync(join(root, "bypass.txt"), "bypass\n"); execFileSync("git", ["-C", root, "add", "bypass.txt"]); execFileSync("git", ["-C", root, "-c", "core.hooksPath=/dev/null", "commit", "-m", "bypass"]);
		const bypass = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
		const hook = join(root, ".githooks/pre-push");
		const pushGate = process.platform === "win32"
			? spawnSync("sh", [hook], { cwd: root, input: `refs/heads/master ${bypass} refs/heads/master ${result.sha}\n`, encoding: "utf8" })
			: spawnSync(hook, [], { cwd: root, input: `refs/heads/master ${bypass} refs/heads/master ${result.sha}\n`, encoding: "utf8" });
		expect(pushGate.status).toBe(2); expect(pushGate.stderr).toContain("Receipt가 없습니다");
	}, 60_000);
	test("승인 뒤 후보 파일 내용이 바뀌면 stale로 차단한다", () => {
		const root = mkdtempSync(join(tmpdir(), "woo-commit-stale-")); roots.push(root);
		execFileSync("git", ["init", "-q", root]); execFileSync("git", ["-C", root, "config", "user.name", "Woo Test"]); execFileSync("git", ["-C", root, "config", "user.email", "test@example.invalid"]);
		writeFileSync(join(root, "base"), "base\n"); execFileSync("git", ["-C", root, "add", "base"]); execFileSync("git", ["-C", root, "-c", "core.hooksPath=/dev/null", "commit", "-qm", "base"]);
		writeFileSync(join(root, "change.txt"), "first\n"); const value = candidate({ baseHead: execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(), contentDigest: candidateContentDigest(root, ["change.txt"]) });
		writeFileSync(join(root, "change.txt"), "second\n"); expect(() => assertCandidateMatchesWorktree(root, value)).toThrow("COMMIT_AUTH_STALE");
	});
	test("rename의 삭제·추가 경로를 Candidate부터 Receipt까지 동일하게 보존한다", () => {
		const root = mkdtempSync(join(tmpdir(), "woo-commit-rename-")); roots.push(root);
		mkdirSync(join(root, ".www/runtime/commit"), { recursive: true });
		execFileSync("git", ["init", "-q", root]);
		execFileSync("git", ["-C", root, "config", "user.name", "Woo Test"]);
		execFileSync("git", ["-C", root, "config", "user.email", "test@example.invalid"]);
		writeFileSync(join(root, "before.txt"), "same content\n");
		execFileSync("git", ["-C", root, "add", "before.txt"]);
		execFileSync("git", ["-C", root, "commit", "-qm", "base"]);
		renameSync(join(root, "before.txt"), join(root, "after.txt"));
		const paths = ["after.txt", "before.txt"];
		const head = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
		const value = candidate({ baseHead: head, paths, contentDigest: candidateContentDigest(root, paths) });
		const candidatePath = join(root, ".www/runtime/commit/candidate.json");
		writeFileSync(candidatePath, JSON.stringify(value));
		const result = executeCommit(root, candidatePath, authorize(root, value, "Woo Test"), policy);
		const receipt = JSON.parse(readFileSync(result.receipt, "utf8")) as { result: { files: string[] } };
		expect(receipt.result.files).toEqual(paths);
		expect(execFileSync("git", ["-C", root, "diff-tree", "--no-renames", "--no-commit-id", "--name-only", "-r", result.sha], { encoding: "utf8" }).trim().split("\n").sort()).toEqual(paths);
	});
});
