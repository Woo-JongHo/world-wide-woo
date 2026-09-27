import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { colors, semantic }                                from "@/adapters/inbound/tui/foundation/theme/theme";

export type DiffLineKind = "addition" | "deletion" | "context" | "hunk" | "meta" | "omitted";

export interface DiffLine {
	readonly kind : DiffLineKind ;
	readonly text : string       ;
}

/** Classifies unified diff syntax before any color is applied. */
export function classifyDiffLine(text: string): DiffLine {
	const kind = /^\+\+\+\s|^---\s/u.test(text) ? "meta"
		: /^@@/u.test(text) ? "hunk"
			: /^(?:\.\.\.|…).*diff lines omitted/iu.test(text.trim()) ? "omitted"
				: text.startsWith("+") ? "addition"
					: text.startsWith("-") ? "deletion"
						: "context";
	return Object.freeze({ kind, text });
}

/** Renders a neutral tree gutter and a width-safe semantic diff body. */
export function renderUnifiedDiff(diff: string, width: number): string[] {
	if (!diff || width <= 0) return [];
	return diff.split(/\r?\n/u).flatMap(text => renderDiffLine(classifyDiffLine(text), width));
}

function renderDiffLine(line: DiffLine, width: number): string[] {
	if (width === 1) return [colors.border("│")];
	const bodyWidth = Math.max(1, width - 2)                                               ;
	const gutter    = `${colors.border("│")} `                                             ;
	const marker    = line.kind === "addition" ? "+" : line.kind === "deletion" ? "-" : "" ;
	const source    = marker ? line.text.slice(1) : line.text                              ;
	const textWidth = Math.max(1, bodyWidth - (marker ? 1 : 0))                            ;
	const wrapped   = wrapTextWithAnsi(source, textWidth)                                  ;
	return wrapped.map((part, index) => {
		const prefix = marker && index === 0 ? marker : marker ? " " : "";
		const body   = fitBody(`${prefix}${part}`, bodyWidth);
		return `${gutter}${styleBody(line.kind, body, prefix.length)}`;
	});
}

function styleBody(kind: DiffLineKind, body: string, markerWidth: number): string {
	if (kind === "addition") {
		const marker = semantic.diffAddedMarker(body.slice(0, markerWidth));
		const text   = semantic.diffAdded(body.slice(markerWidth));
		return semantic.diffAddedSurface(`${marker}${text}`);
	}
	if (kind === "deletion") {
		const marker = semantic.diffRemovedMarker(body.slice(0, markerWidth));
		const text   = semantic.diffRemoved(body.slice(markerWidth));
		return semantic.diffRemovedSurface(`${marker}${text}`);
	}
	if (kind === "hunk") return semantic.diffHunk(body);
	if (kind === "meta") return semantic.diffMeta(body);
	if (kind === "omitted") return semantic.diffOmitted(body);
	return semantic.diffContext(body);
}

function fitBody(value: string, width: number): string {
	const clipped = truncateToWidth(value, width);
	return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}
