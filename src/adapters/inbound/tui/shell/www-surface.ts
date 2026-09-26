import {
	CURSOR_MARKER,
	HStack,
	VStack,
	ScrollView,
	Key,
	matchesKey,
	stripTerminalSequences,
	truncateToWidth,
	visibleWidth,
} from "@earendil-works/pi-tui";
import type { Component, Editor, ScrollRowSource }                     from "@earendil-works/pi-tui";
import { projectChatFeature, projectPlanFeature }                      from "@/core/application/orchestration/workbench-feature-reads";
import type { ChatFeatureProjection }                                  from "@/core/application/orchestration/workbench-feature-reads";
import type { ProjectActivity }                                        from "@/core/domain/execution/project-activity";
import type { WorkbenchSnapshot }                                      from "@/core/domain/work/workbench";
import type { UsageSnapshot, UsageSnapshotCacheMetrics }               from "@/core/ports/observability/usage-monitor-port";
import type { CacheTelemetrySnapshot }                                 from "@/core/domain/observability/cache-telemetry";
import { ChatScrollView }                                              from "@/adapters/inbound/tui/features/chat/view/chat-scroll.view";
import {
	WwwTranscriptView,
	executionHeading,
	wwwExecutionIsLive,
	wwwNowLabel,
	hasVisibleWwwContent,
} from "@/adapters/inbound/tui/features/chat/view/www-execution";
import { WwwContextRail, WwwContextView }                              from "@/adapters/inbound/tui/features/context/view/www-context-view";
import { WwwCacheRail, WwwCacheView }                                  from "@/adapters/inbound/tui/features/cache/view/www-cache-view";
import { projectWorkbenchCacheTelemetry }                              from "@/adapters/inbound/tui/features/cache/view-model/cache-telemetry-projection";
import { WwwDashboardRail }                                            from "@/adapters/inbound/tui/features/dashboard/view/entry-dashboard-view";
import { WwwPlanView }                                                 from "@/adapters/inbound/tui/features/plan/view/www-plan-view";
import type { PlanRuntimePresentation }                                from "@/adapters/inbound/tui/features/plan/view/www-plan-view";
import { WwwWorkflowRail, WwwWorkflowView }                            from "@/adapters/inbound/tui/features/workflow/view/www-workflow-view";
import { WORKBENCH_SLASH_COMMANDS }                                    from "@/adapters/inbound/tui/commands/slash-commands";
import {
	a,
	wwwFlowText,
	duration,
	fit,
	oneLine,
	prose,
	safe,
	section,
} from "@/adapters/inbound/tui/foundation/theme/www-theme";
import { wwwQuotaHudRows }                                             from "@/adapters/inbound/tui/features/usage/view/www-usage";
import { WwwUsageRail, WwwUsageView }                                  from "@/adapters/inbound/tui/features/usage/view/www-usage-view";
import { runtimeModeLabel, workbenchEffortLabel, workbenchModelLabel } from "@/adapters/inbound/tui/foundation/labels";
import { componentScrollRows }                                         from "@/adapters/inbound/tui/foundation/rendering/scroll-row-source";
import {
	WWW_HELP_ACTIONS,
	WWW_KEYMAP,
	WWW_KEYS,
	WWW_VIEWS,
} from "@/adapters/inbound/tui/foundation/keyboard/www-keymap";

export { WWW_DOC_EXTRA, WWW_HELP_ACTIONS, WWW_KEYMAP, WWW_KEYS, WWW_SCROLL_KEYS, WWW_VIEWS, matchesWwwAction, matchesWwwKey } from "@/adapters/inbound/tui/foundation/keyboard/www-keymap";

