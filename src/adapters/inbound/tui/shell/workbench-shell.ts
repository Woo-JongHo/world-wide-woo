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
import type { AuthController }                                  from "@/core/ports/integration/auth-controller-port";
import type { ObservabilityHistoryReader }                      from "@/core/ports/observability/observability-history-port";
import type { UsageMonitor }                                    from "@/core/ports/observability/usage-monitor-port";
import type { WorkbenchGitTelemetryReader }                     from "@/core/ports/observability/workbench-git-telemetry-port";
import type { ComposerDraftController }                         from "@/core/ports/persistence/composer-draft-port";
import type { ProjectWorkbench }                                from "@/core/application/orchestration/project-workbench";
import { projectChatFeature, projectTracerFeature }             from "@/core/application/orchestration/workbench-feature-reads";
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
} from "@/adapters/inbound/tui/features/dashboard/view/shared-dashboard-views";
import { WorkbenchChatView }                                    from "@/adapters/inbound/tui/features/chat/view/workbench-views";
import {
	renderDelegationDetail,
	renderDelegationSummary,
} from "@/adapters/inbound/tui/features/chat/view/delegation-tree-view";
import { ThreeBodyLabView }                                     from "@/adapters/inbound/tui/features/chat/view/three-body-lab";
import {
	EntryDashboardView,
	WwwDashboardView,
} from "@/adapters/inbound/tui/features/dashboard/view/entry-dashboard-view";
import { WorkbenchMonitorView }                                 from "@/adapters/inbound/tui/features/monitoring/view/workbench-monitor-view";
import { WorkbenchTracerView }                                  from "@/adapters/inbound/tui/features/trace/view/workbench-tracer-view";
import { ExitKeyPolicy }                                        from "@/adapters/inbound/tui/shell/exit-key-policy";
import {
	approvalCardRows,
	projectApprovalBackgroundState,
} from "@/adapters/inbound/tui/features/approval/view/approval-presentation";
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
import { WorkbenchBottomHudView }                               from "@/adapters/inbound/tui/features/usage/view/workbench-bottom-hud";
import { WorkbenchTelemetryLine }                               from "@/adapters/inbound/tui/features/monitoring/view/workbench-telemetry";
import { UsageStripView }                                       from "@/adapters/inbound/tui/features/usage/view/usage-strip-view";
import { DevelopmentMapView }                                   from "@/adapters/inbound/tui/features/project-map/view/development-map-view";
import { ObservabilityDashboardView }                           from "@/adapters/inbound/tui/features/session/view/observability-dashboard-view";
import { RuntimeMonitorView }                                   from "@/adapters/inbound/tui/features/monitoring/view/runtime-monitor-view";
import { SessionStatsView }                                     from "@/adapters/inbound/tui/features/stats/view/session-stats-view";
import { WwwContextView }                                       from "@/adapters/inbound/tui/features/context/view/www-context-view";
import { WwwHistoryView }                                       from "@/adapters/inbound/tui/features/session/view/www-history-view";
import { WwwMapView }                                           from "@/adapters/inbound/tui/features/project-map/view/www-map-view";
import { WwwMonitorView }                                       from "@/adapters/inbound/tui/features/monitoring/view/www-monitor-view";
import { WwwStatsView }                                         from "@/adapters/inbound/tui/features/stats/view/www-stats-view";
import { WwwTestView, projectWwwTestView }                      from "@/adapters/inbound/tui/features/test/view/www-test-view";
import {
	requestRuntimeMotionActive,
	requestRuntimeRows,
} from "@/adapters/inbound/tui/features/monitoring/view/request-runtime-view";
import {
	WwwCommandPalette,
	WwwComposer,
	WwwExecutionHeading,
	WwwHeader,
	WwwHud,
	WwwInset,
	WwwNotice,
	WwwSheet,
	WwwViewSwitcher,
	WwwWorkspace,
	WWW_COMMANDS,
	WWW_KEYS,
	WWW_SCROLL_KEYS,
	wwwPageLabel,
	matchesWwwAction,
	matchesWwwKey,
} from "@/adapters/inbound/tui/shell/www-surface";
import type { WwwPage }                                         from "@/adapters/inbound/tui/shell/www-surface";
import { wwwExecutionIsLive, wwwNowLabel }                      from "@/adapters/inbound/tui/features/chat/view/www-execution";
import { WWW_DEMO_PAGES, createWwwDemoState }                   from "@/adapters/inbound/tui/features/demo/view-model/www-demo";
import { a, wwwColors, wwwEditorTheme }                         from "@/adapters/inbound/tui/foundation/theme/www-theme";
import type { UsageSnapshot }                                   from "@/core/ports/observability/usage-monitor-port";
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
import { ComposerDraftPersistenceQueue }                        from "@/adapters/inbound/tui/shell/composer-draft-persistence";
import { WorkbenchOverlayController }                           from "@/adapters/inbound/tui/shell/workbench-overlay-controller";
import { installWorkbenchInputRouting }                         from "@/adapters/inbound/tui/shell/workbench-input-routing";

