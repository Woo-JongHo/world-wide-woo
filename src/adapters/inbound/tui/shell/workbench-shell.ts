import type { DevelopmentService } from "@/core/application/development/development-service";
/** @linear WOO-674 WOO-727 */
import {
	CombinedAutocompleteProvider,
	Editor,
	Key,
	ProcessTerminal,
	ScrollView,
	TuiAltScreen,
	VStack,
	isViewportTUI,
	matchesKey,
} from "@earendil-works/pi-tui";
import type { Component, Terminal }                             from "@earendil-works/pi-tui";
import type {
	AuthController,
	ComposerDraftController,
	ObservabilityHistoryReader,
	UsageMonitor,
	WorkbenchGitTelemetryReader,
} from "@/core/ports";
import type { ProjectWorkbench }                                from "@/core/application/orchestration/project-workbench";
import { EMPTY_DEVELOPMENT_MAP }                                from "@/core/domain/development/development-map";
import type { DevelopmentMapSnapshot }                          from "@/core/domain/development/development-map";
import {
	projectObservabilityDashboard,
	summarizeObservabilityStreams,
} from "@/core/domain/observability/observability-dashboard";
import type { ObservabilityDashboard }                          from "@/core/domain/observability/observability-dashboard";
import { projectRuntimeMonitor }                                from "@/core/domain/observability/runtime-monitor";
import { projectSessionStats }                                  from "@/core/domain/observability/session-stats";
import type { WorkbenchSnapshot }                               from "@/core/domain/work/workbench";
import { createDashboardLayout }                                from "@/adapters/inbound/tui/foundation/layout/dashboard-layout";
import {
	StatusLine,
	todoPanelTimestamp,
	WorkspaceTodoView,
} from "@/adapters/inbound/tui/features/dashboard/shared-dashboard-views";
import { WorkbenchChatView }                                    from "@/adapters/inbound/tui/features/chat/workbench-views";
import {
	renderDelegationDetail,
	renderDelegationSummary,
} from "@/adapters/inbound/tui/features/chat/delegation-tree-view";
import { ThreeBodyLabView }                                     from "@/adapters/inbound/tui/features/chat/three-body-lab";
import { EntryDashboardView, WwwDashboardView }                 from "@/adapters/inbound/tui/features/dashboard/entry-dashboard-view";
import { WorkbenchMonitorView }                                 from "@/adapters/inbound/tui/features/monitoring/workbench-monitor-view";
import { WorkbenchTracerView }                                  from "@/adapters/inbound/tui/features/trace/workbench-tracer-view";
import { ExitKeyPolicy }                                        from "@/adapters/inbound/tui/shell/exit-key-policy";
import {
	approvalCardRows,
	projectApprovalBackgroundState,
} from "@/adapters/inbound/tui/features/approval/approval-presentation";
import { OverlaySheet }                                         from "@/adapters/inbound/tui/foundation/components/overlay-sheet";
import { RenderScheduler, workbenchRenderUrgency }              from "@/adapters/inbound/tui/foundation/rendering/render-scheduler";
import { ShellLifecycle }                                       from "@/adapters/inbound/tui/shell/shell-lifecycle";
import { withNativeModelCompletions, WORKBENCH_SLASH_COMMANDS } from "@/adapters/inbound/tui/commands/slash-commands";
import {
	colors,
	composerBorderColor,
	editorTheme,
	tuiBackgroundResetSequence,
	tuiBackgroundSequence,
} from "@/adapters/inbound/tui/foundation/theme/theme";
import { WorkbenchBottomHudView }                               from "@/adapters/inbound/tui/features/usage/workbench-bottom-hud";
import { WorkbenchTelemetryLine }                               from "@/adapters/inbound/tui/features/monitoring/workbench-telemetry";
import { UsageStripView }                                       from "@/adapters/inbound/tui/features/usage/usage-strip-view";
import { DevelopmentMapView }                                   from "@/adapters/inbound/tui/features/project-map/development-map-view";
import { ObservabilityDashboardView }                           from "@/adapters/inbound/tui/features/session/observability-dashboard-view";
import { RuntimeMonitorView }                                   from "@/adapters/inbound/tui/features/monitoring/runtime-monitor-view";
import { SessionStatsView }                                     from "@/adapters/inbound/tui/features/stats/session-stats-view";
import { AstraContextView }                                     from "@/adapters/inbound/tui/features/context/astra-context-view";
import { AstraHistoryView }                                     from "@/adapters/inbound/tui/features/session/astra-history-view";
import { AstraMapView }                                         from "@/adapters/inbound/tui/features/project-map/astra-map-view";
import { AstraMonitorView }                                     from "@/adapters/inbound/tui/features/monitoring/astra-monitor-view";
import { AstraStatsView }                                       from "@/adapters/inbound/tui/features/stats/astra-stats-view";
import { AstraTestView, projectAstraTestView }                  from "@/adapters/inbound/tui/features/test/astra-test-view";
import {
	requestRuntimeMotionActive,
	requestRuntimeRows,
} from "@/adapters/inbound/tui/features/monitoring/request-runtime-view";
import {
	AstraCommandPalette,
	AstraComposer,
	AstraExecutionHeading,
	AstraHeader,
	AstraHud,
	AstraInset,
	AstraNotice,
	AstraSheet,
	AstraViewSwitcher,
	AstraWorkspace,
	ASTRA_COMMANDS,
	ASTRA_KEYS,
	ASTRA_SCROLL_KEYS,
	astraPageLabel,
	matchesAstraAction,
	matchesAstraKey,
} from "@/adapters/inbound/tui/shell/astra-surface";
import type { AstraPage }                                       from "@/adapters/inbound/tui/shell/astra-surface";
import { astraExecutionIsLive, astraNowLabel }                  from "@/adapters/inbound/tui/features/chat/astra-execution";
import { ASTRA_DEMO_PAGES, createAstraDemoState }               from "@/adapters/inbound/tui/features/demo/astra-demo";
import { a, astraColors, astraEditorTheme }                     from "@/adapters/inbound/tui/foundation/theme/astra-theme";
import type { UsageSnapshot }                                   from "@/core/ports";
import {
	ComponentSlot,
	createWorkbenchViewHost,
	directObservabilityView,
	DevelopmentMapPollingLifecycle,
	rotateObservabilityView,
	shouldHandleObservabilityShortcut,
	WorkbenchNavigationController,
	workbenchDashboardSessionIndex,
} from "@/adapters/inbound/tui/shell/workbench-navigation.controller";
import type { ObservabilityViewMode }                           from "@/adapters/inbound/tui/shell/workbench-navigation.controller";
import {
	loginProviderFromInput,
	nextWorkbenchRuntimeMode,
	workbenchModelSettings,
	workbenchReceiptClearsComposer,
	workbenchReceiptNotice,
	workbenchRuntimeConfiguration,
} from "@/adapters/inbound/tui/shell/workbench-input.controller";
import {
	ComposerModelFrame,
	emptyObservabilityDashboard,
	projectTodoLiveContext,
	projectUsageStripSession,
	unavailableHistoricalMonitor,
	workbenchActivityIndicator,
	workbenchFrameTitle,
} from "@/adapters/inbound/tui/shell/workbench-shell-presentation";
import { createWorkbenchCommandRouter }                         from "@/adapters/inbound/tui/shell/workbench-command-router";
import { WorkbenchOverlayController }                           from "@/adapters/inbound/tui/shell/workbench-overlay-controller";
import { installWorkbenchInputRouting }                         from "@/adapters/inbound/tui/shell/workbench-input-routing";

