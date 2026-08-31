import { Key, matchesKey, wrapTextWithAnsi, type Component } from "@earendil-works/pi-tui";
import type { RepositoryInsights } from "../../application/ports";
import type { CommitSummary, IssueSummary, RepositorySnapshot } from "../../domain/repository";
import { colors } from "./theme";

type RepositoryPanelState =
	| { status: "loading" }
	| { status: "error"; message: string }
	| { status: "ready"; snapshot: RepositorySnapshot; commits: readonly CommitSummary[] };

type IssuePanelState =
	| { status: "loading" }
	| { status: "error"; message: string }
	| { status: "ready"; issues: readonly IssueSummary[] };

function message(error: unknown): string {
	return error instanceof Error ? error.message : "조회에 실패했습니다.";
}

function shortDate(value: string): string {
	const date = new Date(value);
	return Number.isFinite(date.getTime()) ? date.toLocaleDateString("ko-KR") : value;
}

function wrapRows(rows: readonly string[], width: number): string[] {
	return rows.flatMap(row => row ? wrapTextWithAnsi(row, Math.max(1, width)) : [""]);
}

function changeMarker(change: RepositorySnapshot["changedFiles"][number]): string {
	if (change.untracked) return "?";
	if (change.staged && change.unstaged) return "±";
	if (change.staged) return "+";
	return "~";
}

export class RepositoryActivityOverlay implements Component {
	private state: RepositoryPanelState = { status: "loading" };
	private request = 0;

	constructor(
		private readonly repository: RepositoryInsights,
		private readonly onUpdate: () => void,
		private readonly onClose: () => void,
	) {}

	start(): void {
		const request = ++this.request;
		this.state = { status: "loading" };
		this.onUpdate();
		void Promise.all([this.repository.snapshot(), this.repository.recentCommits(8)]).then(
			([snapshot, commits]) => {
				if (request === this.request) this.state = { status: "ready", snapshot, commits };
			},
			(error) => {
				if (request === this.request) this.state = { status: "error", message: message(error) };
			},
		).finally(this.onUpdate);
	}

	invalidate(): void {}

	render(width: number): string[] {
		const rows = [colors.accent("Commit · 작업 트리"), colors.muted("r 새로고침 · Esc 닫기"), ""];
		if (this.state.status === "loading") rows.push(colors.muted("Git 상태를 읽는 중…"));
		if (this.state.status === "error") rows.push(colors.error(this.state.message));
		if (this.state.status === "ready") {
			const { snapshot, commits } = this.state;
			const tracking = snapshot.upstream
				? `${snapshot.upstream} ${colors.success(`↑${snapshot.ahead}`)} ${colors.warning(`↓${snapshot.behind}`)}`
				: colors.muted("upstream 없음");
			rows.push(`${colors.secondary(snapshot.branch)} · ${tracking}`);
			if (snapshot.head) rows.push(`${colors.muted(snapshot.head.shortId)} ${snapshot.head.subject}`);
			rows.push("", colors.warm(`변경 ${snapshot.changedFiles.length}`));
			if (snapshot.changedFiles.length === 0) rows.push(colors.success("  작업 트리 깨끗함"));
			for (const change of snapshot.changedFiles.slice(0, 8)) {
				const path = change.previousPath ? `${change.previousPath} → ${change.path}` : change.path;
				rows.push(`  ${colors.warning(changeMarker(change))} ${path}`);
			}
			if (snapshot.changedFiles.length > 8) rows.push(colors.muted(`  … ${snapshot.changedFiles.length - 8}개 더 있음`));
			rows.push("", colors.warm("최근 Commit"));
			for (const commit of commits) rows.push(`  ${colors.muted(commit.shortId)} ${commit.subject}`);
			if (commits.length === 0) rows.push(colors.muted("  commit 없음"));
		}
		return wrapRows(rows, width);
	}

	handleInput(data: string): void {
		if (matchesKey(data, Key.escape)) return this.onClose();
		if (data.toLowerCase() === "r") this.start();
	}
}

export class IssueListOverlay implements Component {
	private state: IssuePanelState = { status: "loading" };
	private request = 0;

	constructor(
		private readonly repository: RepositoryInsights,
		private readonly onUpdate: () => void,
		private readonly onClose: () => void,
	) {}

	start(): void {
		const request = ++this.request;
		this.state = { status: "loading" };
		this.onUpdate();
		void this.repository.issues("open", 12).then(
			(issues) => {
				if (request === this.request) this.state = { status: "ready", issues };
			},
			(error) => {
				if (request === this.request) this.state = { status: "error", message: message(error) };
			},
		).finally(this.onUpdate);
	}

	invalidate(): void {}

	render(width: number): string[] {
		const rows = [colors.accent("GitHub Issues · Open"), colors.muted("r 새로고침 · Esc 닫기"), ""];
		if (this.state.status === "loading") rows.push(colors.muted("Issue를 읽는 중…"));
		if (this.state.status === "error") rows.push(colors.error(this.state.message));
		if (this.state.status === "ready") {
			if (this.state.issues.length === 0) rows.push(colors.success("열린 Issue 없음"));
			for (const issue of this.state.issues) {
				const labels = issue.labels.length ? colors.muted(` [${issue.labels.join(", ")}]`) : "";
				rows.push(`${colors.secondary(`#${issue.number}`)} ${issue.title}${labels}`);
				rows.push(colors.muted(`   ${shortDate(issue.updatedAt)}`));
			}
		}
		return wrapRows(rows, width);
	}

	handleInput(data: string): void {
		if (matchesKey(data, Key.escape)) return this.onClose();
		if (data.toLowerCase() === "r") this.start();
	}
}
