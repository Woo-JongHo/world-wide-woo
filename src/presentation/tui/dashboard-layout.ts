import {
	HStack,
	ScrollView,
	VStack,
	truncateToWidth,
	visibleWidth,
	type Component,
} from "@earendil-works/pi-tui";
import { colors } from "./theme";

export interface DashboardSection {
	title: string;
	color: (text: string) => string;
	component: Component;
}

function fit(text: string, width: number): string {
	if (width <= 0) return "";
	const clipped = truncateToWidth(text, width);
	return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

class FrameLine implements Component {
	constructor(
		private readonly title: () => string,
		private readonly edge: "top" | "bottom",
	) {}
	invalidate(): void {}
	render(width: number): string[] {
		if (this.edge === "bottom") return [colors.border(`╰${"─".repeat(Math.max(0, width - 2))}╯`)];
		const label = ` ${this.title()} `;
		return [
			colors.border("╭─") + colors.text(truncateToWidth(label, Math.max(0, width - 3))) +
			colors.border(`${"─".repeat(Math.max(0, width - visibleWidth(label) - 3))}╮`),
		];
	}
}

class HorizontalRule implements Component {
	invalidate(): void {}
	render(width: number): string[] {
		return [colors.border("─".repeat(Math.max(0, width)))];
	}
}

class VerticalRule implements Component {
	private readonly rows = Array.from({ length: 512 }, () => colors.border("│"));
	invalidate(): void {}
	render(): string[] {
		return this.rows;
	}
}

class SectionDocument implements Component {
	constructor(private readonly section: DashboardSection) {}
	invalidate(): void {
		this.section.component.invalidate();
	}
	render(width: number): string[] {
		return [
			fit(` ${this.section.color(this.section.title)}`, width),
			...this.section.component.render(Math.max(1, width - 2)).map((line) => ` ${fit(line, Math.max(1, width - 2))} `),
		];
	}
}

class CompactDocument implements Component {
	constructor(private readonly sections: readonly DashboardSection[]) {}
	invalidate(): void {
		for (const section of this.sections) section.component.invalidate();
	}
	render(width: number): string[] {
		const rows: string[] = [];
		for (const [index, section] of this.sections.entries()) {
			if (index > 0) rows.push(colors.border("─".repeat(Math.max(0, width))));
			rows.push(...new SectionDocument(section).render(width));
		}
		return rows;
	}
}

export interface DashboardLayout {
	component: Component;
	leftScroll: ScrollView;
	usageScroll: ScrollView;
	routerScroll: ScrollView;
}

/**
 * One visual frame containing three native viewport regions. Wide mode keeps
 * independent scroll state for left, right-top and right-bottom; compact mode
 * projects the same content into one ordered viewport.
 */
export function createDashboardLayout(
	title: () => string,
	left: DashboardSection,
	rightTop: DashboardSection,
	rightBottom: DashboardSection,
): DashboardLayout {
	const leftScroll = new ScrollView(new SectionDocument(left), {
		follow: "end",
		primary: true,
		overscroll: "contain",
		scrollbar: "auto",
		scrollbarStyle: colors.muted,
	});
	const usageScroll = new ScrollView(new SectionDocument(rightTop), {
		follow: "none",
		overscroll: "contain",
		scrollbar: "auto",
		scrollbarStyle: colors.muted,
	});
	const routerScroll = new ScrollView(new SectionDocument(rightBottom), {
		follow: "none",
		overscroll: "contain",
		scrollbar: "auto",
		scrollbarStyle: colors.muted,
	});
	const right = new VStack([
		{ component: usageScroll, basis: 0, grow: 1, shrink: 1, minSize: 3 },
		{ component: new HorizontalRule(), basis: 1, minSize: 1, maxSize: 1 },
		{ component: routerScroll, basis: 0, grow: 1, shrink: 1, minSize: 3 },
	]);
	const wide = new HStack([
		{ component: new VerticalRule(), basis: 1, shrink: 0, minSize: 1, maxSize: 1 },
		{ component: leftScroll, basis: 0, grow: 3, shrink: 1, minSize: 42 },
		{ component: new VerticalRule(), basis: 1, shrink: 0, minSize: 1, maxSize: 1 },
		{ component: right, basis: 0, grow: 2, shrink: 1, minSize: 34, maxSize: 58 },
		{ component: new VerticalRule(), basis: 1, shrink: 0, minSize: 1, maxSize: 1 },
	]);
	const compactScroll = new ScrollView(new CompactDocument([left, rightTop, rightBottom]), {
		follow: "end",
		primary: true,
		overscroll: "contain",
		scrollbar: "auto",
		scrollbarStyle: colors.muted,
	});
	const compact = new HStack([
		{ component: new VerticalRule(), basis: 1, shrink: 0, minSize: 1, maxSize: 1 },
		{ component: compactScroll, basis: 0, grow: 1, shrink: 1, minSize: 1 },
		{ component: new VerticalRule(), basis: 1, shrink: 0, minSize: 1, maxSize: 1 },
	]);
	const body = new VStack([
		{ component: wide, basis: 0, grow: 1, shrink: 1, minSize: 1, visible: ({ width, height }) => width >= 88 && height >= 14 },
		{ component: compact, basis: 0, grow: 1, shrink: 1, minSize: 1, visible: ({ width, height }) => width < 88 || height < 14 },
	]);
	return {
		component: new VStack([
			{ component: new FrameLine(title, "top"), basis: 1, minSize: 1, maxSize: 1 },
			{ component: body, basis: 0, grow: 1, shrink: 1, minSize: 1 },
			{ component: new FrameLine(title, "bottom"), basis: 1, minSize: 1, maxSize: 1 },
		]),
		leftScroll,
		usageScroll,
		routerScroll,
	};
}
