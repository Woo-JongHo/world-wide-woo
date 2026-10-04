export type DiffLineKind = "addition" | "deletion" | "context" | "hunk" | "meta" | "omitted";

/** How the native change describes the file: `add`/`delete` carry raw file content, `update` a unified diff. */
export type DiffFileKind = "add" | "delete" | "update";

export interface DiffLine {
	readonly kind : DiffLineKind ;
	readonly text : string       ;
}

/** One diff row in reading order. `lineNumber` is the new-file line for additions and context, the old-file line for deletions. */
export interface DiffRow {
	readonly kind       : "addition" | "deletion" | "context" | "gap" | "omitted" ;
	readonly lineNumber : number | null                                           ;
	readonly text       : string                                                  ;
}

/** Classifies unified diff syntax before any color is applied. */
export function classifyDiffLine(text: string): DiffLine {
	const kind = /^\+\+\+\s|^---\s/u.test(text) ? "meta"
		: /^@@/u.test(text) ? "hunk"
			: /^(?:\.\.\.|…).*diff lines omitted/iu.test(text) ? "omitted"
				: text.startsWith("+") ? "addition"
					: text.startsWith("-") ? "deletion"
						: "context";
	return Object.freeze({ kind, text });
}

/** Counts added and removed lines the same way the rows are numbered. */
export function diffStats(diff: string, fileKind: DiffFileKind = "update"): { readonly added: number; readonly removed: number } {
	const rows = parseUnifiedDiff(diff, fileKind);
	return Object.freeze({
		added   : rows.filter(row => row.kind === "addition").length,
		removed : rows.filter(row => row.kind === "deletion").length,
	});
}

/**
 * Turns a native diff into numbered rows. File headers count only outside a hunk, so a body line such as
 * `--- title` stays a deletion. Numbers become unknown (`null`) after an omission or a hunk without ranges.
 * Input contract: the diff of one file, as a native `fileChange` entry carries it. Several files are
 * separated only by `diff --git`; without it a range-less hunk cannot tell the next file header from body.
 * An omission marker (`… N diff lines omitted`) is recognized only at column 0, never inside a context row.
 */
export function parseUnifiedDiff(diff: string, fileKind: DiffFileKind = "update"): readonly DiffRow[] {
	if (!diff) return [];
	const lines = diff.replace(/\r?\n$/u, "").split(/\r?\n/u);
	if (fileKind !== "update") return lines.map((text, index) => row(fileKind === "add" ? "addition" : "deletion", index + 1, text));
	const rows   : DiffRow[]         = []   ;
	let   cursor : HunkCursor | null = null ;
	for (const text of lines) {
		const anchor = /^@@/u.test(text) ? hunkAnchor(text) : undefined;
		if (anchor !== undefined) {
			if (rows.length > 0) rows.push(row("gap", null, ""));
			cursor = anchor;
			continue;
		}
		if (/^diff --git /u.test(text)) {
			cursor = null;
			continue;
		}
		if (text.startsWith("\\")) continue;
		if (classifyDiffLine(text).kind === "omitted") {
			rows.push(row("omitted", null, text));
			cursor = UNKNOWN_POSITION;
			continue;
		}
		if (cursor === null && FILE_HEADER.test(text)) continue;
		cursor = consumeBodyLine(cursor ?? UNKNOWN_POSITION, text, rows);
		if (cursor.oldLeft === 0 && cursor.newLeft === 0) cursor = null;
	}
	return rows;
}

/** Remaining position of the open hunk; `null` counts mean the hunk end is unknown. */
interface HunkCursor {
	readonly oldLine : number | null ;
	readonly newLine : number | null ;
	readonly oldLeft : number | null ;
	readonly newLeft : number | null ;
}

const UNKNOWN_POSITION : HunkCursor = Object.freeze({ oldLine: null, newLine: null, oldLeft: null, newLeft: null })                                      ;
const FILE_HEADER      : RegExp     = /^(?:--- |\+\+\+ |index |new file mode|deleted file mode|old mode|new mode|similarity index|rename (?:from|to) )/u ;

function hunkAnchor(text: string): HunkCursor {
	const range = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/u.exec(text);
	if (!range) return UNKNOWN_POSITION;
	return {
		oldLine : Number(range[1]),
		newLine : Number(range[3]),
		oldLeft : Number(range[2] ?? 1),
		newLeft : Number(range[4] ?? 1),
	};
}

function consumeBodyLine(cursor: HunkCursor, text: string, rows: DiffRow[]): HunkCursor {
	if (text.startsWith("-")) {
		rows.push(row("deletion", cursor.oldLine, text.slice(1)));
		return { ...cursor, oldLine: nextLine(cursor.oldLine), oldLeft: remaining(cursor.oldLeft) };
	}
	if (text.startsWith("+")) {
		rows.push(row("addition", cursor.newLine, text.slice(1)));
		return { ...cursor, newLine: nextLine(cursor.newLine), newLeft: remaining(cursor.newLeft) };
	}
	rows.push(row("context", cursor.newLine, text.startsWith(" ") ? text.slice(1) : text));
	return {
		oldLine : nextLine(cursor.oldLine),
		newLine : nextLine(cursor.newLine),
		oldLeft : remaining(cursor.oldLeft),
		newLeft : remaining(cursor.newLeft),
	};
}

function row(kind: DiffRow["kind"], lineNumber: number | null, text: string): DiffRow {
	return Object.freeze({ kind, lineNumber, text });
}

function nextLine(line: number | null): number | null {
	return line === null ? null : line + 1;
}

function remaining(left: number | null): number | null {
	return left === null ? null : Math.max(0, left - 1);
}
