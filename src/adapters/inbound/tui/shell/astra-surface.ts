import { HStack, VStack, ScrollView, Key, matchesKey, stripTerminalSequences, truncateToWidth, visibleWidth, type Component, type Editor, type ScrollRowSource } from "@earendil-works/pi-tui";
import type { WorkbenchSnapshot } from "../../../../core/domain/work/workbench";
import type { UsageSnapshot } from "../../../../core/ports";
import { ChatScrollView } from "../features/chat/chat-scroll.view";
import { AstraTranscriptView, executionHeading, astraExecutionIsLive, astraNowLabel } from "../features/chat/astra-execution";
import { AstraContextView } from "../features/context/astra-context-view";
import { AstraPlanView, type PlanRuntimePresentation } from "../features/plan/astra-plan-view";
import { AstraWorkflowView } from "../features/workflow/astra-workflow-view";
import { WORKBENCH_SLASH_COMMANDS } from "../commands/slash-commands";
import { a, astraPulse, duration, fit, oneLine, pair, prose, safe, section } from "../foundation/theme/astra-theme";
import { astraUsageLine } from "../features/usage/astra-usage";
import { componentScrollRows } from "../foundation/rendering/scroll-row-source";
import { ASTRA_HELP_ACTIONS, ASTRA_KEYMAP, ASTRA_KEYS, ASTRA_VIEWS } from "../foundation/keyboard/astra-keymap";

export { ASTRA_DOC_EXTRA, ASTRA_HELP_ACTIONS, ASTRA_KEYMAP, ASTRA_KEYS, ASTRA_SCROLL_KEYS, ASTRA_VIEWS, matchesAstraAction, matchesAstraKey } from "../foundation/keyboard/astra-keymap";

export type AstraPage = "dashboard" | "execution" | "plan" | "workflow" | "context" | "help";
const ASTRA_DESCRIPTIONS: Record<string, string> = { chat: "실행·질문 요약 타임라인", todo: "Plan · Todo · Verify", workflow: "Request 단계·Subagent 위임 관측", test: "질문별 검증 목적·검사·근거", help: "Astra 명령과 키보드 이동", source: "선택한 Activity의 공개 실행 근거", dashboard: "이전 세션 탐색", monitor: "현재 Runtime·Request·Tool 관측" };
export const ASTRA_COMMANDS = [...WORKBENCH_SLASH_COMMANDS.filter(command => command.name !== "tnotes" && command.name !== "tnote").map(command => ({ ...command, description: ASTRA_DESCRIPTIONS[command.name] ?? command.description })),
	{ name: "context", description: "세션·권한·사용량·MCP·위임 작업" },
	{ name: "approval", description: "보류한 승인 요청 다시 읽기 · 결정하지 않음" },
	{ name: "work", description: "Issue 연결·기록 상태·Obsidian checkpoint/open" },
];
// Per retained generation, not total heap/RSS: old and new maps may coexist
// during render, and the child's full transcript/output arrays have separate lifetimes.
const ASTRA_INSET_CACHE_MAX_ENTRIES = 16_384;
const ASTRA_INSET_CACHE_MAX_LOGICAL_BYTES = 8 * 1024 * 1024;
const ASTRA_INSET_CACHE_ENTRY_OVERHEAD = 32;

interface AstraInsetCacheEntry {
	readonly source: string;
	readonly rendered: string;
	readonly logicalBytes: number;
}

