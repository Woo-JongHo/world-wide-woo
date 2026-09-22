import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { a, prose, safe } from "../theme/astra-theme";
import { semantic } from "../theme/theme";

const labels: Readonly<Record<string, string>> = {
	pending: "", running: "", completed: "", skipped: "생략",
	failed: "실패", blocked: "확인 필요", cancelled: "중단",
};

/** A bounded terminal card. Only an observed completed state receives the success fill. */
export function statusCardRows(title: string, status: string, requestedWidth: number): string[] {
	const width = Math.max(0, Math.floor(requestedWidth));
	const label = labels[status] ?? "대기";
	const compact = status === "running" || status === "completed";
	const ink = status === "completed" ? a.success : status === "running" ? a.active
		: status === "failed" || status === "blocked" ? a.failure : a.muted;
	if (width < 6) return prose(ink([label, safe(title)].filter(Boolean).join(" ")), width);
	const inner = compact ? width - 2 : width - 4;
	const heading = label ? truncateToWidth(` ${label} `, width - 2, "", false) : "";
	const top = ink(`╭${heading}${"─".repeat(Math.max(0, width - 2 - visibleWidth(heading)))}╮`);
	const body = prose(safe(title), inner).map(line => {
		const padded = compact
			? `${line}${" ".repeat(Math.max(0, inner - visibleWidth(line)))}`
			: ` ${line}${" ".repeat(Math.max(0, inner - visibleWidth(line)))} `;
		const content = status === "completed" ? semantic.executionSurfacePassed(padded) : a.text(padded);
		return `${ink("│")}${content}${ink("│")}`;
	});
	return [top, ...body, ink(`╰${"─".repeat(width - 2)}╯`)];
}
