import { truncateToWidth, visibleWidth, wrapTextWithAnsi, type Component } from "@earendil-works/pi-tui";
import type { LinearDashboardIssue, LinearProjectDashboard } from "../../../../core/domain/work/linear-dashboard";
import { colors } from "../shell/theme";

function fit(text: string, width: number): string {
	if (width <= 0) return "";
	const clipped = truncateToWidth(text, width);
	return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

function relativeAge(value: string | null | undefined, now: Date): string {
	if (!value) return "—";
	const timestamp = Date.parse(value);
	if (!Number.isFinite(timestamp)) return "—";
	const minutes = Math.max(0, Math.floor((now.getTime() - timestamp) / 60_000));
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	return `${Math.floor(hours / 24)}d ago`;
}

function clock(value: string | null | undefined): string {
	if (!value) return "—";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "—";
	return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function isInProgress(issue: LinearDashboardIssue): boolean {
	return issue.statusType === "started"
		|| /(?:progress|started|running|doing|작업|진행)/iu.test(issue.status);
}

function section(title: string): string {
	return colors.warm(title);
}

function issueRows(issue: LinearDashboardIssue, marker: string, width: number, now: Date): string[] {
	const rows = [colors.accent(`${marker} ${issue.id}`)];
	rows.push(...wrapTextWithAnsi(`  ${issue.title}`, width));
	rows.push(colors.muted(`  ${issue.status} · ${relativeAge(issue.updatedAt, now)}`));
	return rows;
}

function updateRows(dashboard: LinearProjectDashboard, width: number): string[] {
	const update = dashboard.update;
	if (!update) return [colors.muted("  Project Update가 없습니다.")];
	const body = update.body.split(/\r?\n/u).map(line => line.trim()).filter(Boolean).slice(0, 8);
	const rows: string[] = [];
	for (const line of body) {
		const cleaned = line.replace(/^#{1,3}\s*/u, "");
		rows.push(...wrapTextWithAnsi(`  ${cleaned}`, width));
	}
	if (update.createdAt) rows.push(colors.muted(`  ${clock(update.createdAt)}`));
	return rows.length > 0 ? rows : [colors.muted("  Project Update가 없습니다.")];
}

/** First-screen project pulse. It is intentionally read-only and snapshot-backed. */
export class EntryDashboardView implements Component {
	public constructor(
		private readonly getDashboard: () => LinearProjectDashboard | undefined,
		private readonly now: () => Date = () => new Date(),
	) {}

	public invalidate(): void {}

	public render(width: number): string[] {
		const contentWidth = Math.max(1, width);
		const dashboard = this.getDashboard();
		const projectName = dashboard?.projectName ?? "Linear 프로젝트";
		const rows: string[] = [colors.secondary(`DASHBOARD · ${projectName}`)];
		if (!dashboard || dashboard.state === "loading") {
			rows.push(section("NOW"), colors.accent("연결 중"));
			rows.push(...wrapTextWithAnsi("열린 이슈·최신 Update·마일스톤을 가져오는 중입니다.", contentWidth));
			return rows;
		}
		if (dashboard.state === "unavailable") {
			rows.push(section("HEALTH"), colors.warning("! Linear Dashboard unavailable"));
			if (dashboard.error) rows.push(...wrapTextWithAnsi(`  ${dashboard.error}`, contentWidth));
			rows.push(...wrapTextWithAnsi(colors.muted("  조치 · .www/workbench.yaml의 연결과 Linear MCP 인증을 확인하세요."), contentWidth));
			return rows;
		}

		const issues = dashboard.issues;
		const current = issues.find(isInProgress) ?? issues[0];
		const next = issues.filter(issue => issue !== current).slice(0, 3);
		if (dashboard.state === "stale") {
			rows.push(colors.warning("갱신 실패 · 마지막 성공 값"));
			if (dashboard.error) rows.push(...wrapTextWithAnsi(`  실패 이유 · ${dashboard.error}`, contentWidth));
		}
		rows.push(section("NOW"));
		if (current) rows.push(...issueRows(current, "▶", contentWidth, this.now()));
		else rows.push(colors.muted("  현재 진행 중인 이슈가 없습니다."));

		rows.push(section("NEXT"));
		if (next.length > 0) {
			for (const issue of next) rows.push(...issueRows(issue, "○", contentWidth, this.now()));
		} else rows.push(colors.muted("  다음 작업이 없습니다."));

		rows.push(section("UPDATE"), ...updateRows(dashboard, contentWidth));
		rows.push(section("RECENT"));
		const recent = [...issues].filter(issue => issue.updatedAt).sort((left, right) => Date.parse(right.updatedAt!) - Date.parse(left.updatedAt!)).slice(0, 4);
		if (recent.length > 0) {
			for (const issue of recent) rows.push(...wrapTextWithAnsi(`${clock(issue.updatedAt)}  ${issue.id}  ${issue.title}`, contentWidth));
		} else rows.push(colors.muted("  최근 갱신 이슈가 없습니다."));

		rows.push(section("HEALTH"));
		const blocked = issues.filter(issue => /blocked|차단/iu.test(issue.status)).length;
		const stale = dashboard.state === "stale" ? 1 : 0;
		rows.push(`${blocked > 0 || stale > 0 ? colors.warning("!") : colors.success("✓")} ${colors.muted(`blocked ${blocked > 0 ? blocked : "—"} · stale ${stale}`)}`);
		rows.push(colors.muted(`synced ${clock(dashboard.fetchedAt)}`));
		return rows.flatMap(row => wrapTextWithAnsi(fit(row, contentWidth), contentWidth));
	}
}
