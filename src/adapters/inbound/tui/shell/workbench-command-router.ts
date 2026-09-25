import { executeDevelopmentShellCommand }                          from "@/core/application/development/development-service";
import type { DevelopmentService }                                 from "@/core/application/development/development-service";
import type { ProjectWorkbench }                                   from "@/core/application/orchestration/project-workbench";
import { nativeModelEfforts }                                      from "@/core/domain/execution/model-settings";
import type { Provider, WwwSettings }                              from "@/core/domain/execution/model-settings";
import { sanitizeTerminalTextUnbounded }                           from "@/core/domain/execution/terminal";
import type { WorkbenchCommandReceipt, WorkbenchSnapshot }         from "@/core/domain/work/workbench";
import type { AuthController, UsageMonitor, UsageSnapshot }        from "@/core/ports";
import { parseWorkbenchShellCommand, WORKBENCH_SLASH_COMMANDS }    from "@/adapters/inbound/tui/commands/slash-commands";
import { getActiveTuiTheme, setActiveTuiTheme, TUI_THEME_OPTIONS } from "@/adapters/inbound/tui/foundation/theme/theme";
import type { AstraPage }                                          from "@/adapters/inbound/tui/shell/astra-surface";
import { workbenchModelSettings, workbenchPaneNotice }             from "@/adapters/inbound/tui/shell/workbench-input.controller";
import {
	workbenchStatsTargetCommand,
	workbenchViewModeCommand,
} from "@/adapters/inbound/tui/shell/workbench-navigation.controller";
import type {
	ObservabilityViewMode,
	WorkbenchViewMode,
} from "@/adapters/inbound/tui/shell/workbench-navigation.controller";

type StatsTarget = "session" | "diagnostics" | "latest" | number;

export interface WorkbenchCommandRouterDependencies {
	readonly hasAstra                : boolean                                                              ;
	readonly snapshot                : () => WorkbenchSnapshot                                              ;
	readonly workbench               : ProjectWorkbench                                                     ;
	readonly development?            : DevelopmentService                                                   ;
	readonly usage                   : UsageMonitor                                                         ;
	readonly auth                    : AuthController                                                       ;
	readonly enterDemo               : () => void                                                           ;
	readonly showAstraPage           : (page: AstraPage) => void                                            ;
	readonly enterObservability      : (mode: ObservabilityViewMode) => Promise<void>                       ;
	readonly updateUsage             : (snapshots: readonly UsageSnapshot[]) => void                        ;
	readonly openApproval            : (request: NonNullable<WorkbenchSnapshot["pendingApproval"]>) => void ;
	readonly showDevelopmentNotice   : (notice: string) => void                                             ;
	readonly selectStatsTarget       : (target: StatsTarget) => void                                        ;
	readonly openCommandView         : (mode: WorkbenchViewMode) => void                                    ;
	readonly openWorkbench           : () => void                                                           ;
	readonly openSource              : () => void                                                           ;
	readonly shutdown                : () => void                                                           ;
	readonly applyTerminalBackground : () => void                                                           ;
	readonly invalidateChat          : () => void                                                           ;
	readonly setNotice               : (notice: string) => void                                             ;
	readonly requestRender           : () => void                                                           ;
	readonly openModelSettings       : () => void                                                           ;
	readonly openAuthentication      : (provider?: Provider) => void                                        ;
	readonly dispatchModelSelection  : (settings: WwwSettings) => Promise<WorkbenchCommandReceipt>          ;
	readonly showReceipt             : (receipt: WorkbenchCommandReceipt) => void                           ;
}

