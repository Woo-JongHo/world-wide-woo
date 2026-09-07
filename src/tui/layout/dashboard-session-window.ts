export const DASHBOARD_SESSION_WINDOW_SIZE = 10;

export interface DashboardSessionWindow {
	readonly selectedIndex: number;
	readonly start: number;
	readonly end: number;
}

/** Keeps the keyboard-selected session inside the rows rendered by Dashboard. */
export function dashboardSessionWindow(
	total: number,
	selectedIndex: number,
	windowSize = DASHBOARD_SESSION_WINDOW_SIZE,
): DashboardSessionWindow {
	const safeTotal = Number.isSafeInteger(total) && total > 0 ? total : 0;
	const safeWindowSize = Number.isSafeInteger(windowSize) && windowSize > 0 ? windowSize : DASHBOARD_SESSION_WINDOW_SIZE;
	const maximum = Math.max(0, safeTotal - 1);
	const selected = Number.isSafeInteger(selectedIndex)
		? Math.max(0, Math.min(maximum, selectedIndex))
		: 0;
	const start = Math.min(
		Math.max(0, selected - safeWindowSize + 1),
		Math.max(0, safeTotal - safeWindowSize),
	);
	return Object.freeze({ selectedIndex: selected, start, end: Math.min(safeTotal, start + safeWindowSize) });
}
