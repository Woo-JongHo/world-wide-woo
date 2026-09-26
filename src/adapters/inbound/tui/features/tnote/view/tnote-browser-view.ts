import { truncateToWidth, visibleWidth, wrapTextWithAnsi }      from "@earendil-works/pi-tui";
import { parseCanonicalTNoteReport, parseLegacyCanonicalTNote } from "@/core/application/work/t-note-service";
import type { WorkbenchTNote }                                  from "@/core/domain/work/workbench";
import { colors }                                               from "@/adapters/inbound/tui/foundation/theme/theme";
import type { TNoteBrowserViewModel }                           from "@/adapters/inbound/tui/features/tnote/view-model/tnote-browser-view-model";

function fit(text: string, width: number): string {
	const clipped = truncateToWidth(text, Math.max(0, width));
	return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

function field(label: string, value: string, width: number): string[] {
	return [colors.muted(label), ...wrapTextWithAnsi(value, Math.max(1, width)), ""];
}

function sourceRows(note: WorkbenchTNote, width: number): string[] {
	const rows = [
		`Note ${note.sequence ? `#${note.sequence}` : note.id} · ${note.format ?? "unknown"} · schema v1`,
		`저장 ${note.updatedAt}`,
		`Activity ${note.sourceActivityIds.length}개${note.sourceRange ? ` · sequence ${note.sourceRange.startSequence}–${note.sourceRange.endSequence}` : ""}`,
	];
	if (note.completion) rows.push(`Turn ${note.completion.threadId} / ${note.completion.turnId} · 질문 #${note.completion.number}`);
	if (note.provenance) rows.push(`생성 ${note.provenance.provider} / ${note.provenance.model} / ${note.provenance.version}`);
	return rows.flatMap(row => wrapTextWithAnsi(colors.muted(row), Math.max(1, width)));
}

function detailRows(note: WorkbenchTNote, width: number): string[] {
	const report = parseCanonicalTNoteReport(note.summary);
	if (report) return [
		...(report.version === "legacy-five-field" ? [colors.muted("LEGACY · 이전 5-field Note를 읽기 전용으로 표시합니다."), ""] : []),
		...field("질문", report.question, width),
		...field("Plan", report.plan, width),
		...field("과정", report.process, width),
		...field("결론", report.conclusion, width),
		...field("Test", report.test ?? "테스트 실행 관측 없음", width),
		...sourceRows(note, width),
	];
	const legacy = parseLegacyCanonicalTNote(note.summary);
	if (legacy) return [
		colors.muted("LEGACY · 이전 3-field Note를 읽기 전용으로 표시합니다."), "",
		...field("질문", legacy.question, width),
		...field("왜", legacy.why, width),
		...field("결과", legacy.result, width),
		...sourceRows(note, width),
	];
	return [
		colors.muted("UNKNOWN · 원문은 보존했지만 알려진 Note 형식으로 해석하지 못했습니다."), "",
		...wrapTextWithAnsi(note.summary, Math.max(1, width)), "",
		...sourceRows(note, width),
	];
}

/** Pure terminal rendering for the Note browser. Stored state and selection remain caller-owned. */
export function renderTNoteBrowserView(
	state: TNoteBrowserViewModel,
	listRows: readonly string[],
	width: number,
): string[] {
	const contentWidth = Math.max(1, width);
	const status = state.status === "stale" ? colors.error(state.statusMessage) : colors.muted(state.statusMessage);
	const rows = state.mode === "detail" && state.selected
		? [colors.highlight(state.selected.title), "", ...detailRows(state.selected, contentWidth), "", colors.muted("← 목록 · Esc 목록 · ↑↓ Note 이동")]
		: [colors.highlight("완료 Note"), status, "", ...listRows, "", colors.muted("↑↓ 선택 · Enter 열기 · Esc 닫기")];
	return rows.map(row => fit(row, contentWidth));
}
