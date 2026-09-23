import { executeDevelopmentShellCommand, type DevelopmentService } from "../../../../core/application/development/development-service";
/** @linear WOO-674 WOO-727 */
import {
	CombinedAutocompleteProvider,
	Editor,
	Key,
	ProcessTerminal,
	ScrollView,
	stripTerminalSequences,
	TuiAltScreen,
	VStack,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
	isViewportTUI,
	matchesKey,
	type Component,
	type OverlayHandle,
	type Terminal,
} from "@earendil-works/pi-tui";
import type { AuthController, ComposerDraftController, ObservabilityHistoryReader, UsageMonitor, WorkbenchGitTelemetryReader } from "../../../../core/ports";
import type { ProjectWorkbench } from "../../../../core/application/orchestration/project-workbench";
import { EMPTY_DEVELOPMENT_MAP, type DevelopmentMapSnapshot } from "../../../../core/domain/development/development-map";
import { projectObservabilityDashboard, summarizeObservabilityStreams, type ObservabilityDashboard } from "../../../../core/domain/observability/observability-dashboard";
import { projectRuntimeMonitor, type RuntimeMonitorProjection } from "../../../../core/domain/observability/runtime-monitor";
import { nativeModelEfforts, type Provider, type WwwSettings } from "../../../../core/domain/execution/model-settings";
import { projectSessionStats } from "../../../../core/domain/observability/session-stats";
import { sanitizeTerminalTextUnbounded } from "../../../../core/domain/execution/terminal";
import type { WorkbenchSnapshot } from "../../../../core/domain/work/workbench";
import { createDashboardLayout } from "../foundation/layout/dashboard-layout";
import { StatusLine, todoPanelTimestamp, WorkspaceTodoView } from "../features/dashboard/shared-dashboard-views";
import { WorkbenchChatView } from "../features/chat/workbench-views";
import { renderDelegationDetail, renderDelegationSummary } from "../features/chat/delegation-tree-view";
import { ThreeBodyLabView } from "../features/chat/three-body-lab";
import { EntryDashboardView, WwwDashboardView } from "../features/dashboard/entry-dashboard-view";
import { WorkbenchMonitorView } from "../features/monitoring/workbench-monitor-view";
import { WorkbenchTracerView } from "../features/trace/workbench-tracer-view";
import { ExitKeyPolicy } from "./exit-key-policy";
import { LoginOverlay } from "../features/authentication/auth-overlay";
import { ApprovalOverlay } from "../features/approval/approval-overlay";
import { approvalCardRows, projectApprovalBackgroundState } from "../features/approval/approval-presentation";
import { ModelPickerOverlay } from "../features/model-selection/model-picker-overlay";
import { OverlaySheet } from "../foundation/components/overlay-sheet";
import { RenderScheduler, workbenchRenderUrgency } from "../foundation/rendering/render-scheduler";
import { ShellLifecycle } from "./shell-lifecycle";
import { parseWorkbenchShellCommand, withNativeModelCompletions, WORKBENCH_SLASH_COMMANDS } from "../commands/slash-commands";
import { colors, composerBorderColor, editorTheme, getActiveTuiTheme, setActiveTuiTheme, tuiBackgroundResetSequence, tuiBackgroundSequence, TUI_THEME_OPTIONS } from "../foundation/theme/theme";
import { WorkbenchBottomHudView } from "../features/usage/workbench-bottom-hud";
import { WorkbenchTelemetryLine, workbenchModelLabel } from "../features/monitoring/workbench-telemetry";
import { UsageStripView } from "../features/usage/usage-strip-view";
import { WORKBENCH_HUD_SYSTEM } from "../features/usage/workbench-hud-system";
import { runtimeModeLabel, workbenchEffortLabel } from "../foundation/labels";
import { DevelopmentMapView } from "../features/project-map/development-map-view";
import { ObservabilityDashboardView } from "../features/session/observability-dashboard-view";
import { RuntimeMonitorView } from "../features/monitoring/runtime-monitor-view";
import { SessionStatsView } from "../features/stats/session-stats-view";
import { AstraContextView } from "../features/context/astra-context-view";
import { AstraHistoryView } from "../features/session/astra-history-view";
import { AstraMapView } from "../features/project-map/astra-map-view";
import { AstraMonitorView } from "../features/monitoring/astra-monitor-view";
import { AstraStatsView } from "../features/stats/astra-stats-view";
import { AstraTestView, projectAstraTestView } from "../features/test/astra-test-view";
import { requestRuntimeMotionActive, requestRuntimeRows } from "../features/monitoring/request-runtime-view";
import { AstraCommandPalette, AstraComposer, AstraExecutionHeading, AstraHeader, AstraHud, AstraInset, AstraNotice, AstraSheet, AstraViewSwitcher, AstraWorkspace, ASTRA_COMMANDS, ASTRA_KEYMAP, ASTRA_KEYS, ASTRA_SCROLL_KEYS, astraPageLabel, matchesAstraAction, matchesAstraKey, type AstraPage } from "./astra-surface";
import { astraExecutionIsLive, astraNowLabel } from "../features/chat/astra-execution";
import { ASTRA_DEMO_PAGES, createAstraDemoState } from "../features/demo/astra-demo";
import { a, astraColors, astraEditorTheme } from "../foundation/theme/astra-theme";
import type { UsageSnapshot } from "../../../../core/ports";
import {
	ComponentSlot,
	createWorkbenchViewHost,
	directObservabilityView,
	DevelopmentMapPollingLifecycle,
	rotateObservabilityView,
	shouldHandleObservabilityShortcut,
	WorkbenchNavigationController,
	workbenchDashboardSessionIndex,
	workbenchStatsTargetCommand,
	workbenchViewModeCommand,
	type ObservabilityViewMode,
} from "./workbench-navigation.controller";
import {
	loginProviderFromInput,
	nextWorkbenchRuntimeMode,
	workbenchModelSettings,
	workbenchPaneNotice,
	workbenchReceiptClearsComposer,
	workbenchReceiptNotice,
	workbenchRuntimeConfiguration,
} from "./workbench-input.controller";

export interface ProjectWorkbenchShellDependencies {
	design?: "astra";
	/** Preview/test seam; production sessions continue to open Chat. */
	initialAstraPage?: AstraPage;
	terminal?: Terminal;
	workbench: ProjectWorkbench;
	development?: DevelopmentService;
	cwd?: string;
	usage: UsageMonitor;
	auth: AuthController;
	developmentMapSource?: {
		startPolling(listener: (snapshot: DevelopmentMapSnapshot) => void, intervalMs?: number): () => void;
	};
	observabilityHistorySource?: ObservabilityHistoryReader;
	gitTelemetrySource?: WorkbenchGitTelemetryReader;
	homeDirectory?: string;
	composerDraft?: ComposerDraftController;
	releaseSessionLease?: () => Promise<void>;
}

export const WORKBENCH_STATUS_NOTICE = "";

/** The active Native model belongs to the composer it drives, not the quota HUD. */
export function composerModelHeader(source: Pick<WorkbenchSnapshot, "model" | "activeModel" | "effort">, width: number): string {
	const label = `${workbenchModelLabel(source.activeModel ?? source.model)}${source.effort ? ` · ${workbenchEffortLabel(source.effort)}` : ""}`;
	const prefix = `${WORKBENCH_HUD_SYSTEM.composer.leftCap} `;
	const suffix = " ";
	const available = Math.max(0, width - visibleWidth(prefix) - visibleWidth(suffix));
	const content = truncateToWidth(label, available, "");
	const rule = WORKBENCH_HUD_SYSTEM.composer.divider.repeat(Math.max(0, width - visibleWidth(prefix) - visibleWidth(content) - visibleWidth(suffix)));
	return truncateToWidth(`${colors.accent(prefix + content)}${colors.border(suffix + rule)}`, Math.max(0, width), "");
}

/** Adds the model label to the input edge while preserving the child focus owner. */
class ComposerModelFrame implements Component {
	constructor(
		private readonly child: Component,
		private readonly snapshot: () => Pick<WorkbenchSnapshot, "model" | "activeModel" | "effort">,
	) {}

	invalidate(): void { this.child.invalidate(); }

	render(width: number): string[] {
		if (width <= 0) return [];
		const rows = this.child.render(width);
		// Editor has a plain horizontal top edge. Replace only that edge so
		// overlays keep their own title and the composer does not gain a row.
		if (rows[0] && /^─+$/u.test(stripTerminalSequences(rows[0]))) {
			rows[0] = colors.muted(composerModelHeader(this.snapshot(), width));
		}
		return rows;
	}
}

