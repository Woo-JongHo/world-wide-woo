import {
	Markdown,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
	type Component,
} from "@earendil-works/pi-tui";
import type { SessionSnapshot } from "../../application/session-runtime";
import type { UsageSnapshot } from "../../application/ports";
import type { Effort } from "../../domain/model-settings";
import { todoDetailProgress, todoProgress, type TodoDocument, type TodoItem } from "../../domain/todos";
import { BashResultCard, GenericToolResultCard } from "./result-cards";
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

function surfaceRows(rows: readonly string[], width: number, surface: (text: string) => string): string[] {
	return rows.map(row => surface(fit(row, width)));
}

export class StatusLine implements Component {
	private notice = "/ 명령 · ! 터미널 · /model 모델 · /usage 사용량 · Ctrl+C 두 번 또는 Ctrl+D 종료";
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

export class WorkspaceTodoView implements Component {
	constructor(private readonly todo: () => TodoDocument | null) {}
	invalidate(): void {}
	render(width: number): string[] {
		return this.renderTodo(width).flatMap((row) => wrapTextWithAnsi(row, Math.max(1, width)));
	}

	private renderTodo(width: number): string[] {
		const document = this.todo();
		if (!document || document.items.length === 0) return [
			colors.secondary("TODO 0/0"),
			"  진행 중인 작업 없음",
		];

		const progress = todoProgress(document);
		const detailProgress = todoDetailProgress(document);
		const progressLabel = detailProgress.total > 0
			? `TODO ${progress.completed}/${progress.total} · 세부 ${detailProgress.completed}/${detailProgress.total}`
			: `TODO ${progress.completed}/${progress.total}`;
		const items = width < 42
			? [document.items.find(item => item.status === "in_progress")
				?? document.items.find(item => item.status === "pending")
				?? document.items.find(item => item.status === "blocked")].filter(
				(item): item is TodoItem => item !== undefined,
			)
			: document.items.slice(0, 12);
		const rows = [
			colors.secondary(progressLabel),
			colors.highlight(`  ${document.storyId ? `${document.storyId} · ` : ""}${document.title}`),
		];
		for (const item of items) {
			const parentDetailProgress = item.details.length > 0
				? ` (${item.details.filter(detail => detail.status === "completed").length}/${item.details.length})`
				: "";
			rows.push(`  ${todoMarker(item.status)} ${item.content}${parentDetailProgress}`);
			const details = width < 42
				? [item.details.find(detail => detail.status === "in_progress")
					?? item.details.find(detail => detail.status === "pending")
					?? item.details.find(detail => detail.status === "blocked")].filter(
					(detail): detail is TodoItem["details"][number] => detail !== undefined,
				)
				: item.details;
			for (const [index, detail] of details.entries()) {
				const branch = index === details.length - 1 ? "└" : "├";
				rows.push(`      ${branch} ${todoMarker(detail.status)} ${detail.content}`);
			}
		}
		return rows;
	}
}

function todoMarker(status: TodoItem["status"]): string {
	if (status === "in_progress") return "[•]";
	if (status === "completed") return "[x]";
	if (status === "blocked") return "[!]";
	return "[ ]";
}

function transcriptProjectionKey(snapshot: SessionSnapshot): string {
	const lastTurn = snapshot.turns.at(-1);
	const lastNarration = snapshot.narrations.at(-1);
	const tools = snapshot.tools.map(tool => {
		const outputLength = "shell" in tool
			? tool.stdout.length + tool.stderr.length
			: tool.output.length + (tool.error?.length ?? 0);
		return `${tool.id}:${tool.status}:${tool.durationMs ?? ""}:${outputLength}`;
	}).join(",");
	return [
		snapshot.turns.length,
		lastTurn?.id ?? "",
		lastTurn?.content.length ?? 0,
		lastTurn?.outcome ?? "",
		snapshot.tools.length,
		tools,
		snapshot.narrations.length,
		lastNarration?.id ?? "",
		snapshot.settings.provider,
		snapshot.settings.model,
		snapshot.settings.effort,
		snapshot.auth?.configured ? "1" : "0",
		snapshot.auth?.source ?? "",
	].join("|");
}

type TranscriptEntry =
	| { kind: "turn"; timestamp: number; turn: SessionSnapshot["turns"][number] }
	| { kind: "tool"; timestamp: number; tool: SessionSnapshot["tools"][number] }
	| { kind: "narration"; timestamp: number; narration: SessionSnapshot["narrations"][number] };

function transcriptEntryPriority(entry: TranscriptEntry): number {
	if (entry.kind === "turn") return entry.turn.role === "user" ? 0 : 3;
	return entry.kind === "narration" ? 1 : 2;
}

export class TranscriptView implements Component {
	private snapshot: SessionSnapshot;
	private readonly markdownByTurn = new Map<string, Markdown>();
	private readonly draft = new Markdown("", 0, 0, markdownTheme);
	private projectionKey = "";
	private readonly stableRowsByWidth = new Map<number, string[]>();
	private readonly entryRowsByWidth = new Map<number, Map<string, { key: string; rows: string[] }>>();

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
		const nextKey = transcriptProjectionKey(snapshot);
		if (nextKey !== this.projectionKey) {
			this.projectionKey = nextKey;
			this.stableRowsByWidth.clear();
		}
	}

