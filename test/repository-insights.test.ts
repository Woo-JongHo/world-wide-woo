import { describe, expect, test } from "bun:test";
import {
	GitHubRepositoryInsights,
	type RepositoryCommandRunner,
} from "../src/infrastructure/repository-insights";

const commit = "a".repeat(40);

type Invocation = { command: "git" | "gh"; args: readonly string[]; cwd: string; timeoutMs: number };

function runner(...results: Array<{ exitCode?: number; stdout?: string; stderr?: string }>): { run: RepositoryCommandRunner; calls: Invocation[] } {
	const calls: Invocation[] = [];
	return {
		calls,
		run: async (command, args, options) => {
			calls.push({ command, args, ...options });
			const result = results.shift();
			if (!result) throw new Error("unexpected command");
			return { exitCode: result.exitCode ?? 0, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
		},
	};
}

describe("repository insights", () => {
	test("reads a dirty branch with upstream counts and display-safe Unicode paths", async () => {
		const mock = runner(
			{ stdout: "/repo\n" },
			{ stdout: "feature/한글\n" },
			{ stdout: "M  staged.ts\0 M unstaged.ts\0?? 새 파일.ts\0 D deleted.ts\0R  renamed.ts\0old-name.ts\0" },
			{ stdout: "origin/feature/한글\n" },
			{ stdout: "3\t2\n" },
			{ stdout: `${commit}\x1f${commit.slice(0, 7)}\x1flatest\x1fAda\x1f${"2026-08-31T00:00:00Z"}\0` },
		);
		const insights = new GitHubRepositoryInsights("/start", mock.run, 1234);

		expect(await insights.snapshot()).toEqual({
			root: "/repo",
			branch: "feature/한글",
			upstream: "origin/feature/한글",
			ahead: 3,
			behind: 2,
			changedFiles: [
				{ path: "staged.ts", kind: "modified", staged: true, unstaged: false, untracked: false },
				{ path: "unstaged.ts", kind: "modified", staged: false, unstaged: true, untracked: false },
				{ path: "새 파일.ts", kind: "untracked", staged: false, unstaged: false, untracked: true },
				{ path: "deleted.ts", kind: "deleted", staged: false, unstaged: true, untracked: false },
				{ path: "renamed.ts", previousPath: "old-name.ts", kind: "renamed", staged: true, unstaged: false, untracked: false },
			],
			head: { id: commit, shortId: commit.slice(0, 7), subject: "latest", author: "Ada", authoredAt: "2026-08-31T00:00:00Z" },
		});
		expect(mock.calls.every(call => call.cwd === "/repo" || call.cwd === "/start")).toBe(true);
		expect(mock.calls[2]!.args).toEqual(["-c", "core.quotepath=false", "status", "--porcelain=v1", "-z"]);
		expect(mock.calls.every(call => call.timeoutMs === 1234)).toBe(true);
	});

	test("supports clean repositories without an upstream", async () => {
		const mock = runner({ stdout: "/repo\n" }, { stdout: "main\n" }, { stdout: "" }, { exitCode: 128, stderr: "no upstream" }, { stdout: "" });
		const snapshot = await new GitHubRepositoryInsights("/repo", mock.run).snapshot();
		expect(snapshot).toMatchObject({ root: "/repo", branch: "main", ahead: 0, behind: 0, changedFiles: [] });
		expect(snapshot.upstream).toBeUndefined();
		expect(snapshot.head).toBeUndefined();
	});

	test("parses delimiter-safe commits and clamps command limits", async () => {
		const mock = runner({ stdout: `${commit}\x1fabc1234\x1fsubject with | delimiter\x1fAda\x1f${"2026-08-31T00:00:00Z"}\0` });
		const commits = await new GitHubRepositoryInsights("/repo", mock.run).recentCommits(999);
		expect(commits).toEqual([{ id: commit, shortId: "abc1234", subject: "subject with | delimiter", author: "Ada", authoredAt: "2026-08-31T00:00:00Z" }]);
		expect(mock.calls[0]!.args).toContain("-n100");
	});

	test("reads open issue labels from the current repository", async () => {
		const mock = runner({ stdout: JSON.stringify([{ number: 7, title: "Bug", state: "OPEN", labels: [{ name: "bug" }, { name: "priority" }], updatedAt: "2026-08-31T00:00:00Z", url: "https://github.com/acme/repo/issues/7" }]) });
		const issues = await new GitHubRepositoryInsights("/repo", mock.run).issues("open", 3);
		expect(issues).toEqual([{ number: 7, title: "Bug", state: "open", labels: ["bug", "priority"], updatedAt: "2026-08-31T00:00:00Z", url: "https://github.com/acme/repo/issues/7" }]);
		expect(mock.calls[0]).toMatchObject({ command: "gh", cwd: "/repo" });
		expect(mock.calls[0]!.args).toEqual(["issue", "list", "--state", "open", "--limit", "3", "--json", "number,title,state,labels,updatedAt,url"]);
	});

	test("returns bounded, redacted command errors without raw output", async () => {
		const git = runner({ exitCode: 1, stderr: `fatal: token=secret-${"x".repeat(500)}` });
		await expect(new GitHubRepositoryInsights("/repo", git.run).recentCommits()).rejects.toThrow("token=[redacted]");
		const gh = runner({ exitCode: 1, stderr: "authorization: bearer ghp_secret" });
		await expect(new GitHubRepositoryInsights("/repo", gh.run).issues()).rejects.toThrow("authorization=[redacted]");
	});
});
