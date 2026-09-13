/** @linear WOO-689 */
import {
	HStack,
	ScrollView,
	VStack,
	truncateToWidth,
	visibleWidth,
	type Component,
} from "@earendil-works/pi-tui";
import { colors } from "../theme/theme";
import { DASHBOARD_PANEL_SYSTEM } from "./dashboard-panel-system";

export interface DashboardSection {
	title?: string;
	/** Small live value aligned to the section heading, such as the Todo revision time. */
	titleMeta?: () => string;
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
		private readonly railLabel?: () => string,
	) {}
	invalidate(): void {}
	render(width: number): string[] {
		if (this.edge === "bottom") return [colors.border(`╰${"─".repeat(Math.max(0, width - 2))}╯`)];
		const label = ` ${this.title()} `;
		const railLabel = this.railLabel?.().trim();
		const suffix = railLabel ? ` ${railLabel} ` : "";
		const available = Math.max(0, width - 3);
		const visibleLabel = truncateToWidth(label, available);
		const visibleSuffix = truncateToWidth(suffix, Math.max(0, available - visibleWidth(visibleLabel)));
		return [
			colors.border("╭─") + colors.text(visibleLabel) +
			colors.border("─".repeat(Math.max(0, width - visibleWidth(visibleLabel) - visibleWidth(visibleSuffix) - 3))) +
			colors.warm(visibleSuffix) + colors.border("╮"),
		];
	}
}

class LabeledRule implements Component {
	constructor(private readonly title: string, private readonly color: (text: string) => string) {}
	invalidate(): void {}
	render(width: number): string[] {
		if (!this.title || width <= 0) return [colors.border("─".repeat(Math.max(0, width)))];
		const label = ` ${this.title.toLocaleUpperCase("en-US")} `;
		const available = Math.max(0, width - visibleWidth(label));
		const left = Math.min(DASHBOARD_PANEL_SYSTEM.heading.preferredLeadingRule, Math.max(
			DASHBOARD_PANEL_SYSTEM.heading.minimumLeadingRule,
			Math.floor(available * 0.22),
		));
		const right = Math.max(0, available - left);
		return [fit(
			colors.border("─".repeat(left)) + this.color(label) + colors.border("─".repeat(right)),
			width,
		)];
	}
}

const sectionWithoutTitle = (section: DashboardSection): DashboardSection => ({
	...section,
	title: undefined,
	titleMeta: undefined,
});

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
		// A title meta value (for example the plan timestamp) may change while its
		// component rows stay stable, so it deliberately bypasses this row cache.
		if (!this.section.titleMeta && width === this.cachedWidth && childRows === this.cachedChildRows && this.cachedRows) return this.cachedRows;
		const sameWidth = width === this.cachedWidth;
		const previousChildRows = sameWidth ? this.cachedChildRows : null;
		const previousRows = sameWidth ? this.cachedRows : null;
		const childOffset = this.section.title ? 1 : 0;
		const rows = new Array<string>(childRows.length + childOffset);
		if (this.section.title) rows[0] = sectionHeading(this.section, width);
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

/** A compact instrument-panel heading: the rule gives the label its boundary. */
function sectionHeading(section: DashboardSection, width: number): string {
	if (!section.title || width <= 0) return "";
	const meta = section.titleMeta?.().trim() ?? "";
	const label = ` ${section.title.toLocaleUpperCase("en-US")} `;
	const minimumRule = DASHBOARD_PANEL_SYSTEM.heading.minimumLeadingRule;
	const available = Math.max(0, width - visibleWidth(label) - (meta ? visibleWidth(meta) + 1 : 0));
	const left = Math.min(DASHBOARD_PANEL_SYSTEM.heading.preferredLeadingRule, Math.max(minimumRule, Math.floor(available * 0.22)));
	const right = Math.max(0, available - left);
	return fit(
		colors.border("─".repeat(left)) + section.color(label) + colors.border("─".repeat(right)) + (meta ? ` ${colors.muted(meta)}` : ""),
		width,
	);
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
	compactScroll: ScrollView;
	usageScroll: ScrollView;
	routerScroll: ScrollView;
}

const containedScrollbar = {
	overscroll: "contain" as const,
	scrollbar: "auto" as const,
	scrollbarStyle: colors.muted,
};

export type DashboardScrollOptions = NonNullable<ConstructorParameters<typeof ScrollView>[1]>;
export type DashboardPrimaryScrollFactory = (component: Component, options: DashboardScrollOptions) => ScrollView;

