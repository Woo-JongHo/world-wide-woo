/** @linear WOO-679 WOO-683 WOO-686 WOO-687 WOO-688 WOO-689 */
import type { Component } from "@earendil-works/pi-tui";
import type { WorkbenchSnapshot } from "../../../../../core/domain/work/workbench";
import { ChatDurableTranscript, type ChatApprovalPresentation } from "./chat-durable-transcript";
import { ChatLiveActivity, type ChatActivityIndicator } from "./chat-live-activity";
import { ChatMessageRenderer } from "./chat-message-renderer";
import { isVisibleWorkStep } from "./work-step-card";
import { WorkbenchWelcomeView } from "./workbench-welcome";

export type { ChatApprovalPresentation } from "./chat-durable-transcript";

/** Chat projection for the native ProjectWorkbench, including existing tool cards. */
/** @Unit Code-001 */
/** @codeId 0001 */
export class WorkbenchChatView implements Component {
	private snapshot: WorkbenchSnapshot;
	private readonly welcome = new WorkbenchWelcomeView();
	private readonly messages = new ChatMessageRenderer();
	private readonly transcript: ChatDurableTranscript;
	private readonly liveActivity = new ChatLiveActivity();
	private cachedSnapshot: WorkbenchSnapshot | null = null;
	private cachedWidth = -1;
	private cachedRows: string[] | null = null;
	/** `cachedRows`에서 activity indicator가 시작하는 행. 본문은 spinner tick에 다시 투영하지 않는다. */
	private cachedActivityRowsStart = -1;

	constructor(
		snapshot: WorkbenchSnapshot,
		private readonly entryDashboard: Component | null = null,
		approvalPresentation: ChatApprovalPresentation | null = null,
	) {
		this.snapshot = snapshot;
		this.transcript = new ChatDurableTranscript(snapshot, {
			update: value => this.messages.update(value),
			invalidate: () => this.messages.invalidate(),
			render: (message, width) => this.renderMessage(message, width),
			renderDraft: width => this.messages.renderDraft(width),
		}, approvalPresentation);
		this.update(snapshot);
	}

	/** @linear WOO-686 WOO-688 */
	update(snapshot: WorkbenchSnapshot): void {
		if (this.snapshot !== snapshot) this.cachedRows = null;
		this.snapshot = snapshot;
		if (hasVisibleChatContent(snapshot)) this.welcome.dispose();
		this.transcript.update(snapshot);
	}

	invalidate(): void {
		this.cachedRows = null;
		this.cachedActivityRowsStart = -1;
		this.transcript.invalidate();
	}

	playWelcomeIntro(requestRender: () => void): void {
		if (!hasVisibleChatContent(this.snapshot)) this.welcome.playIntro(requestRender);
	}

	syncActivity(indicator: ChatActivityIndicator | null, requestRender: () => void): void {
		this.liveActivity.sync(this.snapshot, indicator, {
			changed: () => {
				this.cachedRows = null;
				this.cachedActivityRowsStart = -1;
				requestRender();
			},
			frameAdvanced: () => {
				this.refreshCachedActivityRows();
				requestRender();
			},
		});
	}

	dispose(): void {
		this.welcome.dispose();
		this.liveActivity.dispose();
	}

	render(width: number): string[] {
		const contentWidth = Math.max(1, width);
		const showEntryDashboard = !hasVisibleChatContent(this.snapshot);
		if (showEntryDashboard && this.snapshot.linearDashboard && this.entryDashboard) {
			return this.entryDashboard.render(contentWidth);
		}
		if (!hasVisibleChatContent(this.snapshot)) return this.welcome.render(contentWidth);
		if (
			this.cachedRows
			&& this.cachedSnapshot === this.snapshot
			&& this.cachedWidth === contentWidth
		) return this.cachedRows;
		const rows = this.transcript.render(contentWidth, this.liveActivity.visible);
		this.cachedActivityRowsStart = rows.length;
		rows.push(...this.liveActivity.render(contentWidth));
		this.cachedSnapshot = this.snapshot;
		this.cachedWidth = contentWidth;
		this.cachedRows = rows;
		return rows;
	}

	/** @linear WOO-689 */
	private refreshCachedActivityRows(): void {
		if (!this.cachedRows || this.cachedSnapshot !== this.snapshot || this.cachedWidth < 1 || this.cachedActivityRowsStart < 0) return;
		this.cachedRows = [
			...this.cachedRows.slice(0, this.cachedActivityRowsStart),
			...this.liveActivity.render(this.cachedWidth),
		];
	}

	/** @linear WOO-687 Stable Code-ID member; projection is owned by the injected message renderer. */
	private renderMessage(message: WorkbenchSnapshot["chat"][number], width: number): string[] {
		return this.messages.render(message, width);
	}
}

function hasVisibleChatContent(snapshot: WorkbenchSnapshot): boolean {
	return snapshot.actionResult?.kind === "workflow" || snapshot.chat.length > 0
		|| snapshot.workFlow.steps.length > 0
		|| Boolean(snapshot.pendingApproval || snapshot.executionRun?.receipt || snapshot.executionRun?.phase === "waiting"
			|| snapshot.reasoningSummaryDraft || snapshot.reasoningDraft || snapshot.draft || snapshot.error)
		|| Boolean(snapshot.liveActivity && isVisibleWorkStep(snapshot.liveActivity.kind));
}