export {
	composerModelHeader,
	workbenchActivityIndicator,
	workbenchFrameTitle,
	type WorkbenchActivityIndicator,
} from "@/adapters/inbound/tui/shell/workbench-shell-presentation";

export interface ProjectWorkbenchShellDependencies {
	design?: "astra";
	/** Preview/test seam; production sessions continue to open Chat. */
	initialAstraPage? : AstraPage          ;
	terminal?         : Terminal           ;
	workbench         : ProjectWorkbench   ;
	development?      : DevelopmentService ;
	cwd?              : string             ;
	usage             : UsageMonitor       ;
	auth              : AuthController     ;
	developmentMapSource?: {
		startPolling(listener: (snapshot: DevelopmentMapSnapshot) => void, intervalMs?: number): () => void;
	};
	observabilityHistorySource? : ObservabilityHistoryReader  ;
	gitTelemetrySource?         : WorkbenchGitTelemetryReader ;
	homeDirectory?              : string                      ;
	composerDraft?              : ComposerDraftController     ;
	releaseSessionLease?        : () => Promise<void>         ;
}

export const WORKBENCH_STATUS_NOTICE = "";
const COMPOSER_WELCOME_BORDER_INTERVAL_MS = 750;

function layerTraceId(workbench: ProjectWorkbench): string | null {
	return typeof workbench.currentPerformanceTraceId === "function" ? workbench.currentPerformanceTraceId() : null;
}

