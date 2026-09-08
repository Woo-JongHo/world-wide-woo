import { executeDevelopmentShellCommand, type DevelopmentService } from "../../../core/application/development-service";
import {
	CombinedAutocompleteProvider,
	Editor,
	Key,
	ProcessTerminal,
	ScrollView,
	TuiAltScreen,
	VStack,
	wrapTextWithAnsi,
	isViewportTUI,
	matchesKey,
	type Component,
	type OverlayHandle,
} from "@earendil-works/pi-tui";
import type { AuthController, ComposerDraftController, ObservabilityHistoryReader, UsageMonitor, WorkbenchGitTelemetryReader } from "../../../core/ports";
import type { ProjectWorkbench } from "../../../core/application/project-workbench";
import { EMPTY_DEVELOPMENT_MAP, type DevelopmentMapSnapshot } from "../../../core/domain/development-map";
import { projectObservabilityDashboard, summarizeObservabilityStreams, type ObservabilityDashboard } from "../../../core/domain/observability-dashboard";
import { projectRuntimeMonitor, type RuntimeMonitorProjection } from "../../../core/domain/runtime-monitor";
import { normalizeSettings, PROVIDERS, type Provider, type WwwSettings } from "../../../core/domain/model-settings";
import { projectSessionStats } from "../../../core/domain/session-stats";
import { sanitizeTerminalTextUnbounded } from "../../../core/domain/terminal";
import type { WorkbenchCommandReceipt, WorkbenchSnapshot } from "../../../core/domain/workbench";
import { createDashboardLayout } from "./dashboard-layout";
import { StatusLine, WorkspaceTodoView } from "./shared-dashboard-views";
import { TNotesSourceView, WorkbenchChatView, WorkbenchMonitorView } from "./workbench-views";
import { ExitKeyPolicy } from "./exit-key-policy";
import { LoginOverlay } from "./auth-overlay";
import { ModelPickerOverlay } from "./model-picker-overlay";
import { OverlaySheet } from "./overlay-sheet";
import { RenderScheduler, workbenchRenderUrgency } from "./render-scheduler";
import { settleWithin } from "./shell-lifecycle";
import { parseWorkbenchShellCommand, WORKBENCH_SLASH_COMMANDS, type WorkbenchShellCommand } from "./slash-commands";
import { colors, composerBorderColor, editorTheme } from "./theme";
import { WorkbenchBottomHudView } from "./workbench-bottom-hud";
import { WorkbenchTelemetryLine, workbenchModelLabel } from "./workbench-telemetry";
import { UsageStripView } from "./usage-strip-view";
import { DevelopmentMapView } from "./development-map-view";
import { ObservabilityDashboardView } from "./observability-dashboard-view";
import { RuntimeMonitorView } from "./runtime-monitor-view";
import { SessionStatsView } from "./session-stats-view";

export interface ProjectWorkbenchShellDependencies {
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

export function workbenchReceiptNotice(receipt: WorkbenchCommandReceipt): string {
	if (receipt.state === "accepted") return receipt.message || "요청을 수락했습니다.";
	if (receipt.state === "queued") return "메시지를 Chat에 올렸습니다. 현재 응답 뒤 바로 전송합니다.";
	if (receipt.state === "uncertain") return `${receipt.reason} 자동 재시도하지 않습니다. /cancel로 서버 상태를 확인하세요.`;
	return receipt.reason;
}

/** @linear WOO-694 */
export function workbenchReceiptClearsComposer(receipt: WorkbenchCommandReceipt): boolean {
	return receipt.state !== "rejected";
}

export function approvalDecisionFromInput(text: string): "accept" | "acceptForSession" | "decline" | null {
	const value = text.trim().toLocaleLowerCase("ko-KR").replace(/[.!?]+$/u, "");
	if (["네", "예", "응", "승인", "승인해", "진행", "진행해", "yes", "y", "ok"].includes(value)) return "accept";
	if (["이번 세션 동안 승인", "세션 동안 승인", "항상 승인", "accept for session"].includes(value)) return "acceptForSession";
	if (["아니오", "아니요", "안돼", "거절", "거절해", "취소", "no", "n"].includes(value)) return "decline";
	return null;
}

export function loginProviderFromInput(text: string): Provider | null {
	const value = text.trim().toLocaleLowerCase("en-US");
	const alias = value === "codex" || value === "chatgpt" ? "openai-codex"
		: value === "claude" ? "anthropic"
			: value === "gemini" ? "google" : value;
	return (PROVIDERS as readonly string[]).includes(alias) ? alias as Provider : null;
}

export const WORKBENCH_STATUS_NOTICE = "";

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
		retryCount: 0, failureCount: 0, sourceActivityIds: Object.freeze([]), recentEvents: Object.freeze([]),
	});
}

