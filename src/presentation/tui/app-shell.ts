import {
	CombinedAutocompleteProvider,
	Editor,
	Key,
	ProcessTerminal,
	TuiAltScreen,
	VStack,
	isViewportTUI,
	matchesKey,
	type OverlayHandle,
} from "@earendil-works/pi-tui";
import type {
	AuthController,
	ComposerDraftController,
	RecentSessionSummary,
	RepositoryInsights,
	RouterSettingsController,
	TodoController,
	UsageMonitor,
} from "../../application/ports";
import type { SessionRuntime } from "../../application/session-runtime";
import { MODELS, type WwwSettings } from "../../domain/model-settings";
import { todoProgress } from "../../domain/todos";
import { AuthFlowOverlay } from "./auth-overlay";
import { createDashboardLayout } from "./dashboard-layout";
import {
	RouterModelView,
	StatusLine,
	TranscriptView,
	UsageStripView,
	WorkspaceTodoView,
} from "./dashboard-views";
import { OverlaySheet } from "./overlay-sheet";
import { IssueListOverlay, RepositoryActivityOverlay } from "./repository-overlays";
import { LoginProviderOverlay } from "./router-overlays";
import { ModelPickerOverlay } from "./model-picker-overlay";
import { RenderScheduler } from "./render-scheduler";
import { parseShellCommand, shellCommandConcurrency, SLASH_COMMANDS } from "./slash-commands";
import { colors, editorTheme } from "./theme";
import { ExitKeyPolicy } from "./exit-key-policy";

async function settleWithin(operation: Promise<unknown>, timeoutMs: number): Promise<boolean> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<false>((resolve) => {
		timer = setTimeout(() => resolve(false), timeoutMs);
	});
	const completed = operation.then(() => true as const, () => true as const);
	const result = await Promise.race([completed, timeout]);
	if (timer) clearTimeout(timer);
	return result;
}

export interface TuiShellDependencies {
	runtime: SessionRuntime;
	auth: AuthController;
	usage: UsageMonitor;
	recentSessions: readonly RecentSessionSummary[];
	routerSettings: RouterSettingsController;
	repository: RepositoryInsights;
	composerDraft: ComposerDraftController;
	releaseSessionLease: () => Promise<void>;
	todos: TodoController;
}

