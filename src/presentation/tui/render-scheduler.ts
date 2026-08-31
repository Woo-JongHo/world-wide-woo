export type RenderUrgency = "streaming" | "immediate";

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

	flush(): void {
		if (this.disposed) return;
		if (this.timer !== undefined) {
			this.cancel(this.timer);
			this.timer = undefined;
		}
		this.pending = false;
		this.lastRenderAt = this.now();
		this.renderNow();
	}

	dispose(): void {
		this.disposed = true;
		this.pending = false;
		if (this.timer !== undefined) this.cancel(this.timer);
		this.timer = undefined;
	}

	private perform(timestamp: number): void {
		this.pending = false;
		this.lastRenderAt = timestamp;
		this.renderNow();
	}
}
