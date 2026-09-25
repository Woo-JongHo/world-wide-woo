import { Editor, Key, matchesKey } from "@earendil-works/pi-tui";
import type { TuiAltScreen }       from "@earendil-works/pi-tui";

import type { ProjectWorkbench }                           from "@/core/application/orchestration/project-workbench";
import type { ObservabilityDashboard }                     from "@/core/domain/observability/observability-dashboard";
import type { WorkbenchCommandReceipt, WorkbenchSnapshot } from "@/core/domain/work/workbench";
import { RenderScheduler }                                 from "@/adapters/inbound/tui/foundation/rendering/render-scheduler";
import {
	AstraCommandPalette,
	AstraViewSwitcher,
	ASTRA_KEYS,
	ASTRA_SCROLL_KEYS,
	matchesAstraAction,
	matchesAstraKey,
} from "@/adapters/inbound/tui/shell/astra-surface";
import type { AstraPage, AstraWorkspace }                  from "@/adapters/inbound/tui/shell/astra-surface";
import { ExitKeyPolicy }                                   from "@/adapters/inbound/tui/shell/exit-key-policy";
import { ShellLifecycle }                                  from "@/adapters/inbound/tui/shell/shell-lifecycle";
import {
	WorkbenchNavigationController,
	directObservabilityView,
	rotateObservabilityView,
	shouldHandleObservabilityShortcut,
} from "@/adapters/inbound/tui/shell/workbench-navigation.controller";
import type { ObservabilityViewMode }                      from "@/adapters/inbound/tui/shell/workbench-navigation.controller";
import { WorkbenchOverlayController }                      from "@/adapters/inbound/tui/shell/workbench-overlay-controller";

interface ShellNotice {
	setNotice(notice: string): void;
}
interface ScrollTarget {
	readonly viewportHeight: number;
	scrollBy     (offset: number): void;
	scrollToStart()              : void;
	scrollToEnd  ()              : void;
}
interface Invalidatable {
	invalidate(): void;
}
interface ThreeBodyLab {
	handleInput(data: string): boolean;
}

export interface WorkbenchInputRoutingDependencies {
	readonly tui                        : TuiAltScreen                                                               ;
	readonly editor                     : Editor                                                                     ;
	readonly workbench                  : ProjectWorkbench                                                           ;
	readonly workbenchRenders           : RenderScheduler                                                            ;
	readonly lifecycle                  : ShellLifecycle                                                             ;
	readonly overlays                   : WorkbenchOverlayController                                                 ;
	readonly astra                      : AstraWorkspace | null                                                      ;
	readonly threeBodyLab               : ThreeBodyLab | null                                                        ;
	readonly navigation                 : WorkbenchNavigationController                                              ;
	readonly snapshot                   : () => WorkbenchSnapshot                                                    ;
	readonly handleLocal                : (command: string) => Promise<boolean>                                      ;
	readonly submitComposer             : (text: string) => void                                                     ;
	readonly showAstraPage              : (page: AstraPage, browse?: boolean) => void                                ;
	readonly cycleRuntimeMode           : () => Promise<void>                                                        ;
	readonly enterObservability         : (mode: ObservabilityViewMode) => Promise<void>                             ;
	readonly status                     : ShellNotice                                                                ;
	readonly exitKeys                   : ExitKeyPolicy                                                              ;
	readonly shutdown                   : () => Promise<void>                                                        ;
	readonly showReceipt                : (receipt: WorkbenchCommandReceipt) => void                                 ;
	readonly dashboard                  : () => ObservabilityDashboard                                               ;
	readonly selectedDashboardIndex     : () => number                                                               ;
	readonly setSelectedDashboardIndex  : (index: number) => void                                                    ;
	readonly selectHistoricalSession    : (session: ObservabilityDashboard["recentSessions"][number] | null) => void ;
	readonly resetStatsTarget           : () => void                                                                 ;
	readonly observabilityDashboard     : ScrollTarget                                                               ;
	readonly observabilityDashboardView : Invalidatable                                                              ;
	readonly demo                      : {
		readonly active   : () => boolean ;
		readonly exit     : () => void    ;
		readonly next     : () => void    ;
		readonly previous : () => void    ;
		readonly notice   : () => string  ;
	};
}