interface RestorableReadingScroll {
	readingPosition(): unknown;
	restoreOnNextLayout(position: unknown): void;
}

function supportsReadingRestore(scroll: ScrollView): scroll is ScrollView & RestorableReadingScroll {
	const candidate = scroll as Partial<RestorableReadingScroll>;
	return typeof candidate.readingPosition === "function" && typeof candidate.restoreOnNextLayout === "function";
}

const createDefaultPrimaryScroll: DashboardPrimaryScrollFactory = (component, options) => new ScrollView(component, options);

/**
 * One visual frame containing three native viewport regions. Wide mode keeps
 * independent scroll state for left, right-top and right-bottom; compact mode
 * projects the same content into one ordered viewport.
 */
/** @linear WOO-689 WOO-680 */
/** @Unit Code-013 */
export function createDashboardLayout(
	title: () => string,
	left: DashboardSection,
	rightTop: DashboardSection,
	rightBottom: DashboardSection,
	topRailLabel?: () => string,
	createPrimaryScroll: DashboardPrimaryScrollFactory = createDefaultPrimaryScroll,
): DashboardLayout {
	const leftScroll = createPrimaryScroll(new SectionDocument(left), {
		follow: "end",
		primary: true,
		...containedScrollbar,
	});
	const usageScroll = new ScrollView(new SectionDocument(rightTop), {
		follow: "none",
		...containedScrollbar,
	});
	const routerScroll = new ScrollView(new SectionDocument(sectionWithoutTitle(rightBottom)), {
		follow: "none",
		...containedScrollbar,
	});
	const right = new VStack([
		// Keep the compact Todo rail intentionally lighter than the Tracer rail.
		// The allocator's minimums and integer rows make the result approximate,
		// but the target remains a 3:7 visual split.
		{ component: usageScroll, basis: 0, grow: 1, shrink: 1, minSize: 4 },
		{ component: new LabeledRule(rightBottom.title ?? "", rightBottom.color), basis: 1, minSize: 1, maxSize: 1 },
		{ component: routerScroll, basis: 0, grow: 6, shrink: 1, minSize: 3 },
	]);
	const wide = new HStack([
		{ component: new VerticalRule(), basis: 1, shrink: 0, minSize: 1, maxSize: 1 },
		{ component: leftScroll, basis: 0, grow: 3, shrink: 1, minSize: 42 },
		{ component: new VerticalRule(), basis: 1, shrink: 0, minSize: 1, maxSize: 1 },
		{ component: right, basis: 0, grow: 2, shrink: 1, minSize: 34, maxSize: 72 },
		{ component: new VerticalRule(), basis: 1, shrink: 0, minSize: 1, maxSize: 1 },
	]);
	const compactScroll = createPrimaryScroll(new CompactDocument([left, rightTop, rightBottom]), {
		follow: "end",
		primary: true,
		...containedScrollbar,
	});
	const compact = new HStack([
		{ component: new VerticalRule(), basis: 1, shrink: 0, minSize: 1, maxSize: 1 },
		{ component: compactScroll, basis: 0, grow: 1, shrink: 1, minSize: 1 },
		{ component: new VerticalRule(), basis: 1, shrink: 0, minSize: 1, maxSize: 1 },
	]);
	let activeMode: "wide" | "compact" | undefined;
	const activate = (mode: "wide" | "compact"): true => {
		if (activeMode && activeMode !== mode) {
			const source = activeMode === "wide" ? leftScroll : compactScroll;
			const target = mode === "wide" ? leftScroll : compactScroll;
			if (supportsReadingRestore(source) && supportsReadingRestore(target)) {
				target.restoreOnNextLayout(source.readingPosition());
			}
		}
		activeMode = mode;
		return true;
	};
	const body = new VStack([
		{ component: wide, basis: 0, grow: 1, shrink: 1, minSize: 1, visible: ({ width, height }) => width >= 88 && height >= 14 && activate("wide") },
		{ component: compact, basis: 0, grow: 1, shrink: 1, minSize: 1, visible: ({ width, height }) => (width < 88 || height < 14) && activate("compact") },
	]);
	return {
		component: new VStack([
			{ component: new FrameLine(title, "top", topRailLabel), basis: 1, minSize: 1, maxSize: 1 },
			{ component: body, basis: 0, grow: 1, shrink: 1, minSize: 1 },
			{ component: new FrameLine(title, "bottom"), basis: 1, minSize: 1, maxSize: 1 },
		]),
		leftScroll,
		compactScroll,
		usageScroll,
		routerScroll,
	};
}
