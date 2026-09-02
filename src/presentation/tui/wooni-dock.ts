import { truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";
import { gradientLines } from "./theme";

const WOONI_FULL = Object.freeze([
	"╭─ WOONI ─╮",
	"│≋ ●   ● ≋│  wooni@worldwide:~$",
	"╰─── ᴗ ───╯",
]);

const WOONI_COMPACT = Object.freeze([
	"╭─ WOONI ─╮",
	"│≋ ●   ● ≋│",
	"╰─── ᴗ ───╯",
]);

export const WOONI_FULL_WIDTH = Math.max(...WOONI_FULL.map(visibleWidth));
export const WOONI_COMPACT_WIDTH = Math.max(...WOONI_COMPACT.map(visibleWidth));

/** Static terminal identity: readable at rest, with the WWW diagonal palette. */
export function workbenchWooniDockFrame(compact: boolean): string[] {
	const source = compact ? WOONI_COMPACT : WOONI_FULL;
	const width = compact ? WOONI_COMPACT_WIDTH : WOONI_FULL_WIDTH;
	return gradientLines(source.map((line) => line + " ".repeat(width - visibleWidth(line))));
}

export class WooniDockView implements Component {
	public constructor(private readonly compact: boolean) {}

	public invalidate(): void {}

	public render(width: number): string[] {
		return workbenchWooniDockFrame(this.compact).map((line) => rightAligned(line, width));
	}
}

function rightAligned(text: string, width: number): string {
	const clipped = truncateToWidth(text, Math.max(0, width), "");
	return " ".repeat(Math.max(0, width - visibleWidth(clipped))) + clipped;
}