export function createWorkbenchCommandRouter(dependencies: WorkbenchCommandRouterDependencies): (text: string) => Promise<boolean> {
	const notice = (message: string): void => {
		dependencies.setNotice(message);
		dependencies.requestRender();
	};

	return async (text: string): Promise<boolean> => {
		const normalized = text.trim();
		if (dependencies.hasAstra && normalized.toLowerCase() === "/demo") {
			dependencies.enterDemo();
			return true;
		}
		if (normalized === "/three-body") {
			if (dependencies.hasAstra) {
				dependencies.showAstraPage("lab");
				notice("THREE BODY LAB · Space 일시정지 · Q/Esc 돌아가기");
			} else notice("THREE BODY LAB은 Astra UI에서 사용할 수 있습니다.");
			return true;
		}
		if (dependencies.hasAstra && normalized === "/dashboard") {
			dependencies.showAstraPage("dashboard");
			return true;
		}
		if (dependencies.hasAstra && normalized === "/history") {
			await dependencies.enterObservability("dashboard");
			notice("History · 이전 Session과 Project 관측");
			return true;
		}
		if (dependencies.hasAstra && normalized === "/context") {
			dependencies.showAstraPage("context");
			return true;
		}
		if (dependencies.hasAstra && normalized === "/cache") {
			dependencies.showAstraPage("cache");
			return true;
		}
		if (dependencies.hasAstra && normalized === "/usage") {
			dependencies.showAstraPage("usage");
			try {
				dependencies.updateUsage(await dependencies.usage.refresh());
				dependencies.requestRender();
			} catch (error) {
				notice(`Usage 갱신 실패 · 마지막 관측을 유지합니다: ${error instanceof Error ? error.message : String(error)}`);
			}
			return true;
		}
		if (dependencies.hasAstra && normalized === "/approval") {
			const approval = dependencies.snapshot().pendingApproval;
			if (approval) dependencies.openApproval(approval);
			else dependencies.setNotice("대기 중인 승인 요청이 없습니다.");
			dependencies.requestRender();
			return true;
		}

		const developmentNotice = await executeDevelopmentShellCommand(text, dependencies.development);
		if (developmentNotice !== null) {
			dependencies.showDevelopmentNotice(sanitizeTerminalTextUnbounded(developmentNotice));
			return true;
		}

		const requestedStatsTarget = workbenchStatsTargetCommand(text);
		if (requestedStatsTarget !== null) {
			if (requestedStatsTarget === "invalid") {
				notice("사용법: /stats [diagnostics|latest|#n]");
				return true;
			}
			dependencies.selectStatsTarget(requestedStatsTarget);
			await dependencies.enterObservability("stats");
			notice(requestedStatsTarget === "session"
				? "Session Review · 목적·결과·성능과 요청 검토"
				: requestedStatsTarget === "diagnostics"
					? "Session Diagnostics · 관측 원본 진단"
					: `Request Stats · ${requestedStatsTarget === "latest" ? "latest" : `#${requestedStatsTarget}`}`);
			return true;
		}

		const requestedViewMode = workbenchViewModeCommand(text);
		if (requestedViewMode) {
			if (requestedViewMode === "stats" || requestedViewMode === "dashboard" || requestedViewMode === "monitor") {
				await dependencies.enterObservability(requestedViewMode);
			} else dependencies.openCommandView(requestedViewMode);
			notice(requestedViewMode === "dashboard"
				? "Dashboard · 전체 Session과 Project 관측"
				: requestedViewMode === "monitor"
					? "Monitor · 현재 runtime 실행 관측"
					: requestedViewMode === "map"
						? "Development Map · 전체 구조와 진척도 · 자동 갱신"
						: requestedViewMode === "test"
							? "Test · 현재 세션의 질문별 검증 목적·검사·근거"
							: "Session Stats · 목적·행동·결과와 오케스트레이션 효율");
			return true;
		}

		if (/^\/model\s+\S/u.test(normalized)) await dependencies.workbench.refreshModels();
		const snapshot = dependencies.snapshot();
		const command = parseWorkbenchShellCommand(text, snapshot.modelCatalog);
		if (!command) return false;
		if (command.type === "exit") {
			dependencies.shutdown();
			return true;
		}
		if (command.type === "error") {
			notice(command.message);
			return true;
		}
		if (command.type === "help") {
			if (dependencies.hasAstra) dependencies.showAstraPage("help");
			else notice(WORKBENCH_SLASH_COMMANDS.map(entry => `/${entry.name}${entry.argumentHint ? ` ${entry.argumentHint}` : ""}`).join(" · "));
			return true;
		}
		if (command.type === "theme.set") {
			setActiveTuiTheme(command.theme);
			dependencies.applyTerminalBackground();
			dependencies.invalidateChat();
			const label = TUI_THEME_OPTIONS.find(theme => theme.name === getActiveTuiTheme())?.label ?? getActiveTuiTheme();
			notice(`Theme · ${label}`);
			return true;
		}
		if (command.type === "workflow.view") {
			if (dependencies.hasAstra) dependencies.showAstraPage("workflow");
			else notice("Workflow 화면은 Astra UI에서 사용할 수 있습니다.");
			return true;
		}
		if ((command.type === "mcp.refresh" || command.type === "mcp.reload" || command.type === "mcp.enable" || command.type === "mcp.disable") && snapshot.slash?.mcp === false) {
			notice("이 프로젝트에서는 /mcp 명령이 비활성화되어 있습니다.");
			return true;
		}
		if (command.type === "chat.clear" && snapshot.slash?.clear === false) {
			notice("이 프로젝트에서는 /clear 명령이 비활성화되어 있습니다.");
			return true;
		}
		if (command.type === "thread.compact" && snapshot.slash?.compact === false) {
			notice("이 프로젝트에서는 /compact 명령이 비활성화되어 있습니다.");
			return true;
		}
		if (command.type === "workflow.check" || command.type === "workflow.resume" || command.type === "workflow.show") {
			dependencies.showReceipt(await dependencies.workbench.dispatch(command));
			dependencies.openWorkbench();
			return true;
		}
		if (command.type === "pane.show") {
			if (dependencies.hasAstra) {
				dependencies.showAstraPage(command.pane === "todo" ? "plan" : "execution");
				if (command.pane === "tnotes") dependencies.setNotice("질문 요약은 실행 타임라인의 각 질문 뒤에 표시됩니다.");
				dependencies.requestRender();
				return true;
			}
			dependencies.openWorkbench();
			notice(workbenchPaneNotice(command.pane));
			return true;
		}
		if (command.type === "model.select") {
			dependencies.openModelSettings();
			return true;
		}
		if (command.type === "model.set") {
			const current = workbenchModelSettings(snapshot);
			const efforts = nativeModelEfforts(command.model, snapshot.modelCatalog);
			const inherited = efforts.includes(current.effort)
				? current.effort
				: snapshot.modelCatalog?.models.find(entry => entry.model === command.model)?.defaultEffort ?? "medium";
			dependencies.showReceipt(await dependencies.dispatchModelSelection({
				provider : "openai-codex",
				model    : command.model,
				effort   : command.effort ?? inherited,
			}));
			return true;
		}
		if (command.type === "auth.select") {
			dependencies.openAuthentication();
			return true;
		}
		if (command.type === "auth.login") {
			dependencies.openAuthentication(command.provider);
			return true;
		}
		if (command.type === "auth.logout") {
			if (snapshot.phase === "working") {
				notice("현재 응답이 끝난 뒤 로그아웃할 수 있습니다.");
				return true;
			}
			await dependencies.auth.logout(command.provider);
			dependencies.updateUsage(await dependencies.usage.refresh());
			notice(`${command.provider} 인증을 삭제했습니다.`);
			return true;
		}
		if (command.type === "session.permission" || command.type === "session.mode") {
			dependencies.showReceipt(await dependencies.workbench.dispatch(command));
			return true;
		}
		if (command.type === "goal.view") {
			notice(snapshot.sessionGoal?.text ? `Goal · ${snapshot.sessionGoal.text}` : "설정된 Goal이 없습니다. /goal <목표 문장>으로 시작하세요.");
			return true;
		}
		if (command.type === "goal.set" || command.type === "woo-entry.refresh") {
			dependencies.showReceipt(await dependencies.workbench.dispatch(command));
			return true;
		}
		if (command.type === "activity.select") {
			const activityId = command.activityId === "latest" ? snapshot.activities.at(-1)?.id ?? null : command.activityId;
			const receipt = await dependencies.workbench.dispatch({ type: "activity.select", activityId });
			dependencies.showReceipt(receipt);
			if (receipt.state === "accepted" && activityId) dependencies.openSource();
			return true;
		}
		if (command.type === "trace.select") {
			const receipt = await dependencies.workbench.dispatch(command);
			dependencies.showReceipt(receipt);
			if (receipt.state === "accepted") dependencies.openSource();
			return true;
		}
		if (command.type === "runtime.reconcile") {
			dependencies.showReceipt(await dependencies.workbench.dispatch(command));
			return true;
		}
		if (command.type === "agent.select") {
			const receipt = await dependencies.workbench.dispatch(command);
			dependencies.showReceipt(receipt);
			if (receipt.state === "accepted") {
				if (dependencies.hasAstra) dependencies.showAstraPage("context");
				else dependencies.openWorkbench();
			}
			return true;
		}
		if (command.type === "tnote.capture") {
			dependencies.showReceipt(await dependencies.workbench.dispatch({ type: "tnote.capture-session" }));
			return true;
		}
		if (command.type === "tnote.capture-range") {
			dependencies.showReceipt(await dependencies.workbench.dispatch(command));
			return true;
		}
		if (command.type === "promotion.accept") {
			dependencies.showReceipt(await dependencies.workbench.dispatch({ type: "promotion.accept", noteId: command.noteId, acceptedBy: "human:local" }));
			return true;
		}
		if (command.type === "promotion.confirm" || command.type === "review.send" || command.type === "chat.cancel"
			|| command.type === "mcp.enable" || command.type === "mcp.disable") {
			dependencies.showReceipt(await dependencies.workbench.dispatch(command));
			return true;
		}
		if (command.type === "review.preview") {
			dependencies.showReceipt(await dependencies.workbench.dispatch({ ...command, confirmedPublic: true }));
			return true;
		}
		if (command.type === "chat.clear"
			|| command.type === "thread.compact"
			|| command.type === "mcp.refresh"
			|| command.type === "mcp.reload") {
			dependencies.showReceipt(await dependencies.workbench.dispatch(command));
			return true;
		}

		const approval = snapshot.pendingApproval;
		if (!approval) {
			notice("대기 중인 승인 요청이 없습니다.");
			return true;
		}
		dependencies.showReceipt(await dependencies.workbench.dispatch({
			type: "approval.resolve",
			requestId: approval.requestId,
			response: {
				decision: command.type === "approval.accept" ? "accept"
					: command.type === "approval.accept-session" ? "acceptForSession" : "decline",
			},
		}));
		return true;
	};
}
