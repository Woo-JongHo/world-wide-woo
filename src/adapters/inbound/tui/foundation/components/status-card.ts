import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { a, fit, mark, prose, safe }     from "@/adapters/inbound/tui/foundation/theme/www-theme";
import { semantic }                      from "@/adapters/inbound/tui/foundation/theme/theme";

const labels: Readonly<Record<string, string>> = {
	pending: "", running: "", completed: "", skipped: "생략",
	failed: "실패", blocked: "확인 필요", cancelled: "중단",
};

/** A bounded terminal card. Only an observed completed state receives the success fill. */
export function statusCardRows(title: string, status: string, requestedWidth: number): string[] {
	const width   = Math.max(0, Math.floor(requestedWidth))        ;
	const label   = labels[status] ?? "대기"                       ;
	const compact = status === "running" || status === "completed" ;
	const ink = status === "completed" ? a.success : status === "running" ? a.active
		: status === "failed" || status === "blocked" ? a.failure : a.muted;
	if (width < 6) return prose(ink([label, safe(title)].filter(Boolean).join(" ")), width);
	const inner   = compact ? width - 2 : width - 4                                                  ;
	const heading = label ? truncateToWidth(` ${label} `, width - 2, "", false) : ""                 ;
	const top     = ink(`╭${heading}${"─".repeat(Math.max(0, width - 2 - visibleWidth(heading)))}╮`) ;
	const body = prose(safe(title), inner).map(line => {
		const padded = compact
			? `${line}${" ".repeat(Math.max(0, inner - visibleWidth(line)))}`
			: ` ${line}${" ".repeat(Math.max(0, inner - visibleWidth(line)))} `;
		const content = status === "completed" ? semantic.executionSurfacePassed(padded) : a.text(padded);
		return `${ink("│")}${content}${ink("│")}`;
	});
	return [top, ...body, ink(`╰${"─".repeat(width - 2)}╯`)];
}

/** Compact terminal typography for Plan surfaces; terminal cells do not expose point sizes.
 * A bounded wrap keeps the scan fast; the `…` tail marks a kept-in-full source, not a loss. */
export function compactStatusRows(title: string, status: string, requestedWidth: number, maximumLines = 2): string[] {
	const width        = Math.max(0, Math.floor(requestedWidth))     ;
	const contentWidth = Math.max(1, width - 2)                      ;
	const wrapped      = prose(safe(title), contentWidth)            ;
	const bounded      = wrapped.slice(0, Math.max(1, maximumLines)) ;
	if (wrapped.length > bounded.length && bounded.length) bounded[bounded.length - 1] = withContinuationMark(bounded[bounded.length - 1]!, contentWidth);
	const lines        = bounded.length && bounded[0] !== "" ? bounded : [a.muted("—")]   ;
	return lines.map((line, index) => fit(`${index === 0 ? mark(status) : " "} ${a.muted(line)}`, width));
}

/** The wrapped lines are plain text, so one visible column is freed for the marker. */
function withContinuationMark(line: string, maxWidth: number): string {
	let characters = Array.from(line);
	while (characters.length && visibleWidth(characters.join("")) + 1 > maxWidth) characters = characters.slice(0, -1);
	return `${characters.join("")}…`;
}
