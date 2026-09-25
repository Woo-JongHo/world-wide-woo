import { truncateToWidth, wrapTextWithAnsi }       from "@earendil-works/pi-tui";
import type { WorkbenchSnapshot }                  from "@/core/domain/work/workbench";
import { activityGradientFrame, colors, semantic } from "@/adapters/inbound/tui/foundation/theme/theme";
import { isVisibleWorkStep }                       from "@/adapters/inbound/tui/features/chat/work-step-card";

export interface ChatActivityIndicator {
	readonly message    : string            ;
	readonly hint?      : string            ;
	readonly frames     : readonly string[] ;
	readonly intervalMs : number            ;
}

interface ActivityRenderCallbacks {
	readonly changed: () => void;
	readonly frameAdvanced: () => void;
}

function activityOwnerKey(activity: WorkbenchSnapshot["activities"][number]): string {
	const { threadId, turnId, itemId } = activity.nativeRefs;
	return itemId ? `${threadId ?? ""}\0${turnId ?? ""}\0${itemId}` : `activity\0${activity.id}`;
}

function liveActivityOwnerKey(activity: NonNullable<WorkbenchSnapshot["liveActivity"]>): string {
	const { threadId, turnId, itemId } = activity.nativeRefs;
	return itemId ? `${threadId ?? ""}\0${turnId ?? ""}\0${itemId}` : "activity\0live";
}

export function matchingLiveActivity(
	liveActivity: WorkbenchSnapshot["liveActivity"],
	activity: WorkbenchSnapshot["activities"][number],
): NonNullable<WorkbenchSnapshot["liveActivity"]> | undefined {
	return liveActivity
		&& liveActivityOwnerKey(liveActivity) === activityOwnerKey(activity)
		&& isVisibleWorkStep(liveActivity.kind)
		? liveActivity
		: undefined;
}

/** Owns projection and scheduling for the transient Chat activity indicator. */
export class ChatLiveActivity {
	private indicator : ChatActivityIndicator | null          = null ;
	private frame                                             = 0    ;
	private timer     : ReturnType<typeof setInterval> | null = null ;

	get visible(): boolean {
		return this.indicator !== null;
	}

	sync(
		snapshot: WorkbenchSnapshot,
		indicator: ChatActivityIndicator | null,
		callbacks: ActivityRenderCallbacks,
	): void {
		const motionAllowed = !snapshot.executionRun
			|| ["executing", "verifying", "completing"].includes(snapshot.executionRun.phase);
		if (!motionAllowed) indicator = null;
		const previous = this.indicator;
		const changed = previous?.message !== indicator?.message
			|| previous?.hint !== indicator?.hint
			|| previous?.intervalMs !== indicator?.intervalMs
			|| previous?.frames.join("\0") !== indicator?.frames.join("\0");
		this.indicator = indicator;
		if (!indicator || indicator.frames.length <= 1) {
			this.stop();
		} else if (!this.timer
			|| previous?.intervalMs !== indicator.intervalMs
			|| previous.frames.join("\0") !== indicator.frames.join("\0")) {
			this.stop();
			this.timer = setInterval(() => {
				this.frame = (this.frame + 1) % Math.max(1, indicator.frames.length * 64);
				callbacks.frameAdvanced();
			}, indicator.intervalMs);
			this.timer.unref?.();
		}
		if (changed) callbacks.changed();
	}

	render(width: number): string[] {
		if (!this.indicator) return [];
		const contentWidth    = Math.max(1, width)                                                                   ;
		const rows : string[] = []                                                                                   ;
		const frame           = this.indicator.frames[this.frame % Math.max(1, this.indicator.frames.length)] ?? "·" ;
		if (contentWidth <= 2) {
			rows.push(truncateToWidth(`${colors.accent(frame)} ${this.indicator.message}`, contentWidth));
		} else {
			const activityRows = wrapTextWithAnsi(this.indicator.message, contentWidth - 2);
			for (const [index, line] of activityRows.entries()) {
				rows.push(`${index === 0 ? `${colors.accent(frame)} ` : "  "}${semantic.activity(activityGradientFrame(line, this.frame))}`);
			}
		}
		rows.push("");
		return rows;
	}

	dispose(): void {
		this.stop();
	}

	private stop(): void {
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
		this.frame = 0;
	}
}