export class AstraInset implements Component {
	private cache: { width: number; padding: number; rows: ReadonlyMap<string, AstraInsetCacheEntry> } | undefined;
	constructor(private readonly child: Component, private readonly padding = 2) {}
	invalidate(): void { this.cache = undefined; this.child.invalidate(); }
	private insetRows(sourceRows: readonly string[], width: number, padding: number): string[] {
		const previous = this.cache?.width === width && this.cache.padding === padding ? this.cache.rows : undefined;
		const renderedRows = new Array<string>(sourceRows.length);
		const retainedRows = new Map<string, AstraInsetCacheEntry>();
		let retainedBytes = 0;
		const inset = " ".repeat(padding);
		for (let index = 0; index < sourceRows.length; index++) {
			const source = sourceRows[index]!;
			// Value keys handle mutable arrays, shifted rows, and repeated padding rows.
			// Only the current generation is retained; old drafts cannot accumulate.
			const entry = retainedRows.get(source) ?? previous?.get(source) ?? (() => {
				const rendered = fit(inset + source, width);
				return {
					source,
					rendered,
					logicalBytes: (source.length + rendered.length) * 2 + ASTRA_INSET_CACHE_ENTRY_OVERHEAD,
				};
			})();
			renderedRows[index] = entry.rendered;
			if (!retainedRows.has(source) && retainedRows.size < ASTRA_INSET_CACHE_MAX_ENTRIES && retainedBytes + entry.logicalBytes <= ASTRA_INSET_CACHE_MAX_LOGICAL_BYTES) {
				retainedRows.set(source, entry);
				retainedBytes += entry.logicalBytes;
			}
		}
		this.cache = { width, padding, rows: retainedRows };
		return renderedRows;
	}
	scrollRows(width: number): ScrollRowSource {
		const padding = width > this.padding * 2 + 4 ? this.padding : 0;
		const contentWidth = Math.max(1, width - padding * 2);
		const lazy = componentScrollRows(this.child, contentWidth);
		if (lazy) return {
			rowCount: lazy.rowCount,
			rows: (start, count) => this.insetRows(lazy.rows(start, count), width, padding),
		};
		const dense = this.child.render(contentWidth);
		return {
			rowCount: dense.length,
			rows: (start, count) => this.insetRows(dense.slice(start, start + count), width, padding),
		};
	}
	render(width: number): string[] {
		if (width <= 0) return [];
		const source = this.scrollRows(width);
		return [...source.rows(0, source.rowCount)];
	}
}
export class HelpView implements Component {
	invalidate(): void {}
	render(width: number): string[] {
		const rows = [...section("명령과 이동", width)];
		for (const action of ASTRA_HELP_ACTIONS) {
			const binding = ASTRA_KEYMAP[action];
			const docText = binding.doc.join(" · ");
			rows.push(`${docText.padEnd(18)}${binding.label}`);
		}
		rows.push("Tab (입력 중)       파일·명령 자동완성", "", a.note("질문 요약은 별도 화면이 아니라 실행 타임라인에 쌓입니다."), "");
		for (const [key, command, label] of ASTRA_VIEWS) rows.push(`${a.active(`Ctrl+G ${key}`)}  ${label}  ${a.muted(command)}`);
		const functionKeys = ASTRA_KEYS.map(([key]) => key.toUpperCase());
		rows.push("", a.muted(`Ctrl은 Mac의 Control 키입니다. ${functionKeys[0]}–${functionKeys[functionKeys.length - 1]}도 보조 키로 유지합니다.`));
		rows.push(...section("Slash commands", width));
		for (const c of ASTRA_COMMANDS) rows.push(a.text(`/${c.name}${"argumentHint" in c ? " " + c.argumentHint : ""}`), a.muted(`  ${c.description}`));
		return rows.flatMap(row => prose(row, width));
	}
}

