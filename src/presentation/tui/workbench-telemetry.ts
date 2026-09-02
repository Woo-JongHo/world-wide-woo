import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";
import type { WorkbenchContextUsage, WorkbenchSessionUsage, WorkbenchSnapshot } from "../../domain/workbench";
import { usagePercent } from "./usage-value";
import { colors } from "./theme";

export interface WorkbenchGitTelemetry {
	readonly branch: string | null;
	readonly staged: number;
	readonly unstaged: number;
	readonly untracked: number;
}

export interface WorkbenchTelemetrySource {
	readonly model?: string;
	readonly effort?: string | null;
	readonly contextUsage?: WorkbenchContextUsage | null;
	readonly sessionUsage?: WorkbenchSessionUsage;
	readonly git: WorkbenchGitTelemetry | null;
	readonly cwd: string;
	readonly home: string;
}

export function workbenchModelLabel(model: string | undefined): string {
	if (!model) return "–";
	return model.split("-").map((part, index) => {
		if (index === 0) return part.toUpperCase();
		return /^[a-z]/u.test(part) ? `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}` : part;
	}).join("-");
}

function projectPath(cwd: string, home: string): string {
	if (cwd === home) return "~";
	if (cwd.startsWith(`${home}/`) || cwd.startsWith(`${home}\\`)) return `~${cwd.slice(home.length)}`;
	return cwd;
}

function gitLabel(git: WorkbenchGitTelemetry | null): string {
	if (!git) return "–";
	const changes = [
		git.staged > 0 ? `+${git.staged}` : "",
		git.unstaged > 0 ? `*${git.unstaged}` : "",
		git.untracked > 0 ? `?${git.untracked}` : "",
	].filter(Boolean).join(" ");
	return `${git.branch ?? "HEAD"}${changes ? ` ${changes}` : ""}`;
}

/** One-line operational telemetry. Unknown Native values are never guessed. */
export function formatWorkbenchTelemetry(source: WorkbenchTelemetrySource, width: number): string {
	const output = [
		`${colors.warm("⑂")} ${colors.text(gitLabel(source.git))}`,
		`${colors.muted("📁")} ${colors.muted(projectPath(source.cwd, source.home))}`,
	].join(colors.muted(" · "));
	return truncateToWidth(output, Math.max(0, width));
}

export function formatWorkbenchSessionTelemetry(source: WorkbenchTelemetrySource, width: number): string {
	const remaining = source.contextUsage ? Math.max(0, 100 - source.contextUsage.percent) : undefined;
	const contextColor = remaining === undefined ? colors.muted
		: remaining <= 10 ? colors.error : remaining <= 30 ? colors.warning : colors.highlight;
	const output = `${colors.muted("Context")} ${contextColor(usagePercent(remaining))}`;
	return truncateToWidth(output, Math.max(0, width));
}

export function parseGitTelemetry(output: string): WorkbenchGitTelemetry | null {
	const lines = output.replace(/\r/gu, "").split("\n").filter(Boolean);
	const header = lines.find((line) => line.startsWith("## "));
	if (!header) return null;
	const headerValue = header.slice(3).trim();
	const unborn = /^No commits yet on (.+)$/u.exec(headerValue);
	const rawBranch = unborn?.[1] ?? headerValue.split("...")[0]?.split(" [")[0]?.trim() ?? "";
	let staged = 0;
	let unstaged = 0;
	let untracked = 0;
	for (const line of lines) {
		if (line.startsWith("## ")) continue;
		const index = line[0] ?? " ";
		const worktree = line[1] ?? " ";
		if (index === "?" && worktree === "?") {
			untracked += 1;
			continue;
		}
		if (index !== " ") staged += 1;
		if (worktree !== " ") unstaged += 1;
	}
	return Object.freeze({
		branch: rawBranch === "HEAD (no branch)" ? null : rawBranch || null,
		staged,
		unstaged,
		untracked,
	});
}

export class WorkbenchTelemetryLine implements Component {
	private git: WorkbenchGitTelemetry | null = null;
	private refreshing = false;
	private disposed = false;

	constructor(
		private readonly snapshot: () => WorkbenchSnapshot,
		private readonly cwd: string,
		private readonly requestRender: () => void,
	) {}

	refresh(): void {
		if (this.disposed || this.refreshing) return;
		this.refreshing = true;
		execFile("git", ["status", "--short", "--branch"], {
			cwd: this.cwd,
			timeout: 2_000,
			maxBuffer: 256 * 1024,
		}, (error, stdout) => {
			this.refreshing = false;
			if (this.disposed) return;
			this.git = error ? null : parseGitTelemetry(stdout);
			this.requestRender();
		});
	}

	dispose(): void {
		this.disposed = true;
	}

	invalidate(): void {}

	render(width: number): string[] {
		const snapshot = this.snapshot();
		const source = {
			model: snapshot.model,
			effort: snapshot.effort,
			contextUsage: snapshot.contextUsage,
			sessionUsage: snapshot.sessionUsage,
			git: this.git,
			cwd: this.cwd,
			home: homedir(),
		};
		return [formatWorkbenchTelemetry(source, width), formatWorkbenchSessionTelemetry(source, width)]
			.map((line) => line + " ".repeat(Math.max(0, width - visibleWidth(line))));
	}
}
