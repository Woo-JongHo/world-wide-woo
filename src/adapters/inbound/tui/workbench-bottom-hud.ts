import { truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";

/** One shared row reserved for provider quota. */
/** @Unit Code-010 */
export class WorkbenchBottomHudView implements Component {
	public constructor(private readonly usage: Component) {}

	public invalidate(): void {
		this.usage.invalidate?.();
	}

	public render(width: number): string[] {
		if (width <= 0) return [];
		const line = this.usage.render(width)[0] ?? "";
		const clipped = truncateToWidth(line, width, "");
		return [clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)))];
	}
}
