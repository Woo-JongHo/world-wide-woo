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
	title?: string;
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
	private cachedWidth = -1;
	private cachedChildRows: string[] | null = null;
	private cachedRows: string[] | null = null;
	constructor(private readonly section: DashboardSection) {}
	invalidate(): void {
		this.section.component.invalidate();
		this.cachedWidth = -1;
		this.cachedChildRows = null;
		this.cachedRows = null;
	}
	render(width: number): string[] {
		const contentWidth = Math.max(1, width - 2);
		const childRows = this.section.component.render(contentWidth);
		if (width === this.cachedWidth && childRows === this.cachedChildRows && this.cachedRows) return this.cachedRows;
		const sameWidth = width === this.cachedWidth;
		const previousChildRows = sameWidth ? this.cachedChildRows : null;
		const previousRows = sameWidth ? this.cachedRows : null;
		const childOffset = this.section.title ? 1 : 0;
		const rows = new Array<string>(childRows.length + childOffset);
		if (this.section.title) rows[0] = previousRows?.[0] ?? fit(` ${this.section.color(this.section.title)}`, width);
		for (let index = 0; index < childRows.length; index += 1) {
			const rowIndex = index + childOffset;
			rows[rowIndex] = previousChildRows?.[index] === childRows[index] && previousRows?.[rowIndex]
				? previousRows[rowIndex]
				: ` ${fit(childRows[index]!, contentWidth)} `;
		}
		this.cachedWidth = width;
		this.cachedChildRows = childRows;
		this.cachedRows = rows;
		return rows;
	}
}

class CompactDocument implements Component {
	private readonly documents: readonly SectionDocument[];
	private cachedWidth = -1;
	private cachedSections: readonly string[][] = [];
	private cachedRows: string[] | null = null;
	constructor(sections: readonly DashboardSection[]) {
		this.documents = sections.map(section => new SectionDocument(section));
	}
	invalidate(): void {
		for (const document of this.documents) document.invalidate();
		this.cachedWidth = -1;
		this.cachedSections = [];
		this.cachedRows = null;
	}
	render(width: number): string[] {
		const sections = this.documents.map(document => document.render(width));
		if (
			width === this.cachedWidth &&
			this.cachedRows &&
			sections.every((section, index) => section === this.cachedSections[index])
		) return this.cachedRows;
		const rows: string[] = [];
		for (const [index, section] of sections.entries()) {
			if (index > 0) rows.push(colors.border("─".repeat(Math.max(0, width))));
			rows.push(...section);
		}
		this.cachedWidth = width;
		this.cachedSections = sections;
		this.cachedRows = rows;
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
