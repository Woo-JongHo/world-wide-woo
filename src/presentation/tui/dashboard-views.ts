import {
	Markdown,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
	type Component,
} from "@earendil-works/pi-tui";
import type { SessionSnapshot } from "../../application/session-runtime";
import type { RecentSessionSummary, UsageSnapshot } from "../../application/ports";
import type { Effort } from "../../domain/model-settings";
import { colors, gradientLines, markdownTheme, semantic } from "./theme";

export const EFFORT_LABEL: Record<Effort, string> = {
	low: "낮음",
	medium: "보통",
	high: "높음",
	ultra: "최고",
};

const LANDMARK = [
	" ╭─╮   ╭─╮   ╭─╮ ",
	"╭╯ ╰╮ ╭╯ ╰╮ ╭╯ ╰╮",
	"╯   ╰─╯   ╰─╯   ╰",
	"╰───────────────╯",
];
const ACTIVITY_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

function fit(text: string, width: number): string {
	if (width <= 0) return "";
	const clipped = truncateToWidth(text, width);
	return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

function center(text: string, width: number): string {
	const clipped = truncateToWidth(text, Math.max(0, width));
	return " ".repeat(Math.max(0, Math.floor((width - visibleWidth(clipped)) / 2))) + clipped;
}

export class StatusLine implements Component {
	private notice = "/ 명령 · /model 모델 · /usage 사용량 · Ctrl+C 두 번 또는 Ctrl+D 종료";
	setNotice(notice: string): void {
		this.notice = notice;
	}
	invalidate(): void {}
	render(width: number): string[] {
		return [colors.muted(fit(this.notice, width))];
	}
}

function compactReset(timestamp: number | undefined): string {
	if (!timestamp) return "";
	const remaining = timestamp - Date.now();
	if (remaining <= 0) return "~0m";
	const minutes = Math.max(1, Math.floor(remaining / 60_000));
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);
	if (days > 0) return `${days}d${hours % 24}h`;
	if (hours > 0) return `${hours}h${minutes % 60}m`;
	return `${minutes}m`;
}

function compactLimitLabel(label: string): string {
	return label
		.replace(/^5 hours?/iu, "5h")
		.replace(/^7 days?/iu, "7d")
		.replace(/\s+\(([^)]+)\)/u, "·$1");
}

function usageIssueLabel(snapshot: UsageSnapshot): string {
	if (!snapshot.issue) return "";
	const retry = snapshot.issue.retryAt ? compactReset(snapshot.issue.retryAt) : "";
	const suffix = retry ? `(${retry})` : "";
	if (snapshot.issue.kind === "rate-limit") return `요청 제한${suffix}`;
	if (snapshot.issue.kind === "authentication") return "인증 갱신 필요";
	if (snapshot.issue.kind === "network") return `네트워크 오류${suffix}`;
	return `Provider 오류${suffix}`;
}

export class UsageStripView implements Component {
	private snapshots: readonly UsageSnapshot[] = [
		{ provider: "openai-codex", state: "loading", fetchedAt: Date.now(), limits: [] },
		{ provider: "anthropic", state: "loading", fetchedAt: Date.now(), limits: [] },
	];

	update(snapshots: readonly UsageSnapshot[]): void {
		this.snapshots = snapshots;
	}
	invalidate(): void {}
	render(width: number): string[] {
		return ["openai-codex", "anthropic"].map((provider) => {
			const snapshot = this.snapshots.find((item) => item.provider === provider);
			const providerLabel = provider === "openai-codex" ? colors.highlight("Codex") : colors.warm("Claude");
			const label = snapshot?.stale ? `${providerLabel}${colors.warning("*")}` : providerLabel;
			if (!snapshot || snapshot.state === "loading") return fit(`${label}  ${colors.muted("확인 중…")}`, width);
			if (snapshot.state === "auth-required") return fit(`${label}  ${colors.warning("로그인 필요")} ${colors.muted(`(/login ${provider})`)}`, width);
			if (snapshot.state === "unsupported") return fit(`${label}  ${colors.muted("OAuth 사용량 미지원")}`, width);
			if (snapshot.state === "error") {
				const issue = usageIssueLabel(snapshot);
				return fit(`${label}  ${colors.error(issue || "조회 실패")} ${colors.muted("· 자동 재시도")}`, width);
			}
			const limits = snapshot.limits.slice(0, 4).map((limit) => {
				const remaining = limit.remainingPercent;
				if (remaining === undefined) return compactLimitLabel(limit.label);
				const color = remaining <= 10 ? colors.error : remaining <= 30 ? colors.warning : colors.success;
				const reset = compactReset(limit.resetsAt);
				return `${colors.muted(`${compactLimitLabel(limit.label)}:`)}${color(`${remaining.toFixed(0)}%남음`)}${reset ? colors.muted(`(${reset})`) : ""}`;
			});
			const issue = usageIssueLabel(snapshot);
			const issueSuffix = issue ? `${colors.muted(" · ")}${colors.warning(issue)}` : "";
			return fit(`${label}  ${limits.join(colors.muted(" · ")) || colors.muted("제한 정보 없음")}${issueSuffix}`, width);
		});
	}
}