export class AstraWorkspace {
	page: AstraPage = "execution";
	readonly transcript: AstraTranscriptView;
	readonly scrolls: Record<AstraPage, ScrollView>;
	readonly component: Component;
	private readonly side: Component;
	private sidebarEnabled = true;
	constructor(
		get: () => WorkbenchSnapshot,
		usage: () => readonly UsageSnapshot[],
		bodyHeight: (height: number, width: number, stable?: boolean) => number = height => height,
		clock = Date.now,
		motion = true,
		runtimePresentation: PlanRuntimePresentation | null = null,
		dashboard: Component = new HelpView(),
	) {
		this.transcript = new AstraTranscriptView(get());
		const scroll = (component: Component) => new ScrollView(new AstraInset(component), { follow: "none", primary: true, overscroll: "contain", scrollbar: "auto", scrollbarStyle: a.rule });
		this.scrolls = {
			dashboard: scroll(dashboard),
			execution: new ChatScrollView(new AstraInset(this.transcript), { follow: "end", primary: true, overscroll: "contain", scrollbar: "auto", scrollbarStyle: a.rule }),
			plan: scroll(new AstraPlanView(get, false, clock, motion, runtimePresentation)), workflow: scroll(new AstraWorkflowView(get)), context: scroll(new AstraContextView(get, usage)), help: scroll(new HelpView()),
		};
		this.side = new ScrollView(new AstraInset(new AstraPlanView(get, true, clock, motion, runtimePresentation)), { follow: "none", overscroll: "contain", scrollbar: "auto", scrollbarStyle: a.rule });
		const execution = new HStack([
			{ component: this.scrolls.execution, basis: 0, grow: 1, minSize: 1 },
			{ component: this.side, basis: 38, minSize: 34, maxSize: 44, visible: ({ width, height }) => this.sidebarEnabled && width >= 112 && bodyHeight(height, width, true) >= 14 },
		]);
		this.component = new VStack((Object.keys(this.scrolls) as AstraPage[]).map(page => ({ component: page === "execution" ? execution : this.scrolls[page], basis: 0, grow: 1, minSize: 1, visible: () => this.page === page })));
	}
	get currentScroll(): ScrollView { return this.scrolls[this.page]; }
	show(page: AstraPage): void { this.page = page; }
	toggleSidebar(): boolean { this.sidebarEnabled = !this.sidebarEnabled; return this.sidebarEnabled; }
}

export class AstraHeader implements Component {
	constructor(private readonly get: () => WorkbenchSnapshot, private readonly page: () => string, private readonly cwd: string) {}
	invalidate(): void {}
	render(width: number): string[] {
		const s = this.get();
		const project = this.cwd.split(/[\\/]/u).filter(Boolean).at(-1) ?? s.projectId;
		const identity = `${a.strong("astra")}  ${a.muted(oneLine(project))} ${a.rule("/")} ${a.text(this.page())}`;
		const nav = width >= 112 ? "Ctrl+G 화면  Ctrl+B 사이드바  /  Ctrl+P 명령" : "Ctrl+G 화면  Ctrl+P 명령";
		return [fit("  " + pair(identity, a.muted(nav), width - 4), width), ""];
	}
}

