import { truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";
import { WOONI_FULL_WIDTH, WooniDockView } from "./wooni-dock";

const HUD_ROWS = 4;
const HUD_GAP = 2;
const USAGE_MINIMUM_WIDTH = 64;
const WOONI_FULL_MINIMUM_WIDTH = USAGE_MINIMUM_WIDTH + HUD_GAP + WOONI_FULL_WIDTH;

/** Four shared rows: usage on the left and the three-row Wooni identity on the right. */
export class WorkbenchBottomHudView implements Component {
	private readonly wooniFull = new WooniDockView(false);

	public constructor(private readonly usage: Component) {}

	public invalidate(): void {
		this.usage.invalidate?.();
		this.wooniFull.invalidate();
	}

	public render(width: number): string[] {
		if (width <= 0) return [];
		if (width < WOONI_FULL_MINIMUM_WIDTH) return fixedRows(this.usage.render(width), width);

		const usageWidth = width - HUD_GAP - WOONI_FULL_WIDTH;
		const usageLines = fixedRows(this.usage.render(usageWidth), usageWidth);
		const dockLines = fixedRows(this.wooniFull.render(WOONI_FULL_WIDTH), WOONI_FULL_WIDTH);
		return usageLines.map((usageLine, index) => fit(
			`${usageLine}${" ".repeat(HUD_GAP)}${dockLines[index] ?? ""}`,
			width,
		));
	}
}

function fixedRows(lines: readonly string[], width: number): string[] {
	return Array.from({ length: HUD_ROWS }, (_, index) => fit(lines[index] ?? "", width));
}

function fit(text: string, width: number): string {
	const clipped = truncateToWidth(text, Math.max(0, width), "");
	return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}