export type WwwPage = "dashboard" | "execution" | "plan" | "workflow" | "context" | "cache" | "usage" | "help" | "lab";
export const WWW_PAGE_LABELS: Readonly<Record<WwwPage, string>> = {
	dashboard : "Dashboard",
	execution : "Chat",
	plan      : "Plan",
	workflow  : "Workflow",
	context   : "Context",
	cache     : "Cache",
	usage     : "Usage",
	help      : "Help",
	lab       : "Three Body Lab",
};
export function wwwPageLabel(page: WwwPage): string { return WWW_PAGE_LABELS[page]; }
const WWW_DESCRIPTIONS: Record<string, string> = { chat: "실행·질문 요약 타임라인", todo: "Plan · Progress · Next", workflow: "Request 단계·Subagent 위임 관측", test: "질문별 검증 목적·검사·근거", help: "WWW 명령과 키보드 이동", source: "선택한 Progress 항목의 Trace · Source", dashboard: "현재 Session Overview", usage: "Provider quota·세션 token 상세", monitor: "현재 Progress·Runtime 관측" };
export const WWW_COMMANDS = [...WORKBENCH_SLASH_COMMANDS.filter(command => command.name !== "tnotes" && command.name !== "tnote").map(command => ({ ...command, description: WWW_DESCRIPTIONS[command.name] ?? command.description })),
	{ name: "context", description: "세션·권한·사용량·MCP·위임 작업" },
	{ name: "history", description: "이전 Session·Project 관측 이력" },
	{ name: "usage", description: "Provider quota·세션 token 상세" },
	{ name: "approval", description: "보류한 승인 요청 다시 읽기 · 결정하지 않음" },
	{ name: "demo", description: "MVP 합성 데이터로 전체 화면 순회 · R/E 이동 · Esc 종료" },
	{ name: "work", description: "Issue 연결·기록 상태·Obsidian checkpoint/open" },
];
// Per retained generation, not total heap/RSS: old and new maps may coexist
// during render, and the child's full transcript/output arrays have separate lifetimes.
const WWW_INSET_CACHE_MAX_ENTRIES       = 16_384          ;
const WWW_INSET_CACHE_MAX_LOGICAL_BYTES = 8 * 1024 * 1024 ;
const WWW_INSET_CACHE_ENTRY_OVERHEAD    = 32              ;

interface WwwInsetCacheEntry {
	readonly source       : string ;
	readonly rendered     : string ;
	readonly logicalBytes : number ;
}

export class WwwInset implements Component {
	private cache: { width: number; padding: number; rows: ReadonlyMap<string, WwwInsetCacheEntry> } | undefined;
	constructor(private readonly child: Component, private readonly padding = 2) {}
	invalidate(): void { this.cache = undefined; this.child.invalidate(); }
	private insetRows(sourceRows: readonly string[], width: number, padding: number): string[] {
		const previous     = this.cache?.width === width && this.cache.padding === padding ? this.cache.rows : undefined ;
		const renderedRows = new Array<string>(sourceRows.length)                                                        ;
		const retainedRows = new Map<string, WwwInsetCacheEntry>()                                                       ;
		let retainedBytes  = 0                                                                                           ;
		const inset        = " ".repeat(padding)                                                                         ;
		for (let index = 0; index < sourceRows.length; index++) {
			const source = sourceRows[index];
			// Value keys handle mutable arrays, shifted rows, and repeated padding rows.
			// Only the current generation is retained; old drafts cannot accumulate.
			const entry = retainedRows.get(source) ?? previous?.get(source) ?? (() => {
				const rendered = fit(inset + source, width);
				return {
					source,
					rendered,
					logicalBytes: (source.length + rendered.length) * 2 + WWW_INSET_CACHE_ENTRY_OVERHEAD,
				};
			})();
			renderedRows[index] = entry.rendered;
			if (!retainedRows.has(source) && retainedRows.size < WWW_INSET_CACHE_MAX_ENTRIES && retainedBytes + entry.logicalBytes <= WWW_INSET_CACHE_MAX_LOGICAL_BYTES) {
				retainedRows.set(source, entry);
				retainedBytes += entry.logicalBytes;
			}
		}
		this.cache = { width, padding, rows: retainedRows };
		return renderedRows;
	}
	scrollRows(width: number): ScrollRowSource {
		const padding      = width > this.padding * 2 + 4 ? this.padding : 0 ;
		const contentWidth = Math.max(1, width - padding * 2)                ;
		const lazy         = componentScrollRows(this.child, contentWidth)   ;
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
		for (const action of WWW_HELP_ACTIONS) {
			const binding = WWW_KEYMAP[action];
			const docText = binding.doc.join(" · ");
			rows.push(`${docText.padEnd(18)}${binding.label}`);
		}
		rows.push("Tab (입력 중)       파일·명령 자동완성", "", a.note("질문 요약은 별도 화면이 아니라 실행 타임라인에 쌓입니다."), "");
		for (const [key, command, label] of WWW_VIEWS) rows.push(`${a.active(`Ctrl+G ${key}`)}  ${label}  ${a.muted(command)}`);
		const functionKeys = WWW_KEYS.map(([key]) => key.toUpperCase());
		rows.push("", a.muted(`Ctrl은 Mac의 Control 키입니다. ${functionKeys[0]}–${functionKeys[functionKeys.length - 1]}도 보조 키로 유지합니다.`));
		rows.push(...section("Slash commands", width));
		for (const c of WWW_COMMANDS) rows.push(a.text(`/${c.name}${"argumentHint" in c ? " " + c.argumentHint : ""}`), a.muted(`  ${c.description}`));
		return rows.flatMap(row => prose(row, width));
	}
}

