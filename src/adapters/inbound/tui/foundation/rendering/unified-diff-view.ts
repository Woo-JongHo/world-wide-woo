import      {
              truncateToWidth     ,
              visibleWidth        ,
              wrapTextWithAnsi    ,
                                    } from "@earendil-works/pi-tui"                        ;
import      { colors, semantic      } from "@/adapters/inbound/tui/foundation/theme/theme" ;
import type { DiffFileKind, DiffRow } from "@/core/domain/execution/file-diff.js"          ;
import      { parseUnifiedDiff      } from "@/core/domain/execution/file-diff.js"          ;

export interface DiffViewOptions {
	/** Defaults to `update`; raw `add`/`delete` content is numbered from line 1 without reading `+`/`-` markers. */
	readonly fileKind?   : DiffFileKind ;
	/** Shows at most this many rows and summarizes the rest; omitted means every row. */
	readonly maxRows?    : number       ;
	/** Appended to the collapsed summary, e.g. the key that expands the card. */
	readonly expandHint? : string       ;
}

/** Renders a neutral tree gutter, line numbers and a width-safe semantic diff body. */
export function renderUnifiedDiff(diff: string, width: number, options: DiffViewOptions = {}): string[] {
	if (!diff || width <= 0) return [];
	const rows   = parseUnifiedDiff(diff, options.fileKind ?? "update")                      ;
	const shown  = options.maxRows === undefined ? rows : leadingRows(rows, options.maxRows) ;
	const hidden = contentRowCount(rows) - contentRowCount(shown)                            ;
	const digits = Math.max(0, ...rows.map(entry => String(entry.lineNumber ?? "").length))  ;
	const body   = shown.flatMap(entry => renderDiffRow(entry, width, digits))               ;
	if (hidden <= 0) return body;
	const summary = `… +${hidden} lines${options.expandHint ? ` (${options.expandHint})` : ""}`;
	return [...body, width < 3 ? colors.border("│") : `${colors.border("│")} ${semantic.diffOmitted(fitBody(summary, width - 2))}`];
}

/** Keeps the first `limit` content rows; hunk separators are display rows and never count toward the limit. */
function leadingRows(rows: readonly DiffRow[], limit: number): readonly DiffRow[] {
	const shown : DiffRow[] = [] ;
	for (const entry of rows) {
		if (contentRowCount(shown) >= limit) break;
		shown.push(entry);
	}
	return shown.at(-1)?.kind === "gap" ? shown.slice(0, -1) : shown;
}

function contentRowCount(rows: readonly DiffRow[]): number {
	return rows.filter(entry => entry.kind !== "gap").length;
}

function renderDiffRow(entry: DiffRow, width: number, digits: number): string[] {
	if (width < 3) return [colors.border("│")];
	const bodyWidth = width - 2                                                               ;
	const gutter    = `${colors.border("│")} `                                                ;
	const marker    = entry.kind === "addition" ? "+" : entry.kind === "deletion" ? "-" : " " ;
	const number    = digits ? `${String(entry.lineNumber ?? "").padStart(digits)} ` : ""     ;
	const lead      = rowLead(entry.kind, `${number}${marker}`, marker, bodyWidth)            ;
	const textWidth = Math.max(1, bodyWidth - visibleWidth(lead))                             ;
	const wrapped   = wrapTextWithAnsi(entry.kind === "gap" ? "⋮" : entry.text, textWidth)    ;
	return wrapped.map((part, index) => {
		const prefix = index === 0 ? lead : " ".repeat(visibleWidth(lead)) ;
		const text   = fitBody(part, bodyWidth - visibleWidth(prefix))     ;
		return `${gutter}${styleBody(entry.kind, prefix, text)}`;
	});
}

/** Drops the line number, then the marker, when the body would leave no column for text. */
function rowLead(kind: DiffRow["kind"], numbered: string, marker: string, bodyWidth: number): string {
	if (kind === "gap" || kind === "omitted") return "";
	if (visibleWidth(numbered) < bodyWidth) return numbered;
	return marker.length < bodyWidth ? marker : "";
}

function styleBody(kind: DiffRow["kind"], prefix: string, text: string): string {
	if (kind === "addition") return semantic.diffAddedSurface(`${semantic.diffAddedMarker(prefix)}${semantic.diffAdded(text)}`);
	if (kind === "deletion") return semantic.diffRemovedSurface(`${semantic.diffRemovedMarker(prefix)}${semantic.diffRemoved(text)}`);
	if (kind === "gap") return semantic.diffHunk(text);
	if (kind === "omitted") return semantic.diffOmitted(text);
	return `${colors.muted(prefix)}${semantic.diffContext(text)}`;
}

function fitBody(value: string, width: number): string {
	const clipped = truncateToWidth(value, width);
	return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}
