import type { WorkbenchModelUsage } from "../domain/workbench.js";

export interface SessionModelUsageObservation {
	readonly model: string;
	readonly effort: string | null;
	readonly totalTokens: number;
}

export interface SessionModelUsageSource {
	readonly snapshot: readonly WorkbenchModelUsage[];
	subscribe(listener: () => void): () => void;
}

/** In-process meter for detached model calls that belong to this WWW session. */
export class SessionModelUsageAccumulator implements SessionModelUsageSource {
	private readonly usage = new Map<string, WorkbenchModelUsage>();
	private readonly listeners = new Set<() => void>();

	public get snapshot(): readonly WorkbenchModelUsage[] {
		return Object.freeze([...this.usage.values()]
			.sort((left, right) => right.totalTokens - left.totalTokens || left.model.localeCompare(right.model))
			.map((item) => Object.freeze({ ...item })));
	}

	public observe(observation: SessionModelUsageObservation): void {
		if (typeof observation.model !== "string" || observation.model.trim().length === 0) throw new Error("Session usage model is required");
		if (!Number.isSafeInteger(observation.totalTokens) || observation.totalTokens < 0) throw new Error("Session usage tokens must be a non-negative integer");
		const effort = observation.effort ?? null;
		const key = `${observation.model}\u0000${effort ?? ""}`;
		const current = this.usage.get(key);
		this.usage.set(key, Object.freeze({
			model: observation.model,
			effort,
			turns: (current?.turns ?? 0) + 1,
			totalTokens: (current?.totalTokens ?? 0) + observation.totalTokens,
		}));
		for (const listener of this.listeners) {
			try { listener(); } catch { /* Telemetry observers cannot break generation. */ }
		}
	}

	public subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
}