export class WwwWorkspace {
	page                : WwwPage = "execution"       ;
	readonly transcript : WwwTranscriptView           ;
	readonly scrolls    : Record<WwwPage, ScrollView> ;
	readonly component  : Component                   ;
	/** The single cache projection shared by the Cache page and the HUD summary row. */
	readonly cacheTelemetry : () => CacheTelemetrySnapshot ;
	private readonly side   : Component                    ;
	private sidebarEnabled          = true                 ;
	constructor(
		get: () => WorkbenchSnapshot,
		usage: () => readonly UsageSnapshot[],
		bodyHeight: (height: number, width: number, stable?: boolean) => number = height => height,
		clock = Date.now,
		motion = true,
		runtimePresentation: PlanRuntimePresentation | null = null,
		dashboard: Component = new HelpView(),
		executionHeading: Component | null = null,
		lab: Component = new HelpView(),
		sidebars: Partial<Readonly<Record<WwwPage, Component>>> = {},
		usageCacheMetrics: () => UsageSnapshotCacheMetrics | undefined = () => undefined,
		synthetic: () => boolean = () => false,
	) {
		const getChat = () => projectChatFeature(get());
		this.transcript = new WwwTranscriptView(getChat());
		const getPlan = () => projectPlanFeature(get());
		this.cacheTelemetry = () => {
			const observations = get().cacheObservations;
			const usage = usageCacheMetrics();
			return projectWorkbenchCacheTelemetry({
				transcript: this.transcript.cacheMetrics(),
				...(observations ? { observations } : {}),
				...(usage ? { usage } : {}),
				collectedAt: new Date(clock()).toISOString(),
			});
		};
		const scroll = (component: Component) => new ScrollView(new WwwInset(component), { follow: "none", primary: true, overscroll: "contain", scrollbar: "auto", scrollbarStyle: a.rule });
		this.scrolls = {
			dashboard : scroll(dashboard),
			execution : new ChatScrollView(new WwwInset(this.transcript, 1), { follow: "end", primary: true, overscroll: "contain", scrollbar: "auto", scrollbarStyle: a.rule }),
			plan      : scroll(new WwwPlanView    (getPlan, false, clock, motion, runtimePresentation)),
			workflow  : scroll(new WwwWorkflowView(get, synthetic)),
			context   : scroll(new WwwContextView (get, usage, false, synthetic)),
			cache     : scroll(new WwwCacheView   (this.cacheTelemetry, synthetic)),
			usage     : scroll(new WwwUsageView   (get, usage, synthetic)),
			help      : scroll(new HelpView()),
			lab       : scroll(lab),
		};
		const pageSidebars: Partial<Readonly<Record<WwwPage, Component>>> = {
			dashboard : new WwwDashboardRail(get, synthetic),
			workflow  : new WwwWorkflowRail (get, synthetic),
			context   : new WwwContextRail  (get, synthetic),
			cache     : new WwwCacheRail    (this.cacheTelemetry, synthetic),
			usage     : new WwwUsageRail    (get, usage, synthetic),
			...sidebars,
		};
		const sidePlan   = new WwwInset(new WwwPlanView(getPlan, true, clock, motion, runtimePresentation), 1)                            ;
		const sideScroll = new ScrollView(sidePlan, { follow: "none", overscroll: "contain", scrollbar: "auto", scrollbarStyle: a.rule }) ;
		this.side = sideScroll;
		const executionTranscript = executionHeading
			? new VStack([
				{ component: executionHeading, basis: 2, minSize: 2, maxSize: 2 },
				{ component: this.scrolls.execution, basis: 0, grow: 1, minSize: 1 },
			])
			: this.scrolls.execution;
		const execution = new HStack([
			{ component: executionTranscript, basis: 0, grow: 1, minSize: 1 },
			{ component: this.side, basis: 38, minSize: 34, maxSize: 44, visible: ({ width, height }) => {
				return this.sidebarEnabled && width >= 112 && bodyHeight(height, width, true) >= 14;
			} },
		]);
		const pageComponent = (page: WwwPage): Component => {
			if (page === "execution") return execution;
			const sidebar = pageSidebars[page];
			if (!sidebar) return this.scrolls[page];
			const sideScroll = new ScrollView(new WwwInset(sidebar, 1), { follow: "none", overscroll: "contain", scrollbar: "auto", scrollbarStyle: a.rule });
			return new HStack([
				{ component: this.scrolls[page], basis: 0, grow: 1, minSize: 1 },
				{ component: sideScroll, basis: 38, minSize: 34, maxSize: 44, visible: ({ width, height }) => this.sidebarEnabled && width >= 112 && bodyHeight(height, width, true) >= 18 },
			]);
		};
		this.component = new VStack((Object.keys(this.scrolls) as WwwPage[]).map(page => ({ component: pageComponent(page), basis: 0, grow: 1, minSize: 1, visible: () => this.page === page })));
	}
	get currentScroll(): ScrollView { return this.scrolls[this.page]; }
	show(page: WwwPage): void { this.page = page; }
	toggleSidebar(): boolean { this.sidebarEnabled = !this.sidebarEnabled; return this.sidebarEnabled; }
}