export class AstraExecutionHeading implements Component {
	constructor(private readonly get: () => WorkbenchSnapshot, private readonly actionHint?: () => string | null, private readonly clock = Date.now, private readonly motion = true) {}
	invalidate(): void {}
	render(width: number): string[] {
		const s = this.get(), heading = executionHeading(s);
		const ink = heading.attention ? a.attention : astraExecutionIsLive(s) ? a.active : s.executionRun?.receipt || s.chat.length ? a.success : a.muted;
		const hint = s.pendingApproval ? "/approval 확인" : this.actionHint?.() ?? (s.phase === "working" ? "Esc 중단" : "");
		const now = this.clock();
		const rootActivities = s.activities.filter(x => !s.threadId || x.nativeRefs.threadId === s.threadId);
		const terminal = [...rootActivities].reverse().find(x => ["turn/completed", "turn/interrupted", "turn/failed"].includes(String(x.payload.method)));
		const turnId = s.activeTurnId ?? terminal?.nativeRefs.turnId ?? [...rootActivities].reverse().find(x => x.payload.method === "turn/started")?.nativeRefs.turnId;
		const activities = rootActivities.filter(x => turnId && x.nativeRefs.turnId === turnId);
		const started = Date.parse(activities.find(x => x.payload.method === "turn/started")?.recordedAt ?? "");
		const observed = Date.parse(activities.at(-1)?.recordedAt ?? "");
		const timing = Number.isFinite(started) ? `경과 ${duration(Math.max(0, now - started))}${Number.isFinite(observed) ? `  /  최근 관측 ${duration(Math.max(0, now - observed))} 전` : ""}` : "첫 관측 대기";
		const ended = Date.parse(terminal?.recordedAt ?? "");
		const terminalMethod = String(terminal?.payload.method ?? "");
		const failed = terminalMethod === "turn/failed" || terminal?.phase === "failed";
		const interrupted = terminalMethod === "turn/interrupted" || terminal?.phase === "cancelled";
		const outcome = failed ? { marker: a.failure("!"), label: "실패까지" } : interrupted ? { marker: a.muted("−"), label: "중단까지" } : { marker: a.success("✓"), label: "처리" };
		const completedTiming = Number.isFinite(started) && Number.isFinite(ended) && ended >= started
			? `${outcome.marker} ${outcome.label} ${duration(ended - started)}  ·  ${new Date(ended).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })} 종료`
			: "";
		const progress = astraExecutionIsLive(s)
			? workingStatusLine(s, now, width, this.motion)
			: completedTiming ? `    ${a.caption(completedTiming)}` : "";
		return [fit(`  ${ink("▎")} ${pair(ink(heading.state) + "  " + a.strong(heading.title), a.muted(hint), width - 6)}`, width), fit(`    ${pair(a.caption(heading.detail), s.chatQueue.length ? a.active(`+${s.chatQueue.length} 대기`) : "", width - 6)}`, width), fit(progress, width)];
	}
}

function workingStatusLine(snapshot: WorkbenchSnapshot, now: number, width: number, motion: boolean): string {
	const rootActivities = snapshot.activities.filter(activity => !snapshot.threadId || activity.nativeRefs.threadId === snapshot.threadId);
	const turnId = snapshot.activeTurnId ?? [...rootActivities].reverse().find(activity => activity.payload.method === "turn/started")?.nativeRefs.turnId;
	const turnActivities = rootActivities.filter(activity => turnId && activity.nativeRefs.turnId === turnId);
	const startedAt = Date.parse(turnActivities.find(activity => activity.payload.method === "turn/started")?.recordedAt ?? "");
	const elapsed = Number.isFinite(startedAt) ? duration(Math.max(0, now - startedAt)) : "시간 관측 대기";
	const terminals = activeTerminalCount(turnActivities, snapshot);
	const terminalLabel = terminals === null ? "terminal 관측 대기" : `${terminals} terminal${terminals === 1 ? "" : "s"} running`;
	const controls = width >= 88 ? "Esc to interrupt · /monitor to view" : width >= 64 ? "Esc to interrupt" : "Esc";
	return `    ${astraPulse(motion ? Math.floor(now / 120) : 8)}  ${a.active("Working")} ${a.caption(`(${elapsed} · ${controls}) · ${terminalLabel}`)}`;
}

/** Count only the latest observed lifecycle for each root-turn command item. */
function activeTerminalCount(
	activities: readonly WorkbenchSnapshot["activities"][number][],
	snapshot: WorkbenchSnapshot,
): number | null {
	const latest = new Map<string, WorkbenchSnapshot["activities"][number]>();
	for (const activity of activities) {
		if (activity.kind !== "tool" || !activity.nativeRefs.itemId) continue;
		latest.set(activity.nativeRefs.itemId, activity);
	}
	const observed = [...latest.values()].filter(activity => {
		if (!["started", "updated"].includes(activity.phase)) return false;
		const item = activity.payload.params && typeof activity.payload.params === "object" && !Array.isArray(activity.payload.params)
			? (activity.payload.params as Record<string, unknown>).item : undefined;
		return Boolean(item && typeof item === "object" && !Array.isArray(item)
			&& (item as Record<string, unknown>).type === "commandExecution");
	}).length;
	if (observed > 0) return observed;
	return snapshot.liveActivity?.kind === "tool" ? 1 : null;
}