/** Routes global keyboard input after overlays and focused components get their own contracts. */
export function installWorkbenchInputRouting(dependencies: WorkbenchInputRoutingDependencies): void {
	const { astra, editor, exitKeys, lifecycle, navigation, overlays, status, tui, workbench } = dependencies;
	tui.addInputListener((data) => {
		dependencies.workbenchRenders.prioritizeInput();
		if (lifecycle.isShuttingDown) return { consume: true };
		const loginPrompt = overlays.activeLoginPrompt;
		if (loginPrompt && (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c")) || matchesKey(data, Key.ctrl("d")))) {
			loginPrompt.handleInput(data);
			status.setNotice("로그인을 취소했습니다.");
			tui.requestRender();
			return { consume: true };
		}
		if (astra && overlays.hasInlineApproval) {
			if (matchesKey(data, Key.ctrl("c")) || matchesKey(data, Key.ctrl("d"))) {
				overlays.dismissInlineApproval();
				status.setNotice("승인 보류. /approval 다시 읽기 /approve 승인 /decline 거절");
				return { consume: true };
			}
			return undefined;
		}
		if (overlays.hasOverlay) {
			if (matchesKey(data, Key.ctrl("c")) || matchesKey(data, Key.ctrl("d"))) {
				const closing = overlays.kind;
				overlays.dismiss();
				status.setNotice(closing === "approval"
					? astra ? "승인 보류. /approval 다시 읽기 /approve 승인 /decline 거절" : "승인 창을 닫았습니다. /approve 로 다시 결정할 수 있습니다."
					: closing === "development" ? "개발 연결 창을 닫았습니다." : closing === "views" ? "화면 이동을 닫았습니다." : closing === "commands" ? "명령 찾기를 닫았습니다." : "모델 변경을 취소했습니다.");
				tui.requestRender();
				return { consume: true };
			}
			return undefined;
		}
		if (astra && !loginPrompt) {
			if (dependencies.demo.active()) {
				if (matchesKey(data, Key.escape)) { dependencies.demo.exit(); return { consume: true }; }
				if (data.toLowerCase() === "e") { dependencies.demo.next(); return { consume: true }; }
				if (data.toLowerCase() === "r") { dependencies.demo.previous(); return { consume: true }; }
				if (routeAstraScroll(data, navigation.currentScroll(), tui)) return { consume: true };
				if (!matchesKey(data, Key.ctrl("c")) && !matchesKey(data, Key.ctrl("d"))) {
					status.setNotice(dependencies.demo.notice());
					tui.requestRender();
					return { consume: true };
				}
			}
			if (astra.page === "lab") {
				if (matchesKey(data, Key.escape)) { dependencies.showAstraPage("execution", false); return { consume: true }; }
				if (dependencies.threeBodyLab?.handleInput(data)) return { consume: true };
			}
			const snapshot = dependencies.snapshot();
			if (matchesKey(data, Key.escape) && astra.page === "execution" && editor.focused && !editor.isShowingAutocomplete()
				&& snapshot.phase === "working" && !snapshot.pendingApproval && !snapshot.deliveryUncertain && editor.getText().trim()) {
				const draft = editor.getText();
				editor.setText("");
				dependencies.submitComposer(draft);
				return { consume: true };
			}
			if (matchesAstraAction(data, "plan.sidebar")) {
				status.setNotice(astra.toggleSidebar() ? "계획 사이드바를 열었습니다. 넓은 실행 화면에서 표시됩니다." : "계획 사이드바를 닫았습니다.");
				tui.requestRender();
				return { consume: true };
			}
			if (matchesAstraAction(data, "views.switcher")) {
				const switcher = new AstraViewSwitcher(command => {
					overlays.dismiss();
					void dependencies.handleLocal(command).catch(error => { status.setNotice(String(error)); tui.requestRender(); });
				}, () => { overlays.dismiss(); tui.requestRender(); }, () => tui.requestRender());
				overlays.openAstraTransient("views", switcher);
				return { consume: true };
			}
			if (matchesAstraAction(data, "command.palette")) {
				const palette = new AstraCommandPalette(command => { overlays.dismiss(); editor.setText(command); tui.requestRender(); }, () => overlays.dismiss(), () => tui.requestRender());
				overlays.openAstraTransient("commands", palette);
				return { consume: true };
			}
			for (const [key, command] of ASTRA_KEYS) {
				if (matchesKey(data, key)) {
					void dependencies.handleLocal(command).catch(error => { status.setNotice(String(error)); tui.requestRender(); });
					return { consume: true };
				}
			}
			if (matchesAstraAction(data, "transcript.expand") && !editor.focused) { astra.transcript.expanded = !astra.transcript.expanded; astra.transcript.invalidate(); tui.requestRender(); return { consume: true }; }
			if (matchesAstraAction(data, "browse.toggle") && !editor.isShowingAutocomplete() && (!editor.focused || !editor.getText())) { navigation.toggleAstraBrowse(editor.focused); tui.requestRender(); return { consume: true }; }
			if (matchesAstraAction(data, "navigate.back") && !editor.isShowingAutocomplete()) {
				if (navigation.mode === "workbench" && astra.page !== "execution") { dependencies.showAstraPage("execution"); return { consume: true }; }
				if (navigation.mode === "workbench" && !editor.focused) { navigation.leaveAstraBrowse(); tui.requestRender(); return { consume: true }; }
			}
			if (!editor.focused && !(navigation.mode === "dashboard" && navigation.observabilityBrowsing) && routeAstraScroll(data, navigation.currentScroll(), tui)) return { consume: true };
		}
		if (matchesAstraAction(data, "runtime.mode.cycle")) {
			void dependencies.cycleRuntimeMode().catch(error => { status.setNotice(error instanceof Error ? error.message : String(error)); tui.requestRender(); });
			return { consume: true };
		}
		if (navigation.observabilityBrowsing && navigation.mode === "dashboard" && (matchesKey(data, Key.up) || matchesKey(data, Key.down))) {
			const maximum = Math.max(0, dependencies.dashboard().recentSessions.length - 1);
			dependencies.setSelectedDashboardIndex(Math.max(0, Math.min(maximum, dependencies.selectedDashboardIndex() + (matchesKey(data, Key.up) ? -1 : 1))));
			if (astra) dependencies.observabilityDashboard.scrollToStart();
			dependencies.observabilityDashboardView.invalidate();
			tui.requestRender();
			return { consume: true };
		}
		if (navigation.observabilityBrowsing && navigation.mode === "dashboard" && matchesKey(data, Key.enter)) {
			const selected = dependencies.dashboard().recentSessions[dependencies.selectedDashboardIndex()] ?? null;
			dependencies.selectHistoricalSession(selected);
			if (selected) { dependencies.resetStatsTarget(); void dependencies.enterObservability("stats").then(() => tui.requestRender()); }
			return { consume: true };
		}
		if (shouldHandleObservabilityShortcut(navigation.observabilityBrowsing, astra ? editor.focused : !navigation.observabilityBrowsing, data)
			&& (navigation.mode === "stats" || navigation.mode === "dashboard" || navigation.mode === "monitor")) {
			const direct  = directObservabilityView(data)                                                                                                   ;
			const rotated = data === "r" ? rotateObservabilityView(navigation.mode, 1) : data === "R" ? rotateObservabilityView(navigation.mode, -1) : null ;
			const next    = direct ?? rotated                                                                                                               ;
			if (next) {
				void dependencies.enterObservability(next).then(() => { status.setNotice(`Observability · ${next}`); tui.requestRender(); }).catch(error => { status.setNotice(error instanceof Error ? error.message : String(error)); tui.requestRender(); });
				return { consume: true };
			}
		}
		const snapshot = dependencies.snapshot();
		if (matchesAstraAction(data, "navigate.back") && navigation.returnToWorkbench()) { status.setNotice("상세 화면을 닫고 Workbench로 돌아왔습니다."); tui.requestRender(); return { consume: true }; }
		if (matchesAstraAction(data, "navigate.back") && snapshot.phase === "working" && !editor.isShowingAutocomplete()) { void workbench.dispatch({ type: "chat.cancel" }).then(dependencies.showReceipt); return { consume: true }; }
		if (matchesAstraAction(data, "interrupt.or.exit")) {
			const action = exitKeys.ctrlC(snapshot.phase === "working");
			if (action === "exit") { void dependencies.shutdown(); return { consume: true }; }
			if (action === "abort") {
				void workbench.dispatch({ type: "chat.cancel" }).then(receipt => { if (receipt.state !== "accepted") dependencies.showReceipt(receipt); });
				status.setNotice("현재 응답을 중단합니다. 500ms 안에 Ctrl+C를 다시 누르면 종료합니다."); tui.requestRender(); return { consume: true };
			}
			const hadDraft = Boolean(editor.getText()); editor.setText("");
			status.setNotice(hadDraft ? "작성 중인 입력을 지웠습니다. 500ms 안에 Ctrl+C를 다시 누르면 종료합니다." : "500ms 안에 Ctrl+C를 다시 누르면 종료합니다."); tui.requestRender(); return { consume: true };
		}
		if (matchesKey(data, Key.ctrl("d"))) {
			if (editor.getText()) { status.setNotice("작성 중인 입력이 있습니다. Ctrl+D는 입력이 비었을 때만 종료합니다."); tui.requestRender(); }
			else void dependencies.shutdown();
			return { consume: true };
		}
		return undefined;
	});
}

function routeAstraScroll(data: string, scroll: ScrollTarget, tui: TuiAltScreen): boolean {
	const matchesScroll = (keys: readonly string[]): boolean => keys.some(key => matchesAstraKey(data, key));
	const delta = matchesScroll(ASTRA_SCROLL_KEYS.down) ? 1 : matchesScroll(ASTRA_SCROLL_KEYS.up) ? -1
		: matchesScroll(ASTRA_SCROLL_KEYS.pageDown) ? Math.max(1, scroll.viewportHeight - 2) : matchesScroll(ASTRA_SCROLL_KEYS.pageUp) ? -Math.max(1, scroll.viewportHeight - 2) : 0;
	if (delta) { scroll.scrollBy(delta); tui.requestRender(); return true; }
	if (matchesScroll(ASTRA_SCROLL_KEYS.home)) { scroll.scrollToStart(); tui.requestRender(); return true; }
	if (matchesScroll(ASTRA_SCROLL_KEYS.end)) { scroll.scrollToEnd(); tui.requestRender(); return true; }
	return false;
}