export {
	composerModelHeader,
	workbenchActivityIndicator,
	workbenchFrameTitle,
	type WorkbenchActivityIndicator,
} from "@/adapters/inbound/tui/shell/workbench-shell-presentation";

export interface ProjectWorkbenchShellDependencies {
	surface?: "www";
	/** Preview/test seam; production sessions continue to open Chat. */
	initialWwwPage? : WwwPage            ;
	terminal?       : Terminal           ;
	workbench       : ProjectWorkbench   ;
	development?    : DevelopmentService ;
	cwd?            : string             ;
	usage           : UsageMonitor       ;
	auth            : AuthController     ;
	developmentMapSource?: {
		startPolling(listener: (snapshot: DevelopmentMapSnapshot) => void, intervalMs?: number): () => void;
	};
	observabilityHistorySource? : ObservabilityHistoryReader  ;
	gitTelemetrySource?         : WorkbenchGitTelemetryReader ;
	homeDirectory?              : string                      ;
	composerDraft?              : ComposerDraftController     ;
	releaseSessionLease?        : () => Promise<void>         ;
	/** Test seam for deterministic streaming-frame coalescing; production keeps the scheduler default. */
	renderIntervalMs?           : number                      ;
}

export const WORKBENCH_STATUS_NOTICE = "";

const COMPOSER_WELCOME_BORDER_INTERVAL_MS = 750 ;

function layerTraceId(workbench: ProjectWorkbench): string | null {
	return typeof workbench.currentPerformanceTraceId === "function" ? workbench.currentPerformanceTraceId() : null;
}

function observeLayer(workbench: ProjectWorkbench, traceId: string, layerId: "render-schedule" | "layout-materialize" | "terminal-write", boundary: "queued" | "started" | "completed" | "failed", frameId?: string): void {
	if (typeof workbench.observeLayerPerformance === "function") workbench.observeLayerPerformance(traceId, layerId, boundary, performance.now(), frameId);
}