export class WwwHeader implements Component {
	constructor(private readonly get: () => WorkbenchSnapshot, private readonly page: () => string, private readonly cwd: string, private readonly clock = Date.now, private readonly motion = true) {}
	invalidate(): void {}
	render(width: number): string[] {
		const s        = this.get()                                                                               ;
		const project  = this.cwd.split(/[\\/]/u).filter(Boolean).at(-1) ?? s.projectId                           ;
		const identity = `${a.strong("www")}  ${a.muted(oneLine(project))} ${a.rule("/")} ${a.text(this.page())}` ;
		const goal     = oneLine(s.sessionGoal?.text, 500)                                                        ;
		const frame    = this.motion ? Math.floor(this.clock() / 120) : 0                                         ;
		const goalText = goal ? wwwFlowText(`Goal  ${goal}`, frame) : ""                                          ;
		return [fit("  " + identity, width), goalText ? fit(`  ${goalText}`, width) : ""];
	}
}

export class WwwExecutionHeading implements Component {
	private readonly immutableActivityNodes = new WeakSet<object>();
	private activityCache: { activities: readonly ProjectActivity[]; threadId: string | null; activeTurnId: string | null; value: ExecutionActivitySummary } | null = null;
	constructor(private readonly get: () => ChatFeatureProjection, private readonly actionHint?: () => string | null, private readonly clock = Date.now, private readonly motion = true) {}
	invalidate(): void { this.activityCache = null; }
	render(width: number): string[] {
		const s = this.get(), heading = executionHeading(s);
		const live            = wwwExecutionIsLive(s)                                                                                                                                          ;
		const ink             = heading.attention ? a.attention : live ? a.active : s.executionRun?.receipt || s.chat.length ? a.success : a.muted                                             ;
		const hint            = s.pendingApproval ? "/approval 확인" : this.actionHint?.() ?? ""                                                                                               ;
		const now             = this.clock()                                                                                                                                                   ;
		const activitySummary = this.activitySummary(s)                                                                                                                                        ;
		const failed          = activitySummary.terminalMethod === "turn/failed" || activitySummary.terminalPhase === "failed"                                                                 ;
		const interrupted     = activitySummary.terminalMethod === "turn/interrupted" || activitySummary.terminalPhase === "cancelled"                                                         ;
		const outcome         = failed ? { marker: a.failure("!"), label: "실패까지" } : interrupted ? { marker: a.muted("−"), label: "중단까지" } : { marker: a.success("✓"), label: "처리" } ;
		const completedTiming = Number.isFinite(activitySummary.headingStartedAt) && Number.isFinite(activitySummary.endedAt) && activitySummary.endedAt >= activitySummary.headingStartedAt
			? `${outcome.marker} ${outcome.label} ${duration(activitySummary.endedAt - activitySummary.headingStartedAt)}  ·  ${WWW_EXECUTION_TIME_FORMAT.format(activitySummary.endedAt)} 종료`
			: "";
		const progress = live && !s.draft
			? workingStatusLine(s, activitySummary, now, this.motion)
			: completedTiming ? a.caption(completedTiming) : "";
		const request = activitySummary.headingTurnId ? [...(s.requestRuntime ?? [])].reverse().find(candidate => candidate.turnId === activitySummary.headingTurnId) : s.requestRuntime?.at(-1) ;
		const stages  = request ? `Stages ${request.stages.filter(stage => stage.status === "completed" || stage.status === "skipped").length}/${request.stages.length}` : ""                    ;
		const cancel  = live ? a.muted(`${hint ? `${hint}  ` : ""}⟦esc 중단⟧`) : hint ? a.muted(hint) : ""                                                                                       ;
		const detail  = `${progress && !live ? ink(heading.state) : a.caption(heading.detail)}${stages ? `  ${a.plan(stages)}` : ""}`                                                            ;
		const queue   = s.chatQueue.length ? a.active(`+${s.chatQueue.length} 대기`) : ""                                                                                                        ;
		const core    = live && visibleWidth(progress) > width - 1 - (cancel ? visibleWidth(cancel) + 2 : 0)
			? workingStatusLine(s, activitySummary, now, this.motion, true)
			: live ? progress : progress || `${ink(heading.state)}  ${a.strong(heading.title)}`                                                                                                            ;
		return [fit(` ${boundedHeadingRow(width - 1, core, [{ text: queue, fill: false }, { text: detail, fill: true }], cancel)}`, width)];
	}
	private activitySummary(snapshot: ChatFeatureProjection): ExecutionActivitySummary {
		const cache = this.activityCache;
		if (cache
			&& cache.activities === snapshot.activities
			&& cache.threadId === snapshot.threadId
			&& cache.activeTurnId === snapshot.activeTurnId) return cache.value;
		const value = executionActivitySummary(snapshot);
		if (this.trustedImmutable(snapshot.activities)) this.activityCache = {
			activities   : snapshot.activities,
			threadId     : snapshot.threadId,
			activeTurnId : snapshot.activeTurnId,
			value,
		};
		else this.activityCache = null;
		return value;
	}
	private trustedImmutable(activities: readonly ProjectActivity[]): boolean {
		if (this.immutableActivityNodes.has(activities)) return true;
		const validated = new Set<object>();
		if (!validateDeeplyImmutableHeadingData(activities, this.immutableActivityNodes, new Set(), validated)) return false;
		for (const node of validated) this.immutableActivityNodes.add(node);
		return true;
	}
}

