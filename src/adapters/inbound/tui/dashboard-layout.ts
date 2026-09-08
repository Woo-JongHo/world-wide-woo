/** @linear WOO-689 */
import {
	HStack,
	ScrollView,
	VStack,
	truncateToWidth,
	visibleWidth,
	stripTerminalSequences,
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
	compactScroll: ScrollView;
	usageScroll: ScrollView;
	routerScroll: ScrollView;
}

const containedScrollbar = {
	overscroll: "contain" as const,
	scrollbar: "auto" as const,
	scrollbarStyle: colors.muted,
};

type ReadingPosition =
	| { follow: true }
	| { follow: false; fraction: number; anchor: string };

function normalizedRow(row: string): string {
	return stripTerminalSequences(row).replace(/\s/gu, "");
}

/** @Unit Code-003 */
/** @codeId 0003 */
class ChatScrollView extends ScrollView {
	private observedContentHeight = 0;
	private renderedRows: string[] = [];
	private pendingPosition: ReadingPosition | undefined;
	private renderedWidth: number | undefined;

	readingPosition(): ReadingPosition {
		if (this.isFollowingEnd) return { follow: true };
		return {
			follow: false,
			anchor: this.renderedRows.slice(this.scrollTop, this.scrollTop + 4).map(normalizedRow).join("").slice(0, 80),
			fraction: this.observedContentHeight <= 1 ? 0 : this.scrollTop / (this.observedContentHeight - 1),
		};
	}

	restoreOnNextLayout(position: ReadingPosition): void {
		this.pendingPosition = position;
	}

	override render(width: number): string[] {
		if (this.renderedWidth !== undefined && this.renderedWidth !== width && !this.pendingPosition) {
			this.pendingPosition = this.readingPosition();
		}
		this.renderedWidth = width;
		const rows = super.render(width);
		this.renderedRows = rows;
		return rows;
	}

	override updateLayout(contentHeight: number, viewportHeight: number, requestRender: () => void): void {
		this.observedContentHeight = contentHeight;
		super.updateLayout(contentHeight, viewportHeight, requestRender);
		const pending = this.pendingPosition;
		if (!pending) return;
		this.pendingPosition = undefined;
		if (pending.follow) {
			this.scrollToEnd();
			return;
		}
		const normalized = this.renderedRows.map(normalizedRow);
		const joined = normalized.join("");
		let target = Math.round(pending.fraction * Math.max(0, contentHeight - 1));
		for (let length = pending.anchor.length; length >= 16; length -= 8) {
			const offset = joined.indexOf(pending.anchor.slice(0, length));
			if (offset < 0) continue;
			let consumed = 0;
			target = normalized.findIndex(row => { consumed += row.length; return consumed > offset; });
			break;
		}
		this.scrollTo(target, { disableFollow: true });
	}
}

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
): DashboardLayout {
	const leftScroll = new ChatScrollView(new SectionDocument(left), {
		follow: "end",
		primary: true,
		...containedScrollbar,
	});
	const usageScroll = new ScrollView(new SectionDocument(rightTop), {
		follow: "none",
		...containedScrollbar,
	});
	const routerScroll = new ScrollView(new SectionDocument(rightBottom), {
		follow: "none",
		...containedScrollbar,
	});
	const right = new VStack([
		// The stack allocator distributes its remaining rows sequentially; 3:5
		// weights compensate for that bias and yield equal visible viewports.
		{ component: usageScroll, basis: 0, grow: 3, shrink: 1, minSize: 4 },
		{ component: new HorizontalRule(), basis: 1, minSize: 1, maxSize: 1 },
		{ component: routerScroll, basis: 0, grow: 5, shrink: 1, minSize: 3 },
	]);
	const wide = new HStack([
		{ component: new VerticalRule(), basis: 1, shrink: 0, minSize: 1, maxSize: 1 },
		{ component: leftScroll, basis: 0, grow: 3, shrink: 1, minSize: 42 },
		{ component: new VerticalRule(), basis: 1, shrink: 0, minSize: 1, maxSize: 1 },
		{ component: right, basis: 0, grow: 2, shrink: 1, minSize: 34, maxSize: 72 },
		{ component: new VerticalRule(), basis: 1, shrink: 0, minSize: 1, maxSize: 1 },
	]);
	const compactScroll = new ChatScrollView(new CompactDocument([left, rightTop, rightBottom]), {
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
			target.restoreOnNextLayout(source.readingPosition());
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
			{ component: new FrameLine(title, "top"), basis: 1, minSize: 1, maxSize: 1 },
			{ component: body, basis: 0, grow: 1, shrink: 1, minSize: 1 },
			{ component: new FrameLine(title, "bottom"), basis: 1, minSize: 1, maxSize: 1 },
		]),
		leftScroll,
		compactScroll,
		usageScroll,
		routerScroll,
	};
}