export class AstraNotice implements Component {
	private notice = "";
	get hasNotice(): boolean { return this.notice.length > 0; }
	setNotice(text: string): void { this.notice = oneLine(text, 3000); }
	invalidate(): void {}
	render(width: number): string[] { return [fit(`  ${a.muted(this.notice)}`, width)]; }
}

export class AstraComposer implements Component {
	constructor(private readonly child: Component, private readonly editor: Editor, private readonly get: () => WorkbenchSnapshot, private readonly decorateEditor: () => boolean = () => true) {}
	invalidate(): void { this.child.invalidate(); }
	render(width: number): string[] {
		const rows = this.child.render(width);
		if (!this.decorateEditor()) return rows;
		// Editor rails may contain a scroll indicator. Match only rails (editable
		// rows have padding), leaving text, cursor markers and autocomplete intact.
		const rail = (row: string): string | null => /^─+(?: ([↑↓] \d+ more) )?─*$/u.exec(stripTerminalSequences(row))?.[1] ?? (/^─+$/u.test(stripTerminalSequences(row)) ? "" : null);
		const above = rows[0] ? rail(rows[0]) : null;
		if (above === null) return rows;
		const s = this.get();
		const prompt = "여기에 작성한다.";
		const ink = !this.editor.focused ? a.rule : s.pendingApproval ? a.attention : a.active;
		const model = oneLine(s.activeModel ?? s.model ?? "모델 미확인", 48);
		const effort = oneLine(s.effort ?? "추론 미확인", 16);
		const mode = s.permissionMode === "all" ? "Bypass" : s.collaborationMode === "plan" ? "Plan Mode" : "Manual";
		const rawLabel = `${this.editor.focused ? "›" : "·"} ${prompt} · ${model} · ${effort} · ${mode}${above ? `  ${above}` : ""}`;
		const label = truncateToWidth(rawLabel, Math.max(0, width - 5), "");
		rows[0] = fit(`  ${ink(label)} ${ink("─".repeat(Math.max(0, width - visibleWidth(label) - 5)))}`, width);
		// Preserve the Editor's row/column coordinates and its autocomplete rows.
		const bottom = rows.findIndex((row, index) => index > 0 && rail(row) !== null);
		if (bottom > 0) {
			const below = rail(rows[bottom]!)!;
			const label = below ? `${below} ` : "";
			rows[bottom] = fit(`  ${ink(label + "─".repeat(Math.max(0, width - visibleWidth(label) - 4)))}`, width);
		}
		return rows;
	}
}

export class AstraHud implements Component {
	constructor(
		private readonly get: () => WorkbenchSnapshot,
		private readonly usage: () => readonly UsageSnapshot[] = () => [],
		private readonly showLogos = true,
	) {}
	invalidate(): void {}
	render(width: number): string[] {
		const s = this.get();
		const model = oneLine(s.activeModel ?? s.model ?? "모델 미확인", 70);
		if (s.hud?.showUsage === false) return [""];
		const contentWidth = Math.max(1, width - 2);
		const runtime = astraRuntimeStatus(s, Math.max(0, contentWidth - 40));
		const usageWidth = Math.max(1, contentWidth - visibleWidth(runtime) - (runtime ? 3 : 0));
		const subscription = astraUsageLine(this.usage(), usageWidth, model, Date.now(), this.showLogos, true);
		return [fit(`  ${runtime ? `${runtime}${a.rule(" · ")}` : ""}${subscription}`, width)];
	}
}

