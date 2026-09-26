import type { NoteFeatureProjection } from "@/core/application/orchestration/workbench-feature-reads";
import type { WorkbenchTNote }        from "@/core/domain/work/workbench";

export interface TNoteBrowserViewModel {
	readonly mode          : "list" | "detail"                       ;
	readonly notes         : readonly WorkbenchTNote[]               ;
	readonly selected      : WorkbenchTNote | null                   ;
	readonly selectedIndex : number                                  ;
	readonly status        : NoteFeatureProjection["read"]["status"] ;
	readonly statusMessage : string                                  ;
}

/** Converts the Core Note read contract into selection-safe TUI state without owning stored data. */
export function projectTNoteBrowserViewModel(
	projection: NoteFeatureProjection,
	selectedIndex: number,
	mode: "list" | "detail",
): TNoteBrowserViewModel {
	const maximum  = Math.max(0, projection.notes.length - 1)      ;
	const selected = Math.min(Math.max(0, selectedIndex), maximum) ;
	const note     = projection.notes[selected] ?? null            ;
	const stale    = projection.read.status === "stale"            ;
	const message  = stale
		? `${projection.notes.length > 0 ? "최근 읽기 실패 · 이전 결과를 표시합니다" : "최근 읽기 실패 · 저장된 목록을 표시할 수 없습니다"}${projection.read.error ? ` · ${projection.read.error}` : ""}`
		: projection.read.status === "unavailable"
			? projection.read.unavailableReason === "awaiting-thread"
				? "Native 세션이 시작되면 저장된 Note를 읽습니다."
				: "Note 저장소가 연결되지 않았습니다."
			: projection.read.status === "loading"
				? "저장된 Note를 읽는 중입니다."
				: projection.notes.length === 0
					? "저장된 완료 Note가 없습니다."
					: `${projection.notes.length}개의 완료 Note`;
	return Object.freeze({
		mode          : mode === "detail" && note ? "detail" : "list",
		notes         : projection.notes,
		selected      : note,
		selectedIndex : selected,
		status        : projection.read.status,
		statusMessage : message,
	});
}