function emptyObservabilityDashboard(): ObservabilityDashboard {
	return Object.freeze({
		coverage: Object.freeze({ state: "unknown", observedFrom: null, observedUntil: null, streamsRead: 0, skippedStreams: 0 }),
		sessions: Object.freeze({ active: null, completed: null, failures: null }),
		usage: Object.freeze({ totalTokens: null, models: Object.freeze([]) }),
		health: Object.freeze({ completionPercent: null, retries: null, failures: null }),
		trend: Object.freeze({ available: false, buckets: Object.freeze([]) }),
		attention: Object.freeze([]),
		recentSessions: Object.freeze([]),
	});
}
function unavailableHistoricalMonitor(): RuntimeMonitorProjection {
	return Object.freeze({
		state: "idle", activeRequest: null, model: null, agent: null, currentTool: null, approval: null,
		retryCount: 0, failureCount: 0, sourceActivityIds: Object.freeze([]), recentEvents: Object.freeze([]), skillRun: null,
	});
}

export function workbenchFrameTitle(source: Pick<WorkbenchSnapshot,
	"projectId" | "model" | "activeModel" | "effort" | "phase" | "collaborationMode" | "permissionMode" | "chatQueue" | "pendingApproval"
>): string {
	return `🐙 WWW · ${source.projectId} · ${workbenchModelLabel(source.activeModel ?? source.model)} · ${workbenchEffortLabel(source.effort)} · ${source.phase} · ${runtimeModeLabel(source.permissionMode, source.collaborationMode)}${source.pendingApproval ? " · 승인 대기" : ""}`;
}

