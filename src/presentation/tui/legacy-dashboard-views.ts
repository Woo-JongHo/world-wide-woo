import {
	Markdown,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
	type Component,
} from "@earendil-works/pi-tui";
import type { SessionSnapshot } from "../../application/session-runtime";
import type { Effort } from "../../domain/model-settings";
import { BashResultCard, GenericToolResultCard } from "./result-cards";
import { colors, gradientLines, markdownTheme, semantic } from "./theme";
export { UsageStripView } from "./usage-strip-view";

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
				`${semantic.assistantLabel("bori")}  ${semantic.toolRunning(`${frame} ${activity}`)}`,
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
				`${semantic.assistantLabel("bori")}  ${semantic.narration(`단계 ${entry.narration.step}`)}`,
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
				semantic.userLabel("user"),
				...wrapTextWithAnsi(turn.content, contentWidth),
			], contentWidth, semantic.userSurface);
		}
		const assistantRows = [turn.outcome === "cancelled"
			? `${semantic.assistantLabel("bori")}  ${semantic.toolCancelled("중단됨")}`
			: semantic.assistantLabel("bori")];
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
