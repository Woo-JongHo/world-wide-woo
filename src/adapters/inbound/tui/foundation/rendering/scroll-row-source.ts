import type { Component, ScrollContent, ScrollRowSource } from "@earendil-works/pi-tui";

/** Local type guard for pi-tui's optional lazy scroll-content seam. */
export function componentScrollRows(component: Component, width: number): ScrollRowSource | undefined {
	const candidate = component as Component & Partial<ScrollContent>;
	return typeof candidate.scrollRows === "function" ? candidate.scrollRows(width) : undefined;
}
