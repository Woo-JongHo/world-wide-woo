import type { RepositoryInsights } from "../application/ports";
import type {
	ChangedFile,
	ChangedFileKind,
	CommitSummary,
	IssueState,
	IssueSummary,
	RepositorySnapshot,
} from "../domain/repository";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const STDERR_LIMIT = 240;

type CommandResult = {
	exitCode: number;
	stdout: string;
	stderr: string;
};

export type RepositoryCommandRunner = (
	command: "git" | "gh",
	args: readonly string[],
	options: { cwd: string; timeoutMs: number },
) => Promise<CommandResult>;

export class RepositoryInsightsError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "RepositoryInsightsError";
	}
}

function limit(value: number | undefined): number {
	if (!Number.isFinite(value)) return DEFAULT_LIMIT;
	return Math.max(1, Math.min(MAX_LIMIT, Math.floor(value!)));
}

function safeStderr(stderr: string): string {
	const compact = stderr.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
	const redacted = compact
		.replace(/\b(authorization|token|password|secret)\s*[:=]\s*\S+/gi, "$1=[redacted]")
		.replace(/\b(?:bearer\s+)\S+/gi, "Bearer [redacted]")
		.replace(/\b(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+)\b/g, "[redacted]");
	return redacted.slice(0, STDERR_LIMIT);
}

function commandFailure(command: string, result: CommandResult): RepositoryInsightsError {
	const suffix = safeStderr(result.stderr);
	return new RepositoryInsightsError(`${command} failed${suffix ? `: ${suffix}` : ""}`);
}

async function systemRunner(
	command: "git" | "gh",
	args: readonly string[],
	options: { cwd: string; timeoutMs: number },
): Promise<CommandResult> {
	const process = Bun.spawn([command, ...args], {
		cwd: options.cwd,
		stdout: "pipe",
		stderr: "pipe",
	});
	let timedOut = false;
	const timer = setTimeout(() => {
		timedOut = true;
		process.kill();
	}, options.timeoutMs);
	try {
		const [exitCode, stdout, stderr] = await Promise.all([
			process.exited,
			new Response(process.stdout).text(),
			new Response(process.stderr).text(),
		]);
		if (timedOut) throw new RepositoryInsightsError(`${command} command timed out`);
		return { exitCode, stdout, stderr };
	} finally {
		clearTimeout(timer);
	}
}

function fileKind(index: string, worktree: string): ChangedFileKind {
	const status = `${index}${worktree}`;
	if (status === "??") return "untracked";
	if (index === "R" || worktree === "R") return "renamed";
	if (index === "D" || worktree === "D") return "deleted";
	if (index === "A" || worktree === "A") return "added";
	return "modified";
}

/** Parses porcelain v1 -z output, where rename records are path followed by old path. */
export function parseChangedFiles(output: string): ChangedFile[] {
	const fields = output.split("\0");
	const files: ChangedFile[] = [];
	for (let index = 0; index < fields.length - 1; index += 1) {
		const entry = fields[index]!;
		if (entry.length < 4 || entry[2] !== " ") continue;
		const indexStatus = entry[0]!;
		const worktreeStatus = entry[1]!;
		const renamed = indexStatus === "R" || worktreeStatus === "R" || indexStatus === "C" || worktreeStatus === "C";
		const file: ChangedFile = {
			path: entry.slice(3),
			kind: fileKind(indexStatus, worktreeStatus),
			staged: indexStatus !== " " && indexStatus !== "?",
			unstaged: worktreeStatus !== " " && worktreeStatus !== "?",
			untracked: indexStatus === "?" && worktreeStatus === "?",
		};
		if (renamed && index + 1 < fields.length) file.previousPath = fields[++index]!;
		files.push(file);
	}
	return files;
}

function parseCommits(output: string): CommitSummary[] {
	return output.split("\0").flatMap((record): CommitSummary[] => {
		if (!record) return [];
		const [id, shortId, subject, author, authoredAt] = record.split("\x1f");
		if (!id || !shortId || subject === undefined || author === undefined || !authoredAt) return [];
		return [{ id, shortId, subject, author, authoredAt }];
	});
}

