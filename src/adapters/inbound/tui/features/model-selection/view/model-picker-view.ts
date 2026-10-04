import      {
              stripTerminalSequences                  ,
              truncateToWidth                         ,
              visibleWidth                            ,
                                                        } from "@earendil-works/pi-tui"                        ;
import type { WwwSettings                               } from "@/core/domain/execution/model-settings"        ;
import type { TuiColors                                 } from "@/adapters/inbound/tui/foundation/theme/theme" ;
import      { workbenchEffortLabel, workbenchModelLabel } from "@/adapters/inbound/tui/foundation/labels"      ;

export interface ModelPickerViewState {
	readonly appearance?   : "www"             ;
	readonly nativeCodex   : boolean           ;
	readonly current       : WwwSettings       ;
	readonly staged        : WwwSettings       ;
	readonly breadcrumb    : string            ;
	readonly catalogNotice : string            ;
	readonly rows          : readonly string[] ;
	readonly error         : string | null     ;
	readonly applying      : boolean           ;
	readonly confirmation  : boolean           ;
}

export function renderModelPickerView(state: ModelPickerViewState, width: number, ui: TuiColors): string[] {
	const contentWidth = Math.max(1, width)                                                                                               ;
	const rows         = state.appearance === "www" ? wwwPickerRows(state, contentWidth, ui) : classicPickerRows(state, contentWidth, ui) ;
	return rows.map(row => fit(row, contentWidth));
}

function wwwPickerRows(state: ModelPickerViewState, contentWidth: number, ui: TuiColors): string[] {
	return [
		ui.highlight("모델과 추론 강도"), "", state.breadcrumb, "",
		ui.muted(`현재 ${workbenchModelLabel(state.current.model)} / ${workbenchEffortLabel(state.current.effort)}`), ui.muted(state.catalogNotice),
		...state.rows.map(row => row.startsWith("›") || stripTerminalSequences(row).startsWith("›") ? ui.selected(fit(row, contentWidth)) : row),
		...(state.error ? [ui.error(state.error)] : []), "",
		ui.muted(state.applying ? "적용 중" : "↑↓ 선택 / Enter 다음·적용 / ← 이전 / Esc 닫기"),
	];
}

function classicPickerRows(state: ModelPickerViewState, contentWidth: number, ui: TuiColors): string[] {
	const hint = state.confirmation ? "Enter 적용 · ← 이전 · Esc 닫기" : "↑↓ 선택 · Enter 다음 · ← 이전 · Esc 닫기";
	return [
		ui.accent("◈ 모델 설정 · 모델 연결"),
		ui.muted("현재 대화에 사용할 모델과 추론 수준을 선택합니다."),
		state.breadcrumb,
		ui.border("─".repeat(contentWidth)),
		`현재: ${state.current.provider} / ${workbenchModelLabel(state.current.model)} / ${workbenchEffortLabel(state.current.effort)}`,
		ui.highlight(`선택: ${state.staged.provider} / ${workbenchModelLabel(state.staged.model)} / ${workbenchEffortLabel(state.staged.effort)}`),
		ui.border("─".repeat(contentWidth)),
		...(state.nativeCodex ? [ui.muted(state.catalogNotice)] : []),
		...state.rows,
		...(state.error ? [ui.error(state.error)] : []),
		ui.muted(state.applying ? "적용하는 중…" : hint),
	];
}

function fit(text: string, width: number): string {
	const clipped = truncateToWidth(text, Math.max(0, width));
	return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}