/** @Unit Code-004 */
/** Native workbench shell. */
/** @codeId 0004 */
export function runProjectWorkbenchShell(dependencies: ProjectWorkbenchShellDependencies): void {
	const { workbench, usage, auth, composerDraft, releaseSessionLease } = dependencies;
	const cwd                          = dependencies.cwd ?? process.cwd()              ;
	const terminal                     = dependencies.terminal ?? new ProcessTerminal() ;
	const tui                          = new TuiAltScreen(terminal, true)               ;
	let terminalFrameSequence          = 0                                              ;
	let activeFrameId  : string | null = null                                           ;
	let activeFrameTraceIds            = new Set<string>()                              ;
	const pendingFrameTraceIds         = new Set<string>()                              ;
	tui.setRenderObserver((phase, boundary) => {
		if (phase === "layout-materialize" && boundary === "started") {
			activeFrameId = `terminal-frame-${++terminalFrameSequence}`;
			activeFrameTraceIds = new Set(pendingFrameTraceIds);
			pendingFrameTraceIds.clear();
		}
		for (const traceId of activeFrameTraceIds) observeLayer(workbench, traceId, phase, boundary, activeFrameId ?? undefined);
		if (boundary === "failed" || phase === "terminal-write" && boundary === "completed") {
			activeFrameId = null;
			activeFrameTraceIds.clear();
		}
	});
	const terminalBackgroundEnabled                   = dependencies.surface === "www" && process.env.NO_COLOR === undefined                         ;
	const applyTerminalBackground                     = (): void => { if (terminalBackgroundEnabled) terminal.write(tuiBackgroundSequence()); }      ;
	const resetTerminalBackground                     = (): void => { if (terminalBackgroundEnabled) terminal.write(tuiBackgroundResetSequence()); } ;
	let liveSnapshot                                  = workbench.snapshot                                                                           ;
	let snapshot                                      = liveSnapshot                                                                                 ;
	let liveUsageSnapshots : readonly UsageSnapshot[] = []                                                                                           ;
	let usageSnapshots     : readonly UsageSnapshot[] = liveUsageSnapshots                                                                           ;
	let demoMode                                      = false                                                                                        ;
	let demoIndex                                     = 0                                                                                            ;
	let demoReturnPage     : WwwPage                  = "execution"                                                                                  ;
	let demoReturnDraft                               = ""                                                                                           ;
	let synchronizeSnapshotUi                         = (): void => undefined                                                                        ;
	const wwwMotion                                   = process.env.WWW_REDUCED_MOTION !== "1" && process.env.NO_COLOR === undefined                 ;
	// pi-tui visibility callbacks receive the whole terminal, even in nested
	// stacks. Reserve the real composer/HUD chrome before showing side content.
	function wwwBodyHeight(rows: number, columns: number, stable = false): number {
		// Keep the transcript's width stable while typing. Only the scrollable
		// plan keeps its column; the optional note still uses the real row budget.
		const composerRows = stable
			? www?.page === "execution" ? 4 : 3
			: composerFrame instanceof WwwComposer ? composerFrame.rowCount(columns) : composerFrame.render(columns).length;
		return Math.max(1, rows - composerRows - (rows >= 12 ? 2 : 0) - 2
			- (rows >= 5 && (stable || status.hasNotice) ? 1 : 0) - (rows >= 7 ? 1 : 0));
	}
	const wwwExecutionHeading = dependencies.surface === "www"
		? new WwwExecutionHeading(() => projectChatFeature(snapshot), undefined, Date.now, wwwMotion)
		: null;
	let closeThreeBodyLab = (): void => undefined;
	const threeBodyLab = dependencies.surface === "www"
		? new ThreeBodyLabView({
			viewportHeight: () => wwwBodyHeight(terminal.rows, terminal.columns),
			onClose: () => closeThreeBodyLab(),
		})
		: null;
	const www = dependencies.surface === "www" ? new WwwWorkspace(
		() => snapshot,
		() => usageSnapshots,
		wwwBodyHeight,
		Date.now,
		wwwMotion,
		{ motionActive: requestRuntimeMotionActive, rows: requestRuntimeRows },
		new WwwDashboardView(() => typeof workbench.layerPerformanceSnapshot === "function" ? { ...snapshot, layerPerformance: workbench.layerPerformanceSnapshot() } : snapshot, () => demoMode),
		null,
		threeBodyLab ?? undefined,
		{},
		() => dependencies.usage.cacheMetrics(),
		() => demoMode,
	) : null;
	www?.show(dependencies.initialWwwPage ?? "execution");
	const status = www ? new WwwNotice() : new StatusLine(WORKBENCH_STATUS_NOTICE);
	const entryDashboard = new EntryDashboardView(() => snapshot.linearDashboard);
	const chat = www?.transcript ?? new WorkbenchChatView(projectChatFeature(snapshot), entryDashboard, {
		render: (current, width) => current.pendingApproval
			? approvalCardRows(
				current.pendingApproval,
				current.chatQueue.length,
				projectApprovalBackgroundState(current.activities),
				width,
			)
			: [],
	});
	const sheet = (content: Component) => www ? new WwwSheet(content, () => Math.max(6, Math.floor(terminal.rows * 0.8))) : new OverlaySheet(content);
	const usageStrip = new UsageStripView(() => projectUsageStripSession(snapshot));
	const tracer = new WorkbenchTracerView(() => projectTracerFeature(snapshot), {
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
	const runtimeMonitorView = www ? new WwwMonitorView(getRuntimeMonitor, Date.now, wwwMotion) : new RuntimeMonitorView(getRuntimeMonitor);
	const runtimeMonitor = new ScrollView(www ? new WwwInset(runtimeMonitorView) : runtimeMonitorView, {
		follow: www ? "none" : "end", primary: true, overscroll: "contain", scrollbar: "auto", scrollbarStyle: www ? a.rule : colors.muted,
	});
	let observabilityDashboardSnapshot : ObservabilityDashboard                                  = emptyObservabilityDashboard() ;
	let selectedDashboardSessionIndex                                                            = 0                             ;
	let selectedHistoricalSession      : ObservabilityDashboard["recentSessions"][number] | null = null                          ;
	const observabilityDashboardView = www
		? new WwwHistoryView(() => observabilityDashboardSnapshot, () => selectedDashboardSessionIndex, () => wwwBodyHeight(terminal.rows, terminal.columns))
		: new ObservabilityDashboardView(() => observabilityDashboardSnapshot, () => selectedDashboardSessionIndex);
	const observabilityDashboard = new ScrollView(www ? new WwwInset(observabilityDashboardView) : observabilityDashboardView, {
		follow: "none", primary: true, overscroll: "contain", scrollbar: "auto", scrollbarStyle: www ? a.rule : colors.muted,
	});
	let developmentMapSnapshot: DevelopmentMapSnapshot = EMPTY_DEVELOPMENT_MAP;
	const developmentMapView = new (www ? WwwMapView : DevelopmentMapView)(() => developmentMapSnapshot);
	const developmentMap = new ScrollView(www ? new WwwInset(developmentMapView) : developmentMapView, {
		follow         : "none",
		primary        : true,
		overscroll     : "contain",
		scrollbar      : "auto",
		scrollbarStyle : www ? a.rule : colors.muted,
	});
	let statsTarget: "session" | "diagnostics" | "latest" | number = "session";
	const sessionStatsView = new (www ? WwwStatsView : SessionStatsView)(() => projectSessionStats(snapshot), () => statsTarget, () => selectedHistoricalSession);
	const sessionStats = new ScrollView(www ? new WwwInset(sessionStatsView) : sessionStatsView, {
		follow         : "none",
		primary        : true,
		overscroll     : "contain",
		scrollbar      : "auto",
		scrollbarStyle : www ? a.rule : colors.muted,
	});
	const testWorkspaceView = new WwwTestView(() => projectWwwTestView(snapshot));
	const testWorkspace = new ScrollView(new WwwInset(testWorkspaceView), {
		follow: "none", primary: true, overscroll: "contain", scrollbar: "auto", scrollbarStyle: www ? a.rule : colors.muted,
	});
	const telemetry = new WorkbenchTelemetryLine(cwd, () => tui.requestRender(), dependencies.gitTelemetrySource, dependencies.homeDirectory);
	const bottomHud = new WorkbenchBottomHudView(usageStrip);
	const dashboard = www ? { component: www.component } : createDashboardLayout(
		() => "Workbench",
		{ color: colors.accent, component: chat },
		{ color: colors.warm, component: todo },
		{ title: "Tracer", color: colors.secondary, component: tracer },
		() => ["TODO", todoPanelTimestamp(snapshot.todo?.updatedAt)].filter(Boolean).join(" "),
	);
	const wwwSource = www ? new ScrollView(new WwwInset(new WwwContextView(() => snapshot, () => usageSnapshots, true)), { follow: "none", primary: true, overscroll: "contain", scrollbar: "auto", scrollbarStyle: a.rule }) : null;
	const sourceLayout = wwwSource ? { component: wwwSource, leftScroll: wwwSource } : createDashboardLayout(
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
	const editor = new Editor(tui, www ? wwwEditorTheme : editorTheme, { paddingX: www ? 2 : 1, autocompleteMaxVisible: 5 });
	editor.setAutocompleteProvider(new CombinedAutocompleteProvider(withNativeModelCompletions(www ? WWW_COMMANDS : [...WORKBENCH_SLASH_COMMANDS, {name: "work", description: "Issue 연결·기록 상태·Obsidian checkpoint/open"}], () => snapshot.modelCatalog), cwd));
	if (composerDraft?.initialText) editor.setText(composerDraft.initialText);
	let composerGeneration = 0;
	editor.onChange = () => { composerGeneration += 1; };
	const composerPersistence = composerDraft
		? new ComposerDraftPersistenceQueue(composerDraft, () => composerGeneration, () => editor.getExpandedText())
		: null;
	const composerSlot                               = new ComponentSlot(editor)                                                                                                                                                                                        ;
	let overlays : WorkbenchOverlayController | null = null                                                                                                                                                                                                             ;
	const composerFrame                              = www ? new WwwComposer(composerSlot, editor, () => snapshot, () => !overlays?.isInlineApprovalActive, wwwExecutionHeading, () => www.page === "execution") : new ComposerModelFrame(composerSlot, () => snapshot) ;
	const root = new VStack([
		...(www ? [
			{ component: new WwwHeader(() => snapshot, () => navigation.mode === "workbench" ? wwwPageLabel(www.page) : navigation.mode === "monitor" ? "Progress" : navigation.mode, cwd), basis: 2, minSize: 1, maxSize: 2, visible: ({ height }: { height: number }) => height >= 12 },
		] : []),
		{ component: activeView, basis: 0, grow: 1, shrink: 1, minSize: 1 },
		{ component: composerFrame, basis: "auto", shrink: 1, minSize: 3 },
		{ component: status, basis: 1, minSize: 1, maxSize: 1, visible: ({ height }) => height >= 5 && status.hasNotice },
		{ component: www ? new WwwHud(() => snapshot, () => usageSnapshots, true, () => www.cacheTelemetry()) : bottomHud, basis: www ? "auto" : 1, minSize: 1, maxSize: www ? 6 : 1, visible: ({ height }) => height >= 7 },
	]);
	let lastAutoApprovalId : NonNullable<WorkbenchSnapshot["pendingApproval"]>["requestId"] | null = null                ;
	const exitKeys                                                                                 = new ExitKeyPolicy() ;
	let unsubscribe        : () => void                                                            = () => undefined     ;
	const scheduledRenderTraceIds                                                                  = new Set<string>()   ;
	const workbenchRenders = new RenderScheduler(() => {
		const traceIds = [...scheduledRenderTraceIds];
		scheduledRenderTraceIds.clear();
		for (const traceId of traceIds) observeLayer(workbench, traceId, "render-schedule", "started");
		try {
			chat.update(projectChatFeature(snapshot));
			for (const traceId of traceIds) {
				pendingFrameTraceIds.add(traceId);
				observeLayer(workbench, traceId, "layout-materialize", "queued");
				observeLayer(workbench, traceId, "terminal-write", "queued");
			}
			tui.requestRender();
			for (const traceId of traceIds) observeLayer(workbench, traceId, "render-schedule", "completed");
		} catch (error) {
			for (const traceId of traceIds) {
				pendingFrameTraceIds.delete(traceId);
				observeLayer(workbench, traceId, "render-schedule", "failed");
			}
			throw error;
		}
	}, dependencies.renderIntervalMs);
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
		www,
	);
	const showWwwPage = (page: WwwPage, browse = page !== "execution"): void => {
		const wasLab = www?.page === "lab";
		if (!navigation.showWwwPage(page, browse)) return;
		if (wasLab && page !== "lab") threeBodyLab?.deactivate();
		if (page === "lab") threeBodyLab?.activate(() => tui.requestRender());
		status.setNotice("");
		tui.requestRender();
	};
	const currentDemoPage = (): WwwPage => WWW_DEMO_PAGES[demoIndex] ?? "execution";
	const demoNotice = (): string => `DEMO DATA · ${demoIndex + 1}/${WWW_DEMO_PAGES.length} ${wwwPageLabel(currentDemoPage())} · R 이전 · E 다음 · Esc 종료`;
	const showDemoPage = (index: number): void => {
		demoIndex = (index + WWW_DEMO_PAGES.length) % WWW_DEMO_PAGES.length;
		showWwwPage(currentDemoPage(), true);
		status.setNotice(demoNotice());
		tui.requestRender();
	};
	const enterDemo = (): void => {
		if (!www || demoMode) return;
		demoMode        = true             ;
		demoReturnPage  = www.page         ;
		demoReturnDraft = editor.getText() ;
		const demo = createWwwDemoState(liveSnapshot);
		snapshot = demo.snapshot;
		usageSnapshots = demo.usage;
		editor.setText("");
		chat.update(projectChatFeature(snapshot));
		usageStrip.update(usageSnapshots);
		showDemoPage(0);
	};
	const exitDemo = (): void => {
		if (!www || !demoMode) return;
		demoMode       = false              ;
		snapshot       = liveSnapshot       ;
		usageSnapshots = liveUsageSnapshots ;
		chat.update(projectChatFeature(snapshot));
		usageStrip.update(usageSnapshots);
		editor.setText(demoReturnDraft);
		showWwwPage(demoReturnPage, demoReturnPage !== "execution");
		synchronizeSnapshotUi();
		tui.requestRender();
	};
	closeThreeBodyLab = () => showWwwPage("execution", false);
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
	// The spinner frame advances every 120ms; without motion only elapsed labels need the 1s tick.
	const wwwClock = www ? setInterval(() => {
		const request = snapshot.requestRuntime?.at(-1);
		if (!lifecycle.isShuttingDown && !overlays?.hasOverlay && (wwwExecutionIsLive(projectChatFeature(snapshot)) || wwwMotion && request && requestRuntimeMotionActive(request, Date.now()))) tui.requestRender();
	// Native deltas already use the 32ms scheduler below. This clock only keeps
	// elapsed labels and live decoration fresh. A persistent session goal is
	// static and must not keep the layered workspace repainting after completion.
	}, wwwMotion ? 120 : 1_000) : null;
	wwwClock?.unref?.();
	let composerBorderFrame = 0;
	const composerBorderClock = setInterval(() => {
		// A border shimmer is decorative. Once a conversation exists, redraws must
		// belong to input or Runtime state, not a perpetual cosmetic clock.
		if (www
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
		timers      : [monitorClock, composerBorderClock, wwwClock],
		disposables : [workbenchRenders, telemetry, chat, ...(threeBodyLab ? [threeBodyLab] : [])],
		...(composerPersistence ? { saveDraft: () => composerPersistence.saveLatest() } : {}),
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
		www,
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
		showWwwPage,
		closeTransientSurface: () => navigation.closeTransientSurface(),
		updateUsage: (next) => {
			usageSnapshots = next;
			usageStrip.update(next);
		},
		showReceipt,
	});
	const submitComposer = (text: string): void => {
		if (lifecycle.isShuttingDown || !text.trim()) return;
		const submittedGeneration = composerGeneration                                               ;
		const composerIsUnchanged = (): boolean => composerGeneration === submittedGeneration        ;
		const restoreSubmission   = (): void => { if (composerIsUnchanged()) editor.setText(text); } ;
		editor.addToHistory(text);
		void (async () => {
			if (await handleLocal(text)) return;
			if (snapshot.pendingApproval) {
				restoreSubmission();
				overlays?.openApproval(snapshot.pendingApproval);
				status.setNotice("승인 선택 화면을 열었습니다. ↑↓ 또는 숫자로 선택하세요.");
				tui.requestRender();
				return;
			}
			const receipt = await workbench.dispatch({ type: "chat.send", text, delivery: "queue" });
			showReceipt(receipt);
			if (workbenchReceiptClearsComposer(receipt)) {
				await composerPersistence?.clearIfCurrent(submittedGeneration).catch(() => undefined);
			} else restoreSubmission();
		})().catch((error) => {
			restoreSubmission();
			status.setNotice(error instanceof Error ? error.message : String(error));
			tui.requestRender();
		});
	};
	synchronizeSnapshotUi = (): void => {
		lastAutoApprovalId = overlays?.synchronizeApproval(lastAutoApprovalId) ?? null;
		chat.syncActivity(workbenchActivityIndicator(snapshot), () => tui.requestRender());
	};
	const handleLocal = createWorkbenchCommandRouter({
		hasWww: www !== null,
		snapshot: () => snapshot,
		workbench,
		...(dependencies.development ? { development: dependencies.development } : {}),
		usage,
		auth,
		enterDemo,
		showWwwPage,
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
		openNotes              : () => overlays?.openNotes(),
		openAuthentication     : (provider) => overlays?.openAuthentication(provider),
		dispatchModelSelection : (settings) => overlays!.dispatchModelSelection(settings),
		showReceipt,
	});
	/** @linear WOO-694 */
	editor.onSubmit = submitComposer;
	unsubscribe = workbench.subscribe((next) => {
		const traceId = layerTraceId(workbench);
		if (traceId) {
			scheduledRenderTraceIds.add(traceId);
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
		tui, editor, workbench, workbenchRenders, lifecycle, overlays, www, threeBodyLab, navigation,
		snapshot: () => snapshot, handleLocal, submitComposer, showWwwPage, cycleRuntimeMode, enterObservability, status, exitKeys, shutdown, showReceipt,
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
	if (www) void refreshObservabilityDashboard().then(() => tui.requestRender());
	telemetry.refresh();
	chat.syncActivity(workbenchActivityIndicator(snapshot), () => tui.requestRender());
	chat.playWelcomeIntro(() => tui.requestRender());
	applyTerminalBackground();
	tui.start();
}
