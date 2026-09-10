/**
 * Shared visual contract for the Workbench side panels. It defines information
 * hierarchy, rather than decorating individual views ad hoc.
 */
export const DASHBOARD_PANEL_SYSTEM = Object.freeze({
	heading: Object.freeze({ minimumLeadingRule: 3, preferredLeadingRule: 8 }),
	todo: Object.freeze({ title: "TODO", progressCells: 10, completed: "✓", active: "▶", pending: "○", blocked: "◆" }),
	tracer: Object.freeze({ title: "TRACER", flow: "FLOW", now: "NOW", health: "HEALTH" }),
});

export function dashboardProgressCells(width: number): number {
	return Math.max(3, Math.min(DASHBOARD_PANEL_SYSTEM.todo.progressCells, Math.floor(Math.max(10, width - 8) / 2)));
}