const WORKBENCH_ACTIVITY_FRAMES = Object.freeze(["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]);
// Every frame walks the viewport layout. Four visible frames per second keeps
// working state legible without competing with typing or scrolling.
const WORKBENCH_ACTIVITY_INTERVAL_MS = 240;
const WORKBENCH_ACTIVITY_MESSAGE_MAX_CHARS = 72;
const WORKBENCH_TOOL_STALL_MS = 3 * 60 * 1_000;
const COMPOSER_WELCOME_BORDER_INTERVAL_MS = 750;

interface WorkbenchActivityIndicatorSource {
	readonly phase: string;
	readonly activeTurnId?: string | null;
	readonly pendingApproval: unknown;
	readonly activities?: readonly Pick<WorkbenchSnapshot["activities"][number], "recordedAt" | "phase" | "nativeRefs">[];
	readonly chatQueue?: readonly unknown[];
	readonly draft: string;
	readonly reasoningDraft: string;
	readonly reasoningSummaryDraft?: string;
	readonly liveActivity?: {
		readonly method: string;
		readonly kind: "tool" | "progress" | "file-change" | "approval";
		readonly text?: string;
		readonly nativeRefs?: { readonly threadId?: string; readonly turnId?: string; readonly itemId?: string };
	} | null;
	readonly chat: readonly { readonly role: string; readonly content: string; readonly status?: string }[];
	readonly workFlow: {
		readonly currentStepNumber: number | null;
		readonly steps: readonly {
			readonly number: number;
			readonly title: string;
		}[];
	};
}

export interface WorkbenchActivityIndicator {
	readonly message: string;
	readonly hint: string;
	readonly frames: readonly string[];
	readonly intervalMs: number;
}

/** Gajae-style live rail driven only by public Native workbench state. */
export function workbenchActivityIndicator(source: WorkbenchActivityIndicatorSource, now = Date.now()): WorkbenchActivityIndicator | null {
	const outboundPending = [...source.chat].reverse().find((message) => message.role === "user")?.status === "streaming";
	if (source.phase !== "working" && !outboundPending) return null;
	const queueDepth = source.chatQueue?.length ?? 0;
	const reasoningSummary = boundedActivityText(source.reasoningSummaryDraft);
	const currentStep = source.workFlow.currentStepNumber === null
		? undefined
		: source.workFlow.steps.find((step) => step.number === source.workFlow.currentStepNumber);
	const currentStepTitle = boundedActivityText(currentStep?.title);
	const liveActivity = liveActivityLabel(source.liveActivity);
	const liveRefs = source.liveActivity?.nativeRefs;
	let liveStartedAt: string | undefined;
	if (source.liveActivity?.kind === "tool" && liveRefs && liveRefs.turnId === source.activeTurnId) {
		liveStartedAt = [...(source.activities ?? [])].reverse().find((activity) =>
			activity.phase === "started"
			&& activity.nativeRefs.threadId === liveRefs.threadId
			&& activity.nativeRefs.turnId === liveRefs.turnId
			&& activity.nativeRefs.itemId === liveRefs.itemId)?.recordedAt;
	}
	const toolObservationStalled = Boolean(liveStartedAt
		&& Number.isFinite(Date.parse(liveStartedAt))
		&& now - Date.parse(liveStartedAt) >= WORKBENCH_TOOL_STALL_MS);
	const stepLabel = currentStep && currentStepTitle
		? `단계 ${source.workFlow.currentStepNumber}/${source.workFlow.steps.length} · ${currentStepTitle}`
		: null;
	let label: string;
	if (source.pendingApproval) {
		label = queueDepth > 0
			? `승인 대기 · 현재 턴 일시중지 · 대기 메시지 ${queueDepth}개는 승인 후 전송`
			: "승인 대기 · 현재 턴 일시중지";
	} else if (toolObservationStalled) {
		label = "관측 단절 가능 · Tool 결과를 3분 이상 받지 못했습니다";
	} else if (outboundPending) {
		label = "전송 · 요청을 Native Thread에 전달하는 중";
	} else if (source.draft) {
		label = "응답 · 결과를 작성하는 중";
	} else if (stepLabel && liveActivity) {
		label = `${stepLabel} · ${liveActivity}`;
	} else if (liveActivity) {
		label = `실행 · ${liveActivity}${reasoningSummary ? ` · 판단 · ${reasoningSummary}` : ""}`;
	} else if (stepLabel) {
		label = `${stepLabel}${reasoningSummary ? ` · 판단 · ${reasoningSummary}` : ""}`;
	} else if (reasoningSummary) {
		label = `분석 · ${reasoningSummary}`;
	} else if (source.workFlow.steps.length > 0) {
		label = `마무리 · ${source.workFlow.steps.length}개 단계 결과를 정리하는 중`;
	} else {
		label = "분석 · 실행 순서를 정리하는 중";
	}
	return Object.freeze({
		message: label,
		hint: "",
		frames: source.pendingApproval ? Object.freeze(["⏸"]) : WORKBENCH_ACTIVITY_FRAMES,
		intervalMs: source.pendingApproval ? 1_000 : WORKBENCH_ACTIVITY_INTERVAL_MS,
	});
}

function liveActivityLabel(activity: WorkbenchActivityIndicatorSource["liveActivity"]): string | null {
	if (!activity) return null;
	const method = activity.method.replace(/[-_]/gu, "").toLowerCase();
	const detail = boundedActivityText(activity.text);
	if (activity.kind === "file-change" || method.includes("filechange")) return detail ? `Edit · ${detail}` : "Edit 변경을 반영하는 중";
	if (activity.kind === "approval" || method.includes("approval")) return detail ? `승인 · ${detail}` : "승인 결과를 기다리는 중";
	if (activity.kind === "tool" && /command|bash|shell/u.test(method)) return detail ? `Bash · ${detail}` : "Bash 명령 결과를 확인하는 중";
	if (activity.kind === "tool") return detail ? `Tool · ${detail}` : "Tool 실행 결과를 확인하는 중";
	return detail ?? "현재 작업 상태를 확인하는 중";
}

function boundedActivityText(value: string | undefined): string | null {
	const text = sanitizeTerminalTextUnbounded(value ?? "")
		.replace(/\s*⟦\s*esc\s*⟧\s*/giu, " ")
		.replace(/\s+/gu, " ")
		.trim();
	if (!text) return null;
	const characters = Array.from(text);
	return characters.length <= WORKBENCH_ACTIVITY_MESSAGE_MAX_CHARS
		? text
		: `${characters.slice(0, WORKBENCH_ACTIVITY_MESSAGE_MAX_CHARS - 1).join("")}…`;
}

/** @Unit Code-004 */
/** Native workbench shell. */
/** @codeId 0004 */
export function runProjectWorkbenchShell(dependencies: ProjectWorkbenchShellDependencies): void {
	const { workbench, usage, auth, composerDraft, releaseSessionLease } = dependencies;
	const cwd = dependencies.cwd ?? process.cwd();
	const terminal = dependencies.terminal ?? new ProcessTerminal();
	const tui = new TuiAltScreen(terminal, true);
	const terminalBackgroundEnabled = dependencies.design === "astra" && process.env.NO_COLOR === undefined;
	const applyTerminalBackground = (): void => { if (terminalBackgroundEnabled) terminal.write(tuiBackgroundSequence()); };
	const resetTerminalBackground = (): void => { if (terminalBackgroundEnabled) terminal.write(tuiBackgroundResetSequence()); };
	let liveSnapshot = workbench.snapshot;
	let snapshot = liveSnapshot;
	let liveUsageSnapshots: readonly UsageSnapshot[] = [];
	let usageSnapshots: readonly UsageSnapshot[] = liveUsageSnapshots;
	let demoMode = false;
	let demoIndex = 0;
	let demoReturnPage: AstraPage = "execution";
	let demoReturnDraft = "";
	let synchronizeSnapshotUi = (): void => undefined;
	const astraMotion = process.env.ASTRA_REDUCED_MOTION !== "1" && process.env.NO_COLOR === undefined;
	// pi-tui visibility callbacks receive the whole terminal, even in nested
	// stacks. Reserve the real composer/HUD chrome before showing side content.
	function astraBodyHeight(rows: number, columns: number, stable = false): number {
		// Keep the transcript's width stable while typing. Only the scrollable
		// plan keeps its column; the optional note still uses the real row budget.
		return Math.max(1, rows - (stable ? 3 : composerFrame.render(columns).length) - (rows >= 12 ? 2 : 0) - 2
			- (rows >= 5 && (stable || status.hasNotice) ? 1 : 0) - (rows >= 7 ? 1 : 0));
	}
	const astraExecutionHeading = dependencies.design === "astra"
		? new AstraExecutionHeading(() => snapshot, undefined, Date.now, astraMotion)
		: null;
	let closeThreeBodyLab = (): void => undefined;
	const threeBodyLab = dependencies.design === "astra"
		? new ThreeBodyLabView({
			viewportHeight: () => astraBodyHeight(terminal.rows, terminal.columns),
			onClose: () => closeThreeBodyLab(),
		})
		: null;
	const astra = dependencies.design === "astra" ? new AstraWorkspace(
		() => snapshot,
		() => usageSnapshots,
		astraBodyHeight,
		Date.now,
		astraMotion,
		{ motionActive: requestRuntimeMotionActive, rows: requestRuntimeRows },
		new WwwDashboardView(() => snapshot, () => demoMode),
		astraExecutionHeading,
		threeBodyLab ?? undefined,
		{},
		() => dependencies.usage.cacheMetrics(),
		() => demoMode,
	) : null;
	astra?.show(dependencies.initialAstraPage ?? "execution");
	const status = astra ? new AstraNotice() : new StatusLine(WORKBENCH_STATUS_NOTICE);
	const entryDashboard = new EntryDashboardView(() => snapshot.linearDashboard);
	const chat = astra?.transcript ?? new WorkbenchChatView(snapshot, entryDashboard, {
		render: (current, width) => current.pendingApproval
			? approvalCardRows(
				current.pendingApproval,
				current.chatQueue.length,
				projectApprovalBackgroundState(current.activities),
				width,
			)
			: [],
	});
	const sheet = (content: Component) => astra ? new AstraSheet(content, () => Math.max(6, Math.floor(terminal.rows * 0.8))) : new OverlaySheet(content);
	const usageStrip = new UsageStripView(() => ({
		models: snapshot.sessionUsage?.models ?? [],
		activeModel: snapshot.activeModel ?? snapshot.model,
		effort: snapshot.effort,
		contextUsage: snapshot.contextUsage,
		collaborationMode: snapshot.collaborationMode,
		permissionMode: snapshot.permissionMode,
		showUsage: snapshot.hud?.showUsage,
		showContext: snapshot.hud?.showContext,
	}));
	const tracer = new WorkbenchTracerView(() => snapshot, {
		renderSummary: renderDelegationSummary,
		renderDetail: renderDelegationDetail,
	});
	const todo = new WorkspaceTodoView(
		() => snapshot.todo,
		() => ({
			activeTurnId: snapshot.activeTurnId,
			activities: snapshot.activities,
				workFlow: snapshot.workFlow,
				hasConversation: snapshot.chat.length > 0 || snapshot.activities.length > 0 || snapshot.actionResult !== null,
				goal: snapshot.sessionGoal?.text ?? null,
				sync: snapshot.todoSync,
		}),
		() => snapshot.linearDashboard,
	);
	const sourceMonitor = new WorkbenchMonitorView(() => snapshot);
	const getRuntimeMonitor = () => selectedHistoricalSession && selectedHistoricalSession.sessionId !== snapshot.threadId
		? unavailableHistoricalMonitor()
		: projectRuntimeMonitor(snapshot);
	const runtimeMonitorView = astra ? new AstraMonitorView(getRuntimeMonitor, Date.now, astraMotion) : new RuntimeMonitorView(getRuntimeMonitor);
	const runtimeMonitor = new ScrollView(astra ? new AstraInset(runtimeMonitorView) : runtimeMonitorView, {
		follow: astra ? "none" : "end", primary: true, overscroll: "contain", scrollbar: "auto", scrollbarStyle: astra ? a.rule : colors.muted,
	});
	let observabilityDashboardSnapshot: ObservabilityDashboard = emptyObservabilityDashboard();
	let selectedDashboardSessionIndex = 0;
	let selectedHistoricalSession: ObservabilityDashboard["recentSessions"][number] | null = null;
	const observabilityDashboardView = astra
		? new AstraHistoryView(() => observabilityDashboardSnapshot, () => selectedDashboardSessionIndex, () => astraBodyHeight(terminal.rows, terminal.columns))
		: new ObservabilityDashboardView(() => observabilityDashboardSnapshot, () => selectedDashboardSessionIndex);
	const observabilityDashboard = new ScrollView(astra ? new AstraInset(observabilityDashboardView) : observabilityDashboardView, {
		follow: "none", primary: true, overscroll: "contain", scrollbar: "auto", scrollbarStyle: astra ? a.rule : colors.muted,
	});
	let developmentMapSnapshot: DevelopmentMapSnapshot = EMPTY_DEVELOPMENT_MAP;
	const developmentMapView = new (astra ? AstraMapView : DevelopmentMapView)(() => developmentMapSnapshot);
	const developmentMap = new ScrollView(astra ? new AstraInset(developmentMapView) : developmentMapView, {
		follow: "none",
		primary: true,
		overscroll: "contain",
		scrollbar: "auto",
		scrollbarStyle: astra ? a.rule : colors.muted,
	});
	let statsTarget: "session" | "diagnostics" | "latest" | number = "session";
	const sessionStatsView = new (astra ? AstraStatsView : SessionStatsView)(() => projectSessionStats(snapshot), () => statsTarget, () => selectedHistoricalSession);
	const sessionStats = new ScrollView(astra ? new AstraInset(sessionStatsView) : sessionStatsView, {
		follow: "none",
		primary: true,
		overscroll: "contain",
		scrollbar: "auto",
		scrollbarStyle: astra ? a.rule : colors.muted,
	});
	const testWorkspaceView = new AstraTestView(() => projectAstraTestView(snapshot));
	const testWorkspace = new ScrollView(new AstraInset(testWorkspaceView), {
		follow: "none", primary: true, overscroll: "contain", scrollbar: "auto", scrollbarStyle: astra ? a.rule : colors.muted,
	});
	const telemetry = new WorkbenchTelemetryLine(() => snapshot, cwd, () => tui.requestRender(), dependencies.gitTelemetrySource, dependencies.homeDirectory);
	const bottomHud = new WorkbenchBottomHudView(usageStrip);
	const dashboard = astra ? { component: astra.component } : createDashboardLayout(
		() => "Workbench",
		{ color: colors.accent, component: chat },
		{ color: colors.warm, component: todo },
		{ title: "Tracer", color: colors.secondary, component: tracer },
		() => ["TODO", todoPanelTimestamp(snapshot.todo?.updatedAt)].filter(Boolean).join(" "),
	);
	const astraSource = astra ? new ScrollView(new AstraInset(new AstraContextView(() => snapshot, () => usageSnapshots, true)), { follow: "none", primary: true, overscroll: "contain", scrollbar: "auto", scrollbarStyle: a.rule }) : null;
	const sourceLayout = astraSource ? { component: astraSource, leftScroll: astraSource } : createDashboardLayout(
		() => `Source · ${workbenchFrameTitle(snapshot)}`,
		{ color: colors.accent, component: chat },
		{ color: colors.warm, component: todo },
		{ color: colors.secondary, component: sourceMonitor },
	);
	const initialViewMode = "workbench";
	let navigation: WorkbenchNavigationController;
	const activeView = createWorkbenchViewHost(
		() => navigation?.mode ?? initialViewMode,
		dashboard.component,
		observabilityDashboard,
		runtimeMonitor,
		sourceLayout.component,
		developmentMap,
		sessionStats,
		testWorkspace,
	);
	const editor = new Editor(tui, astra ? astraEditorTheme : editorTheme, { paddingX: astra ? 2 : 1, autocompleteMaxVisible: 5 });
	editor.setAutocompleteProvider(new CombinedAutocompleteProvider(withNativeModelCompletions(astra ? ASTRA_COMMANDS : [...WORKBENCH_SLASH_COMMANDS, {name: "work", description: "Issue 연결·기록 상태·Obsidian checkpoint/open"}], () => snapshot.modelCatalog), cwd));
	if (composerDraft?.initialText) editor.setText(composerDraft.initialText);
	const composerSlot = new ComponentSlot(editor);
	let astraInlineApprovalActive = false;
	const composerFrame = astra ? new AstraComposer(composerSlot, editor, () => snapshot, () => !astraInlineApprovalActive) : new ComposerModelFrame(composerSlot, () => snapshot);
	const root = new VStack([
		...(astra ? [
			{ component: new AstraHeader(() => snapshot, () => navigation.mode === "workbench" ? astraPageLabel(astra.page) : navigation.mode === "monitor" ? "Activity" : navigation.mode, cwd), basis: 2, minSize: 1, maxSize: 2, visible: ({ height }: { height: number }) => height >= 12 },
		] : []),
		{ component: activeView, basis: 0, grow: 1, shrink: 1, minSize: 1 },
		{ component: composerFrame, basis: "auto", shrink: 1, minSize: 3 },
		{ component: status, basis: 1, minSize: 1, maxSize: 1, visible: ({ height }) => height >= 5 && status.hasNotice },
		{ component: astra ? new AstraHud(() => snapshot, () => usageSnapshots) : bottomHud, basis: astra ? "auto" : 1, minSize: 1, maxSize: astra ? 6 : 1, visible: ({ height }) => height >= 7 },
	]);
	let overlay: OverlayHandle | null = null;
	let overlayKind: "model" | "approval" | "development" | "commands" | "views" | "auth" | null = null;
	let activeApprovalId: NonNullable<WorkbenchSnapshot["pendingApproval"]>["requestId"] | null = null;
	let inlineApprovalSheet: AstraSheet | null = null;
	let lastAutoApprovalId: NonNullable<WorkbenchSnapshot["pendingApproval"]>["requestId"] | null = null;
	let loginPrompt: LoginOverlay | null = null;
	const exitKeys = new ExitKeyPolicy();
	let unsubscribe: () => void = () => undefined;
	const workbenchRenders = new RenderScheduler(() => {
		chat.update(snapshot);
		tui.requestRender();
	});
	const stopUsagePolling = usage.startPolling((snapshots) => {
		liveUsageSnapshots = snapshots;
		if (!demoMode) {
			usageSnapshots = snapshots;
			usageStrip.update(snapshots);
			tui.requestRender();
		}
	});
	const developmentMapPolling = new DevelopmentMapPollingLifecycle(dependencies.developmentMapSource, (next) => {
		developmentMapSnapshot = next;
		developmentMapView.invalidate();
		tui.requestRender();
	});
	navigation = new WorkbenchNavigationController(
		initialViewMode,
		(component) => tui.setFocus(component),
		{
			editor,
			dashboard: observabilityDashboard,
			monitor: runtimeMonitor,
			source: sourceLayout.leftScroll,
			map: developmentMap,
			stats: sessionStats,
			test: testWorkspace,
		},
		developmentMapPolling,
		astra,
	);
	const showAstraPage = (page: AstraPage, browse = page !== "execution"): void => {
		const wasLab = astra?.page === "lab";
		if (!navigation.showAstraPage(page, browse)) return;
		if (wasLab && page !== "lab") threeBodyLab?.deactivate();
		if (page === "lab") threeBodyLab?.activate(() => tui.requestRender());
		status.setNotice("");
		tui.requestRender();
	};
	const demoNotice = (): string => `DEMO DATA · ${demoIndex + 1}/${ASTRA_DEMO_PAGES.length} ${astraPageLabel(ASTRA_DEMO_PAGES[demoIndex]!)} · R 이전 · E 다음 · Esc 종료`;
	const showDemoPage = (index: number): void => {
		demoIndex = (index + ASTRA_DEMO_PAGES.length) % ASTRA_DEMO_PAGES.length;
		showAstraPage(ASTRA_DEMO_PAGES[demoIndex]!, true);
		status.setNotice(demoNotice());
		tui.requestRender();
	};
	const enterDemo = (): void => {
		if (!astra || demoMode) return;
		demoMode = true;
		demoReturnPage = astra.page;
		demoReturnDraft = editor.getText();
		const demo = createAstraDemoState(liveSnapshot);
		snapshot = demo.snapshot;
		usageSnapshots = demo.usage;
		editor.setText("");
		chat.update(snapshot);
		usageStrip.update(usageSnapshots);
		showDemoPage(0);
	};
	const exitDemo = (): void => {
		if (!astra || !demoMode) return;
		demoMode = false;
		snapshot = liveSnapshot;
		usageSnapshots = liveUsageSnapshots;
		chat.update(snapshot);
		usageStrip.update(usageSnapshots);
		editor.setText(demoReturnDraft);
		showAstraPage(demoReturnPage, demoReturnPage !== "execution");
		synchronizeSnapshotUi();
		tui.requestRender();
	};
	closeThreeBodyLab = () => showAstraPage("execution", false);
	const cycleRuntimeMode = async (): Promise<void> => {
		const next = nextWorkbenchRuntimeMode(snapshot);
		const configuration = workbenchRuntimeConfiguration(next);
		const modeReceipt = await workbench.dispatch({ type: "session.mode", mode: configuration.collaboration });
		if (modeReceipt.state === "rejected") {
			showReceipt(modeReceipt);
			return;
		}
		const permissionReceipt = await workbench.dispatch({ type: "session.permission", mode: configuration.permission });
		if (permissionReceipt.state !== "accepted") showReceipt(permissionReceipt);
		else status.setNotice("");
		tui.requestRender();
	};
	let lifecycle: ShellLifecycle;
	const monitorClock = setInterval(() => {
		if (snapshot.phase === "working") chat.syncActivity(workbenchActivityIndicator(snapshot), () => tui.requestRender());
		if (navigation.mode === "monitor" && snapshot.phase === "working") tui.requestRender();
	}, 1_000);
	monitorClock.unref?.();
	const astraClock = astra ? setInterval(() => {
		const request = snapshot.requestRuntime?.at(-1);
		if (!lifecycle.isShuttingDown && !overlay && (astraExecutionIsLive(snapshot) || astraMotion && (astra.hasVisibleSidebarOrbit || snapshot.sessionGoal?.text || request && requestRuntimeMotionActive(request, Date.now())))) tui.requestRender();
	// `workingStatusLine()` advances its pulse every 120ms. Repainting at 80ms
	// computed an identical full layout roughly one third of the time, while live
	// Native snapshots already use the 32ms RenderScheduler path below.
	}, astraMotion ? 120 : 1_000) : null;
	astraClock?.unref?.();
	let composerBorderFrame = 0;
	const composerBorderClock = setInterval(() => {
		// A border shimmer is decorative. Once a conversation exists, redraws must
		// belong to input or Runtime state, not a perpetual cosmetic clock.
		if (astra || !editor.focused || lifecycle.isShuttingDown || snapshot.phase === "working" || snapshot.chat.length > 0) return;
		composerBorderFrame = (composerBorderFrame + 1) % 24;
		editor.borderColor = composerBorderColor(composerBorderFrame);
		tui.requestRender();
	}, COMPOSER_WELCOME_BORDER_INTERVAL_MS);
	composerBorderClock.unref?.();
	lifecycle = new ShellLifecycle({
		cancelPrompt: () => loginPrompt?.handleInput("\u0003"),
		dismissOverlay: () => {
			overlay?.hide();
			overlay = null;
		},
		announceClosing: () => {
			status.setNotice("Workbench를 안전하게 종료하는 중…");
			tui.requestRender();
		},
		unsubscribe: () => unsubscribe(),
		stopPolling: [stopUsagePolling, () => navigation.dispose()],
		timers: [monitorClock, composerBorderClock, astraClock],
		disposables: [workbenchRenders, telemetry, chat, ...(threeBodyLab ? [threeBodyLab] : [])],
		saveDraft: composerDraft ? () => composerDraft.save(editor.getExpandedText()) : undefined,
		closeWorkbench: () => workbench.close(),
		releaseSessionLease,
		stopTerminal: () => { tui.stop(); resetTerminalBackground(); },
	});
	const shutdown = (): Promise<void> => lifecycle.shutdown();
	const refreshObservabilityDashboard = async (): Promise<void> => {
		if (!dependencies.observabilityHistorySource) return;
		const previousSessions = observabilityDashboardSnapshot.recentSessions;
		try {
			const history = await dependencies.observabilityHistorySource.read();
			observabilityDashboardSnapshot = projectObservabilityDashboard(
				summarizeObservabilityStreams(history.streams),
				history.coverage,
			);
		} catch (error) {
			status.setNotice(`Dashboard 새로고침 실패 · 마지막 관측을 유지합니다: ${error instanceof Error ? error.message : String(error)}`);
			observabilityDashboardView.invalidate();
			return;
		}
		selectedDashboardSessionIndex = workbenchDashboardSessionIndex(
			previousSessions,
			selectedDashboardSessionIndex,
			observabilityDashboardSnapshot.recentSessions,
		);
		observabilityDashboardView.invalidate();
	};
	const enterObservability = async (next: ObservabilityViewMode): Promise<void> => {
		if (next === "dashboard") await refreshObservabilityDashboard();
		navigation.enterObservability(next);
	};
	const showReceipt = (receipt: Awaited<ReturnType<ProjectWorkbench["dispatch"]>>) => {
		status.setNotice(workbenchReceiptNotice(receipt));
		tui.requestRender();
	};
	const submitComposer = (text: string): void => {
		if (lifecycle.isShuttingDown || !text.trim()) return;
		editor.addToHistory(text);
		void (async () => {
			if (await handleLocal(text)) return;
			if (snapshot.pendingApproval) {
				editor.setText(text);
				openApproval(snapshot.pendingApproval);
				status.setNotice("승인 선택 화면을 열었습니다. ↑↓ 또는 숫자로 선택하세요.");
				tui.requestRender();
				return;
			}
			const receipt = await workbench.dispatch({ type: "chat.send", text, delivery: "queue" });
			showReceipt(receipt);
			if (workbenchReceiptClearsComposer(receipt)) await composerDraft?.clear().catch(() => undefined);
			else editor.setText(text);
		})().catch((error) => {
			editor.setText(text);
			status.setNotice(error instanceof Error ? error.message : String(error));
			tui.requestRender();
		});
	};
	const closeOverlay = (): void => {
		if (!overlay) return;
		overlay.hide();
		overlay = null;
		overlayKind = null;
		activeApprovalId = null;
		navigation.closeTransientSurface();
	};
	const closeInlineApproval = (): void => {
		if (!inlineApprovalSheet) return;
		inlineApprovalSheet = null;
		astraInlineApprovalActive = false;
		activeApprovalId = null;
		composerSlot.set(editor);
		tui.setFocus(editor);
		tui.requestRender();
	};
	const closeApprovalSurface = (): void => astra ? closeInlineApproval() : closeOverlay();
	const dispatchModelSelection = (settings: WwwSettings) => workbench.dispatch({
			type: "session.model",
			selection: { model: settings.model, effort: settings.effort },
		});
	const applyModelSelection = async (settings: WwwSettings): Promise<void> => {
		const receipt = await dispatchModelSelection(settings);
		if (receipt.state !== "accepted") throw new Error(workbenchReceiptNotice(receipt));
		showReceipt(receipt);
	};
	const closeLoginPrompt = (expected: LoginOverlay | null = loginPrompt): void => {
		if (!loginPrompt || loginPrompt !== expected) return;
		loginPrompt = null;
		if (overlayKind === "auth") closeOverlay();
		composerSlot.set(editor);
		tui.setFocus(editor);
		tui.requestRender();
	};
	const openAuthentication = (provider?: Provider): void => {
		if (astra && snapshot.pendingApproval) {
			status.setNotice("대기 중인 승인 요청을 먼저 결정하세요.");
			tui.requestRender();
			return;
		}
		if (overlay) closeOverlay();
		if (loginPrompt) return;
		if (snapshot.phase === "working") {
			status.setNotice("현재 응답이 끝난 뒤 로그인할 수 있습니다.");
			tui.requestRender();
			return;
		}
		let panel: LoginOverlay;
		panel = new LoginOverlay(
			auth,
			() => tui.requestRender(),
			async (authStatus) => {
				if (authStatus.state !== "configured") throw new Error("인증이 완료되지 않았습니다.");
				status.setNotice(`${authStatus.provider} 로그인이 완료되었습니다.`);
				usageSnapshots = await usage.refresh();
				usageStrip.update(usageSnapshots);
				tui.requestRender();
			},
			() => closeLoginPrompt(panel),
			provider ? [provider] : undefined,
			undefined,
			astra ? astraColors : undefined,
		);
		loginPrompt = panel;
		const loginSheet = astra ? new AstraSheet(panel, () => Math.max(6, Math.floor(terminal.rows * 0.8)), { followPrompt: true }) : sheet(panel);
		if (astra) {
			// AltScreen routes paging to its viewport before ordinary input listeners.
			// Register auth as a real overlay so paging reaches the focused sheet.
			overlay = tui.showOverlay(loginSheet, { width: "90%", minWidth: 36, maxHeight: "95%", anchor: "center", margin: 1 });
			overlayKind = "auth";
		} else composerSlot.set(loginSheet);
		tui.setFocus(astra ? loginSheet : panel);
		panel.start(provider !== undefined);
		tui.requestRender();
	};
	// Codex 네이티브 피커는 openai-codex만 노출하며 인증은 Codex App Server 구독이 소유한다.
	// provider별 auth.status 조회 대신 고정된 구독 연결 상태를 보여준다.
	const codexNativeAuthStatus = async (provider: Provider) => ({ state: "configured" as const, provider, source: "Codex App Server", type: "oauth" as const });
	const openModelSettings = (): void => {
		if (overlay) return;
		if (snapshot.phase === "working") {
			status.setNotice("현재 응답이 끝난 뒤 모델을 변경할 수 있습니다.");
			tui.requestRender();
			return;
		}
		const current = workbenchModelSettings(snapshot);
		const panel = new ModelPickerOverlay(
			current,
			codexNativeAuthStatus,
			() => tui.requestRender(),
			applyModelSelection,
			() => undefined,
			closeOverlay,
			current,
			false,
			{ providers: ["openai-codex"], startAtModel: true, nativeCodex: true, catalog: snapshot.modelCatalog, loadCatalog: () => workbench.refreshModels(), maxVisibleOptions: () => Math.max(1, Math.floor(terminal.rows * 0.7) - 12), ...(astra ? { colors: astraColors, appearance: "astra" as const } : {}) },
		);
		const modelSheet = astra ? new AstraSheet(panel, () => Math.max(6, Math.floor(terminal.rows * 0.8)), { followSelection: true }) : sheet(panel);
		overlay = tui.showOverlay(modelSheet, {
			width: astra ? "84%" : "64%", minWidth: 46, maxHeight: astra ? "90%" : "70%", anchor: astra ? "center" : "bottom-center", margin: astra ? 1 : 2,
		});
		overlayKind = "model";
		if (astra) tui.setFocus(modelSheet);
		panel.start();
	};
	const openApproval = (request: NonNullable<WorkbenchSnapshot["pendingApproval"]>): void => {
		if (astra ? inlineApprovalSheet && activeApprovalId === request.requestId : overlayKind === "approval") return;
		if (astra && loginPrompt) { loginPrompt.handleInput("\x1b"); closeLoginPrompt(); }
		if (overlay) closeOverlay();
		if (astra) showAstraPage("execution");
		const panel = new ApprovalOverlay(
			request,
			() => tui.requestRender(),
			(decision) => {
				void workbench.dispatch({
					type: "approval.resolve",
					requestId: request.requestId,
					response: { decision },
				}).then(receipt => {
					if (activeApprovalId === request.requestId) closeApprovalSurface();
					showReceipt(receipt);
				}).catch(error => {
					if (activeApprovalId === request.requestId) closeApprovalSurface();
					status.setNotice(error instanceof Error ? error.message : String(error));
					tui.requestRender();
				});
			},
			closeApprovalSurface,
			astra ? astraColors : undefined,
		);
		activeApprovalId = request.requestId;
		if (astra) {
			inlineApprovalSheet = new AstraSheet(panel, () => Math.max(8, Math.floor(terminal.rows * 0.45)));
			astraInlineApprovalActive = true;
			composerSlot.set(inlineApprovalSheet);
			tui.setFocus(inlineApprovalSheet);
			tui.requestRender();
			return;
		}
		const approvalSheet = sheet(panel);
		overlay = tui.showOverlay(approvalSheet, {
			width: "72%", minWidth: 46, maxHeight: "80%", anchor: "bottom-center", margin: 2,
		});
		overlayKind = "approval";
		tui.setFocus(panel);
		tui.requestRender();
	};
	synchronizeSnapshotUi = (): void => {
		if (snapshot.pendingApproval && (!astra || lastAutoApprovalId !== snapshot.pendingApproval.requestId)) {
			lastAutoApprovalId = snapshot.pendingApproval.requestId;
			openApproval(snapshot.pendingApproval);
			status.setNotice(astra ? "채팅 영역에 승인 선택을 열었습니다. ↑↓ 또는 숫자로 선택하세요." : "승인 선택 화면을 열었습니다. ↑↓ 또는 숫자로 선택하세요.");
		} else if (!snapshot.pendingApproval) {
			lastAutoApprovalId = null;
			if (astra) closeInlineApproval();
			else if (overlayKind === "approval") closeOverlay();
		}
		chat.syncActivity(workbenchActivityIndicator(snapshot), () => tui.requestRender());
	};
	const handleLocal = async (text: string): Promise<boolean> => {
		if (astra && text.trim().toLowerCase() === "/demo") {
			enterDemo();
			return true;
		}
		if (text.trim() === "/three-body") {
			if (astra) {
				showAstraPage("lab");
				status.setNotice("THREE BODY LAB · Space 일시정지 · Q/Esc 돌아가기");
			} else status.setNotice("THREE BODY LAB은 Astra UI에서 사용할 수 있습니다.");
			tui.requestRender();
			return true;
		}
		if (astra && text.trim() === "/dashboard") { showAstraPage("dashboard"); return true; }
		if (astra && text.trim() === "/history") {
			await enterObservability("dashboard");
			status.setNotice("History · 이전 Session과 Project 관측");
			tui.requestRender();
			return true;
		}
		if (astra && text.trim() === "/context") { showAstraPage("context"); return true; }
		if (astra && text.trim() === "/cache") { showAstraPage("cache"); return true; }
		if (astra && text.trim() === "/usage") {
			showAstraPage("usage");
			try {
				usageSnapshots = await usage.refresh();
				usageStrip.update(usageSnapshots);
				tui.requestRender();
			} catch (error) {
				status.setNotice(`Usage 갱신 실패 · 마지막 관측을 유지합니다: ${error instanceof Error ? error.message : String(error)}`);
				tui.requestRender();
			}
			return true;
		}
		if (astra && text.trim() === "/approval") {
			if (snapshot.pendingApproval) openApproval(snapshot.pendingApproval);
			else status.setNotice("대기 중인 승인 요청이 없습니다.");
			tui.requestRender();
			return true;
		}
		const developmentNotice = await executeDevelopmentShellCommand(text, dependencies.development);
		if (developmentNotice !== null) {
			const safeNotice = sanitizeTerminalTextUnbounded(developmentNotice);
			status.setNotice(safeNotice.split("\n")[0] ?? "개발 연결");
			if (safeNotice.includes("\n")) {
				closeOverlay();
				let offset = 0;
				let lineCount = 0;
				const panel: Component = {
					invalidate() {},
					render(width) {
						const lines = safeNotice.split("\n").flatMap(line => wrapTextWithAnsi(line, Math.max(1, width)));
						lineCount = lines.length;
						return ["개발 연결 · ↑↓ 이동 · Esc 닫기", "", ...lines.slice(offset, offset + 18)];
					},
					handleInput(data) {
						if (matchesKey(data, Key.escape)) closeOverlay();
						else if (matchesKey(data, Key.down)) offset = Math.min(Math.max(0, lineCount - 18), offset + 1);
						else if (matchesKey(data, Key.up)) offset = Math.max(0, offset - 1);
						tui.requestRender();
					},
				};
				overlay = tui.showOverlay(sheet(panel), { width: "90%", minWidth: 40, maxHeight: "85%", anchor: "center" });
				overlayKind = "development";
			}
			tui.requestRender();
			return true;
		}
		const requestedStatsTarget = workbenchStatsTargetCommand(text);
		if (requestedStatsTarget !== null) {
			if (requestedStatsTarget === "invalid") {
				status.setNotice("사용법: /stats [diagnostics|latest|#n]");
				tui.requestRender();
				return true;
			}
			statsTarget = requestedStatsTarget;
			selectedHistoricalSession = null;
			sessionStats.scrollTo(0);
			await enterObservability("stats");
			status.setNotice(requestedStatsTarget === "session"
				? "Session Review · 목적·결과·성능과 요청 검토"
				: requestedStatsTarget === "diagnostics"
					? "Session Diagnostics · 관측 원본 진단"
					: `Request Stats · ${requestedStatsTarget === "latest" ? "latest" : `#${requestedStatsTarget}`}`);
			tui.requestRender();
			return true;
		}
		const requestedViewMode = workbenchViewModeCommand(text);
		if (requestedViewMode) {
			if (requestedViewMode === "stats" || requestedViewMode === "dashboard" || requestedViewMode === "monitor") {
				await enterObservability(requestedViewMode);
			} else navigation.openCommandView(requestedViewMode);
			status.setNotice(requestedViewMode === "dashboard"
				? "Dashboard · 전체 Session과 Project 관측"
				: requestedViewMode === "monitor"
					? "Monitor · 현재 runtime 실행 관측"
					: requestedViewMode === "map"
						? "Development Map · 전체 구조와 진척도 · 자동 갱신"
						: requestedViewMode === "test"
							? "Test · 현재 세션의 질문별 검증 목적·검사·근거"
							: "Session Stats · 목적·행동·결과와 오케스트레이션 효율");
			tui.requestRender();
			return true;
		}
		if (/^\/model\s+\S/u.test(text.trim())) await workbench.refreshModels();
		const command = parseWorkbenchShellCommand(text, snapshot.modelCatalog);
		if (!command) return false;
		if (command.type === "exit") {
			void shutdown();
			return true;
		}
		if (command.type === "error") {
			status.setNotice(command.message);
			tui.requestRender();
			return true;
		}
		if (command.type === "help") {
			if (astra) { showAstraPage("help"); return true; }
			status.setNotice(WORKBENCH_SLASH_COMMANDS.map(command => `/${command.name}${command.argumentHint ? ` ${command.argumentHint}` : ""}`).join(" · "));
			tui.requestRender();
			return true;
		}
		if (command.type === "theme.set") {
			setActiveTuiTheme(command.theme);
			applyTerminalBackground();
			chat.invalidate();
			const label = TUI_THEME_OPTIONS.find(theme => theme.name === getActiveTuiTheme())?.label ?? getActiveTuiTheme();
			status.setNotice(`Theme · ${label}`);
			tui.requestRender();
			return true;
		}
		if (command.type === "workflow.view") {
			if (astra) showAstraPage("workflow");
			else status.setNotice("Workflow 화면은 Astra UI에서 사용할 수 있습니다.");
			tui.requestRender();
			return true;
		}
		if ((command.type === "mcp.refresh" || command.type === "mcp.reload" || command.type === "mcp.enable" || command.type === "mcp.disable") && snapshot.slash?.mcp === false) {
			status.setNotice("이 프로젝트에서는 /mcp 명령이 비활성화되어 있습니다.");
			tui.requestRender();
			return true;
		}
		if (command.type === "chat.clear" && snapshot.slash?.clear === false) {
			status.setNotice("이 프로젝트에서는 /clear 명령이 비활성화되어 있습니다.");
			tui.requestRender();
			return true;
		}
		if (command.type === "thread.compact" && snapshot.slash?.compact === false) {
			status.setNotice("이 프로젝트에서는 /compact 명령이 비활성화되어 있습니다.");
			tui.requestRender();
			return true;
		}
		if (command.type === "workflow.check" || command.type === "workflow.resume" || command.type === "workflow.show") {
			showReceipt(await workbench.dispatch(command));
			navigation.openWorkbench();
			return true;
		}
		if (command.type === "pane.show") {
			if (astra) {
				showAstraPage(command.pane === "todo" ? "plan" : "execution");
				if (command.pane === "tnotes") status.setNotice("질문 요약은 실행 타임라인의 각 질문 뒤에 표시됩니다.");
				tui.requestRender();
				return true;
			}
			navigation.openWorkbench();
			status.setNotice(workbenchPaneNotice(command.pane));
			tui.requestRender();
			return true;
		}
		if (command.type === "model.select") {
			openModelSettings();
			return true;
		}
		if (command.type === "model.set") {
			const current = workbenchModelSettings(snapshot);
			const efforts = nativeModelEfforts(command.model, snapshot.modelCatalog);
			const inherited = efforts.includes(current.effort) ? current.effort : snapshot.modelCatalog?.models.find(entry => entry.model === command.model)?.defaultEffort ?? "medium";
			showReceipt(await dispatchModelSelection({
				provider: "openai-codex",
				model: command.model,
				effort: command.effort ?? inherited,
			}));
			return true;
		}
		if (command.type === "auth.select") {
			openAuthentication();
			return true;
		}
		if (command.type === "auth.login") {
			openAuthentication(command.provider);
			return true;
		}
		if (command.type === "auth.logout") {
			if (snapshot.phase === "working") {
				status.setNotice("현재 응답이 끝난 뒤 로그아웃할 수 있습니다.");
				tui.requestRender();
				return true;
			}
			await auth.logout(command.provider);
			usageSnapshots = await usage.refresh();
			usageStrip.update(usageSnapshots);
			status.setNotice(`${command.provider} 인증을 삭제했습니다.`);
			tui.requestRender();
			return true;
		}
		if (command.type === "session.permission") {
			showReceipt(await workbench.dispatch({ type: "session.permission", mode: command.mode }));
			return true;
		}
		if (command.type === "session.mode") {
			showReceipt(await workbench.dispatch({ type: "session.mode", mode: command.mode }));
			return true;
		}
		if (command.type === "goal.view") {
			status.setNotice(snapshot.sessionGoal?.text ? `Goal · ${snapshot.sessionGoal.text}` : "설정된 Goal이 없습니다. /goal <목표 문장>으로 시작하세요.");
			tui.requestRender();
			return true;
		}
		if (command.type === "goal.set") {
			showReceipt(await workbench.dispatch({ type: "goal.set", text: command.text }));
			return true;
		}
		if (command.type === "woo-entry.refresh") {
			showReceipt(await workbench.dispatch({ type: "woo-entry.refresh" }));
			return true;
		}
		if (command.type === "activity.select") {
			const activityId = command.activityId === "latest" ? snapshot.activities.at(-1)?.id ?? null : command.activityId;
			const receipt = await workbench.dispatch({ type: "activity.select", activityId });
			showReceipt(receipt);
			if (receipt.state !== "accepted" || !activityId) return true;
			navigation.openSource();
			return true;
		}
		if (command.type === "trace.select") {
			const receipt = await workbench.dispatch({ type: "trace.select", activityId: command.activityId });
			showReceipt(receipt);
			if (receipt.state === "accepted") {
				navigation.openSource();
			}
			return true;
		}
		if (command.type === "runtime.reconcile") {
			showReceipt(await workbench.dispatch(command));
			return true;
		}
		if (command.type === "agent.select") {
			const receipt = await workbench.dispatch({ type: "agent.select", agentRef: command.agentRef });
			showReceipt(receipt);
			if (receipt.state === "accepted") {
				if (astra) { showAstraPage("context"); return true; }
				navigation.openWorkbench();
			}
			return true;
		}
		if (command.type === "tnote.capture") {
			showReceipt(await workbench.dispatch({ type: "tnote.capture-session" }));
			return true;
		}
		if (command.type === "tnote.capture-range") {
			showReceipt(await workbench.dispatch({
				type: "tnote.capture-range",
				startSequence: command.startSequence,
				endSequence: command.endSequence,
			}));
			return true;
		}
		if (command.type === "promotion.accept") {
			showReceipt(await workbench.dispatch({ type: "promotion.accept", noteId: command.noteId, acceptedBy: "human:local" }));
			return true;
		}
		if (command.type === "promotion.confirm") {
			showReceipt(await workbench.dispatch({ type: "promotion.confirm", token: command.token }));
			return true;
		}
		if (command.type === "review.preview") {
			showReceipt(await workbench.dispatch({
				type: "review.preview",
				provider: command.provider,
				noteId: command.noteId,
				request: command.request,
				confirmedPublic: true,
			}));
			return true;
		}
		if (command.type === "review.send") {
			showReceipt(await workbench.dispatch({ type: "review.send", digest: command.digest }));
			return true;
		}
		if (command.type === "chat.cancel") {
			showReceipt(await workbench.dispatch({ type: "chat.cancel" }));
			return true;
		}
		if (command.type === "chat.clear" || command.type === "thread.compact" || command.type === "mcp.refresh" || command.type === "mcp.reload") {
			showReceipt(await workbench.dispatch({ type: command.type }));
			return true;
		}
		if (command.type === "mcp.enable" || command.type === "mcp.disable") {
			showReceipt(await workbench.dispatch(command));
			return true;
		}
		const approval = snapshot.pendingApproval;
		if (!approval) {
			status.setNotice("대기 중인 승인 요청이 없습니다.");
			tui.requestRender();
			return true;
		}
		showReceipt(await workbench.dispatch({
			type: "approval.resolve",
			requestId: approval.requestId,
			response: {
				decision: command.type === "approval.accept" ? "accept"
					: command.type === "approval.accept-session" ? "acceptForSession" : "decline",
			},
		}));
		return true;
	};
	/** @linear WOO-694 */
	editor.onSubmit = submitComposer;
	unsubscribe = workbench.subscribe((next) => {
		const urgency = workbenchRenderUrgency(liveSnapshot, next);
		const refreshTelemetry = liveSnapshot.phase === "working" && next.phase !== "working";
		liveSnapshot = next;
		if (demoMode) return;
		snapshot = next;
		synchronizeSnapshotUi();
		if (refreshTelemetry) telemetry.refresh();
		workbenchRenders.request(urgency);
	});
	tui.addInputListener((data) => {
		// This listener runs before the focused Editor. Defer any streaming frame
		// until the Editor has committed this input turn; Pi TUI then takes its
		// immediate keyboard-render path instead of a 64ms workbench repaint.
		workbenchRenders.prioritizeInput();
		if (lifecycle.isShuttingDown) return { consume: true };
		if (loginPrompt && (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c")) || matchesKey(data, Key.ctrl("d")))) {
			loginPrompt.handleInput(data);
			status.setNotice("로그인을 취소했습니다.");
			tui.requestRender();
			return { consume: true };
		}
		if (astra && inlineApprovalSheet) {
			if (matchesKey(data, Key.ctrl("c")) || matchesKey(data, Key.ctrl("d"))) {
				closeInlineApproval();
				status.setNotice("승인 보류. /approval 다시 읽기 /approve 승인 /decline 거절");
				return { consume: true };
			}
			return undefined;
		}
		if (overlay) {
			if (matchesKey(data, Key.ctrl("c")) || matchesKey(data, Key.ctrl("d"))) {
				const closing = overlayKind;
				closeOverlay();
				status.setNotice(closing === "approval"
					? astra ? "승인 보류. /approval 다시 읽기 /approve 승인 /decline 거절" : "승인 창을 닫았습니다. /approve 로 다시 결정할 수 있습니다."
					: closing === "development" ? "개발 연결 창을 닫았습니다." : closing === "views" ? "화면 이동을 닫았습니다." : closing === "commands" ? "명령 찾기를 닫았습니다." : "모델 변경을 취소했습니다.");
				tui.requestRender();
				return { consume: true };
			}
			return undefined;
		}
		if (astra && !loginPrompt) {
			if (demoMode) {
				if (matchesKey(data, Key.escape)) { exitDemo(); return { consume: true }; }
				if (data.toLowerCase() === "e") { showDemoPage(demoIndex + 1); return { consume: true }; }
				if (data.toLowerCase() === "r") { showDemoPage(demoIndex - 1); return { consume: true }; }
				const scroll = navigation.currentScroll();
				const matchesScroll = (keys: readonly string[]) => keys.some(key => matchesAstraKey(data, key));
				const delta = matchesScroll(ASTRA_SCROLL_KEYS.down) ? 1 : matchesScroll(ASTRA_SCROLL_KEYS.up) ? -1
					: matchesScroll(ASTRA_SCROLL_KEYS.pageDown) ? Math.max(1, scroll.viewportHeight - 2) : matchesScroll(ASTRA_SCROLL_KEYS.pageUp) ? -Math.max(1, scroll.viewportHeight - 2) : 0;
				if (delta) { scroll.scrollBy(delta); tui.requestRender(); return { consume: true }; }
				if (matchesScroll(ASTRA_SCROLL_KEYS.home)) { scroll.scrollToStart(); tui.requestRender(); return { consume: true }; }
				if (matchesScroll(ASTRA_SCROLL_KEYS.end)) { scroll.scrollToEnd(); tui.requestRender(); return { consume: true }; }
				if (!matchesKey(data, Key.ctrl("c")) && !matchesKey(data, Key.ctrl("d"))) {
					status.setNotice(demoNotice());
					tui.requestRender();
					return { consume: true };
				}
			}
			if (astra.page === "lab") {
				if (matchesKey(data, Key.escape)) {
					showAstraPage("execution", false);
					return { consume: true };
				}
				if (threeBodyLab?.handleInput(data)) return { consume: true };
			}
			if (matchesKey(data, Key.escape) && astra.page === "execution" && editor.focused && !editor.isShowingAutocomplete()
				&& snapshot.phase === "working" && !snapshot.pendingApproval && !snapshot.deliveryUncertain && editor.getText().trim()) {
				const draft = editor.getText();
				editor.setText("");
				submitComposer(draft);
				return { consume: true };
			}
			if (matchesAstraAction(data, "plan.sidebar")) {
				const enabled = astra.toggleSidebar();
				status.setNotice(enabled ? "계획 사이드바를 열었습니다. 넓은 실행 화면에서 표시됩니다." : "계획 사이드바를 닫았습니다.");
				tui.requestRender();
				return { consume: true };
			}
			if (matchesAstraAction(data, "views.switcher")) {
				const switcher = new AstraViewSwitcher(command => {
					closeOverlay();
					void handleLocal(command).catch(error => { status.setNotice(String(error)); tui.requestRender(); });
				}, () => { closeOverlay(); tui.requestRender(); }, () => tui.requestRender());
				const switcherSheet = sheet(switcher);
				overlay = tui.showOverlay(switcherSheet, { width: "86%", minWidth: 36, maxHeight: "95%", anchor: "center", margin: 1 });
				overlayKind = "views";
				tui.setFocus(switcherSheet);
				return { consume: true };
			}
			if (matchesAstraAction(data, "command.palette")) {
				const palette = new AstraCommandPalette(command => { closeOverlay(); editor.setText(command); tui.requestRender(); }, closeOverlay, () => tui.requestRender());
				const paletteSheet = sheet(palette);
				overlay = tui.showOverlay(paletteSheet, { width: "86%", minWidth: 36, maxHeight: "95%", anchor: "center", margin: 1 });
				overlayKind = "commands";
				tui.setFocus(paletteSheet);
				return { consume: true };
			}
			for (const [key, command] of ASTRA_KEYS) {
				if (matchesKey(data, key)) {
					void handleLocal(command).catch(error => { status.setNotice(String(error)); tui.requestRender(); });
					return { consume: true };
				}
			}
			if (matchesAstraAction(data, "transcript.expand") && !editor.focused) { astra.transcript.expanded = !astra.transcript.expanded; astra.transcript.invalidate(); tui.requestRender(); return { consume: true }; }
			if (matchesAstraAction(data, "browse.toggle") && !editor.isShowingAutocomplete() && (!editor.focused || !editor.getText())) {
				navigation.toggleAstraBrowse(editor.focused);
				tui.requestRender(); return { consume: true };
			}
			if (matchesAstraAction(data, "navigate.back") && !editor.isShowingAutocomplete()) {
				if (navigation.mode === "workbench" && astra.page !== "execution") { showAstraPage("execution"); return { consume: true }; }
				if (navigation.mode === "workbench" && !editor.focused) { navigation.leaveAstraBrowse(); tui.requestRender(); return { consume: true }; }
			}
			if (!editor.focused && !(navigation.mode === "dashboard" && navigation.observabilityBrowsing)) {
				const scroll = navigation.currentScroll();
				const matchesScroll = (keys: readonly string[]) => keys.some(key => matchesAstraKey(data, key));
				const delta = matchesScroll(ASTRA_SCROLL_KEYS.down) ? 1 : matchesScroll(ASTRA_SCROLL_KEYS.up) ? -1
					: matchesScroll(ASTRA_SCROLL_KEYS.pageDown) ? Math.max(1, scroll.viewportHeight - 2) : matchesScroll(ASTRA_SCROLL_KEYS.pageUp) ? -Math.max(1, scroll.viewportHeight - 2) : 0;
				if (delta) { scroll.scrollBy(delta); tui.requestRender(); return { consume: true }; }
				if (matchesScroll(ASTRA_SCROLL_KEYS.home)) { scroll.scrollToStart(); tui.requestRender(); return { consume: true }; }
				if (matchesScroll(ASTRA_SCROLL_KEYS.end)) { scroll.scrollToEnd(); tui.requestRender(); return { consume: true }; }
			}
		}
		if (matchesAstraAction(data, "runtime.mode.cycle")) {
			void cycleRuntimeMode().catch(error => {
				status.setNotice(error instanceof Error ? error.message : String(error));
				tui.requestRender();
			});
			return { consume: true };
		}
		if (navigation.observabilityBrowsing && navigation.mode === "dashboard" && (matchesKey(data, Key.up) || matchesKey(data, Key.down))) {
			const maximum = Math.max(0, observabilityDashboardSnapshot.recentSessions.length - 1);
			selectedDashboardSessionIndex = Math.max(0, Math.min(maximum, selectedDashboardSessionIndex + (matchesKey(data, Key.up) ? -1 : 1)));
			if (astra) observabilityDashboard.scrollToStart();
			observabilityDashboardView.invalidate();
			tui.requestRender();
			return { consume: true };
		}
		if (navigation.observabilityBrowsing && navigation.mode === "dashboard" && matchesKey(data, Key.enter)) {
			selectedHistoricalSession = observabilityDashboardSnapshot.recentSessions[selectedDashboardSessionIndex] ?? null;
			if (selectedHistoricalSession) {
				statsTarget = "session";
				void enterObservability("stats").then(() => tui.requestRender());
			}
			return { consume: true };
		}
		if (shouldHandleObservabilityShortcut(navigation.observabilityBrowsing, astra ? editor.focused : !navigation.observabilityBrowsing, data)
			&& (navigation.mode === "stats" || navigation.mode === "dashboard" || navigation.mode === "monitor")) {
			const direct = directObservabilityView(data);
			const rotated = data === "r" ? rotateObservabilityView(navigation.mode, 1)
				: data === "R" ? rotateObservabilityView(navigation.mode, -1) : null;
			const next = direct ?? rotated;
			if (next) {
				void enterObservability(next).then(() => {
					status.setNotice(`Observability · ${next}`);
					tui.requestRender();
				}).catch(error => {
					status.setNotice(error instanceof Error ? error.message : String(error));
					tui.requestRender();
				});
				return { consume: true };
			}
		}
		if (matchesAstraAction(data, "navigate.back")) {
			if (navigation.returnToWorkbench()) {
				status.setNotice("상세 화면을 닫고 Workbench로 돌아왔습니다.");
				tui.requestRender();
				return { consume: true };
			}
		}
		if (matchesAstraAction(data, "navigate.back") && snapshot.phase === "working" && !editor.isShowingAutocomplete()) {
			void workbench.dispatch({ type: "chat.cancel" }).then(showReceipt);
			return { consume: true };
		}
		if (matchesAstraAction(data, "interrupt.or.exit")) {
			const action = exitKeys.ctrlC(snapshot.phase === "working");
			if (action === "exit") {
				void shutdown();
				return { consume: true };
			}
			if (action === "abort") {
				void workbench.dispatch({ type: "chat.cancel" }).then((receipt) => {
					if (receipt.state !== "accepted") showReceipt(receipt);
				});
				status.setNotice("현재 응답을 중단합니다. 500ms 안에 Ctrl+C를 다시 누르면 종료합니다.");
				tui.requestRender();
				return { consume: true };
			}
			const hadDraft = Boolean(editor.getText());
			editor.setText("");
			status.setNotice(hadDraft
				? "작성 중인 입력을 지웠습니다. 500ms 안에 Ctrl+C를 다시 누르면 종료합니다."
				: "500ms 안에 Ctrl+C를 다시 누르면 종료합니다.");
			tui.requestRender();
			return { consume: true };
		}
		if (matchesKey(data, Key.ctrl("d"))) {
			if (editor.getText()) {
				status.setNotice("작성 중인 입력이 있습니다. Ctrl+D는 입력이 비었을 때만 종료합니다.");
				tui.requestRender();
			} else void shutdown();
			return { consume: true };
		}
		return undefined;
	});
	if (!isViewportTUI(tui)) throw new Error("현재 터미널 렌더러가 viewport layout을 지원하지 않습니다.");
	tui.setLayoutRoot(root);
	tui.setFocus(inlineApprovalSheet ?? editor);
	if (astra) void refreshObservabilityDashboard().then(() => tui.requestRender());
	telemetry.refresh();
	chat.syncActivity(workbenchActivityIndicator(snapshot), () => tui.requestRender());
	chat.playWelcomeIntro(() => tui.requestRender());
	applyTerminalBackground();
	tui.start();
}