const WWW_EXECUTION_TIME_FORMAT = new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
const TERMINAL_TURN_METHODS = new Set(["turn/completed", "turn/interrupted", "turn/failed"]);

interface ExecutionActivitySummary {
	readonly headingTurnId           : string | undefined                   ;
	readonly headingStartedAt        : number                               ;
	readonly endedAt                 : number                               ;
	readonly terminalMethod          : string                               ;
	readonly terminalPhase           : ProjectActivity["phase"] | undefined ;
	readonly workingStartedAt        : number                               ;
	readonly observedActiveTerminals : number                               ;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Priority-bounded status row: the core never breaks mid-word; whole segments drop before the filler shrinks. */
function boundedHeadingRow(width: number, core: string, segments: readonly { text: string; fill: boolean }[], reserved: string): string {
	const gap          = "  "                                                                                                                         ;
	const coreWidth    = visibleWidth(core)                                                                                                           ;
	const reservedRoom = reserved && coreWidth + visibleWidth(reserved) + visibleWidth(gap) <= width ? visibleWidth(reserved) + visibleWidth(gap) : 0 ;
	const parts        = [core]                                                                                                                       ;
	let used           = coreWidth                                                                                                                    ;
	for (const { text, fill } of segments) {
		if (!text) continue;
		const room = width - used - reservedRoom - visibleWidth(gap)                                                                                ;
		if (fill) {
			if (room < 12) continue;
			const filled = fit(text, room)                                                                                                          ;
			parts.push(filled)                                                                                                                      ;
			used += visibleWidth(filled) + visibleWidth(gap)                                                                                        ;
			continue                                                                                                                                ;
		}
		if (visibleWidth(text) > room) continue                                                                                                     ;
		parts.push(text)                                                                                                                            ;
		used += visibleWidth(text) + visibleWidth(gap)                                                                                              ;
	}
	if (reservedRoom) parts.push(reserved);
	return parts.join(gap);
}

function workingStatusLine(snapshot: ChatFeatureProjection, summary: ExecutionActivitySummary, now: number, motion: boolean, brief = false): string {
	const elapsed       = Number.isFinite(summary.workingStartedAt) ? duration(Math.max(0, now - summary.workingStartedAt)) : "실행 경과 계산 중"   ;
	if (brief) return `${a.active(WWW_ACTIVITY_SPINNER[motion ? Math.floor(now / 120) % WWW_ACTIVITY_SPINNER.length : WWW_ACTIVITY_SPINNER.length - 1])} ${a.active("Working")} ${a.caption(elapsed)}`;
	const terminals     = summary.observedActiveTerminals > 0 ? summary.observedActiveTerminals : snapshot.liveActivity?.kind === "tool" ? 1 : null ;
	const terminalLabel = terminals === null ? "terminal 상태 확인 중" : `${terminals} terminal${terminals === 1 ? "" : "s"} running`               ;
	const spinner       = WWW_ACTIVITY_SPINNER[motion ? Math.floor(now / 120) % WWW_ACTIVITY_SPINNER.length : WWW_ACTIVITY_SPINNER.length - 1]      ;
	return `${a.active(spinner)} ${a.active("Working")} ${a.caption(`(${elapsed} · ${terminalLabel})`)}`;
}

const WWW_ACTIVITY_SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

/** Derive root-turn timing and latest command lifecycles in two linear passes per new activity revision. */
function executionActivitySummary(snapshot: ChatFeatureProjection): ExecutionActivitySummary {
	let terminal: ProjectActivity | undefined;
	let latestStartedTurnId: string | undefined;
	for (const activity of snapshot.activities) {
		if (snapshot.threadId && activity.nativeRefs.threadId !== snapshot.threadId) continue;
		const method = String(activity.payload.method ?? "");
		if (TERMINAL_TURN_METHODS.has(method)) terminal = activity;
		if (method === "turn/started") latestStartedTurnId = activity.nativeRefs.turnId;
	}
	const headingTurnId   = snapshot.activeTurnId ?? terminal?.nativeRefs.turnId ?? latestStartedTurnId ;
	const workingTurnId   = snapshot.activeTurnId ?? latestStartedTurnId                                ;
	let headingStartedAt  = Number.NaN                                                                  ;
	let workingStartedAt  = Number.NaN                                                                  ;
	let headingStartFound = false                                                                       ;
	let workingStartFound = false                                                                       ;
	const latest          = new Map<string, ProjectActivity>()                                          ;
	for (const activity of snapshot.activities) {
		if (snapshot.threadId && activity.nativeRefs.threadId !== snapshot.threadId) continue;
		if (headingTurnId
			&& activity.nativeRefs.turnId === headingTurnId
			&& activity.payload.method === "turn/started"
			&& !headingStartFound) {
			headingStartFound = true;
			headingStartedAt = Date.parse(activity.recordedAt);
		}
		if (workingTurnId && activity.nativeRefs.turnId === workingTurnId) {
			if (activity.payload.method === "turn/started" && !workingStartFound) {
				workingStartFound = true;
				workingStartedAt = Date.parse(activity.recordedAt);
			}
			if (activity.kind === "tool" && activity.nativeRefs.itemId) latest.set(activity.nativeRefs.itemId, activity);
		}
	}
	const observed = [...latest.values()].filter(activity => {
		if (!["started", "updated"].includes(activity.phase)) return false;
		const item = isRecord(activity.payload.params) ? activity.payload.params.item : undefined;
		return isRecord(item) && item.type === "commandExecution";
	}).length;
	return {
		headingTurnId,
		headingStartedAt,
		endedAt        : Date.parse(terminal?.recordedAt ?? ""),
		terminalMethod : String(terminal?.payload.method ?? ""),
		terminalPhase  : terminal?.phase,
		workingStartedAt,
		observedActiveTerminals: observed,
	};
}

function validateDeeplyImmutableHeadingData(
	value: unknown,
	known: WeakSet<object>,
	visiting: Set<object>,
	validated: Set<object>,
): boolean {
	if (!value) return true;
	if (typeof value === "function") return false;
	if (typeof value !== "object") return true;
	if (known.has(value)) return true;
	if (visiting.has(value)) return true;
	if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) return false;
	if (!Object.isFrozen(value)) return false;
	visiting.add(value);
	for (const key of Reflect.ownKeys(value)) {
		const descriptor = Object.getOwnPropertyDescriptor(value, key);
		if (!descriptor || !("value" in descriptor) || !validateDeeplyImmutableHeadingData(descriptor.value, known, visiting, validated)) return false;
	}
	visiting.delete(value);
	validated.add(value);
	return true;
}

