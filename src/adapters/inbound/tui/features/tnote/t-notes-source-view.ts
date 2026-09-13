import { wrapTextWithAnsi, type Component } from "@earendil-works/pi-tui";
import type { WorkbenchSnapshot } from "../../../../../core/domain/work/workbench";
import { colors } from "../../foundation/theme/theme";

const VISIBLE_LIMIT = 20;
const SUMMARY_MAX_CHARS = 2 * 1024;
const SUMMARY_MAX_LINES = 24;
const OMISSION = "… 이전 T-note %d개 생략 · 최근 %d개 표시 …";
const SUMMARY_OMISSION = "… T-note 요약 일부 생략 …";

/** Right-top panel containing append-only records of completed questions. */
export class TNotesSourceView implements Component {
	constructor(private readonly getSnapshot: () => WorkbenchSnapshot) {}
	invalidate(): void {}
	render(width: number): string[] {
		const snapshot = this.getSnapshot();
		const rows: string[] = [];
		const visibleLimit = snapshot.tnoteVisibleLimit ?? VISIBLE_LIMIT;
		const omittedTNotes = Math.max(0, snapshot.tnotes.length - visibleLimit);
		const visibleTNotes = snapshot.tnotes.slice(-visibleLimit);
		if (omittedTNotes > 0) {
			rows.push(colors.muted(OMISSION.replace("%d", String(omittedTNotes)).replace("%d", String(visibleTNotes.length))));
		}
		for (const [visibleIndex, note] of visibleTNotes.entries()) {
			const index = omittedTNotes + visibleIndex;
			rows.push(colors.highlight(`  ${index + 1}. ${note.title} · ${note.id}`));
			const summary = boundedSummary(note.summary);
			for (const line of summary.text.split(/\r?\n/u)) {
				rows.push(...wrapTextWithAnsi(`    ${line}`, Math.max(1, width)));
			}
			if (summary.omitted) rows.push(colors.muted(SUMMARY_OMISSION));
			rows.push(colors.muted(`    근거 활동 ${note.sourceActivityIds.length}개`));
		}
		return rows;
	}
}

function boundedSummary(summary: string): { text: string; omitted: boolean } {
	const clipped = summary.slice(0, SUMMARY_MAX_CHARS);
	const lines = clipped.split(/\r?\n/u);
	const text = lines.slice(0, SUMMARY_MAX_LINES).join("\n");
	return { text, omitted: clipped.length < summary.length || lines.length > SUMMARY_MAX_LINES };
}