export function runTuiShell(dependencies: TuiShellDependencies): void {
	const { runtime, auth, usage, recentSessions, routerSettings, repository, composerDraft, releaseSessionLease, todos } = dependencies;
	const tui = new TuiAltScreen(new ProcessTerminal(), true);
	let snapshot = runtime.snapshot;
	let todoSnapshot = todos.snapshot;
	const status = new StatusLine();
	const usageStrip = new UsageStripView();
	const routerModel = new RouterModelView(() => snapshot);
	const workspaceTodo = new WorkspaceTodoView(recentSessions, () => ({
		name: snapshot.projectName,
		cwd: snapshot.cwd,
		root: snapshot.projectRoot,
	}), () => todoSnapshot);
	const transcript = new TranscriptView(snapshot);
	const dashboard = createDashboardLayout(
		() => `🐙 WWW · ${snapshot.settings.provider}/${snapshot.settings.model} · ${
			snapshot.phase === "streaming" ? "응답 중" : snapshot.auth?.configured ? "준비됨" : "인증 필요"
		}${todoSnapshot ? ` · TODO ${todoProgress(todoSnapshot).completed}/${todoSnapshot.items.length}` : ""}`,
		{ title: "대화 · 작업", color: colors.accent, component: transcript },
		{ title: "Router · 모델", color: colors.secondary, component: routerModel },
		{ title: "프로젝트 · TODO", color: colors.warm, component: workspaceTodo },
	);
	const editor = new Editor(tui, editorTheme, { paddingX: 1, autocompleteMaxVisible: 5 });
	editor.setAutocompleteProvider(new CombinedAutocompleteProvider(SLASH_COMMANDS, process.cwd()));
	if (composerDraft.initialText) editor.setText(composerDraft.initialText);
	const root = new VStack([
		{ component: dashboard.component, basis: 0, grow: 1, shrink: 1, minSize: 1 },
		{ component: usageStrip, basis: 2, minSize: 2, maxSize: 2 },
		{ component: editor, basis: "auto", shrink: 1, minSize: 3 },
		{ component: status, basis: 1, minSize: 1, maxSize: 1, visible: ({ height }) => height >= 6 },
	]);

	let overlay: OverlayHandle | null = null;
	let shuttingDown = false;
	let pendingModelSettings: WwwSettings | null = null;
	let clearedExitDraft: string | null = null;
	let clearedExitDraftTimer: ReturnType<typeof setTimeout> | undefined;
	let overlayHandlesInterrupt = false;
	let overlayMutationLocked = false;
	let settingsMutationInFlight = false;
	const exitKeys = new ExitKeyPolicy();
	let unsubscribeRuntime = () => {};
	const unsubscribeTodo = todos.subscribe((next) => {
		todoSnapshot = next;
		tui.requestRender();
	});
	let activityTimer: ReturnType<typeof setInterval> | undefined;
	const transcriptRenders = new RenderScheduler(() => {
		transcript.update(snapshot);
		tui.requestRender();
	});
	const stopUsagePolling = usage.startPolling((snapshots) => {
		usageStrip.update(snapshots);
		tui.requestRender();
	});
	const closeOverlay = (expected: OverlayHandle | null = overlay): boolean => {
		if (!overlay || overlay !== expected) return false;
		overlay.hide();
		overlay = null;
		overlayHandlesInterrupt = false;
		overlayMutationLocked = false;
		tui.setFocus(editor);
		return true;
	};
	const updateRouterSettings = async (next: WwwSettings): Promise<void> => {
		if (snapshot.phase === "streaming") throw new Error("응답 중에는 모델 설정을 적용할 수 없습니다.");
		if (settingsMutationInFlight) throw new Error("다른 모델 설정을 적용하는 중입니다.");
		settingsMutationInFlight = true;
		try {
			await routerSettings.update(next);
		} finally {
			settingsMutationInFlight = false;
		}
	};
	let openAuthFlow!: (provider: WwwSettings["provider"], pending?: WwwSettings) => void;
	const openModelSettings = (
		initial: WwwSettings = pendingModelSettings ?? snapshot.settings,
		resumeAtConfirmation = false,
	) => {
		if (overlay) return;
		pendingModelSettings = null;
		const panel = new ModelPickerOverlay(
			snapshot.settings,
			provider => auth.status(provider),
			() => tui.requestRender(),
			async next => {
				overlayMutationLocked = true;
				try {
					await updateRouterSettings(next);
				} catch {
					throw new Error("모델 설정을 적용하지 못했습니다. 기존 설정을 유지했습니다.");
				} finally {
					overlayMutationLocked = false;
				}
				status.setNotice(`모델 변경: ${next.provider}/${next.model} · 추론 ${next.effort}`);
			},
			next => {
				if (snapshot.phase === "streaming") {
					status.setNotice("응답 중에는 로그인을 시작할 수 없습니다. 선택 내용은 모델 화면에 유지됩니다.");
					tui.requestRender();
					return;
				}
				openAuthFlow(next.provider, next);
			},
			closeOverlay,
			initial,
			resumeAtConfirmation,
		);
		overlay = tui.showOverlay(new OverlaySheet(panel), {
			width: "72%", minWidth: 54, maxHeight: "100%", anchor: "bottom-center", margin: 1,
		});
		overlayHandlesInterrupt = false;
		panel.start();
	};
	openAuthFlow = (provider, pending) => {
		const staged = pending ?? null;
		pendingModelSettings = staged;
		closeOverlay();
		let owner: OverlayHandle | null = null;
		const closeAuthOverlay = () => closeOverlay(owner);
		const panel = new AuthFlowOverlay(
			provider,
			auth.methods(provider),
			auth,
			() => tui.requestRender(),
			async (authStatus) => {
				if (!owner || overlay !== owner) return;
				if (staged && snapshot.phase === "streaming") {
					pendingModelSettings = null;
					closeAuthOverlay();
					openModelSettings(staged, true);
					status.setNotice("로그인은 완료됐습니다. 현재 응답이 끝난 뒤 선택한 모델을 적용하세요.");
					tui.requestRender();
					return;
				}
				overlayMutationLocked = true;
				try {
					if (authStatus.state !== "configured") throw new Error("인증이 완료되지 않았습니다.");
					if (staged) await updateRouterSettings(staged);
					else if (authStatus.provider !== snapshot.settings.provider) {
						await updateRouterSettings({
							...snapshot.settings,
							provider: authStatus.provider,
							model: (MODELS[authStatus.provider] as readonly string[]).includes(snapshot.settings.model)
								? snapshot.settings.model
								: MODELS[authStatus.provider][0],
						});
					} else await runtime.refreshAuth();
				} catch {
					overlayMutationLocked = false;
					closeAuthOverlay();
					status.setNotice("로그인 후 모델 설정을 적용하지 못했습니다. 선택 내용을 복원했습니다.");
					if (staged) openModelSettings(staged, true);
					tui.requestRender();
					return;
				}
				overlayMutationLocked = false;
				pendingModelSettings = null;
				closeAuthOverlay();
				status.setNotice(staged
					? `로그인 후 모델 적용: ${staged.provider}/${staged.model}`
					: `${provider} 로그인이 완료되었습니다.`);
				tui.requestRender();
				try {
					usageStrip.update(await usage.refresh());
				} catch {
					status.setNotice("로그인은 완료됐지만 사용량은 다음 주기에 갱신됩니다.");
				}
				tui.requestRender();
			},
			() => {
				if (!owner || overlay !== owner) return;
				pendingModelSettings = null;
				closeAuthOverlay();
				if (staged) openModelSettings(staged, true);
			},
		);
		owner = tui.showOverlay(new OverlaySheet(panel), {
			width: "60%", minWidth: 46, maxHeight: "70%", anchor: "bottom-center", margin: 2,
		});
		overlay = owner;
		overlayHandlesInterrupt = true;
		panel.start();
	};
	const openAuthentication = () => {
		if (overlay) return;
		const selector = new LoginProviderOverlay(openAuthFlow, closeOverlay);
		overlay = tui.showOverlay(new OverlaySheet(selector), {
			width: "60%", minWidth: 46, maxHeight: "55%", anchor: "bottom-center", margin: 2,
		});
	};
	const openCommits = () => {
		if (overlay) return;
		const panel = new RepositoryActivityOverlay(repository, () => tui.requestRender(), closeOverlay);
		overlay = tui.showOverlay(new OverlaySheet(panel), {
			width: "72%", minWidth: 54, maxHeight: "75%", anchor: "bottom-center", margin: 2,
		});
		panel.start();
	};
	const openIssues = () => {
		if (overlay) return;
		const panel = new IssueListOverlay(repository, () => tui.requestRender(), closeOverlay);
		overlay = tui.showOverlay(new OverlaySheet(panel), {
			width: "72%", minWidth: 54, maxHeight: "75%", anchor: "bottom-center", margin: 2,
		});
		panel.start();
	};
	const handleShellCommand = async (text: string): Promise<void> => {
		const command = parseShellCommand(text, snapshot.settings);
		if (!command) return;
		const concurrency = shellCommandConcurrency(command);
		if (snapshot.phase === "streaming" && concurrency === "mutation" && command.type !== "model.select") {
			status.setNotice("응답 중에는 설정을 변경할 수 없습니다. 조회 명령과 /exit는 계속 사용할 수 있습니다.");
			tui.requestRender();
			return;
		}
		if (command.type === "model.select") return openModelSettings();
		if (command.type === "model.set") {
			const authState = await auth.status(command.settings.provider);
			if (snapshot.phase === "streaming") {
				status.setNotice("응답이 시작되어 모델 변경을 취소했습니다.");
				tui.requestRender();
				return;
			}
			if (authState.state === "required") return openAuthFlow(command.settings.provider, command.settings);
			if (authState.state === "failed") {
				status.setNotice("인증 상태를 확인하지 못해 모델을 변경하지 않았습니다.");
				tui.requestRender();
				return;
			}
			try {
				await updateRouterSettings(command.settings);
			} catch {
				status.setNotice("모델 설정을 적용하지 못했습니다. 기존 설정을 유지했습니다.");
				tui.requestRender();
				return;
			}
			status.setNotice(`모델 변경: ${command.settings.provider}/${command.settings.model} · 추론 ${command.settings.effort}`);
		}
		if (command.type === "auth.select") return openAuthentication();
		if (command.type === "auth.login") return openAuthFlow(command.provider);
		if (command.type === "auth.logout") {
			await auth.logout(command.provider);
			if (command.provider === snapshot.settings.provider) await runtime.refreshAuth();
			usageStrip.update(await usage.refresh());
			status.setNotice(`${command.provider} 인증을 삭제했습니다.`);
		}
		if (command.type === "effort.set") {
			await updateRouterSettings({ ...snapshot.settings, effort: command.effort });
			status.setNotice(`추론 강도 변경: ${command.effort}`);
		}
		if (command.type === "usage.refresh") {
			if (snapshot.phase === "streaming") {
				status.setNotice("응답 중에는 현재 표시된 사용량 캐시를 유지합니다.");
			} else {
				usageStrip.update(await usage.refresh());
				status.setNotice("Codex·Claude 사용량을 갱신했습니다.");
			}
		}
		if (command.type === "help") {
			status.setNotice("/model · /login · /usage · /commits · /issues · /status · /exit");
		}
		if (command.type === "status") {
			status.setNotice(
				`${snapshot.settings.provider}/${snapshot.settings.model} · 추론 ${snapshot.settings.effort} · ${
					snapshot.auth?.configured ? `인증 ${snapshot.auth.source ?? "설정됨"}` : "인증 필요"
				} · 세션 ${snapshot.id.slice(0, 8)} · 경로 ${snapshot.cwd}`,
			);
		}
		if (command.type === "repository.commits") return openCommits();
		if (command.type === "repository.issues") return openIssues();
		if (command.type === "exit") return shutdown();
		if (command.type === "error") status.setNotice(command.message);
		tui.requestRender();
	};
	const shutdown = async () => {
		if (shuttingDown) return;
		shuttingDown = true;
		status.setNotice("세션을 안전하게 종료하는 중…");
		tui.requestRender();
		const draft = editor.getExpandedText() || clearedExitDraft || "";
		if (clearedExitDraftTimer) clearTimeout(clearedExitDraftTimer);
		stopUsagePolling();
		if (activityTimer) clearInterval(activityTimer);
		unsubscribeRuntime();
		unsubscribeTodo();
		transcriptRenders.dispose();
		await settleWithin((async () => {
			try {
				await composerDraft.save(draft);
			} catch {
				status.setNotice("초안을 저장하지 못했습니다. 터미널 복원을 위해 종료는 계속합니다.");
				tui.requestRender();
			}
			try {
				await routerSettings.flush();
			} catch {
				status.setNotice("모델 설정 flush에 실패했지만 세션 종료는 계속합니다.");
				tui.requestRender();
			}
			try {
				await runtime.close();
			} finally {
				await releaseSessionLease();
			}
		})(), 5_000);
		tui.stop();
	};

	let restoredDraftActive = Boolean(composerDraft.initialText);
	editor.onChange = (text) => {
		if (text) {
			clearedExitDraft = null;
			if (clearedExitDraftTimer) clearTimeout(clearedExitDraftTimer);
		}
		if (!restoredDraftActive) return;
		restoredDraftActive = false;
		status.setNotice("복원된 초안을 편집 중입니다.");
	};
	editor.onSubmit = (text) => {
		if (shuttingDown) return;
		if (!text.trim()) return;
		editor.addToHistory(text);
		if (text.trim().startsWith("/")) {
			void handleShellCommand(text).catch((error) => {
				status.setNotice(error instanceof Error ? error.message : String(error));
				tui.requestRender();
			});
			return;
		}
		if (snapshot.phase === "streaming") {
			editor.setText(text);
			status.setNotice("현재 응답이 끝난 뒤 메시지를 전송하세요. 조회 명령은 계속 사용할 수 있습니다.");
			tui.requestRender();
			return;
		}
		if (settingsMutationInFlight) {
			editor.setText(text);
			status.setNotice("모델 설정 적용이 끝난 뒤 메시지를 전송하세요.");
			tui.requestRender();
			return;
		}
		void runtime.submit(text)
			.then(() => composerDraft.clear().catch(() => undefined))
			.catch((error) => {
				const enteredTranscript = runtime.snapshot.turns.some(turn => turn.role === "user" && turn.content === text);
				if (enteredTranscript) void composerDraft.clear().catch(() => undefined);
				else editor.setText(text);
				status.setNotice(error instanceof Error ? error.message : String(error));
			})
			.finally(() => tui.requestRender());
	};

	unsubscribeRuntime = runtime.subscribe((next) => {
		const previousPhase = snapshot.phase;
		snapshot = next;
		if (next.phase === "streaming" && !activityTimer) {
			activityTimer = setInterval(() => tui.requestRender(), 80);
		}
		if (next.phase !== "streaming" && activityTimer) {
			clearInterval(activityTimer);
			activityTimer = undefined;
		}
		if (next.phase !== previousPhase) {
			if (next.phase === "streaming") status.setNotice("모델이 응답 중입니다. 다음 입력은 작성할 수 있고 Esc로 중단합니다.");
			if (next.phase === "error") status.setNotice("응답에 실패했습니다. 오류를 확인한 뒤 다시 전송하세요.");
			if (next.phase === "ready") status.setNotice("/ 명령 · /model 모델 · /usage 사용량 · Ctrl+C 두 번 또는 Ctrl+D 종료");
		}
		transcriptRenders.request(next.phase === "streaming" ? "streaming" : "immediate");
	});
	if (composerDraft.initialText) {
		status.setNotice("이 프로젝트의 작성 중 초안을 복원했습니다.");
	}

	tui.addInputListener((data) => {
		if (shuttingDown) return { consume: true };
		if (overlay && matchesKey(data, Key.ctrl("c"))) {
			if (overlayMutationLocked) {
				status.setNotice("설정을 적용하는 중입니다. 완료될 때까지 기다려 주세요.");
				tui.requestRender();
				return { consume: true };
			}
			if (overlayHandlesInterrupt) return undefined;
			exitKeys.reset();
			closeOverlay();
			status.setNotice("열린 화면을 닫고 입력창으로 돌아왔습니다.");
			tui.requestRender();
			return { consume: true };
		}
		if (overlay && matchesKey(data, Key.ctrl("d"))) {
			if (overlayMutationLocked) {
				status.setNotice("설정을 적용하는 중에는 종료할 수 없습니다.");
				tui.requestRender();
				return { consume: true };
			}
			if (overlayHandlesInterrupt) return undefined;
			if (exitKeys.ctrlD(Boolean(editor.getText())) === "ignore") {
				closeOverlay();
				status.setNotice("작성 중인 입력이 있어 종료하지 않았습니다.");
				tui.requestRender();
				return { consume: true };
			}
			void shutdown();
			return { consume: true };
		}
		if (overlay) return undefined;
		if (matchesKey(data, Key.ctrl("o"))) {
			if (snapshot.phase === "streaming") {
				status.setNotice("응답 중에는 로그인을 시작할 수 없습니다.");
				tui.requestRender();
				return { consume: true };
			}
			openAuthentication();
			return { consume: true };
		}
		if (matchesKey(data, Key.ctrl("l"))) {
			openModelSettings();
			return { consume: true };
		}
		if (matchesKey(data, Key.escape) && snapshot.phase === "streaming" && !editor.isShowingAutocomplete()) {
			runtime.abort();
			return { consume: true };
		}
		if (matchesKey(data, Key.ctrl("c"))) {
			const action = exitKeys.ctrlC(snapshot.phase === "streaming");
			if (action === "clear") {
				const hadDraft = Boolean(editor.getText());
				clearedExitDraft = editor.getExpandedText() || null;
				if (clearedExitDraftTimer) clearTimeout(clearedExitDraftTimer);
				clearedExitDraftTimer = setTimeout(() => {
					clearedExitDraft = null;
					clearedExitDraftTimer = undefined;
				}, 500);
				editor.setText("");
				status.setNotice(hadDraft
					? "작성 중인 입력을 지웠습니다. 500ms 안에 Ctrl+C를 다시 누르면 종료합니다."
					: "500ms 안에 Ctrl+C를 다시 누르면 종료합니다.");
				tui.requestRender();
				return { consume: true };
			}
			if (action === "abort") {
				runtime.abort();
				status.setNotice("현재 응답을 중단합니다. 500ms 안에 Ctrl+C를 다시 누르면 종료합니다.");
				tui.requestRender();
				return { consume: true };
			}
			void shutdown();
			return { consume: true };
		}
		if (matchesKey(data, Key.ctrl("d"))) {
			if (exitKeys.ctrlD(Boolean(editor.getText())) === "ignore") {
				status.setNotice("작성 중인 입력이 있습니다. Ctrl+D 종료는 입력이 비었을 때만 동작합니다.");
				tui.requestRender();
				return { consume: true };
			}
			void shutdown();
			return { consume: true };
		}
		return undefined;
	});

	if (!isViewportTUI(tui)) throw new Error("현재 터미널 렌더러가 viewport layout을 지원하지 않습니다.");
	tui.setLayoutRoot(root);
	tui.setFocus(editor);
	tui.start();
}
