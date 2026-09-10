import { describe, expect, test } from "bun:test";
import { dashboardProgressCells, DASHBOARD_PANEL_SYSTEM } from "../src/adapters/inbound/tui/dashboard/dashboard-panel-system";

describe("Workbench panel system", () => {
	test("keeps the Todo and Tracer information hierarchy stable across widths", () => {
		expect(DASHBOARD_PANEL_SYSTEM.todo).toMatchObject({ title: "TODO", completed: "✓", active: "▶", pending: "○" });
		expect(DASHBOARD_PANEL_SYSTEM.tracer).toMatchObject({ title: "TRACER", flow: "FLOW", now: "NOW", health: "HEALTH" });
		for (const width of [20, 42, 80, 120]) expect(dashboardProgressCells(width)).toBeGreaterThanOrEqual(3);
		expect(dashboardProgressCells(120)).toBe(10);
	});
});
