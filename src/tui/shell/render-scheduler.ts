export type RenderUrgency = "streaming" | "immediate";

interface WorkbenchRenderState {
	readonly phase: string;
	readonly journalSequence: number;
}

/** Native delta-only revisions are repaint noise; durable and lifecycle changes stay immediate. */
export function workbenchRenderUrgency(
	previous: WorkbenchRenderState,
	next: WorkbenchRenderState,
): RenderUrgency {
	return previous.phase === "working" &&
		next.phase === "working" &&
		previous.journalSequence === next.journalSequence
		? "streaming"
		: "immediate";
}

type TimerToken = ReturnType<typeof setTimeout>;
type ScheduleTimer = (callback: () => void, delayMs: number) => TimerToken;
type CancelTimer = (token: TimerToken) => void;

/**
 * Coalesces token-delta repaints while guaranteeing an immediate terminal frame.
 * The latest application snapshot remains the source of truth; this class only
 * schedules its projection.
 */
export class RenderScheduler {
	private lastRenderAt: number | undefined;
	private timer: TimerToken | undefined;
	private pending = false;
	private immediatePending = false;
	private inputPending = false;
	private disposed = false;

	constructor(
		private readonly renderNow: () => void,
		private readonly intervalMs = 64,
		private readonly now: () => number = () => performance.now(),
		private readonly schedule: ScheduleTimer = (callback, delay) => setTimeout(callback, delay),
		private readonly cancel: CancelTimer = clearTimeout,
	) {}

	request(urgency: RenderUrgency): void {
		if (this.disposed) return;
		if (this.inputPending) {
			this.pending = true;
			this.immediatePending ||= urgency === "immediate";
			return;
		}
		if (urgency === "immediate") {
			this.flush();
			return;
		}
		this.pending = true;
		const current = this.now();
		if (this.lastRenderAt === undefined || current - this.lastRenderAt >= this.intervalMs) {
			this.perform(current);
			return;
		}
		if (this.timer !== undefined) return;
		const delay = Math.max(0, this.intervalMs - (current - this.lastRenderAt));
		this.timer = this.schedule(() => {
			this.timer = undefined;
			if (this.pending && !this.disposed) this.perform(this.now());
		}, delay);
	}

	/**
	 * Lets the focused component consume its current terminal input before a
	 * queued workbench projection can render. Pi TUI renders that input on its
	 * immediate path, while streaming work remains subject to this scheduler's
	 * interval when the input turn has completed.
	 */
	prioritizeInput(): void {
		if (this.disposed || this.inputPending) return;
		this.inputPending = true;
		if (this.timer !== undefined) {
			this.cancel(this.timer);
			this.timer = undefined;
		}
		queueMicrotask(() => {
			this.inputPending = false;
			if (this.disposed || !this.pending) return;
			if (this.immediatePending) {
				this.immediatePending = false;
				this.flush();
				return;
			}
			this.request("streaming");
		});
	}

	flush(): void {
		if (this.disposed) return;
		if (this.timer !== undefined) {
			this.cancel(this.timer);
			this.timer = undefined;
		}
		this.pending = false;
		this.immediatePending = false;
		this.lastRenderAt = this.now();
		this.renderNow();
	}

	dispose(): void {
		this.disposed = true;
		this.pending = false;
		this.immediatePending = false;
		if (this.timer !== undefined) this.cancel(this.timer);
		this.timer = undefined;
	}

	private perform(timestamp: number): void {
		this.pending = false;
		this.lastRenderAt = timestamp;
		this.renderNow();
	}
}
