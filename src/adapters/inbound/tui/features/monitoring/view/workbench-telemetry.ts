import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { Component }                from "@earendil-works/pi-tui";
import type {
	WorkbenchGitTelemetry,
	WorkbenchGitTelemetryReader,
} from "@/core/ports/observability/workbench-git-telemetry-port";
import { colors }                        from "@/adapters/inbound/tui/foundation/theme/theme";

export { workbenchModelLabel } from "@/adapters/inbound/tui/foundation/labels";
import { workbenchModelLabel } from "@/adapters/inbound/tui/foundation/labels";

export interface WorkbenchTelemetrySource {
	readonly git  : WorkbenchGitTelemetry | null ;
	readonly cwd  : string                       ;
	readonly home : string                       ;
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
	private git: WorkbenchGitTelemetry | null = null  ;
	private refreshing                        = false ;
	private disposed                          = false ;

	constructor(
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
		const source = {
			git  : this.git,
			cwd  : this.cwd,
			home : this.home,
		};
		const line = formatWorkbenchTelemetry(source, width);
		return [line + " ".repeat(Math.max(0, width - visibleWidth(line)))];
	}
}
