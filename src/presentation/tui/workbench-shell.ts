import {
	CombinedAutocompleteProvider,
	Editor,
	Key,
	ProcessTerminal,
	TuiAltScreen,
	VStack,
	isViewportTUI,
	matchesKey,
} from "@earendil-works/pi-tui";
import type { ComposerDraftController } from "../../application/ports";
import type { ProjectWorkbench } from "../../application/project-workbench";
import type { WorkbenchCommandReceipt } from "../../domain/workbench";
import { createDashboardLayout } from "./dashboard-layout";
import {
	StatusLine,
	WorkspaceTodoView,
} from "./shared-dashboard-views";
import { TNotesSourceView, WorkbenchChatView } from "./workbench-views";
import { ExitKeyPolicy } from "./exit-key-policy";
import { RenderScheduler, workbenchRenderUrgency } from "./render-scheduler";
import { settleWithin } from "./shell-lifecycle";
import { parseWorkbenchShellCommand, WORKBENCH_SLASH_COMMANDS } from "./slash-commands";
import { colors, editorTheme } from "./theme";

export interface ProjectWorkbenchShellDependencies {
	workbench: ProjectWorkbench;
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

export const WORKBENCH_STATUS_NOTICE = "/source · /tnote range · /todo · /promote · /review · /approve · /approve-session · /decline · /cancel · /exit · Esc 중단 · Ctrl+C 두 번 종료 · Ctrl+D(빈 입력) 종료";

/** Native workbench shell. */
export function runProjectWorkbenchShell(dependencies: ProjectWorkbenchShellDependencies): void {
	const { workbench, composerDraft, releaseSessionLease } = dependencies;
	const tui = new TuiAltScreen(new ProcessTerminal(), true);
	let snapshot = workbench.snapshot;
	const status = new StatusLine(WORKBENCH_STATUS_NOTICE);
	const chat = new WorkbenchChatView(snapshot);
	const tnotes = new TNotesSourceView(() => snapshot);
	const todo = new WorkspaceTodoView(() => snapshot.todo);
	const dashboard = createDashboardLayout(
		() => `🐙 WWW · ${snapshot.projectId} · ${snapshot.phase}${snapshot.chatQueue.length > 0 ? ` · 대기 ${snapshot.chatQueue.length}` : ""}${snapshot.pendingApproval ? " · 승인 대기" : ""}`,
		{ color: colors.accent, component: chat },
		{ title: "T-notes · Source", color: colors.secondary, component: tnotes },
		{ title: "Todo.md · 현재 작업", color: colors.warm, component: todo },
	);
	const editor = new Editor(tui, editorTheme, { paddingX: 1, autocompleteMaxVisible: 5 });
	editor.setAutocompleteProvider(new CombinedAutocompleteProvider(WORKBENCH_SLASH_COMMANDS, process.cwd()));
	if (composerDraft?.initialText) editor.setText(composerDraft.initialText);
	const root = new VStack([
		{ component: dashboard.component, basis: 0, grow: 1, shrink: 1, minSize: 1 },
		{ component: editor, basis: "auto", shrink: 1, minSize: 3 },
		{ component: status, basis: 1, minSize: 1, maxSize: 1, visible: ({ height }) => height >= 5 },
	]);
	let shuttingDown = false;
	const exitKeys = new ExitKeyPolicy();
	let unsubscribe: () => void = () => undefined;
	const workbenchRenders = new RenderScheduler(() => {
		chat.update(snapshot);
		tui.requestRender();
	});
	const shutdown = async () => {
		if (shuttingDown) return;
		shuttingDown = true;
		status.setNotice("Workbench를 안전하게 종료하는 중…");
		tui.requestRender();
		unsubscribe();
		workbenchRenders.dispose();
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
	const handleLocal = async (text: string): Promise<boolean> => {
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
				: command.pane === "tnotes" ? "오른쪽 위 T-notes·Source" : "오른쪽 아래 Todo.md";
			status.setNotice(`${pane} pane은 현재 화면에 계속 표시됩니다.`);
			tui.requestRender();
			return true;
		}
		if (command.type === "activity.select") {
			const activityId = command.activityId === "latest" ? snapshot.activities.at(-1)?.id ?? null : command.activityId;
			showReceipt(await workbench.dispatch({ type: "activity.select", activityId }));
			return true;
		}
		if (command.type === "tnote.capture") {
			if (!snapshot.selectedActivityId) {
				status.setNotice("먼저 /source <activity-id|latest>로 source를 선택하세요.");
				tui.requestRender();
				return true;
			}
			showReceipt(await workbench.dispatch({ type: "tnote.capture", activityIds: [snapshot.selectedActivityId] }));
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
		if (command.type === "todo.create") {
			showReceipt(await workbench.dispatch({ type: "todo.create", title: command.title, items: command.items }));
			return true;
		}
		if (command.type === "todo.add") {
			showReceipt(await workbench.dispatch({ type: "todo.add", placement: command.placement, content: command.content }));
			return true;
		}
		if (command.type === "todo.details") {
			showReceipt(await workbench.dispatch({ type: "todo.details", itemId: command.itemId, details: command.details }));
			return true;
		}
		if (command.type === "todo.transition") {
			showReceipt(await workbench.dispatch({ type: "todo.transition", action: command.action, itemId: command.itemId }));
			return true;
		}
		if (command.type === "todo.evidence") {
			const activityId = command.activityId === "latest" ? snapshot.activities.at(-1)?.id : command.activityId;
			if (!activityId) {
				status.setNotice("기록할 activity가 없습니다.");
				tui.requestRender();
				return true;
			}
			showReceipt(await workbench.dispatch({ type: "todo.evidence", activityId }));
			return true;
		}
		if (command.type === "todo.import-legacy") {
			showReceipt(await workbench.dispatch({ type: "todo.import-legacy" }));
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
		snapshot = next;
		workbenchRenders.request(urgency);
	});
	tui.addInputListener((data) => {
		if (shuttingDown) return { consume: true };
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
	tui.start();
}
