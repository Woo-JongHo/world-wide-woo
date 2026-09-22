import { a, fit, oneLine, pair, type AstraInk } from "../theme/astra-theme";
import { visibleWidth } from "@earendil-works/pi-tui";

export interface MonitoringCard {
	readonly title: string;
	readonly value: string;
	readonly detail: string;
}

/** A reusable terminal-native container for bounded monitoring content. */
export interface MonitoringPanel {
	readonly title: string;
	/** Kept for the original two-argument panel API. */
	readonly rows?: readonly string[];
	readonly meta?: string;
	readonly ink?: AstraInk;
}

/** A table-like projection. Empty data stays explicitly unobserved. */
export interface MonitoringMatrix {
	readonly columns: readonly string[];
	readonly rows: readonly (readonly string[])[];
	readonly emptyLabel?: string;
}

export interface MonitoringFlowStep {
	readonly label: string;
	readonly detail?: string;
	readonly ink?: AstraInk;
}

export interface MonitoringQueueItem {
	readonly label: string;
	readonly state?: string;
	readonly detail?: string;
	readonly ink?: AstraInk;
}

export interface MonitoringDiagnostic {
	readonly label: string;
	readonly value: string;
	readonly ink?: AstraInk;
}

function paneWidth(width: number): number { return Math.max(1, Math.floor(width)); }
function panelCell(value: string, width: number): string {
	const clipped = fit(value.replace(/\s+/gu, " "), width);
	return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}
function cell(value: string, width: number): string { return fit(value.replace(/\s+/gu, " "), Math.max(1, width)); }

/**
 * Wraps a fixed amount of already-bounded content in an explicit titled panel.
 * The container intentionally does not synthesize a status, value, or empty-state.
 */
export function monitoringPanel(panel: MonitoringPanel, width: number): string[];
export function monitoringPanel(panel: MonitoringPanel, rows: readonly string[], width: number): string[];
export function monitoringPanel(panel: MonitoringPanel, rowsOrWidth: readonly string[] | number, suppliedWidth?: number): string[] {
	const rows = typeof rowsOrWidth === "number" ? panel.rows ?? [] : rowsOrWidth;
	const width = typeof rowsOrWidth === "number" ? rowsOrWidth : suppliedWidth ?? 1;
	const outer = paneWidth(width);
	if (outer < 3) return rows.map(row => fit(row, outer));
	const inner = outer - 2;
	const title = panel.ink?.(oneLine(panel.title)) ?? a.strong(oneLine(panel.title));
	const meta = panel.meta ? `${a.muted(" · ")}${a.muted(oneLine(panel.meta))}` : "";
	const header = visibleWidth(title) + visibleWidth(meta) <= inner ? `${title}${meta}` : title;
	return [
		a.rule(`┌${"─".repeat(inner)}┐`),
		`${a.rule("│")}${panelCell(header, inner)}${a.rule("│")}`,
		a.rule(`├${"─".repeat(inner)}┤`),
		...rows.map(row => `${a.rule("│")}${panelCell(row, inner)}${a.rule("│")}`),
		a.rule(`└${"─".repeat(inner)}┘`),
	];
}

/** Makes unavailable data a first-class panel instead of a fabricated zero-value chart. */
export function monitoringUnavailablePanel(title: string, reason: string, width: number, meta = "unavailable"): string[] {
	return monitoringPanel({ title, meta, ink: a.muted }, [a.muted("미관측"), a.caption(oneLine(reason))], width);
}

/** A bounded matrix. It renders only supplied rows and marks an empty source as unobserved. */
export function monitoringMatrix(matrix: MonitoringMatrix, width: number, maxRows = 8): string[] {
	const outer = paneWidth(width);
	if (!matrix.rows.length || !matrix.columns.length) return [a.muted(matrix.emptyLabel ?? "matrix data 미관측")];
	const columnCount = matrix.columns.length;
	const widths = monitoringWidths(outer, columnCount);
	const line = (values: readonly string[], ink?: AstraInk): string => values
		.map((value, index) => {
			const text = oneLine(value);
			return cell(ink?.(text) ?? text, widths[index] ?? 1);
		})
		.join(" ");
	const limit = Math.max(1, Math.floor(maxRows));
	const visible = matrix.rows.slice(0, limit);
	const rows = [line(matrix.columns, a.muted), a.rule("─".repeat(outer))];
	for (const row of visible) rows.push(line(matrix.columns.map((_, index) => row[index] ?? "—")));
	if (matrix.rows.length > visible.length) rows.push(a.muted(`… ${matrix.rows.length - visible.length} additional rows not shown`));
	return rows.map(row => fit(row, outer));
}

