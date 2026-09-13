export async function settleWithin(operation: Promise<unknown>, timeoutMs: number): Promise<boolean> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<false>((resolve) => {
		timer = setTimeout(() => resolve(false), timeoutMs);
	});
	const completed = operation.then(() => true as const, () => true as const);
	const result = await Promise.race([completed, timeout]);
	if (timer) clearTimeout(timer);
	return result;
}

export interface ShellLifecycleDependencies {
	readonly cancelPrompt: () => void;
	readonly dismissOverlay: () => void;
	readonly announceClosing: () => void;
	readonly unsubscribe: () => void;
	readonly stopPolling: readonly (() => void)[];
	readonly timers: readonly (ReturnType<typeof setInterval> | null)[];
	readonly disposables: readonly { dispose(): void }[];
	readonly saveDraft?: () => Promise<void>;
	readonly closeWorkbench: () => Promise<void>;
	readonly releaseSessionLease?: () => Promise<void>;
	readonly stopTerminal: () => void;
	readonly timeoutMs?: number;
}

/** Owns idempotent shell shutdown and the order in which interactive resources are released. */
export class ShellLifecycle {
	private state: "running" | "stopping" | "stopped" = "running";

	public constructor(private readonly dependencies: ShellLifecycleDependencies) {}

	public get isShuttingDown(): boolean {
		return this.state !== "running";
	}

	public async shutdown(): Promise<void> {
		if (this.state !== "running") return;
		this.state = "stopping";

		this.dependencies.cancelPrompt();
		this.dependencies.dismissOverlay();
		this.dependencies.announceClosing();
		this.dependencies.unsubscribe();
		for (const stop of this.dependencies.stopPolling) stop();
		for (const timer of this.dependencies.timers) if (timer) clearInterval(timer);
		for (const disposable of this.dependencies.disposables) disposable.dispose();

		await settleWithin((async () => {
			if (this.dependencies.saveDraft) await this.dependencies.saveDraft().catch(() => undefined);
			try {
				await this.dependencies.closeWorkbench();
			} finally {
				await this.dependencies.releaseSessionLease?.();
			}
		})(), this.dependencies.timeoutMs ?? 5_000);

		this.dependencies.stopTerminal();
		this.state = "stopped";
	}
}
