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
	RecentSessionSummary,
	RouterSettingsController,
	UsageMonitor,
} from "../../application/ports";
import type { SessionRuntime } from "../../application/session-runtime";
import { MODELS, type WwwSettings } from "../../domain/model-settings";
import { AuthFlowOverlay } from "./auth-overlay";
import { createDashboardLayout } from "./dashboard-layout";
import {
	RouterModelView,
	SessionFlowView,
	StatusLine,
	TranscriptView,
	UsageStripView,
} from "./dashboard-views";
import { LoginProviderOverlay, ModelSettingsOverlay } from "./router-overlays";
import { RenderScheduler } from "./render-scheduler";
import { parseShellCommand, SLASH_COMMANDS } from "./slash-commands";
import { colors, editorTheme } from "./theme";

export interface TuiShellDependencies {
	runtime: SessionRuntime;
	auth: AuthController;
	usage: UsageMonitor;
	recentSessions: readonly RecentSessionSummary[];
	routerSettings: RouterSettingsController;
}

export function runTuiShell(dependencies: TuiShellDependencies): void {
	const { runtime, auth, usage, recentSessions, routerSettings } = dependencies;
	const tui = new TuiAltScreen(new ProcessTerminal(), true);
	let snapshot = runtime.snapshot;
	const status = new StatusLine();
	const usageStrip = new UsageStripView();
	const routerModel = new RouterModelView(() => snapshot);
	const sessionFlow = new SessionFlowView(recentSessions);
	const transcript = new TranscriptView(snapshot);
	const dashboard = createDashboardLayout(
		() => `🐙 WWW · ${snapshot.settings.provider}/${snapshot.settings.model} · ${
			snapshot.phase === "streaming" ? "응답 중" : snapshot.auth?.configured ? "준비됨" : "인증 필요"
		}`,
		{ title: "대화 · 작업", color: colors.accent, component: transcript },
		{ title: "Router · 모델", color: colors.secondary, component: routerModel },
		{ title: "세션 · 흐름", color: colors.warm, component: sessionFlow },
	);
	const editor = new Editor(tui, editorTheme, { paddingX: 1, autocompleteMaxVisible: 5 });
	editor.setAutocompleteProvider(new CombinedAutocompleteProvider(SLASH_COMMANDS, process.cwd()));
	const root = new VStack([
		{ component: dashboard.component, basis: 0, grow: 1, shrink: 1, minSize: 1 },
		{ component: usageStrip, basis: 2, minSize: 2, maxSize: 2 },
		{ component: editor, basis: "auto", shrink: 1, minSize: 3 },
		{ component: status, basis: 1, minSize: 1, maxSize: 1, visible: ({ height }) => height >= 6 },
	]);

	let overlay: OverlayHandle | null = null;
	let shuttingDown = false;
	let unsubscribeRuntime = () => {};
	const transcriptRenders = new RenderScheduler(() => {
		transcript.update(snapshot);
		tui.requestRender();
	});
	const stopUsagePolling = usage.startPolling((snapshots) => {
		usageStrip.update(snapshots);
		tui.requestRender();
	});
	const closeOverlay = () => {
		overlay?.hide();
		overlay = null;
		tui.setFocus(editor);
	};
	const persistSettings = (next: WwwSettings) => {
		void routerSettings.update(next).then(
			() => status.setNotice("모델 설정을 저장했습니다."),
			(error) => status.setNotice(`설정 저장 실패: ${error instanceof Error ? error.message : String(error)}`),
		).finally(() => tui.requestRender());
	};
	const openModelSettings = () => {
		if (overlay) return;
		const authLabel = snapshot.auth?.configured ? snapshot.auth.source ?? "설정됨" : "필요";
		const panel = new ModelSettingsOverlay(snapshot.settings, authLabel, persistSettings, closeOverlay);
		overlay = tui.showOverlay(panel, { width: "70%", minWidth: 42, anchor: "center", margin: 2 });
	};
	const openAuthFlow = (provider: WwwSettings["provider"]) => {
		closeOverlay();
		const panel = new AuthFlowOverlay(
			provider,
			auth.methods(provider),
			auth,
			() => tui.requestRender(),
			(authStatus) => {
				const activate = authStatus.state === "configured" && authStatus.provider !== snapshot.settings.provider
					? routerSettings.update({
						...snapshot.settings,
						provider: authStatus.provider,
						model: (MODELS[authStatus.provider] as readonly string[]).includes(snapshot.settings.model)
							? snapshot.settings.model
							: MODELS[authStatus.provider][0],
					})
					: runtime.refreshAuth().then(() => undefined);
				void activate.then(() => usage.refresh()).then((snapshots) => {
					usageStrip.update(snapshots);
					tui.requestRender();
				}).catch((error) => {
					status.setNotice(error instanceof Error ? error.message : String(error));
					tui.requestRender();
				});
			},
			closeOverlay,
		);
		overlay = tui.showOverlay(panel, { width: "70%", minWidth: 46, maxHeight: "80%", anchor: "center", margin: 2 });
		panel.start();
	};
	const openAuthentication = () => {
		if (overlay) return;
		const selector = new LoginProviderOverlay(openAuthFlow, closeOverlay);
		overlay = tui.showOverlay(selector, { width: "70%", minWidth: 46, maxHeight: "80%", anchor: "center", margin: 2 });
	};
	const handleShellCommand = async (text: string): Promise<void> => {
		const command = parseShellCommand(text, snapshot.settings);
		if (!command) return;
		if (command.type === "model.select") return openModelSettings();
		if (command.type === "model.set") {
			await routerSettings.update(command.settings);
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
			await routerSettings.update({ ...snapshot.settings, effort: command.effort });
			status.setNotice(`추론 강도 변경: ${command.effort}`);
		}
		if (command.type === "usage.refresh") {
			usageStrip.update(await usage.refresh());
			status.setNotice("Codex·Claude 사용량을 갱신했습니다.");
		}
		if (command.type === "help") {
			status.setNotice("/model · /effort · /login · /logout · /usage · /status · /exit");
		}
		if (command.type === "status") {
			status.setNotice(
				`${snapshot.settings.provider}/${snapshot.settings.model} · 추론 ${snapshot.settings.effort} · ${
					snapshot.auth?.configured ? `인증 ${snapshot.auth.source ?? "설정됨"}` : "인증 필요"
				} · 세션 ${snapshot.id.slice(0, 8)}`,
			);
		}
		if (command.type === "exit") return shutdown();
		if (command.type === "error") status.setNotice(command.message);
		tui.requestRender();
	};
	const shutdown = async () => {
		if (shuttingDown) return;
		shuttingDown = true;
		status.setNotice("세션을 안전하게 종료하는 중…");
		tui.requestRender();
		stopUsagePolling();
		unsubscribeRuntime();
		transcriptRenders.dispose();
		await routerSettings.flush();
		await runtime.close();
		tui.stop();
	};

	editor.onSubmit = (text) => {
		if (!text.trim()) return;
		editor.addToHistory(text);
		if (text.trim().startsWith("/")) {
			void handleShellCommand(text).catch((error) => {
				status.setNotice(error instanceof Error ? error.message : String(error));
				tui.requestRender();
			});
			return;
		}
		editor.disableSubmit = true;
		void runtime.submit(text)
			.catch((error) => status.setNotice(error instanceof Error ? error.message : String(error)))
			.finally(() => {
				editor.disableSubmit = false;
				tui.requestRender();
			});
	};

	unsubscribeRuntime = runtime.subscribe((next) => {
		const previousPhase = snapshot.phase;
		snapshot = next;
		editor.disableSubmit = next.phase === "streaming";
		if (next.phase !== previousPhase) {
			if (next.phase === "streaming") status.setNotice("모델이 응답 중입니다. 다음 입력은 작성할 수 있고 Esc로 중단합니다.");
			if (next.phase === "error") status.setNotice("응답에 실패했습니다. 오류를 확인한 뒤 다시 전송하세요.");
			if (next.phase === "ready") status.setNotice("/ 명령 · /model 모델 · /login 계정 · /usage 사용량 · Ctrl+C 종료");
		}
		transcriptRenders.request(next.phase === "streaming" ? "streaming" : "immediate");
	});

	tui.addInputListener((data) => {
		if (overlay) return undefined;
		if (matchesKey(data, Key.ctrl("o"))) {
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
			if (editor.getText()) {
				editor.setText("");
				status.setNotice("작성 중인 입력을 지웠습니다.");
				tui.requestRender();
				return { consume: true };
			}
			if (snapshot.phase === "streaming") {
				runtime.abort();
				status.setNotice("현재 응답을 중단하는 중…");
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