function parseIssues(output: string): IssueSummary[] {
	const parsed: unknown = JSON.parse(output);
	if (!Array.isArray(parsed)) throw new RepositoryInsightsError("gh returned invalid issue data");
	return parsed.flatMap((issue): IssueSummary[] => {
		if (!issue || typeof issue !== "object") return [];
		const value = issue as Record<string, unknown>;
		if (
			typeof value.number !== "number" || typeof value.title !== "string" ||
			(value.state !== "OPEN" && value.state !== "CLOSED") || typeof value.updatedAt !== "string" || typeof value.url !== "string"
		) return [];
		const labels = Array.isArray(value.labels)
			? value.labels.flatMap(label => label && typeof label === "object" && typeof (label as Record<string, unknown>).name === "string"
				? [(label as Record<string, string>).name] : [])
			: [];
		return [{ number: value.number, title: value.title, state: value.state.toLowerCase() as IssueState, labels, updatedAt: value.updatedAt, url: value.url }];
	});
}

/** Read-only Git and GitHub CLI adapter. It never invokes a shell or exposes command output directly. */
export class GitHubRepositoryInsights implements RepositoryInsights {
	constructor(
		private readonly workingDirectory: string,
		private readonly runner: RepositoryCommandRunner = systemRunner,
		private readonly timeoutMs = 10_000,
	) {}

	async snapshot(): Promise<RepositorySnapshot> {
		const root = (await this.git(this.workingDirectory, ["rev-parse", "--show-toplevel"])).trim();
		const branch = (await this.git(root, ["branch", "--show-current"])).trim();
		const changedFiles = parseChangedFiles(await this.git(root, ["-c", "core.quotepath=false", "status", "--porcelain=v1", "-z"]));
		const upstream = await this.optionalGit(root, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]);
		const counts = upstream ? (await this.git(root, ["rev-list", "--left-right", "--count", `HEAD...${upstream.trim()}`])).trim().split(/\s+/) : [];
		const head = await this.optionalGit(root, ["log", "-1", "--format=%H%x1f%h%x1f%s%x1f%an%x1f%aI", "-z"]);
		return {
			root,
			branch,
			upstream: upstream?.trim() || undefined,
			ahead: Number.parseInt(counts[0] ?? "0", 10) || 0,
			behind: Number.parseInt(counts[1] ?? "0", 10) || 0,
			changedFiles,
			head: head ? parseCommits(head)[0] : undefined,
		};
	}

	async recentCommits(requestedLimit?: number): Promise<readonly CommitSummary[]> {
		const output = await this.git(this.workingDirectory, ["log", `-n${limit(requestedLimit)}`, "--format=%H%x1f%h%x1f%s%x1f%an%x1f%aI", "-z"]);
		return parseCommits(output);
	}

	async issues(state: IssueState = "open", requestedLimit?: number): Promise<readonly IssueSummary[]> {
		const output = (await this.command("gh", this.workingDirectory, ["issue", "list", "--state", state, "--limit", String(limit(requestedLimit)), "--json", "number,title,state,labels,updatedAt,url"])).stdout;
		return parseIssues(output);
	}

	private async git(cwd: string, args: readonly string[]): Promise<string> {
		return (await this.command("git", cwd, args)).stdout;
	}

	private async optionalGit(cwd: string, args: readonly string[]): Promise<string | undefined> {
		const result = await this.runner("git", args, { cwd, timeoutMs: this.timeoutMs });
		return result.exitCode === 0 ? result.stdout : undefined;
	}

	private async command(command: "git" | "gh", cwd: string, args: readonly string[]): Promise<CommandResult> {
		let result: CommandResult;
		try {
			result = await this.runner(command, args, { cwd, timeoutMs: this.timeoutMs });
		} catch (error) {
			if (error instanceof RepositoryInsightsError) throw error;
			throw new RepositoryInsightsError(`${command} command failed`);
		}
		if (result.exitCode !== 0) throw commandFailure(command, result);
		return result;
	}
}