function astraRuntimeStatus(snapshot: WorkbenchSnapshot, maximumWidth: number): string {
	const mode = snapshot.permissionMode === "all" ? a.attention("Bypass") : snapshot.collaborationMode === "plan" ? a.plan("Plan Mode") : a.success("Manual");
	const context = snapshot.contextUsage && Number.isFinite(snapshot.contextUsage.percent)
		? a.caption(`Context ${compactTokens(snapshot.contextUsage.usedTokens)} / ${compactTokens(snapshot.contextUsage.contextWindow)} ${Math.round(Math.max(0, Math.min(100, snapshot.contextUsage.percent)))}%`)
		: a.muted("Context —");
	const join = (parts: readonly string[]) => parts.join(a.rule(" · "));
	for (const candidate of [join([mode, context]), mode, context]) {
		if (visibleWidth(candidate) <= maximumWidth) return candidate;
	}
	return "";
}

function compactTokens(value: number): string {
	if (!Number.isFinite(value) || value < 0) return "—";
	if (value < 1_000) return String(Math.round(value));
	if (value < 1_000_000) return `${Math.round(value / 1_000)}k`;
	return `${(value / 1_000_000).toFixed(value < 10_000_000 ? 1 : 0)}m`;
}

/** A two-keystroke switcher: Control+G, then a digit. Drafts are never submitted or replaced. */
export class AstraViewSwitcher implements Component {
	private selected = 0;
	constructor(private readonly choose: (command: string) => void, private readonly close: () => void, private readonly repaint: () => void) {}
	invalidate(): void {}
	render(width: number): string[] {
		return [a.strong("화면 이동"), a.muted("숫자를 누르면 이동합니다. 입력 초안은 유지됩니다."), "", ...ASTRA_VIEWS.map(([key, command, label], i) => {
			const row = fit(`${i === this.selected ? "›" : " "} ${key}  ${label}  ${command}`, width);
			return i === this.selected ? a.selected(row) : a.text(row);
		}), "", a.muted("↑↓ 선택 / Enter 이동 / Esc 닫기")].map(row => fit(row, width));
	}
	handleInput(data: string): void {
		if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("g"))) return this.close();
		const direct = ASTRA_VIEWS.find(([key]) => data === key);
		if (direct) return this.choose(direct[1]);
		if (matchesKey(data, Key.enter)) return this.choose(ASTRA_VIEWS[this.selected]![1]);
		if (matchesKey(data, Key.up)) this.selected = Math.max(0, this.selected - 1);
		if (matchesKey(data, Key.down)) this.selected = Math.min(ASTRA_VIEWS.length - 1, this.selected + 1);
		this.repaint();
	}
}

