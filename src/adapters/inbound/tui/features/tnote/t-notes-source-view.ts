import { wrapTextWithAnsi }       from "@earendil-works/pi-tui";
import type { Component }         from "@earendil-works/pi-tui";
import type { WorkbenchSnapshot } from "@/core/domain/work/workbench";
import { colors }                 from "@/adapters/inbound/tui/foundation/theme/theme";
import { DEFAULT_TNOTE_DISPLAY }  from "@/core/domain/execution/workbench-config";

const OMISSION = "… 이전 완료 질문 %d개 생략 · 최근 %d개 표시 …";

/** Right-top panel containing append-only records of completed questions. */
export class TNotesSourceView implements Component {
	constructor(private readonly getSnapshot: () => WorkbenchSnapshot) {}
	invalidate(): void {}
	render(width: number): string[] {
		const snapshot        = this.getSnapshot()                                                          ;
		const rows : string[] = []                                                                          ;
		const visibleLimit    = snapshot.tnoteVisibleLimit ?? DEFAULT_TNOTE_DISPLAY.tnoteVisibleLimit       ;
		const summaryMaxChars = snapshot.tnoteSummaryMaxChars ?? DEFAULT_TNOTE_DISPLAY.tnoteSummaryMaxChars ;
		const summaryMaxLines = snapshot.tnoteSummaryMaxLines ?? DEFAULT_TNOTE_DISPLAY.tnoteSummaryMaxLines ;
		const omittedTNotes   = Math.max(0, snapshot.tnotes.length - visibleLimit)                          ;
		const visibleTNotes   = snapshot.tnotes.slice(-visibleLimit)                                        ;
		if (omittedTNotes > 0) {
			rows.push(colors.muted(OMISSION.replace("%d", String(omittedTNotes)).replace("%d", String(visibleTNotes.length))));
		}
		for (const [visibleIndex, note] of visibleTNotes.entries()) {
			const index = omittedTNotes + visibleIndex;
			rows.push(colors.highlight(`  ${index + 1}. ${note.title} · ${note.id}`));
			const summary = boundedSummary(note.summary, summaryMaxChars, summaryMaxLines);
			for (const line of summary.text.split(/\r?\n/u)) {
				rows.push(...wrapTextWithAnsi(`    ${line}`, Math.max(1, width)));
			}
			if (summary.omitted) rows.push(colors.muted(`… 긴 Report 일부 생략 · 최대 ${formatNumber(summaryMaxChars)}자 · ${summaryMaxLines}줄 …`));
			rows.push(colors.muted(`    근거 활동 ${note.sourceActivityIds.length}개`));
		}
		return rows;
	}
}

function boundedSummary(summary: string, maximumChars: number, maximumLines: number): { text: string; omitted: boolean } {
	const clipped = summary.slice(0, maximumChars)          ;
	const lines   = clipped.split(/\r?\n/u)                 ;
	const text    = lines.slice(0, maximumLines).join("\n") ;
	return { text, omitted: clipped.length < summary.length || lines.length > maximumLines };
}

function formatNumber(value: number): string {
	return value.toLocaleString("ko-KR");
}