export class WwwNotice implements Component {
	private notice = "";
	get hasNotice(): boolean { return this.notice.length > 0; }
	setNotice (text: string ): void { this.notice = oneLine(text, 3000); }
	invalidate()             : void {}
	render    (width: number): string[] { return [fit(`  ${a.muted(this.notice)}`, width)]; }
}

export class WwwComposer implements Component {
	constructor(
		private readonly child: Component,
		private readonly editor: Editor,
		private readonly get: () => WorkbenchSnapshot,
		private readonly decorateEditor: () => boolean = () => true,
		private readonly activityStatus: Component | null = null,
		private readonly showActivityStatus: () => boolean = () => true,
	) {}
	invalidate(): void { this.child.invalidate(); this.activityStatus?.invalidate(); }
	rowCount(width: number): number {
		return this.child.render(width).length + (this.decorateEditor() && this.showActivityStatus() && this.activityStatus ? 1 : 0);
	}
	render(width: number): string[] {
		const rows = this.child.render(width);
		if (!this.decorateEditor()) return rows;
		// Editor rails may contain a scroll indicator. Match only rails (editable
		// rows have padding), leaving text, cursor markers and autocomplete intact.
		const rail = (row: string): string | null => /^─+(?: ([↑↓] \d+ more) )?─*$/u.exec(stripTerminalSequences(row))?.[1] ?? (/^─+$/u.test(stripTerminalSequences(row)) ? "" : null);
		const above = rows[0] ? rail(rows[0]) : null;
		if (above === null) return rows;
		const s        = this.get()                                                                            ;
		const ink      = !this.editor.focused ? a.rule : s.pendingApproval ? a.attention : a.active            ;
		const model    = oneLine(workbenchModelLabel(s.activeModel ?? s.model), 48)                            ;
		const effort   = oneLine(workbenchEffortLabel(s.effort), 16)                                           ;
		const rawLabel = `${this.editor.focused ? "›" : "·"} ${model} · ${effort}${above ? `  ${above}` : ""}` ;
		const label    = truncateToWidth(rawLabel, Math.max(0, width - 5), "")                                 ;
		rows[0] = fit(`  ${ink(label)} ${ink("─".repeat(Math.max(0, width - visibleWidth(label) - 5)))}`, width);
		if (!this.editor.getText() && s.phase === "working" && rows[1] !== undefined) {
			rows[1] = fit(`  ${this.editor.focused ? CURSOR_MARKER : ""}${a.muted("Queue · Esc 전송")}`, width);
		}
		// Preserve the Editor's row/column coordinates and its autocomplete rows.
		const bottom = rows.findIndex((row, index) => index > 0 && rail(row) !== null);
		const below = bottom > 0 ? rail(rows[bottom]) : null;
		if (below !== null) {
			const label = below ? `${below} ` : "";
			rows[bottom] = fit(`  ${ink(label + "─".repeat(Math.max(0, width - visibleWidth(label) - 4)))}`, width);
		}
		return [...(this.showActivityStatus() ? this.activityStatus?.render(width) ?? [] : []), ...rows];
	}
}