export type WorkbenchBaseViewMode = "workbench";
export type ObservabilityViewMode = "stats" | "dashboard" | "monitor";
export type WorkbenchViewMode = WorkbenchBaseViewMode | ObservabilityViewMode | "map" | "source";

export function workbenchViewModeCommand(text: string): WorkbenchViewMode | null {
	const command = text.trim();
	return command === "/dashboard" ? "dashboard"
		: command === "/monitor" ? "monitor"
		: command === "/map" ? "map"
		: command === "/stats" ? "stats"
		: null;
}

export function workbenchStatsTargetCommand(text: string): "session" | "diagnostics" | "latest" | number | "invalid" | null {
	const command = text.trim();
	if (command === "/stats") return "session";
	if (command === "/stats diagnostics") return "diagnostics";
	if (command === "/stats latest") return "latest";
	const numbered = command.match(/^\/stats\s+#(\d+)$/u);
	if (numbered) return Number(numbered[1]);
	return command.startsWith("/stats") ? "invalid" : null;
}

export function workbenchEscapeView(
	mode: WorkbenchViewMode,
	previous: WorkbenchBaseViewMode,
): WorkbenchBaseViewMode | null {
	return mode !== "workbench" ? previous : null;
}

const OBSERVABILITY_ROTATION: readonly ObservabilityViewMode[] = ["stats", "dashboard", "monitor"];
export function rotateObservabilityView(mode: ObservabilityViewMode, direction: 1 | -1): ObservabilityViewMode {
	const index = OBSERVABILITY_ROTATION.indexOf(mode);
	return OBSERVABILITY_ROTATION[(index + direction + OBSERVABILITY_ROTATION.length) % OBSERVABILITY_ROTATION.length]!;
}
export function directObservabilityView(key: string): ObservabilityViewMode | null {
	return key === "1" ? "stats" : key === "2" ? "dashboard" : key === "3" ? "monitor" : null;
}
export function shouldHandleObservabilityShortcut(navigationActive: boolean, editableFocused: boolean, key: string): boolean {
	return navigationActive && !editableFocused && (key === "r" || key === "R" || directObservabilityView(key) !== null);
}

export function workbenchDashboardSessionIndex(
	previous: readonly { readonly sessionId: string }[],
	selectedIndex: number,
	next: readonly { readonly sessionId: string }[],
): number {
	const selectedSessionId = previous[selectedIndex]?.sessionId;
	const preserved = selectedSessionId ? next.findIndex(session => session.sessionId === selectedSessionId) : -1;
	return preserved >= 0 ? preserved : Math.min(Math.max(0, selectedIndex), Math.max(0, next.length - 1));
}

export class DevelopmentMapPollingLifecycle {
	private stopPolling: (() => void) | null = null;
	public constructor(
		private readonly source: ProjectWorkbenchShellDependencies["developmentMapSource"],
		private readonly listener: (snapshot: DevelopmentMapSnapshot) => void,
	) {}
	public enter(): void {
		if (!this.stopPolling && this.source) this.stopPolling = this.source.startPolling(this.listener);
	}
	public leave(): void {
		this.stopPolling?.();
		this.stopPolling = null;
	}
}

/** A stable layout slot whose active component and keyboard owner can be replaced without rebuilding the root. */
export class ComponentSlot implements Component {
	public constructor(private current: Component) {}
	public set(component: Component): void { this.current = component; }
	public invalidate(): void { this.current.invalidate(); }
	public render(width: number): string[] { return this.current.render(width); }
	public handleInput(data: string): void { this.current.handleInput?.(data); }
}

/** @linear WOO-673 */
export function createWorkbenchViewHost(
	getMode: () => WorkbenchViewMode,
	workbench: Component,
	dashboard: Component,
	monitor: Component,
	source: Component,
	map: Component,
	stats: Component,
): Component {
	return new VStack([
		{
			component: workbench,
			basis: 0,
			grow: 1,
			shrink: 1,
			minSize: 1,
			visible: () => getMode() === "workbench",
		},
		{
			component: dashboard,
			basis: 0,
			grow: 1,
			shrink: 1,
			minSize: 1,
			visible: () => getMode() === "dashboard",
		},
		{
			component: monitor,
			basis: 0,
			grow: 1,
			shrink: 1,
			minSize: 1,
			visible: () => getMode() === "monitor",
		},
		{
			component: source,
			basis: 0,
			grow: 1,
			shrink: 1,
			minSize: 1,
			visible: () => getMode() === "source",
		},
		{
			component: map,
			basis: 0,
			grow: 1,
			shrink: 1,
			minSize: 1,
			visible: () => getMode() === "map",
		},
		{
			component: stats,
			basis: 0,
			grow: 1,
			shrink: 1,
			minSize: 1,
			visible: () => getMode() === "stats",
		},
	]);
}

export function workbenchModelSettings(source: Pick<WorkbenchSnapshot, "model" | "effort">): WwwSettings {
	return normalizeSettings({
		provider: "openai-codex",
		model: source.model,
		effort: source.effort,
	});
}

export function workbenchFrameTitle(source: Pick<WorkbenchSnapshot,
	"projectId" | "model" | "activeModel" | "effort" | "phase" | "collaborationMode" | "permissionMode" | "chatQueue" | "pendingApproval"
>): string {
	return `🐙 WWW · ${source.projectId} · ${workbenchModelLabel(source.activeModel ?? source.model)} · ${source.effort ?? "–"} · ${source.phase} · ${source.collaborationMode === "plan" ? "Plan" : "Manual"} · Permission ${source.permissionMode ?? "manual"}${source.pendingApproval ? " · 승인 대기" : ""}`;
}

export function workbenchPaneNotice(pane: "chat" | "tnotes" | "todo"): string {
	const location = pane === "chat" ? "왼쪽 Chat · 질문과 공개 응답"
		: pane === "tnotes" ? "오른쪽 위 완료 질문 T-note" : "오른쪽 아래 현재 Native Plan·Todo.md";
	return `${location} pane은 현재 화면에 계속 표시됩니다.`;
}

export function workbenchViewModeForCommand(
	current: WorkbenchViewMode,
	command: WorkbenchShellCommand,
): WorkbenchViewMode {
	if (command.type === "pane.show") return "workbench";
	if (command.type === "activity.select" && command.activityId) return "source";
	if (command.type === "trace.select") return "source";
	return current;
}

const WORKBENCH_ACTIVITY_FRAMES = Object.freeze(["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]);
const WORKBENCH_ACTIVITY_INTERVAL_MS = 80;
const WORKBENCH_ACTIVITY_MESSAGE_MAX_CHARS = 72;
const WORKBENCH_TOOL_STALL_MS = 3 * 60 * 1_000;

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
		label = "분석 · 요청을 읽고 첫 단계를 정하는 중";
	}
	return Object.freeze({
		message: label,
		hint: toolObservationStalled ? "Esc 또는 /cancel 즉시 중단" : "Esc 중단",
		frames: source.pendingApproval ? Object.freeze(["⏸"]) : WORKBENCH_ACTIVITY_FRAMES,
		intervalMs: source.pendingApproval ? 1_000 : WORKBENCH_ACTIVITY_INTERVAL_MS,
	});
}

function liveActivityLabel(activity: WorkbenchActivityIndicatorSource["liveActivity"]): string | null {
	if (!activity) return null;
	const method = activity.method.replace(/[-_]/gu, "").toLowerCase();
	if (activity.kind === "file-change" || method.includes("filechange")) return "Edit 변경을 반영하는 중";
	if (activity.kind === "approval" || method.includes("approval")) return "승인 결과를 기다리는 중";
	if (activity.kind === "tool" && /command|bash|shell/u.test(method)) return "Bash 명령 결과를 확인하는 중";
	if (activity.kind === "tool") return "Tool 실행 결과를 확인하는 중";
	return "현재 작업 상태를 확인하는 중";
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
// @linear WOO-727
/** @linear WOO-674 */
/** @codeId 0004 */
export function runProjectWorkbenchShell(dependencies: ProjectWorkbenchShellDependencies): void {
	const { workbench, usage, auth, composerDraft, releaseSessionLease } = dependencies;
	const cwd = dependencies.cwd ?? process.cwd();
	const tui = new TuiAltScreen(new ProcessTerminal(), true);
	let snapshot = workbench.snapshot;
	const status = new StatusLine(WORKBENCH_STATUS_NOTICE);
	const chat = new WorkbenchChatView(snapshot);
	const usageStrip = new UsageStripView(() => ({ models: snapshot.sessionUsage?.models ?? [], activeModel: snapshot.activeModel }));
	const tnotes = new TNotesSourceView(() => snapshot);
	const todo = new WorkspaceTodoView(
		() => snapshot.todo,
		() => ({
			activeTurnId: snapshot.activeTurnId,
			activities: snapshot.activities,
			workFlow: snapshot.workFlow,
			sync: snapshot.todoSync,
		}),
	);
	const sourceMonitor = new WorkbenchMonitorView(() => snapshot);
	const runtimeMonitorView = new RuntimeMonitorView(() => selectedHistoricalSession && selectedHistoricalSession.sessionId !== snapshot.threadId
		? unavailableHistoricalMonitor()
		: projectRuntimeMonitor(snapshot));
	const runtimeMonitor = new ScrollView(runtimeMonitorView, {
		follow: "end", primary: true, overscroll: "contain", scrollbar: "auto", scrollbarStyle: colors.muted,
	});
	let observabilityDashboardSnapshot: ObservabilityDashboard = emptyObservabilityDashboard();
	let selectedDashboardSessionIndex = 0;
	let selectedHistoricalSession: ObservabilityDashboard["recentSessions"][number] | null = null;
	const observabilityDashboardView = new ObservabilityDashboardView(() => observabilityDashboardSnapshot, () => selectedDashboardSessionIndex);
	const observabilityDashboard = new ScrollView(observabilityDashboardView, {
		follow: "none", primary: true, overscroll: "contain", scrollbar: "auto", scrollbarStyle: colors.muted,
	});
	let developmentMapSnapshot: DevelopmentMapSnapshot = EMPTY_DEVELOPMENT_MAP;
	const developmentMapView = new DevelopmentMapView(() => developmentMapSnapshot);
	const developmentMap = new ScrollView(developmentMapView, {
		follow: "none",
		primary: true,
		overscroll: "contain",
		scrollbar: "auto",
		scrollbarStyle: colors.muted,
	});
	let statsTarget: "session" | "diagnostics" | "latest" | number = "session";
	const sessionStatsView = new SessionStatsView(() => projectSessionStats(snapshot), () => statsTarget, () => selectedHistoricalSession);
	const sessionStats = new ScrollView(sessionStatsView, {
		follow: "none",
		primary: true,
		overscroll: "contain",
		scrollbar: "auto",
		scrollbarStyle: colors.muted,
	});
	const telemetry = new WorkbenchTelemetryLine(() => snapshot, cwd, () => tui.requestRender(), dependencies.gitTelemetrySource, dependencies.homeDirectory);
	const bottomHud = new WorkbenchBottomHudView(usageStrip);
	const dashboard = createDashboardLayout(
		() => `Workbench · ${workbenchFrameTitle(snapshot)}`,
		{ color: colors.accent, component: chat },
		{ color: colors.warm, component: todo },
		{ color: colors.secondary, component: tnotes },
	);
	const sourceLayout = createDashboardLayout(
		() => `Source · ${workbenchFrameTitle(snapshot)}`,
		{ color: colors.accent, component: chat },
		{ color: colors.warm, component: todo },
		{ color: colors.secondary, component: sourceMonitor },
	);
	let viewMode: WorkbenchViewMode = "workbench";
	let previousViewMode: WorkbenchBaseViewMode = "workbench";
	const activeView = createWorkbenchViewHost(
		() => viewMode,
		dashboard.component,
		observabilityDashboard,
		runtimeMonitor,
		sourceLayout.component,
		developmentMap,
		sessionStats,
	);
	const editor = new Editor(tui, editorTheme, { paddingX: 1, autocompleteMaxVisible: 5 });
	editor.setAutocompleteProvider(new CombinedAutocompleteProvider([...WORKBENCH_SLASH_COMMANDS, {name: "work", description: "Issue 연결·기록 상태·Obsidian checkpoint/open"}], process.cwd()));
	if (composerDraft?.initialText) editor.setText(composerDraft.initialText);
	const composerSlot = new ComponentSlot(editor);
	const root = new VStack([
		{ component: activeView, basis: 0, grow: 1, shrink: 1, minSize: 1 },
		{ component: composerSlot, basis: "auto", shrink: 1, minSize: 3 },
		{ component: status, basis: 1, minSize: 1, maxSize: 1, visible: ({ height }) => height >= 5 && status.hasNotice },
		{ component: bottomHud, basis: 1, minSize: 1, maxSize: 1, visible: ({ height }) => height >= 7 },
	]);
	let shuttingDown = false;
	let observabilityNavigation = false;
	let overlay: OverlayHandle | null = null;
	let overlayKind: "model" | "approval" | "development" | null = null;
	let loginPrompt: LoginOverlay | null = null;
	const exitKeys = new ExitKeyPolicy();
	let unsubscribe: () => void = () => undefined;
	const workbenchRenders = new RenderScheduler(() => {
		chat.update(snapshot);
		tui.requestRender();
	});
	const stopUsagePolling = usage.startPolling((snapshots) => {
		usageStrip.update(snapshots);
		tui.requestRender();
	});
	const developmentMapPolling = new DevelopmentMapPollingLifecycle(dependencies.developmentMapSource, (next) => {
		developmentMapSnapshot = next;
		developmentMapView.invalidate();
		tui.requestRender();
	});
	const setViewMode = (next: WorkbenchViewMode): void => {
		if (viewMode === next) return;
		const wasMap = viewMode === "map";
		viewMode = next;
		if (!wasMap && next === "map") developmentMapPolling.enter();
		if (wasMap && next !== "map") developmentMapPolling.leave();
	};
	const monitorClock = setInterval(() => {
		if (snapshot.phase === "working") chat.syncActivity(workbenchActivityIndicator(snapshot), () => tui.requestRender());
		if (viewMode === "monitor" && snapshot.phase === "working") tui.requestRender();
	}, 1_000);
	monitorClock.unref?.();
	let composerBorderFrame = 0;
	const composerBorderClock = setInterval(() => {
		if (!editor.focused || shuttingDown) return;
		composerBorderFrame = (composerBorderFrame + 1) % 24;
		editor.borderColor = composerBorderColor(composerBorderFrame);
		tui.requestRender();
	}, 90);
	composerBorderClock.unref?.();
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
		setViewMode(next);
		observabilityNavigation = true;
		tui.setFocus(next === "stats" ? sessionStats : next === "dashboard" ? observabilityDashboard : runtimeMonitor);
	};
	const shutdown = async () => {
		if (shuttingDown) return;
		shuttingDown = true;
		loginPrompt?.handleInput("\u0003");
		overlay?.hide();
		overlay = null;
		status.setNotice("Workbench를 안전하게 종료하는 중…");
		tui.requestRender();
		unsubscribe();
		stopUsagePolling();
		developmentMapPolling.leave();
		clearInterval(monitorClock);
		clearInterval(composerBorderClock);
		workbenchRenders.dispose();
		telemetry.dispose();
		chat.dispose();
		await settleWithin((async () => {
			if (composerDraft) await composerDraft.save(editor.getExpandedText()).catch(() => undefined);
			try {
				await workbench.close();
			} finally {
				await releaseSessionLease?.();
			}
		})(), 5_000);
		tui.stop();
	};
	const showReceipt = (receipt: Awaited<ReturnType<ProjectWorkbench["dispatch"]>>) => {
		status.setNotice(workbenchReceiptNotice(receipt));
		tui.requestRender();
	};
	const closeOverlay = (): void => {
		if (!overlay) return;
		overlay.hide();
		overlay = null;
		overlayKind = null;
		tui.setFocus(editor);
	};
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
		composerSlot.set(editor);
		tui.setFocus(editor);
		tui.requestRender();
	};
	const openAuthentication = (provider?: Provider): void => {
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
				usageStrip.update(await usage.refresh());
				tui.requestRender();
			},
			() => closeLoginPrompt(panel),
			provider ? [provider] : undefined,
		);
		loginPrompt = panel;
		composerSlot.set(new OverlaySheet(panel));
		tui.setFocus(panel);
		panel.start(provider !== undefined);
		tui.requestRender();
	};
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
			async provider => ({ state: "configured", provider, source: "Codex App Server", type: "oauth" }),
			() => tui.requestRender(),
			applyModelSelection,
			() => undefined,
			closeOverlay,
			current,
			false,
			{ providers: ["openai-codex"], startAtModel: true },
		);
		overlay = tui.showOverlay(new OverlaySheet(panel), {
			width: "64%", minWidth: 46, maxHeight: "70%", anchor: "bottom-center", margin: 2,
		});
		overlayKind = "model";
		panel.start();
	};
	const handleLocal = async (text: string): Promise<boolean> => {
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
				overlay = tui.showOverlay(new OverlaySheet(panel), { width: "90%", minWidth: 40, maxHeight: "85%", anchor: "center" });
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
			if (requestedViewMode === "map") {
				observabilityNavigation = false;
				setViewMode("map");
				tui.setFocus(developmentMap);
			} else if (requestedViewMode === "workbench" || requestedViewMode === "source") {
				setViewMode("workbench");
				observabilityNavigation = false;
				tui.setFocus(editor);
			} else await enterObservability(requestedViewMode);
			status.setNotice(requestedViewMode === "dashboard"
				? "Dashboard · 전체 Session과 Project 관측"
				: requestedViewMode === "monitor"
					? "Monitor · 현재 runtime 실행 관측"
					: requestedViewMode === "map"
						? "Development Map · 전체 구조와 진척도 · 자동 갱신"
						: "Session Stats · 목적·행동·결과와 오케스트레이션 효율");
			tui.requestRender();
			return true;
		}
		const command = parseWorkbenchShellCommand(text);
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
		if (command.type === "pane.show") {
			setViewMode(workbenchViewModeForCommand(viewMode, command));
			observabilityNavigation = false;
			tui.setFocus(editor);
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
			showReceipt(await dispatchModelSelection({
				provider: "openai-codex",
				model: command.model,
				effort: command.effort ?? current.effort,
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
			usageStrip.update(await usage.refresh());
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
		if (command.type === "woo-entry.refresh") {
			showReceipt(await workbench.dispatch({ type: "woo-entry.refresh" }));
			return true;
		}
		if (command.type === "activity.select") {
			const activityId = command.activityId === "latest" ? snapshot.activities.at(-1)?.id ?? null : command.activityId;
			const receipt = await workbench.dispatch({ type: "activity.select", activityId });
			showReceipt(receipt);
			if (receipt.state !== "accepted" || !activityId) return true;
			setViewMode("source");
			observabilityNavigation = false;
			tui.setFocus(sourceLayout.leftScroll);
			return true;
		}
		if (command.type === "trace.select") {
			const receipt = await workbench.dispatch({ type: "trace.select", activityId: command.activityId });
			showReceipt(receipt);
			if (receipt.state === "accepted") {
				setViewMode("source");
				observabilityNavigation = false;
				tui.setFocus(sourceLayout.leftScroll);
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
	editor.onSubmit = (text) => {
		if (shuttingDown || !text.trim()) return;
		editor.addToHistory(text);
		void (async () => {
			if (await handleLocal(text)) return;
			if (snapshot.pendingApproval) {
				const decision = approvalDecisionFromInput(text);
				if (!decision) {
					editor.setText(text);
					status.setNotice("승인할까요? Input에 ‘네’ 또는 ‘아니요’라고 답해 주세요.");
					tui.requestRender();
					return;
				}
				const receipt = await workbench.dispatch({
					type: "approval.resolve",
					requestId: snapshot.pendingApproval.requestId,
					response: { decision },
				});
				showReceipt(receipt);
				if (workbenchReceiptClearsComposer(receipt)) await composerDraft?.clear().catch(() => undefined);
				else editor.setText(text);
				return;
			}
			const receipt = await workbench.dispatch({ type: "chat.send", text });
			showReceipt(receipt);
			if (workbenchReceiptClearsComposer(receipt)) {
				await composerDraft?.clear().catch(() => undefined);
			} else editor.setText(text);
		})().catch((error) => {
			editor.setText(text);
			status.setNotice(error instanceof Error ? error.message : String(error));
			tui.requestRender();
		});
	};
	unsubscribe = workbench.subscribe((next) => {
		const urgency = workbenchRenderUrgency(snapshot, next);
		const refreshTelemetry = snapshot.phase === "working" && next.phase !== "working";
		snapshot = next;
		if (snapshot.pendingApproval) status.setNotice("승인할까요? Input에 ‘네’ 또는 ‘아니요’라고 답해 주세요.");
		chat.syncActivity(workbenchActivityIndicator(snapshot), () => tui.requestRender());
		if (refreshTelemetry) telemetry.refresh();
		workbenchRenders.request(urgency);
	});
	tui.addInputListener((data) => {
		// This listener runs before the focused Editor. Defer any streaming frame
		// until the Editor has committed this input turn; Pi TUI then takes its
		// immediate keyboard-render path instead of a 64ms workbench repaint.
		workbenchRenders.prioritizeInput();
		if (shuttingDown) return { consume: true };
		if (loginPrompt && (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c")) || matchesKey(data, Key.ctrl("d")))) {
			loginPrompt.handleInput(data);
			status.setNotice("로그인을 취소했습니다.");
			tui.requestRender();
			return { consume: true };
		}
		if (overlay) {
			if (matchesKey(data, Key.ctrl("c")) || matchesKey(data, Key.ctrl("d"))) {
				const closing = overlayKind;
				closeOverlay();
				status.setNotice(closing === "approval"
					? "승인 창을 닫았습니다. /approve 로 다시 결정할 수 있습니다."
					: closing === "development" ? "개발 연결 창을 닫았습니다." : "모델 변경을 취소했습니다.");
				tui.requestRender();
				return { consume: true };
			}
			return undefined;
		}
		if (observabilityNavigation && viewMode === "dashboard" && (matchesKey(data, Key.up) || matchesKey(data, Key.down))) {
			const maximum = Math.max(0, observabilityDashboardSnapshot.recentSessions.length - 1);
			selectedDashboardSessionIndex = Math.max(0, Math.min(maximum, selectedDashboardSessionIndex + (matchesKey(data, Key.up) ? -1 : 1)));
			observabilityDashboardView.invalidate();
			tui.requestRender();
			return { consume: true };
		}
		if (observabilityNavigation && viewMode === "dashboard" && matchesKey(data, Key.enter)) {
			selectedHistoricalSession = observabilityDashboardSnapshot.recentSessions[selectedDashboardSessionIndex] ?? null;
			if (selectedHistoricalSession) {
				statsTarget = "session";
				void enterObservability("stats").then(() => tui.requestRender());
			}
			return { consume: true };
		}
		if (shouldHandleObservabilityShortcut(observabilityNavigation, !observabilityNavigation, data)
			&& (viewMode === "stats" || viewMode === "dashboard" || viewMode === "monitor")) {
			const direct = directObservabilityView(data);
			const rotated = data === "r" ? rotateObservabilityView(viewMode, 1)
				: data === "R" ? rotateObservabilityView(viewMode, -1) : null;
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
		if (matchesKey(data, Key.escape)) {
			const returnView = workbenchEscapeView(viewMode, previousViewMode);
			if (returnView) {
				setViewMode(returnView);
				observabilityNavigation = false;
				tui.setFocus(editor);
				status.setNotice("상세 화면을 닫고 Workbench로 돌아왔습니다.");
				tui.requestRender();
				return { consume: true };
			}
		}
		if (matchesKey(data, Key.escape) && snapshot.phase === "working" && !editor.isShowingAutocomplete()) {
			void workbench.dispatch({ type: "chat.cancel" }).then(showReceipt);
			return { consume: true };
		}
		if (matchesKey(data, Key.ctrl("c"))) {
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
	tui.setFocus(editor);
	telemetry.refresh();
	chat.syncActivity(workbenchActivityIndicator(snapshot), () => tui.requestRender());
	chat.playWelcomeIntro(() => tui.requestRender());
	tui.start();
}
