import { ScrollView, stripTerminalSequences, type Component, type ScrollRowSource, type ScrollViewOptions } from "@earendil-works/pi-tui";
import type {
	DashboardPrimaryScrollFactory,
	DashboardScrollOptions,
} from "../../foundation/layout/dashboard-layout";
import { componentScrollRows } from "../../foundation/rendering/scroll-row-source";

type ReadingPosition =
	| { follow: true }
	| { follow: false; fraction: number; anchor: string };

function normalizedRow(row: string): string {
	return stripTerminalSequences(row).replace(/\s/gu, "");
}

/** Preserves the reader's chat anchor across wrapping and layout-mode changes. */
/** @Unit Code-003 */
/** @codeId 0003 */
export class ChatScrollView extends ScrollView {
	private observedContentHeight = 0;
	private renderedRows: string[] = [];
	private logicalRows: ScrollRowSource | undefined;
	private pendingPosition: ReadingPosition | undefined;
	private renderedWidth: number | undefined;
	constructor(private readonly content: Component, options: ScrollViewOptions = {}) {
		super(content, options);
	}

	readingPosition(): ReadingPosition {
		if (this.isFollowingEnd) return { follow: true };
		const available = Math.max(0, Math.min(4, (this.logicalRows?.rowCount ?? this.renderedRows.length) - this.scrollTop));
		const rows = this.logicalRows ? this.logicalRows.rows(this.scrollTop, available) : this.renderedRows.slice(this.scrollTop, this.scrollTop + 4);
		return {
			follow: false,
			anchor: rows.map(normalizedRow).join("").slice(0, 80),
			fraction: this.observedContentHeight <= 1 ? 0 : this.scrollTop / (this.observedContentHeight - 1),
		};
	}

	restoreOnNextLayout(position: ReadingPosition): void {
		this.pendingPosition = position;
	}

	override prepareLayout(contentWidth: number): void {
		if (this.renderedWidth !== undefined && this.renderedWidth !== contentWidth && !this.pendingPosition) this.pendingPosition = this.readingPosition();
		this.renderedWidth = contentWidth;
		this.logicalRows = componentScrollRows(this.content, contentWidth);
		super.prepareLayout(contentWidth);
	}

	override render(width: number): string[] {
		if (this.renderedWidth !== undefined && this.renderedWidth !== width && !this.pendingPosition) {
			this.pendingPosition = this.readingPosition();
		}
		this.renderedWidth = width;
		const rows = super.render(width);
		this.renderedRows = rows;
		this.logicalRows = undefined;
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
		let target = Math.round(pending.fraction * Math.max(0, contentHeight - 1));
		for (let length = pending.anchor.length; length >= 16; length -= 8) {
			const needle = pending.anchor.slice(0, length);
			if (this.logicalRows) {
				const chunkSize = 256;
				let found = false;
				for (let start = 0; start < this.logicalRows.rowCount; start += chunkSize) {
					const rows = this.logicalRows.rows(start, Math.min(chunkSize + 3, this.logicalRows.rowCount - start));
					const normalized = rows.map(normalizedRow);
					const offset = normalized.join("").indexOf(needle);
					if (offset < 0) continue;
					let consumed = 0;
					const local = normalized.findIndex(row => { consumed += row.length; return consumed > offset; });
					target = start + Math.max(0, local);
					found = true;
					break;
				}
				if (found) break;
			} else {
				const normalized = this.renderedRows.map(normalizedRow);
				const offset = normalized.join("").indexOf(needle);
				if (offset < 0) continue;
				let consumed = 0;
				target = normalized.findIndex(row => { consumed += row.length; return consumed > offset; });
				break;
			}
		}
		this.scrollTo(target, { disableFollow: true });
	}
}

export const createChatScrollView: DashboardPrimaryScrollFactory = (
	component: Component,
	options: DashboardScrollOptions,
) => new ChatScrollView(component, options);