/** A compact, bounded handoff flow for known stages only. */
export function monitoringFlow(steps: readonly MonitoringFlowStep[], width: number, maxSteps = 6): string[] {
	const outer = paneWidth(width);
	if (!steps.length) return [a.muted("flow data 미관측")];
	const visible = steps.slice(0, Math.max(1, Math.floor(maxSteps)));
	const summary = visible.map((step, index) => `${step.ink?.(String(index + 1)) ?? a.muted(String(index + 1))} ${step.ink?.(oneLine(step.label)) ?? oneLine(step.label)}`).join(a.rule("  →  "));
	const details = visible.flatMap(step => step.detail ? [a.muted(`· ${oneLine(step.label)}  ${oneLine(step.detail)}`)] : []);
	if (steps.length > visible.length) details.push(a.muted(`… ${steps.length - visible.length} additional steps not shown`));
	return [fit(summary, outer), ...details.map(row => fit(row, outer))];
}

/** A bounded queue that distinguishes an actually empty queue from unavailable telemetry. */
export function monitoringQueue(items: readonly MonitoringQueueItem[], width: number, maxItems = 8): string[] {
	const outer = paneWidth(width);
	if (!items.length) return [a.muted("queue empty")];
	const visible = items.slice(0, Math.max(1, Math.floor(maxItems)));
	const rows = visible.map((item, index) => {
		const left = `${item.ink?.("›") ?? a.muted("›")} ${index + 1}. ${oneLine(item.label)}`;
		const right = [item.state, item.detail].filter((value): value is string => Boolean(value)).map(oneLine).join(" · ");
		return pair(left, a.muted(right), outer);
	});
	if (items.length > visible.length) rows.push(a.muted(`… ${items.length - visible.length} additional items not shown`));
	return rows.map(row => fit(row, outer));
}

/** A bounded diagnostic list; absent diagnostics remain unobserved rather than green. */
export function monitoringDiagnostics(entries: readonly MonitoringDiagnostic[], width: number, maxEntries = 8): string[] {
	const outer = paneWidth(width);
	if (!entries.length) return [a.muted("diagnostic data 미관측")];
	const visible = entries.slice(0, Math.max(1, Math.floor(maxEntries)));
	const rows = visible.map(entry => pair(entry.ink?.(oneLine(entry.label)) ?? oneLine(entry.label), oneLine(entry.value), outer));
	if (entries.length > visible.length) rows.push(a.muted(`… ${entries.length - visible.length} additional diagnostics not shown`));
	return rows.map(row => fit(row, outer));
}

/** Distribute terminal cells without losing remainder columns. */
export function monitoringWidths(width: number, count: number, gap = 1): number[] {
	const available = Math.max(count, width - gap * (count - 1));
	const base = Math.floor(available / count);
	return Array.from({ length: count }, (_, index) => base + (index < available % count ? 1 : 0));
}

/** A five-row native terminal card matching the Figma summary hierarchy. */
export function monitoringCard(card: MonitoringCard, width: number): string[] {
	const inner = Math.max(1, width - 2);
	return [
		a.rule(`┌${"─".repeat(inner)}┐`),
		`${a.rule("│")}${fit(` ${a.muted(card.title.toLocaleUpperCase("en-US"))}`, inner)}${a.rule("│")}`,
		`${a.rule("│")}${fit(` ${a.strong(card.value)}`, inner)}${a.rule("│")}`,
		`${a.rule("│")}${fit(` ${a.caption(card.detail)}`, inner)}${a.rule("│")}`,
		a.rule(`└${"─".repeat(inner)}┘`),
	];
}

export function monitoringColumns(cards: readonly string[][], widths: readonly number[]): string[] {
	const height = Math.max(0, ...cards.map(card => card.length));
	return Array.from({ length: height }, (_, row) => cards
		.map((card, index) => fit(card[row] ?? "", widths[index] ?? 0))
		.join(" "));
}

/** Shared bordered analysis panel for the Figma monitoring lower workspace. */
export function monitoringMeter(value: number, total: number, width: number, ink: AstraInk = a.active): string {
	const cells = Math.max(4, width);
	const ratio = total > 0 ? Math.max(0, Math.min(1, value / total)) : 0;
	const filled = Math.round(cells * ratio);
	return ink("█".repeat(filled)) + a.rule("░".repeat(cells - filled));
}
