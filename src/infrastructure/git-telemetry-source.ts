import { execFile } from "node:child_process";
import type { WorkbenchGitTelemetry, WorkbenchGitTelemetryReader } from "../application/ports/index.js";

export class GitTelemetrySource implements WorkbenchGitTelemetryReader {
	public read(cwd: string): Promise<WorkbenchGitTelemetry | null> {
		return new Promise(resolve => {
			execFile("git", ["status", "--short", "--branch"], { cwd, timeout: 2_000, maxBuffer: 256 * 1024 }, (error, stdout) => {
				resolve(error ? null : parseGitTelemetry(stdout));
			});
		});
	}
}

export function parseGitTelemetry(output: string): WorkbenchGitTelemetry | null {
	const lines = output.replace(/\r/gu, "").split("\n").filter(Boolean);
	const header = lines.find(line => line.startsWith("## "));
	if (!header) return null;
	const headerValue = header.slice(3).trim();
	const unborn = /^No commits yet on (.+)$/u.exec(headerValue);
	const rawBranch = unborn?.[1] ?? headerValue.split("...")[0]?.split(" [")[0]?.trim() ?? "";
	let staged = 0; let unstaged = 0; let untracked = 0;
	for (const line of lines) {
		if (line.startsWith("## ")) continue;
		const index = line[0] ?? " "; const worktree = line[1] ?? " ";
		if (index === "?" && worktree === "?") { untracked += 1; continue; }
		if (index !== " ") staged += 1;
		if (worktree !== " ") unstaged += 1;
	}
	return Object.freeze({ branch: rawBranch === "HEAD (no branch)" ? null : rawBranch || null, staged, unstaged, untracked });
}
