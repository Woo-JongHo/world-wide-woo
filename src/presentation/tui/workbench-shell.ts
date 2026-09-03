import {
	CombinedAutocompleteProvider,
	Editor,
	Key,
	ProcessTerminal,
	TuiAltScreen,
	VStack,
	isViewportTUI,
	matchesKey,
	type Component,
	type OverlayHandle,
} from "@earendil-works/pi-tui";
import type { ComposerDraftController, UsageMonitor } from "../../application/ports";
import type { ProjectWorkbench } from "../../application/project-workbench";
import { normalizeSettings, type WwwSettings } from "../../domain/model-settings";
import { sanitizeTerminalTextUnbounded } from "../../domain/terminal";
import { workbenchApprovalIdentity, type WorkbenchCommandReceipt, type WorkbenchSnapshot } from "../../domain/workbench";
import { createDashboardLayout } from "./dashboard-layout";
import { StatusLine, WorkspaceTodoView } from "./shared-dashboard-views";
import { TNotesSourceView, WorkbenchChatView, WorkbenchMonitorView } from "./workbench-views";
import { ExitKeyPolicy } from "./exit-key-policy";
import { ApprovalOverlay } from "./approval-overlay";
import { ModelPickerOverlay } from "./model-picker-overlay";
import { OverlaySheet } from "./overlay-sheet";
import { RenderScheduler, workbenchRenderUrgency } from "./render-scheduler";
import { settleWithin } from "./shell-lifecycle";
import { parseWorkbenchShellCommand, WORKBENCH_SLASH_COMMANDS } from "./slash-commands";
import { colors, editorTheme } from "./theme";
import { WorkbenchBottomHudView } from "./workbench-bottom-hud";
import { WorkbenchTelemetryLine, workbenchModelLabel } from "./workbench-telemetry";
import { UsageStripView } from "./usage-strip-view";

export interface ProjectWorkbenchShellDependencies {
	workbench: ProjectWorkbench;
	cwd?: string;
	usage: UsageMonitor;
	composerDraft?: ComposerDraftController;
	releaseSessionLease?: () => Promise<void>;
}

export function workbenchReceiptNotice(receipt: WorkbenchCommandReceipt): string {
	if (receipt.state === "accepted") return receipt.message || "요청을 수락했습니다.";
	if (receipt.state === "queued") return `메시지를 대기열 ${receipt.position}번에 추가했습니다.`;
	if (receipt.state === "uncertain") return `${receipt.reason} 자동 재시도하지 않습니다. /cancel로 서버 상태를 확인하세요.`;
	return receipt.reason;
}

export function workbenchReceiptClearsComposer(receipt: WorkbenchCommandReceipt): boolean {
	return receipt.state !== "rejected";
}

export const WORKBENCH_STATUS_NOTICE = "";

export type WorkbenchViewMode = "dashboard" | "monitor";

export function workbenchViewModeCommand(text: string): WorkbenchViewMode | null {
	const command = text.trim();
	return command === "/dashboard" ? "dashboard" : command === "/monitor" ? "monitor" : null;
}

