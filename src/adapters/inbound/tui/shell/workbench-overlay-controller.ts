import { Key, matchesKey, TuiAltScreen, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import type { Component, OverlayHandle, Terminal }         from "@earendil-works/pi-tui";

import type { ProjectWorkbench }                            from "@/core/application/orchestration/project-workbench";
import type { Provider, WwwSettings }                       from "@/core/domain/execution/model-settings";
import type { WorkbenchCommandReceipt, WorkbenchSnapshot }  from "@/core/domain/work/workbench";
import type { AuthController, UsageMonitor, UsageSnapshot } from "@/core/ports";
import { LoginOverlay }                                     from "@/adapters/inbound/tui/features/authentication/auth-overlay";
import { ApprovalOverlay }                                  from "@/adapters/inbound/tui/features/approval/approval-overlay";
import { ModelPickerOverlay }                               from "@/adapters/inbound/tui/features/model-selection/model-picker-overlay";
import { ComponentSlot }                                    from "@/adapters/inbound/tui/shell/workbench-navigation.controller";
import { AstraSheet }                                       from "@/adapters/inbound/tui/shell/astra-surface";
import type { AstraPage, AstraWorkspace }                   from "@/adapters/inbound/tui/shell/astra-surface";
import {
	workbenchModelSettings,
	workbenchReceiptNotice,
} from "@/adapters/inbound/tui/shell/workbench-input.controller";
import { astraColors }                                      from "@/adapters/inbound/tui/foundation/theme/astra-theme";

type OverlayKind = "model" | "approval" | "development" | "commands" | "views" | "auth";

interface ShellNotice {
	setNotice(notice: string): void;
}

export interface WorkbenchOverlayControllerDependencies {
	readonly astra                 : AstraWorkspace | null                         ;
	readonly terminal              : Terminal                                      ;
	readonly tui                   : TuiAltScreen                                  ;
	readonly editor                : Component & { setText(text: string): void }   ;
	readonly composerSlot          : ComponentSlot                                 ;
	readonly sheet                 : (content: Component) => Component             ;
	readonly snapshot              : () => WorkbenchSnapshot                       ;
	readonly workbench             : ProjectWorkbench                              ;
	readonly usage                 : UsageMonitor                                  ;
	readonly auth                  : AuthController                                ;
	readonly status                : ShellNotice                                   ;
	readonly showAstraPage         : (page: AstraPage, browse?: boolean) => void   ;
	readonly closeTransientSurface : () => void                                    ;
	readonly updateUsage           : (snapshots: readonly UsageSnapshot[]) => void ;
	readonly showReceipt           : (receipt: WorkbenchCommandReceipt) => void    ;
}

/** Owns modal lifetime so command and keyboard routing never mutate overlay state directly. */
export class WorkbenchOverlayController {
	private overlay             : OverlayHandle | null                                                  = null  ;
	private overlayKind         : OverlayKind | null                                                    = null  ;
	private activeApprovalId    : NonNullable<WorkbenchSnapshot["pendingApproval"]>["requestId"] | null = null  ;
	private inlineApprovalSheet : AstraSheet | null                                                     = null  ;
	private inlineApprovalActive                                                                        = false ;
	private loginPrompt         : LoginOverlay | null                                                   = null  ;

	constructor(private readonly dependencies: WorkbenchOverlayControllerDependencies) {}

	get hasOverlay(): boolean { return this.overlay !== null; }
	get kind(): OverlayKind | null { return this.overlayKind; }
	get hasInlineApproval(): boolean { return this.inlineApprovalSheet !== null; }
	get isInlineApprovalActive(): boolean { return this.inlineApprovalActive; }
	get activeLoginPrompt(): LoginOverlay | null { return this.loginPrompt; }
	get focusTarget(): Component { return this.inlineApprovalSheet ?? this.dependencies.editor; }

	dismiss(): void {
		if (!this.overlay) return;
		this.overlay.hide();
		this.overlay          = null ;
		this.overlayKind      = null ;
		this.activeApprovalId = null ;
		this.dependencies.closeTransientSurface();
	}

	dismissInlineApproval(): void {
		if (!this.inlineApprovalSheet) return;
		this.inlineApprovalSheet  = null  ;
		this.inlineApprovalActive = false ;
		this.activeApprovalId     = null  ;
		this.dependencies.composerSlot.set(this.dependencies.editor);
		this.dependencies.tui.setFocus(this.dependencies.editor);
		this.dependencies.tui.requestRender();
	}

	dismissApproval(): void {
		if (this.dependencies.astra) this.dismissInlineApproval();
		else this.dismiss();
	}

	openAuthentication(provider?: Provider): void {
		const { astra, snapshot, status, tui, usage } = this.dependencies;
		if (astra && snapshot().pendingApproval) {
			status.setNotice("대기 중인 승인 요청을 먼저 결정하세요.");
			tui.requestRender();
			return;
		}
		if (this.overlay) this.dismiss();
		if (this.loginPrompt) return;
		if (snapshot().phase === "working") {
			status.setNotice("현재 응답이 끝난 뒤 로그인할 수 있습니다.");
			tui.requestRender();
			return;
		}
		let panel: LoginOverlay;
		panel = new LoginOverlay(
			this.dependencies.auth,
			() => tui.requestRender(),
			async (authStatus) => {
				if (authStatus.state !== "configured") throw new Error("인증이 완료되지 않았습니다.");
				status.setNotice(`${authStatus.provider} 로그인이 완료되었습니다.`);
				this.dependencies.updateUsage(await usage.refresh());
				tui.requestRender();
			},
			() => this.closeLoginPrompt(panel),
			provider ? [provider] : undefined,
			undefined,
			astra ? astraColors : undefined,
		);
		this.loginPrompt = panel;
		const loginSheet = astra ? new AstraSheet(panel, () => Math.max(6, Math.floor(this.dependencies.terminal.rows * 0.8)), { followPrompt: true }) : this.dependencies.sheet(panel);
		if (astra) {
			this.overlay = tui.showOverlay(loginSheet, { width: "90%", minWidth: 36, maxHeight: "95%", anchor: "center", margin: 1 });
			this.overlayKind = "auth";
		} else this.dependencies.composerSlot.set(loginSheet);
		tui.setFocus(astra ? loginSheet : panel);
		panel.start(provider !== undefined);
		tui.requestRender();
	}

	openModelSettings(): void {
		const { astra, snapshot, tui, workbench } = this.dependencies;
		if (this.overlay) return;
		if (snapshot().phase === "working") {
			this.dependencies.status.setNotice("현재 응답이 끝난 뒤 모델을 변경할 수 있습니다.");
			tui.requestRender();
			return;
		}
		const current = workbenchModelSettings(snapshot());
		const panel = new ModelPickerOverlay(
			current,
			async (provider) => ({ state: "configured" as const, provider, source: "Codex App Server", type: "oauth" as const }),
			() => tui.requestRender(),
			async (settings) => {
				const receipt = await this.dispatchModelSelection(settings);
				if (receipt.state !== "accepted") throw new Error(workbenchReceiptNotice(receipt));
				this.dependencies.showReceipt(receipt);
			},
			() => undefined,
			() => this.dismiss(),
			current,
			false,
			{
				providers: ["openai-codex"], startAtModel: true, nativeCodex: true,
				...(snapshot().modelCatalog ? { catalog: snapshot().modelCatalog } : {}),
				loadCatalog: () => workbench.refreshModels(),
				maxVisibleOptions: () => Math.max(1, Math.floor(this.dependencies.terminal.rows * 0.7) - 12),
				...(astra ? { colors: astraColors, appearance: "astra" as const } : {}),
			},
		);
		const modelSheet = astra ? new AstraSheet(panel, () => Math.max(6, Math.floor(this.dependencies.terminal.rows * 0.8)), { followSelection: true }) : this.dependencies.sheet(panel);
		this.overlay = tui.showOverlay(modelSheet, { width: astra ? "84%" : "64%", minWidth: 46, maxHeight: astra ? "90%" : "70%", anchor: astra ? "center" : "bottom-center", margin: astra ? 1 : 2 });
		this.overlayKind = "model";
		if (astra) tui.setFocus(modelSheet);
		panel.start();
	}

	openApproval(request: NonNullable<WorkbenchSnapshot["pendingApproval"]>): void {
		const { astra, tui, workbench } = this.dependencies;
		if (astra ? this.inlineApprovalSheet && this.activeApprovalId === request.requestId : this.overlayKind === "approval") return;
		if (astra && this.loginPrompt) { this.loginPrompt.handleInput("\x1b"); this.closeLoginPrompt(); }
		if (this.overlay) this.dismiss();
		if (astra) this.dependencies.showAstraPage("execution");
		const panel = new ApprovalOverlay(
			request,
			() => tui.requestRender(),
			(decision) => {
				void workbench.dispatch({ type: "approval.resolve", requestId: request.requestId, response: { decision } }).then(receipt => {
					if (this.activeApprovalId === request.requestId) this.dismissApproval();
					this.dependencies.showReceipt(receipt);
				}).catch(error => {
					if (this.activeApprovalId === request.requestId) this.dismissApproval();
					this.dependencies.status.setNotice(error instanceof Error ? error.message : String(error));
					tui.requestRender();
				});
			},
			() => this.dismissApproval(),
			astra ? astraColors : undefined,
		);
		this.activeApprovalId = request.requestId;
		if (astra) {
			this.inlineApprovalSheet = new AstraSheet(panel, () => Math.max(8, Math.floor(this.dependencies.terminal.rows * 0.45)));
			this.inlineApprovalActive = true;
			this.dependencies.composerSlot.set(this.inlineApprovalSheet);
			tui.setFocus(this.inlineApprovalSheet);
			tui.requestRender();
			return;
		}
		const approvalSheet = this.dependencies.sheet(panel);
		this.overlay = tui.showOverlay(approvalSheet, { width: "72%", minWidth: 46, maxHeight: "80%", anchor: "bottom-center", margin: 2 });
		this.overlayKind = "approval";
		tui.setFocus(panel);
		tui.requestRender();
	}

	synchronizeApproval(
		lastAutoApprovalId: NonNullable<WorkbenchSnapshot["pendingApproval"]>["requestId"] | null,
	): NonNullable<WorkbenchSnapshot["pendingApproval"]>["requestId"] | null {
		const pending = this.dependencies.snapshot().pendingApproval;
		if (pending && (!this.dependencies.astra || lastAutoApprovalId !== pending.requestId)) {
			this.openApproval(pending);
			this.dependencies.status.setNotice(this.dependencies.astra ? "채팅 영역에 승인 선택을 열었습니다. ↑↓ 또는 숫자로 선택하세요." : "승인 선택 화면을 열었습니다. ↑↓ 또는 숫자로 선택하세요.");
			return pending.requestId;
		}
		if (!pending) {
			if (this.dependencies.astra) this.dismissInlineApproval();
			else if (this.overlayKind === "approval") this.dismiss();
		}
		return pending ? lastAutoApprovalId : null;
	}

	showDevelopmentNotice(safeNotice: string): void {
		this.dependencies.status.setNotice(safeNotice.split("\n")[0] ?? "개발 연결");
		if (safeNotice.includes("\n")) {
			this.dismiss();
			let offset = 0;
			let lineCount = 0;
			const panel: Component = {
				invalidate() {},
				render: (width) => {
					const lines = safeNotice.split("\n").flatMap(line => wrapTextWithAnsi(line, Math.max(1, width)));
					lineCount = lines.length;
					return ["개발 연결 · ↑↓ 이동 · Esc 닫기", "", ...lines.slice(offset, offset + 18)];
				},
				handleInput: (data) => {
					if (matchesKey(data, Key.escape)) this.dismiss();
					else if (matchesKey(data, Key.down)) offset = Math.min(Math.max(0, lineCount - 18), offset + 1);
					else if (matchesKey(data, Key.up)) offset = Math.max(0, offset - 1);
					this.dependencies.tui.requestRender();
				},
			};
			this.overlay = this.dependencies.tui.showOverlay(this.dependencies.sheet(panel), { width: "90%", minWidth: 40, maxHeight: "85%", anchor: "center" });
			this.overlayKind = "development";
		}
		this.dependencies.tui.requestRender();
	}

	dispatchModelSelection(settings: WwwSettings): Promise<WorkbenchCommandReceipt> {
		return this.dependencies.workbench.dispatch({ type: "session.model", selection: { model: settings.model, effort: settings.effort } });
	}

	openAstraTransient(kind: Extract<OverlayKind, "commands" | "views">, content: Component): void {
		const sheet = this.dependencies.sheet(content);
		this.overlay = this.dependencies.tui.showOverlay(sheet, { width: "86%", minWidth: 36, maxHeight: "95%", anchor: "center", margin: 1 });
		this.overlayKind = kind;
		this.dependencies.tui.setFocus(sheet);
	}

	private closeLoginPrompt(expected: LoginOverlay | null = this.loginPrompt): void {
		if (!this.loginPrompt || this.loginPrompt !== expected) return;
		this.loginPrompt = null;
		if (this.overlayKind === "auth") this.dismiss();
		this.dependencies.composerSlot.set(this.dependencies.editor);
		this.dependencies.tui.setFocus(this.dependencies.editor);
		this.dependencies.tui.requestRender();
	}
}
