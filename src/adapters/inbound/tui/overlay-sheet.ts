import { truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";
import { colors } from "./theme";

function fit(text: string, width: number): string {
	const clipped = truncateToWidth(text, Math.max(0, width));
	return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

/** Opaque-looking bordered surface that keeps modal content visually separate. */
export class OverlaySheet implements Component {
	constructor(private readonly content: Component) {}

	invalidate(): void {
		this.content.invalidate();
	}

	render(width: number): string[] {
		if (width < 4) return this.content.render(width).map(line => fit(line, width));
		const innerWidth = width - 4;
		return [
			colors.border(`╭${"─".repeat(width - 2)}╮`),
			...this.content.render(innerWidth).map(line => `${colors.border("│")} ${fit(line, innerWidth)} ${colors.border("│")}`),
			colors.border(`╰${"─".repeat(width - 2)}╯`),
		];
	}

	handleInput(data: string): void {
		this.content.handleInput?.(data);
	}
}
