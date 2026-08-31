export type CtrlCAction = "clear" | "abort" | "exit";

/** Keeps destructive exit gestures independent from terminal input plumbing. */
export class ExitKeyPolicy {
	private lastCtrlCAt: number | undefined;

	constructor(
		private readonly now: () => number = performance.now.bind(performance),
		private readonly doublePressMs = 500,
	) {}

	ctrlC(streaming: boolean): CtrlCAction {
		const pressedAt = this.now();
		const elapsed = this.lastCtrlCAt === undefined ? undefined : pressedAt - this.lastCtrlCAt;
		if (elapsed !== undefined && elapsed >= 0 && elapsed < this.doublePressMs) {
			this.lastCtrlCAt = undefined;
			return "exit";
		}
		this.lastCtrlCAt = pressedAt;
		return streaming ? "abort" : "clear";
	}

	ctrlD(hasDraft: boolean): "ignore" | "exit" {
		return hasDraft ? "ignore" : "exit";
	}

	reset(): void {
		this.lastCtrlCAt = undefined;
	}
}