export class WwwHud implements Component {
	constructor(
		private readonly get: () => WorkbenchSnapshot,
		private readonly usage: () => readonly UsageSnapshot[] = () => [],
		private readonly showLogos = true,
		private readonly cache: () => CacheTelemetrySnapshot | undefined = () => undefined,
	) {}
	invalidate(): void {}
	render(width: number): string[] {
		const s = this.get();
		if (s.hud?.showUsage === false) return [""];
		const contentWidth = Math.max(1, width - 2)                                                                ;
		const runtime      = wwwRuntimeStatus(s, contentWidth)                                                     ;
		const sessionWidth = runtime ? Math.max(1, contentWidth - visibleWidth(runtime) - 2) : contentWidth        ;
		const quota        = wwwQuotaHudRows(this.usage(), contentWidth, Date.now(), this.showLogos, sessionWidth) ;
		// The quota grid pads its last row to sessionWidth; the padding is not content.
		const third   = (quota[2] ?? "").replace(/\s+$/u, "") ;
		const request = wwwHudRequestSegment(s)               ;
		const cache   = wwwHudCacheSegment(this.cache())      ;
		return [
			fit(`  ${quota[0] ?? ""}`, width),
			fit(`  ${quota[1] ?? ""}`, width),
			fit(`  ${wwwHudSummaryRow(third, request, cache, runtime, contentWidth)}`, width),
		];
	}
}

/** HUD left group keeps the quota grid intact; summary segments drop cache first, then request. */
function wwwHudSummaryRow(third: string, request: string, cache: string, runtime: string, width: number): string {
	const rows = [third, request, cache].filter(Boolean)                                                                                  ;
	const overflow = (): boolean => visibleWidth(rows.join("  ")) + (runtime ? visibleWidth(runtime) + 2 : 0) > width                     ;
	while (rows.length > 1 && overflow()) rows.pop()                                                                                      ;
	const gap = runtime ? " ".repeat(Math.max(2, width - visibleWidth(rows.join("  ")) - visibleWidth(runtime))) : ""                     ;
	return `${rows.join("  ")}${runtime ? `${gap}${runtime}` : ""}`                                                                       ;
}

/** Monitor essence: the live tool/agent while working, the failed request after a failure. */
function wwwHudRequestSegment(snapshot: WorkbenchSnapshot): string {
	const chat    = projectChatFeature(snapshot)                                                                                          ;
	const request = snapshot.requestRuntime?.at(-1)                                                                                       ;
	if (wwwExecutionIsLive(chat)) {
		const kind  = chat.liveActivity?.kind                                                                                             ;
		const label = kind === "tool" ? "Bash" : kind === "file-change" ? "Edit" : oneLine(kind ?? "실행", 12)                             ;
		return `${a.active("›")} ${a.tool(label)}`                                                                                        ;
	}
	if (request && ["failed", "blocked"].includes(request.status)) {
		const done = request.stages.filter(stage => stage.status === "completed" || stage.status === "skipped").length                    ;
		return a.failure(`! Request ${done}/${request.stages.length}`)                                                                    ;
	}
	return ""                                                                                                                             ;
}