export function createWorkbenchViewHost(
	getMode: () => WorkbenchViewMode,
	dashboard: Component,
	monitor: Component,
): Component {
	return new VStack([
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
	return `🐙 WWW · ${source.projectId} · ${workbenchModelLabel(source.activeModel ?? source.model)} · ${source.effort ?? "–"} · ${source.phase} · ${source.collaborationMode === "plan" ? "Plan" : "Manual"} · Permission ${source.permissionMode ?? "manual"}${source.chatQueue.length > 0 ? ` · 대기 ${source.chatQueue.length}` : ""}${source.pendingApproval ? " · 승인 대기" : ""}`;
}

const WORKBENCH_ACTIVITY_FRAMES = Object.freeze(["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]);
const WORKBENCH_ACTIVITY_INTERVAL_MS = 80;
const WORKBENCH_ACTIVITY_MESSAGE_MAX_CHARS = 72;

interface WorkbenchActivityIndicatorSource {
	readonly phase: string;
	readonly pendingApproval: unknown;
	readonly chatQueue?: readonly unknown[];
	readonly draft: string;
	readonly reasoningDraft: string;
	readonly reasoningSummaryDraft?: string;
	readonly liveActivity?: {
		readonly method: string;
		readonly kind: "tool" | "progress" | "file-change" | "approval";
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
export function workbenchActivityIndicator(source: WorkbenchActivityIndicatorSource): WorkbenchActivityIndicator | null {
	const outboundPending = [...source.chat].reverse().find((message) => message.role === "user")?.status === "streaming";
	if (source.phase !== "working" && !outboundPending) return null;
	const queueDepth = source.chatQueue?.length ?? 0;
	const reasoningSummary = boundedActivityText(source.reasoningSummaryDraft);
	const currentStep = source.workFlow.currentStepNumber === null
		? undefined
		: source.workFlow.steps.find((step) => step.number === source.workFlow.currentStepNumber);
	const currentStepTitle = boundedActivityText(currentStep?.title);
	const liveActivity = liveActivityLabel(source.liveActivity);
	const stepLabel = currentStep && currentStepTitle
		? `단계 ${source.workFlow.currentStepNumber}/${source.workFlow.steps.length} · ${currentStepTitle}`
		: null;
	let label: string;
	if (source.pendingApproval) {
		label = queueDepth > 0
			? `승인 대기 · 현재 턴 일시중지 · 대기 메시지 ${queueDepth}개는 승인 후 전송`
			: "승인 대기 · 현재 턴 일시중지";
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
		hint: "Esc 중단",
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

/** Native workbench shell. */
export function runProjectWorkbenchShell(dependencies: ProjectWorkbenchShellDependencies): void {
	const { workbench, usage, composerDraft, releaseSessionLease } = dependencies;
	const cwd = dependencies.cwd ?? process.cwd();
	const tui = new TuiAltScreen(new ProcessTerminal(), true);
	let snapshot = workbench.snapshot;
	const status = new StatusLine(WORKBENCH_STATUS_NOTICE);
	const chat = new WorkbenchChatView(snapshot);
	const usageStrip = new UsageStripView(() => ({ models: snapshot.sessionUsage?.models ?? [], activeModel: snapshot.activeModel }));
	const tnotes = new TNotesSourceView(() => snapshot);
	const todo = new WorkspaceTodoView(() => snapshot.todo);
	const monitor = new WorkbenchMonitorView(() => snapshot);
	const telemetry = new WorkbenchTelemetryLine(() => snapshot, cwd, () => tui.requestRender());
	const bottomHud = new WorkbenchBottomHudView(usageStrip);
	const dashboard = createDashboardLayout(
		() => `Dashboard · ${workbenchFrameTitle(snapshot)}`,
		{ color: colors.accent, component: chat },
		{ color: colors.secondary, component: tnotes },
		{ color: colors.warm, component: todo },
	);
	const monitorLayout = createDashboardLayout(
		() => `Monitor · ${workbenchFrameTitle(snapshot)}`,
		{ color: colors.accent, component: chat },
		{ color: colors.secondary, component: monitor },
		{ color: colors.warm, component: todo },
	);
	let viewMode: WorkbenchViewMode = "dashboard";
	const activeView = createWorkbenchViewHost(
		() => viewMode,
		dashboard.component,
		monitorLayout.component,
	);
	const editor = new Editor(tui, editorTheme, { paddingX: 1, autocompleteMaxVisible: 5 });
	editor.setAutocompleteProvider(new CombinedAutocompleteProvider(WORKBENCH_SLASH_COMMANDS, process.cwd()));
	if (composerDraft?.initialText) editor.setText(composerDraft.initialText);
	const root = new VStack([
		{ component: activeView, basis: 0, grow: 1, shrink: 1, minSize: 1 },
		{ component: editor, basis: "auto", shrink: 1, minSize: 3 },
		{ component: status, basis: 1, minSize: 1, maxSize: 1, visible: ({ height }) => height >= 5 && status.hasNotice },
		{ component: telemetry, basis: 1, minSize: 1, maxSize: 1, visible: ({ height }) => height >= 7 },
		{ component: bottomHud, basis: 4, minSize: 4, maxSize: 4, visible: ({ height }) => height >= 10 },
	]);
	let shuttingDown = false;
	let overlay: OverlayHandle | null = null;
	let overlayKind: "model" | "approval" | null = null;
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
	const shutdown = async () => {
		if (shuttingDown) return;
		shuttingDown = true;
		overlay?.hide();
		overlay = null;
		status.setNotice("Workbench를 안전하게 종료하는 중…");
		tui.requestRender();
		unsubscribe();
		stopUsagePolling();
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
	// A pending approval pauses the turn, so it takes the surface as soon as it arrives.  The
	// model picker keeps it if already open; the chat-pane card and /approve still resolve it.
	const openApproval = (request: NonNullable<WorkbenchSnapshot["pendingApproval"]>): void => {
		if (overlay) return;
		const approvalIdentity = workbenchApprovalIdentity(request);
		const panel = new ApprovalOverlay(
			request,
			() => tui.requestRender(),
			(decision) => {
				if (!snapshot.pendingApproval
					|| snapshot.pendingApproval.requestId !== request.requestId
					|| workbenchApprovalIdentity(snapshot.pendingApproval) !== approvalIdentity) {
					closeOverlay();
					showReceipt({ state: "rejected", commandId: "approval-stale", reason: "승인 후보가 변경되어 결정을 거부했습니다. 최신 후보를 확인하세요." });
					return;
				}
				void workbench.dispatch({ type: "approval.resolve", requestId: request.requestId, response: { decision } })
					.then((receipt) => {
						closeOverlay();
						showReceipt(receipt);
					});
			},
			closeOverlay,
		);
		overlay = tui.showOverlay(new OverlaySheet(panel), {
			width: "70%", minWidth: 46, maxHeight: "70%", anchor: "bottom-center", margin: 2,
		});
		overlayKind = "approval";
	};
	const handleLocal = async (text: string): Promise<boolean> => {
		const requestedViewMode = workbenchViewModeCommand(text);
		if (requestedViewMode) {
			viewMode = requestedViewMode;
			status.setNotice(requestedViewMode === "dashboard"
				? "Dashboard · 프로젝트 요약과 작업 진입"
				: "Monitor · session·turn·tool 실행 관측");
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
			const pane = command.pane === "chat" ? "왼쪽 Chat"
				: command.pane === "tnotes" ? "오른쪽 위 Trace·Source" : "오른쪽 아래 Todo.md";
			status.setNotice(`${pane} pane은 현재 화면에 계속 표시됩니다.`);
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
			showReceipt(await workbench.dispatch({ type: "activity.select", activityId }));
			return true;
		}
		if (command.type === "trace.select") {
			const activityId = [...snapshot.activities].reverse().find((activity) =>
				activity.nativeRefs.itemId === command.planItemId,
			)?.id ?? null;
			if (!activityId) {
				status.setNotice(`Todo planItemId를 찾을 수 없습니다: ${command.planItemId}`);
				tui.requestRender();
				return true;
			}
			showReceipt(await workbench.dispatch({ type: "activity.select", activityId }));
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
		if (snapshot.pendingApproval) openApproval(snapshot.pendingApproval);
		else if (overlayKind === "approval") closeOverlay();
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
		if (overlay) {
			if (matchesKey(data, Key.ctrl("c")) || matchesKey(data, Key.ctrl("d"))) {
				const closing = overlayKind;
				closeOverlay();
				status.setNotice(closing === "approval"
					? "승인 창을 닫았습니다. /approve 로 다시 결정할 수 있습니다."
					: "모델 변경을 취소했습니다.");
				tui.requestRender();
				return { consume: true };
			}
			return undefined;
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
