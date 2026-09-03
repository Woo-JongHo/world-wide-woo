import { truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";
import type { WorkbenchGitTelemetry, WorkbenchGitTelemetryReader } from "../../application/ports/index.js";
import type { WorkbenchContextUsage, WorkbenchSessionUsage, WorkbenchSnapshot } from "../../domain/workbench";
import { colors } from "./theme";

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

export class WorkbenchTelemetryLine implements Component {
	private git: WorkbenchGitTelemetry | null = null;
	private refreshing = false;
	private disposed = false;

	constructor(
		private readonly snapshot: () => WorkbenchSnapshot,
		private readonly cwd: string,
		private readonly requestRender: () => void,
		private readonly gitSource?: WorkbenchGitTelemetryReader,
		private readonly home = "",
	) {}

	refresh(): void {
		if (this.disposed || this.refreshing) return;
		this.refreshing = true;
		void (this.gitSource?.read(this.cwd) ?? Promise.resolve(null)).then(git => {
			this.refreshing = false;
			if (this.disposed) return;
			this.git = git;
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
			home: this.home,
		};
		const line = formatWorkbenchTelemetry(source, width);
		return [line + " ".repeat(Math.max(0, width - visibleWidth(line)))];
	}
}