	invalidate(): void {
		for (const markdown of this.markdownByTurn.values()) markdown.invalidate();
		this.draft.invalidate();
		this.stableRowsByWidth.clear();
		this.entryRowsByWidth.clear();
	}

	render(width: number): string[] {
		const contentWidth = Math.max(1, width);
		const stable = this.stableRows(contentWidth);
		if (this.snapshot.phase !== "streaming" && !this.snapshot.error) return stable;
		const rows = [...stable];
		if (this.snapshot.phase === "streaming" && !this.snapshot.activity?.label.startsWith("Terminal")) {
			const frame = ACTIVITY_FRAMES[Math.floor(performance.now() / 80) % ACTIVITY_FRAMES.length];
			const activity = this.snapshot.activity?.label ?? "응답 준비 중";
			rows.push(...surfaceRows([
				`${semantic.assistantLabel("WWW")}  ${semantic.toolRunning(`${frame} ${activity}`)}`,
				...(this.snapshot.draft ? this.draft.render(contentWidth) : [colors.muted("응답을 준비하는 중…")]),
			], contentWidth, semantic.assistantSurface), "");
		}
		if (this.snapshot.error) {
			rows.push(colors.error("오류"));
			rows.push(...wrapTextWithAnsi(this.snapshot.error, contentWidth).map(colors.error), "");
		}
		return rows;
	}

	private stableRows(contentWidth: number): string[] {
		const cached = this.stableRowsByWidth.get(contentWidth);
		if (cached) return cached;
		const rows = this.buildStableRows(contentWidth);
		this.stableRowsByWidth.set(contentWidth, rows);
		if (this.stableRowsByWidth.size > 2) {
			const oldest = this.stableRowsByWidth.keys().next().value;
			if (oldest !== undefined) {
				this.stableRowsByWidth.delete(oldest);
				this.entryRowsByWidth.delete(oldest);
			}
		}
		return rows;
	}

	private buildStableRows(contentWidth: number): string[] {
		if (this.snapshot.turns.length === 0 && this.snapshot.tools.length === 0 && this.snapshot.narrations.length === 0) {
			return this.renderWelcome(contentWidth);
		}
		const rows: string[] = [];
		const entries: TranscriptEntry[] = [
			...this.snapshot.turns.map(turn => ({ kind: "turn" as const, timestamp: turn.timestamp, turn })),
			...this.snapshot.tools.map(tool => ({ kind: "tool" as const, timestamp: tool.startedAt ?? 0, tool })),
			...this.snapshot.narrations.map(narration => ({
				kind: "narration" as const,
				timestamp: Date.parse(narration.timestamp),
				narration,
			})),
		].sort((left, right) => left.timestamp - right.timestamp || transcriptEntryPriority(left) - transcriptEntryPriority(right));
		for (const entry of entries) {
			rows.push(...this.entryRows(entry, contentWidth), "");
		}
		return rows;
	}

	private entryRows(entry: TranscriptEntry, contentWidth: number): string[] {
		let widthCache = this.entryRowsByWidth.get(contentWidth);
		if (!widthCache) {
			widthCache = new Map();
			this.entryRowsByWidth.set(contentWidth, widthCache);
		}
		const id = entry.kind === "turn"
			? `turn:${entry.turn.id}`
			: entry.kind === "tool"
				? `tool:${entry.tool.id}`
				: `narration:${entry.narration.id}`;
		const key = entry.kind === "turn"
			? `${entry.turn.outcome ?? ""}:${entry.turn.content.length}`
			: entry.kind === "tool"
				? `${entry.tool.status}:${entry.tool.durationMs ?? ""}:${
					"shell" in entry.tool
						? `${entry.tool.stdout.length}:${entry.tool.stderr.length}`
						: `${entry.tool.output.length}:${entry.tool.error?.length ?? 0}`
				}`
				: `${entry.narration.step}:${entry.narration.action}:${entry.narration.reason}`;
		const cached = widthCache.get(id);
		if (cached?.key === key) return cached.rows;
		const rows = this.renderEntry(entry, contentWidth);
		widthCache.set(id, { key, rows });
		return rows;
	}

	private renderEntry(entry: TranscriptEntry, contentWidth: number): string[] {
		if (entry.kind === "narration") {
			return surfaceRows([
				`${semantic.assistantLabel("WWW")}  ${semantic.narration(`단계 ${entry.narration.step}`)}`,
				semantic.narration(`동작: ${entry.narration.action}`),
				semantic.narration(`이유: ${entry.narration.reason}`),
			], contentWidth, semantic.assistantSurface);
		}
		if (entry.kind === "tool") {
			const card = "shell" in entry.tool
				? new BashResultCard(entry.tool)
				: new GenericToolResultCard(entry.tool);
			return card.render(contentWidth);
		}
		const { turn } = entry;
		if (turn.role === "user") {
			return surfaceRows([
				semantic.userLabel("사용자"),
				...wrapTextWithAnsi(turn.content, contentWidth),
			], contentWidth, semantic.userSurface);
		}
		const assistantRows = [turn.outcome === "cancelled"
			? `${semantic.assistantLabel("WWW")}  ${semantic.toolCancelled("중단됨")}`
			: semantic.assistantLabel("WWW")];
		const markdown = this.markdownByTurn.get(turn.id);
		if (markdown) assistantRows.push(...markdown.render(contentWidth));
		return surfaceRows(assistantRows, contentWidth, semantic.assistantSurface);
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