export class RouterModelView implements Component {
	constructor(private readonly getSnapshot: () => SessionSnapshot) {}
	invalidate(): void {}
	render(width: number): string[] {
		const snapshot = this.getSnapshot();
		const auth = snapshot.auth?.configured
			? colors.success(`연결됨 · ${snapshot.auth.source ?? snapshot.settings.provider}`)
			: colors.warning("인증 설정 필요");
		const rows = [
			colors.secondary("활성 Router"),
			`  ${snapshot.settings.provider}`,
			`  ${snapshot.settings.model}`,
			`  추론 ${EFFORT_LABEL[snapshot.settings.effort]}`,
			`  ${auth}`,
			"",
			"  /model  Router · 모델 설정",
			"  /login  로그인 · 계정",
		];
		return rows.flatMap((row) => wrapTextWithAnsi(row, Math.max(1, width)));
	}
}

export class SessionFlowView implements Component {
	constructor(
		private readonly recentSessions: readonly RecentSessionSummary[],
		private readonly cwd: () => string,
	) {}
	invalidate(): void {}
	render(width: number): string[] {
		const rows = [
			colors.secondary("작업 위치"),
			`  ${this.cwd()}`,
			"",
			colors.secondary("명령"),
			"  /usage   사용량 즉시 갱신",
			"  /status  Router · 세션 상태",
			"  /commits Git 작업 트리",
			"  /issues  GitHub Issue",
			"  /help    전체 Shell 명령",
			"  /exit    안전하게 종료",
		];
		if (this.recentSessions.length > 0) {
			rows.push("", colors.secondary("최근 세션"));
			for (const session of this.recentSessions.slice(0, 3)) rows.push(`  ${session.id.slice(0, 12)}`);
		}
		return rows.flatMap((row) => wrapTextWithAnsi(row, Math.max(1, width)));
	}
}

export class TranscriptView implements Component {
	private snapshot: SessionSnapshot;
	private readonly markdownByTurn = new Map<string, Markdown>();
	private readonly draft = new Markdown("", 0, 0, markdownTheme);

	constructor(initial: SessionSnapshot) {
		this.snapshot = initial;
		this.update(initial);
	}

	update(snapshot: SessionSnapshot): void {
		this.snapshot = snapshot;
		for (const turn of snapshot.turns) {
			if (turn.role === "assistant" && !this.markdownByTurn.has(turn.id)) {
				this.markdownByTurn.set(turn.id, new Markdown(turn.content, 0, 0, markdownTheme));
			}
		}
		this.draft.setText(snapshot.draft);
	}

	invalidate(): void {
		for (const markdown of this.markdownByTurn.values()) markdown.invalidate();
		this.draft.invalidate();
	}

	render(width: number): string[] {
		if (this.snapshot.turns.length === 0) return this.renderWelcome(width);
		const contentWidth = Math.max(1, width);
		const rows: string[] = [];
		for (const turn of this.snapshot.turns) {
			if (turn.role === "user") {
				rows.push(semantic.userLabel("사용자"));
				rows.push(...wrapTextWithAnsi(turn.content, contentWidth), "");
				continue;
			}
			rows.push(turn.outcome === "cancelled"
				? `${semantic.assistantLabel("WWW")}  ${semantic.toolCancelled("중단됨")}`
				: semantic.assistantLabel("WWW"));
			const markdown = this.markdownByTurn.get(turn.id);
			if (markdown) rows.push(...markdown.render(contentWidth));
			rows.push("");
		}
		if (this.snapshot.phase === "streaming") {
			const frame = ACTIVITY_FRAMES[Math.floor(performance.now() / 80) % ACTIVITY_FRAMES.length];
			const activity = this.snapshot.activity?.label ?? "응답 준비 중";
			rows.push(`${semantic.assistantLabel("WWW")}  ${semantic.toolRunning(`${frame} ${activity}`)}`);
			rows.push(...(this.snapshot.draft ? this.draft.render(contentWidth) : [colors.muted("응답을 준비하는 중…")]), "");
		}
		if (this.snapshot.error) {
			rows.push(colors.error("오류"));
			rows.push(...wrapTextWithAnsi(this.snapshot.error, contentWidth).map(colors.error), "");
		}
		return rows;
	}

	private pill(text: string, color: (value: string) => string): string {
		return `${colors.border("[")} ${color(text)} ${colors.border("]")}`;
	}

	private renderWelcome(width: number): string[] {
		const settings = this.snapshot.settings;
		const auth = this.snapshot.auth;
		const authConfigured = auth?.configured ?? false;
		const authPill = this.pill(
			authConfigured ? `인증됨 · ${auth?.source ?? settings.provider}` : "인증 필요",
			authConfigured ? colors.success : colors.warning,
		);
		const modelPill = this.pill(`${settings.provider} · ${settings.model}`, colors.highlight);
		const effortPill = this.pill(`추론 ${EFFORT_LABEL[settings.effort]}`, colors.secondary);
		const rows: string[] = [""];
		if (width >= 21) rows.push(...gradientLines(LANDMARK).map((line) => center(line, width)), "");
		rows.push(
			center(colors.accent("WWW · World Wide Woo"), width),
			center(colors.muted("전 세계 어디서나 에이전트를 지켜보고 함께 판단하는 WES 콘솔"), width),
			"",
			center(modelPill, width),
			center(effortPill, width),
			center(authPill, width),
			"",
		);
		if (!authConfigured) rows.push(center(colors.muted(`/login ${settings.provider}`), width));
		rows.push(center(colors.muted("아래 입력창에서 대화를 시작하세요."), width));
		return rows;
	}
}
