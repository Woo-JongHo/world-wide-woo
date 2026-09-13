import { ScrollView, stripTerminalSequences, type Component } from "@earendil-works/pi-tui";
import type {
	DashboardPrimaryScrollFactory,
	DashboardScrollOptions,
} from "../../foundation/layout/dashboard-layout";

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
			target = normalized.findIndex(row => {
				consumed += row.length;
				return consumed > offset;
			});
			break;
		}
		this.scrollTo(target, { disableFollow: true });
	}
}

export const createChatScrollView: DashboardPrimaryScrollFactory = (
	component: Component,
	options: DashboardScrollOptions,
) => new ChatScrollView(component, options);