/** Search is local. Choosing a command fills the composer; it never executes a mutation. */
export class AstraCommandPalette implements Component {
	private query = "";
	private selected = 0;
	constructor(private readonly choose: (command: string) => void, private readonly close: () => void, private readonly repaint: () => void) {}
	private matches() { const q = this.query.replace(/^\//u, "").toLowerCase(); return ASTRA_COMMANDS.filter(c => `${c.name} ${c.description}`.toLowerCase().includes(q)); }
	invalidate(): void {}
	render(width: number): string[] {
		const matches = this.matches();
		const offset = Math.max(0, this.selected - 5);
		return [a.strong("명령 찾기"), "", fit(a.active(`검색  ${this.query || "명령 이름 입력"}`), width), "", ...matches.slice(offset, offset + 7).map((c, i) => {
			const text = fit(`${i + offset === this.selected ? "›" : " "} /${c.name}  ${c.description}`, width);
			return i + offset === this.selected ? a.selected(text) : a.muted(text);
		}), ...(matches.length ? [] : [a.muted("일치하는 명령이 없습니다.")]), "", a.muted("↑↓ 선택 / Enter 입력란에 넣기 / Esc 닫기")];
	}
	handleInput(data: string): void {
		if (matchesKey(data, Key.escape)) return this.close();
		const matches = this.matches();
		if (matchesKey(data, Key.up)) this.selected = Math.max(0, this.selected - 1);
		else if (matchesKey(data, Key.down)) this.selected = Math.min(Math.max(0, matches.length - 1), this.selected + 1);
		else if (matchesKey(data, Key.enter)) { const c = matches[this.selected]; if (c) this.choose(`/${c.name}${"argumentHint" in c ? " " : ""}`); return; }
		else if (matchesKey(data, Key.backspace)) { this.query = Array.from(this.query).slice(0, -1).join(""); this.selected = 0; }
		else if (!/[\x00-\x1f\x7f]/u.test(data)) { this.query += data; this.selected = 0; }
		this.repaint();
	}
}

/** A single modal sheet. Local scrolling keeps long approval candidates and choices reachable. */
export class AstraSheet implements Component {
	private offset = 0;
	private rowCount = 0;
	private viewportHeight = 1;
	private promptLine = -1;
	private revealSelection = false;
	private selectionKey = "";
	constructor(private readonly content: Component & { renderActions?(width: number): string[] }, private readonly height: () => number, private readonly options: { followPrompt?: boolean; followSelection?: boolean } = {}) {}
	invalidate(): void { this.content.invalidate(); }
	render(width: number): string[] {
		const inner = Math.max(1, width - 4);
		const allLines = this.content.render(inner);
		const allPinned = this.content.renderActions?.(inner) ?? [];
		let pinned = allPinned;
		const pinnedLimit = Math.max(1, this.height() - 5);
		if (pinned.length > pinnedLimit) {
			const selected = Math.max(0, pinned.findIndex(row => /^\s*▸/u.test(stripTerminalSequences(row))));
			const start = Math.max(0, selected - pinnedLimit + 1);
			pinned = pinned.slice(start, start + pinnedLimit);
		}
		const lines = allPinned.length ? allLines.slice(0, -allPinned.length) : allLines;
		this.rowCount = lines.length;
		const height = Math.max(1, this.height() - 4 - pinned.length);
		const resized = this.viewportHeight !== height;
		this.viewportHeight = height;
		if (this.options.followSelection) {
			const selected = lines.findIndex(row => /^\s*[▸›]/u.test(stripTerminalSequences(row)));
			const key = `${selected}:${selected >= 0 ? stripTerminalSequences(lines[selected]!) : ""}`;
			if (key !== this.selectionKey || resized) this.revealSelection = true;
			this.selectionKey = key;
		}
		const prompt = this.options.followPrompt ? lines.findIndex(row => /^\s*(?:>|●)/u.test(stripTerminalSequences(row))) : -1;
		if (prompt >= 0 && prompt !== this.promptLine) this.revealSelection = true;
		this.promptLine = prompt;
		if (this.revealSelection) {
			const selectedBackground = lines.findIndex(row => /\x1b\[48;2;/u.test(row));
			const selected = prompt >= 0 ? prompt : selectedBackground >= 0 ? selectedBackground : lines.findIndex(row => /^\s*[▸›]/u.test(stripTerminalSequences(row)));
			if (selected >= 0 && (selected < this.offset || selected >= this.offset + height)) this.offset = Math.max(0, selected - height + 2);
			this.revealSelection = false;
		}
		this.offset = Math.min(this.offset, Math.max(0, lines.length - height));
		return [a.rule("─".repeat(width)), ...lines.slice(this.offset, this.offset + height).map(row => fit("  " + row, width)), ...(lines.length > height ? [fit(a.muted(`  PgUp / PgDn 읽기  ${this.offset + 1}–${Math.min(lines.length, this.offset + height)}/${lines.length}`), width)] : []), ...pinned.map(row => fit("  " + row, width)), a.rule("─".repeat(width))];
	}
	handleInput(data: string): void {
		if (matchesKey(data, Key.pageDown)) this.offset = Math.min(this.rowCount - 1, this.offset + Math.max(1, this.viewportHeight - 2));
		else if (matchesKey(data, Key.pageUp)) this.offset = Math.max(0, this.offset - Math.max(1, this.viewportHeight - 2));
		else {
			this.revealSelection = [Key.up, Key.down, Key.left, Key.right, Key.enter, Key.backspace].some(key => matchesKey(data, key));
			this.content.handleInput?.(data);
		}
	}
}