function observeLayer(workbench: ProjectWorkbench, traceId: string, layerId: "render-schedule" | "layout-materialize" | "terminal-write", boundary: "queued" | "started" | "completed" | "failed"): void {
	if (typeof workbench.observeLayerPerformance === "function") workbench.observeLayerPerformance(traceId, layerId, boundary);
}

/** @Unit Code-004 */
/** Native workbench shell. */
/** @codeId 0004 */
export function runProjectWorkbenchShell(dependencies: ProjectWorkbenchShellDependencies): void {
	const { workbench, usage, auth, composerDraft, releaseSessionLease } = dependencies;
	const cwd                        = dependencies.cwd ?? process.cwd()              ;
	const terminal                   = dependencies.terminal ?? new ProcessTerminal() ;
	const tui                        = new TuiAltScreen(terminal, true)               ;
	let frameTraceId : string | null = null                                           ;
	tui.setRenderObserver((phase, boundary) => {
		const traceId = frameTraceId;
		if (traceId) observeLayer(workbench, traceId, phase, boundary);
		if (boundary === "failed" || phase === "terminal-write" && boundary === "completed") frameTraceId = null;
	});
	const terminalBackgroundEnabled                   = dependencies.design === "astra" && process.env.NO_COLOR === undefined                        ;
	const applyTerminalBackground                     = (): void => { if (terminalBackgroundEnabled) terminal.write(tuiBackgroundSequence()); }      ;
	const resetTerminalBackground                     = (): void => { if (terminalBackgroundEnabled) terminal.write(tuiBackgroundResetSequence()); } ;
	let liveSnapshot                                  = workbench.snapshot                                                                           ;
	let snapshot                                      = liveSnapshot                                                                                 ;
	let liveUsageSnapshots : readonly UsageSnapshot[] = []                                                                                           ;
	let usageSnapshots     : readonly UsageSnapshot[] = liveUsageSnapshots                                                                           ;
	let demoMode                                      = false                                                                                        ;
	let demoIndex                                     = 0                                                                                            ;
	let demoReturnPage     : AstraPage                = "execution"                                                                                  ;
	let demoReturnDraft                               = ""                                                                                           ;
	let synchronizeSnapshotUi                         = (): void => undefined                                                                        ;
	const astraMotion                                 = process.env.ASTRA_REDUCED_MOTION !== "1" && process.env.NO_COLOR === undefined               ;
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
		new WwwDashboardView(() => typeof workbench.layerPerformanceSnapshot === "function" ? { ...snapshot, layerPerformance: workbench.layerPerformanceSnapshot() } : snapshot, () => demoMode),
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
	const usageStrip = new UsageStripView(() => projectUsageStripSession(snapshot));
	const tracer = new WorkbenchTracerView(() => snapshot, {
		renderSummary: renderDelegationSummary,
		renderDetail: renderDelegationDetail,
	});
	const todo = new WorkspaceTodoView(
		() => snapshot.todo,
		() => projectTodoLiveContext(snapshot),
		() => snapshot.linearDashboard,
	);
	const sourceMonitor = new WorkbenchMonitorView(() => snapshot);
	const getRuntimeMonitor = () => selectedHistoricalSession && selectedHistoricalSession.sessionId !== snapshot.threadId
		? unavailableHistoricalMonitor()
		: projectRuntimeMonitor(snapshot, snapshot.activities, typeof workbench.layerPerformanceSnapshot === "function" ? workbench.layerPerformanceSnapshot() : snapshot.layerPerformance);
	const runtimeMonitorView = astra ? new AstraMonitorView(getRuntimeMonitor, Date.now, astraMotion) : new RuntimeMonitorView(getRuntimeMonitor);
	const runtimeMonitor = new ScrollView(astra ? new AstraInset(runtimeMonitorView) : runtimeMonitorView, {
		follow: astra ? "none" : "end", primary: true, overscroll: "contain", scrollbar: "auto", scrollbarStyle: astra ? a.rule : colors.muted,
	});
	let observabilityDashboardSnapshot : ObservabilityDashboard                                  = emptyObservabilityDashboard() ;
	let selectedDashboardSessionIndex                                                            = 0                             ;
	let selectedHistoricalSession      : ObservabilityDashboard["recentSessions"][number] | null = null                          ;
	const observabilityDashboardView = astra
		? new AstraHistoryView(() => observabilityDashboardSnapshot, () => selectedDashboardSessionIndex, () => astraBodyHeight(terminal.rows, terminal.columns))
		: new ObservabilityDashboardView(() => observabilityDashboardSnapshot, () => selectedDashboardSessionIndex);
	const observabilityDashboard = new ScrollView(astra ? new AstraInset(observabilityDashboardView) : observabilityDashboardView, {
		follow: "none", primary: true, overscroll: "contain", scrollbar: "auto", scrollbarStyle: astra ? a.rule : colors.muted,
	});
	let developmentMapSnapshot: DevelopmentMapSnapshot = EMPTY_DEVELOPMENT_MAP;
	const developmentMapView = new (astra ? AstraMapView : DevelopmentMapView)(() => developmentMapSnapshot);
	const developmentMap = new ScrollView(astra ? new AstraInset(developmentMapView) : developmentMapView, {
		follow         : "none",
		primary        : true,
		overscroll     : "contain",
		scrollbar      : "auto",
		scrollbarStyle : astra ? a.rule : colors.muted,
	});
	let statsTarget: "session" | "diagnostics" | "latest" | number = "session";
	const sessionStatsView = new (astra ? AstraStatsView : SessionStatsView)(() => projectSessionStats(snapshot), () => statsTarget, () => selectedHistoricalSession);
	const sessionStats = new ScrollView(astra ? new AstraInset(sessionStatsView) : sessionStatsView, {
		follow         : "none",
		primary        : true,
		overscroll     : "contain",
		scrollbar      : "auto",
		scrollbarStyle : astra ? a.rule : colors.muted,
	});
	const testWorkspaceView = new AstraTestView(() => projectAstraTestView(snapshot));
	const testWorkspace = new ScrollView(new AstraInset(testWorkspaceView), {
		follow: "none", primary: true, overscroll: "contain", scrollbar: "auto", scrollbarStyle: astra ? a.rule : colors.muted,
	});
	const telemetry = new WorkbenchTelemetryLine(cwd, () => tui.requestRender(), dependencies.gitTelemetrySource, dependencies.homeDirectory);
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
	const composerSlot                               = new ComponentSlot(editor)                                                                                                                                       ;
	let overlays : WorkbenchOverlayController | null = null                                                                                                                                                            ;
	const composerFrame                              = astra ? new AstraComposer(composerSlot, editor, () => snapshot, () => !overlays?.isInlineApprovalActive) : new ComposerModelFrame(composerSlot, () => snapshot) ;
	const root = new VStack([
		...(astra ? [
			{ component: new AstraHeader(() => snapshot, () => navigation.mode === "workbench" ? astraPageLabel(astra.page) : navigation.mode === "monitor" ? "Activity" : navigation.mode, cwd), basis: 2, minSize: 1, maxSize: 2, visible: ({ height }: { height: number }) => height >= 12 },
		] : []),
		{ component: activeView, basis: 0, grow: 1, shrink: 1, minSize: 1 },
		{ component: composerFrame, basis: "auto", shrink: 1, minSize: 3 },
		{ component: status, basis: 1, minSize: 1, maxSize: 1, visible: ({ height }) => height >= 5 && status.hasNotice },
		{ component: astra ? new AstraHud(() => snapshot, () => usageSnapshots) : bottomHud, basis: astra ? "auto" : 1, minSize: 1, maxSize: astra ? 6 : 1, visible: ({ height }) => height >= 7 },
	]);
	let lastAutoApprovalId     : NonNullable<WorkbenchSnapshot["pendingApproval"]>["requestId"] | null = null                ;
	const exitKeys                                                                                     = new ExitKeyPolicy() ;
	let unsubscribe            : () => void                                                            = () => undefined     ;
	let scheduledRenderTraceId : string | null                                                         = null                ;
	const workbenchRenders = new RenderScheduler(() => {
		const traceId = scheduledRenderTraceId;
		scheduledRenderTraceId = null;
		if (traceId) observeLayer(workbench, traceId, "render-schedule", "started");
		try {
			chat.update(snapshot);
			frameTraceId = traceId;
			if (traceId) {
				observeLayer(workbench, traceId, "layout-materialize", "queued");
				observeLayer(workbench, traceId, "terminal-write", "queued");
			}
			tui.requestRender();
			if (traceId) observeLayer(workbench, traceId, "render-schedule", "completed");
		} catch (error) {
			frameTraceId = null;
			if (traceId) observeLayer(workbench, traceId, "render-schedule", "failed");
			throw error;
		}
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
			dashboard : observabilityDashboard,
			monitor   : runtimeMonitor,
			source    : sourceLayout.leftScroll,
			map       : developmentMap,
			stats     : sessionStats,
			test      : testWorkspace,
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
	const currentDemoPage = (): AstraPage => ASTRA_DEMO_PAGES[demoIndex] ?? "execution";
	const demoNotice = (): string => `DEMO DATA · ${demoIndex + 1}/${ASTRA_DEMO_PAGES.length} ${astraPageLabel(currentDemoPage())} · R 이전 · E 다음 · Esc 종료`;
	const showDemoPage = (index: number): void => {
		demoIndex = (index + ASTRA_DEMO_PAGES.length) % ASTRA_DEMO_PAGES.length;
		showAstraPage(currentDemoPage(), true);
		status.setNotice(demoNotice());
		tui.requestRender();
	};
	const enterDemo = (): void => {
		if (!astra || demoMode) return;
		demoMode        = true             ;
		demoReturnPage  = astra.page       ;
		demoReturnDraft = editor.getText() ;
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
		demoMode       = false              ;
		snapshot       = liveSnapshot       ;
		usageSnapshots = liveUsageSnapshots ;
		chat.update(snapshot);
		usageStrip.update(usageSnapshots);
		editor.setText(demoReturnDraft);
		showAstraPage(demoReturnPage, demoReturnPage !== "execution");
		synchronizeSnapshotUi();
		tui.requestRender();
	};
	closeThreeBodyLab = () => showAstraPage("execution", false);
	const cycleRuntimeMode = async (): Promise<void> => {
		const next          = nextWorkbenchRuntimeMode(snapshot)                                                    ;
		const configuration = workbenchRuntimeConfiguration(next)                                                   ;
		const modeReceipt   = await workbench.dispatch({ type: "session.mode", mode: configuration.collaboration }) ;
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
		if (!lifecycle.isShuttingDown && !overlays?.hasOverlay && (astraExecutionIsLive(snapshot) || astraMotion && (astra.hasVisibleSidebarOrbit || snapshot.sessionGoal?.text || request && requestRuntimeMotionActive(request, Date.now())))) tui.requestRender();
	// `workingStatusLine()` advances its pulse every 120ms. Repainting at 80ms
	// computed an identical full layout roughly one third of the time, while live
	// Native snapshots already use the 32ms RenderScheduler path below.
	}, astraMotion ? 120 : 1_000) : null;
	astraClock?.unref?.();
	let composerBorderFrame = 0;
	const composerBorderClock = setInterval(() => {
		// A border shimmer is decorative. Once a conversation exists, redraws must
		// belong to input or Runtime state, not a perpetual cosmetic clock.
		if (astra
			|| !editor.focused
			|| lifecycle.isShuttingDown
			|| snapshot.phase === "working"
			|| snapshot.chat.length > 0) return;
		composerBorderFrame = (composerBorderFrame + 1) % 24;
		editor.borderColor = composerBorderColor(composerBorderFrame);
		tui.requestRender();
	}, COMPOSER_WELCOME_BORDER_INTERVAL_MS);
	composerBorderClock.unref?.();
	lifecycle = new ShellLifecycle({
		cancelPrompt: () => overlays?.activeLoginPrompt?.handleInput("\u0003"),
		dismissOverlay: () => overlays?.dismiss(),
		announceClosing: () => {
			status.setNotice("Workbench를 안전하게 종료하는 중…");
			tui.requestRender();
		},
		unsubscribe : () => unsubscribe(),
		stopPolling : [stopUsagePolling, () => navigation.dispose()],
		timers      : [monitorClock, composerBorderClock, astraClock],
		disposables : [workbenchRenders, telemetry, chat, ...(threeBodyLab ? [threeBodyLab] : [])],
		...(composerDraft ? { saveDraft: () => composerDraft.save(editor.getExpandedText()) } : {}),
		closeWorkbench: () => workbench.close(),
		...(releaseSessionLease ? { releaseSessionLease } : {}),
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
	overlays = new WorkbenchOverlayController({
		astra,
		terminal,
		tui,
		editor,
		composerSlot,
		sheet,
		snapshot: () => snapshot,
		workbench,
		usage,
		auth,
		status,
		showAstraPage,
		closeTransientSurface: () => navigation.closeTransientSurface(),
		updateUsage: (next) => {
			usageSnapshots = next;
			usageStrip.update(next);
		},
		showReceipt,
	});
	const submitComposer = (text: string): void => {
		if (lifecycle.isShuttingDown || !text.trim()) return;
		editor.addToHistory(text);
		void (async () => {
			if (await handleLocal(text)) return;
			if (snapshot.pendingApproval) {
				editor.setText(text);
				overlays?.openApproval(snapshot.pendingApproval);
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
	synchronizeSnapshotUi = (): void => {
		lastAutoApprovalId = overlays?.synchronizeApproval(lastAutoApprovalId) ?? null;
		chat.syncActivity(workbenchActivityIndicator(snapshot), () => tui.requestRender());
	};
	const handleLocal = createWorkbenchCommandRouter({
		hasAstra: astra !== null,
		snapshot: () => snapshot,
		workbench,
		...(dependencies.development ? { development: dependencies.development } : {}),
		usage,
		auth,
		enterDemo,
		showAstraPage,
		enterObservability,
		updateUsage: (next) => {
			usageSnapshots = next;
			usageStrip.update(next);
		},
		openApproval: (request) => overlays?.openApproval(request),
		showDevelopmentNotice: (notice) => overlays?.showDevelopmentNotice(notice),
		selectStatsTarget: (target) => {
			statsTarget = target;
			selectedHistoricalSession = null;
			sessionStats.scrollTo(0);
		},
		openCommandView : (mode) => navigation.openCommandView(mode),
		openWorkbench   : () => navigation.openWorkbench(),
		openSource      : () => navigation.openSource(),
		shutdown        : () => { void shutdown(); },
		applyTerminalBackground,
		invalidateChat         : () => chat.invalidate(),
		setNotice              : (notice) => status.setNotice(notice),
		requestRender          : () => tui.requestRender(),
		openModelSettings      : () => overlays?.openModelSettings(),
		openAuthentication     : (provider) => overlays?.openAuthentication(provider),
		dispatchModelSelection : (settings) => overlays!.dispatchModelSelection(settings),
		showReceipt,
	});
	/** @linear WOO-694 */
	editor.onSubmit = submitComposer;
	unsubscribe = workbench.subscribe((next) => {
		const traceId = layerTraceId(workbench);
		if (traceId) {
			scheduledRenderTraceId = traceId;
			observeLayer(workbench, traceId, "render-schedule", "queued");
		}
		const urgency = workbenchRenderUrgency(liveSnapshot, next);
		const refreshTelemetry = liveSnapshot.phase === "working" && next.phase !== "working";
		liveSnapshot = next;
		if (demoMode) return;
		snapshot = next;
		synchronizeSnapshotUi();
		if (refreshTelemetry) telemetry.refresh();
		workbenchRenders.request(urgency);
	});
	installWorkbenchInputRouting({
		tui, editor, workbench, workbenchRenders, lifecycle, overlays, astra, threeBodyLab, navigation,
		snapshot: () => snapshot, handleLocal, submitComposer, showAstraPage, cycleRuntimeMode, enterObservability, status, exitKeys, shutdown, showReceipt,
		dashboard                 : () => observabilityDashboardSnapshot,
		selectedDashboardIndex    : () => selectedDashboardSessionIndex,
		setSelectedDashboardIndex : (index) => { selectedDashboardSessionIndex = index; },
		selectHistoricalSession   : (session) => { selectedHistoricalSession = session; },
		resetStatsTarget          : () => { statsTarget = "session"; },
		observabilityDashboard, observabilityDashboardView,
		demo: { active: () => demoMode, exit: exitDemo, next: () => showDemoPage(demoIndex + 1), previous: () => showDemoPage(demoIndex - 1), notice: demoNotice },
	});
	if (!isViewportTUI(tui)) throw new Error("현재 터미널 렌더러가 viewport layout을 지원하지 않습니다.");
	tui.setLayoutRoot(root);
	tui.setFocus(overlays?.focusTarget ?? editor);
	if (astra) void refreshObservabilityDashboard().then(() => tui.requestRender());
	telemetry.refresh();
	chat.syncActivity(workbenchActivityIndicator(snapshot), () => tui.requestRender());
	chat.playWelcomeIntro(() => tui.requestRender());
	applyTerminalBackground();
	tui.start();
}