/** Cache essence from the same projection as the Cache page; unobserved stays silent. */
function wwwHudCacheSegment(cache: CacheTelemetrySnapshot | undefined): string {
	if (!cache) return ""                                                                                                                 ;
	const stale = cache.layers.filter(layer => layer.state === "stale").length                                                            ;
	if (stale) return a.attention(`Cache ${stale} stale`)                                                                                 ;
	const hits     = cache.totals.hits ?? 0   ;
	const misses   = cache.totals.misses ?? 0 ;
	const accessed = hits + misses > 0        ;
	if (!accessed && cache.totals.entries === null) return ""                                                                             ;
	const hitRate = accessed ? `${Math.round(hits / (hits + misses) * 100)}% · ` : ""                                                     ;
	return a.muted(`Cache ${hitRate}${compactTokens(cache.totals.entries ?? 0)}`)                                                         ;
}

function wwwRuntimeStatus(snapshot: WorkbenchSnapshot, maximumWidth: number): string {
	const label = runtimeModeLabel(snapshot.permissionMode, snapshot.collaborationMode);
	const mode = label === "bypass mode" ? a.attention(label) : label === "plan mode" ? a.plan(label) : a.success(label);
	const context = snapshot.contextUsage && Number.isFinite(snapshot.contextUsage.percent)
		? a.muted(`Context ${compactTokens(snapshot.contextUsage.usedTokens)} / ${compactTokens(snapshot.contextUsage.contextWindow)} ${Math.round(Math.max(0, Math.min(100, snapshot.contextUsage.percent)))}%`)
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
export class WwwViewSwitcher implements Component {
	private selected = 0;
	constructor(private readonly choose: (command: string) => void, private readonly close: () => void, private readonly repaint: () => void) {}
	invalidate(): void {}
	render(width: number): string[] {
		return [a.strong("화면 이동"), a.muted("숫자를 누르면 이동합니다. 입력 초안은 유지됩니다."), "", ...WWW_VIEWS.map(([key, command, label], i) => {
			const row = fit(`${i === this.selected ? "›" : " "} ${key}  ${label}  ${command}`, width);
			return i === this.selected ? a.selected(row) : a.text(row);
		}), "", a.muted("↑↓ 선택 / Enter 이동 / Esc 닫기")].map(row => fit(row, width));
	}
	handleInput(data: string): void {
		if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("g"))) return this.close();
		const direct = WWW_VIEWS.find(([key]) => data === key);
		if (direct) return this.choose(direct[1]);
		if (matchesKey(data, Key.enter)) return this.choose(WWW_VIEWS[this.selected][1]);
		if (matchesKey(data, Key.up)) this.selected = Math.max(0, this.selected - 1);
		if (matchesKey(data, Key.down)) this.selected = Math.min(WWW_VIEWS.length - 1, this.selected + 1);
		this.repaint();
	}
}

/** Search is local. Choosing a command fills the composer; it never executes a mutation. */
export class WwwCommandPalette implements Component {
	private query = "";
	private selected = 0;
	constructor(private readonly choose: (command: string) => void, private readonly close: () => void, private readonly repaint: () => void) {}
	private matches() { const q = this.query.replace(/^\//u, "").toLowerCase(); return WWW_COMMANDS.filter(c => `${c.name} ${c.description}`.toLowerCase().includes(q)); }
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
export class WwwSheet implements Component {
	private offset          = 0     ;
	private rowCount        = 0     ;
	private viewportHeight  = 1     ;
	private promptLine      = -1    ;
	private revealSelection = false ;
	private selectionKey    = ""    ;
	constructor(private readonly content: Component & { renderActions?(width: number): string[] }, private readonly height: () => number, private readonly options: { followPrompt?: boolean; followSelection?: boolean } = {}) {}
	invalidate(): void { this.content.invalidate(); }
	render(width: number): string[] {
		const inner       = Math.max(1, width - 4)                    ;
		const allLines    = this.content.render(inner)                ;
		const allPinned   = this.content.renderActions?.(inner) ?? [] ;
		let pinned        = allPinned                                 ;
		const pinnedLimit = Math.max(1, this.height() - 5)            ;
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
			const key = `${selected}:${selected >= 0 ? stripTerminalSequences(lines[selected]) : ""}`;
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
