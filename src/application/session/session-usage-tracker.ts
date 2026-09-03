import type { NativeHarnessEvent } from "../../domain/native-session.js";
import type { WorkbenchContextUsage, WorkbenchModelUsage, WorkbenchSessionUsage } from "../../domain/workbench.js";
import type { SessionModelUsageSource } from "../session-model-usage.js";
const NATIVE_CONTEXT_BASELINE_TOKENS = 12_000;

/** Session-local accounting for executor and detached model usage observations. */
export class SessionUsageTracker {
	private contextUsageValue: WorkbenchContextUsage | null = null;
	private observedThreadTotalTokens: number | null;
	private readonly turnModels = new Map<string, { model: string; effort: string | null }>();
	private readonly observedTurns = new Set<string>();
	private readonly modelUsage = new Map<string, WorkbenchModelUsage>();
	private readonly pendingByTurn = new Map<string, number>();
	private unattributedTokens = 0;

	public constructor(resumed = false) { this.observedThreadTotalTokens = resumed ? null : 0; }
	public get contextUsage(): WorkbenchContextUsage | null { return this.contextUsageValue; }
	public hasTurn(turnId: string): boolean { return this.turnModels.has(turnId); }
	public modelFor(turnId: string): string | null { return this.turnModels.get(turnId)?.model ?? null; }

	public observe(event: Extract<NativeHarnessEvent, { type: "notification" }>, threadId: string | null, contextTurnId: string | null): void {
		if (event.refs.threadId && threadId && event.refs.threadId !== threadId) return;
		const totalTokens = projectThreadTotalTokens(event.params);
		if (totalTokens !== null) {
			let delta = 0;
			if (this.observedThreadTotalTokens === null) this.observedThreadTotalTokens = totalTokens;
			else if (totalTokens >= this.observedThreadTotalTokens) {
				delta = totalTokens - this.observedThreadTotalTokens;
				this.observedThreadTotalTokens = totalTokens;
			}
			if (delta > 0) this.attribute(event.refs.turnId, delta);
		}
		if (event.refs.turnId && event.refs.turnId === contextTurnId) this.contextUsageValue = projectContextUsage(event.params);
	}

	public bindTurn(turnId: string, model: string, effort: string | null): void {
		this.turnModels.set(turnId, { model, effort });
		const pending = this.pendingByTurn.get(turnId);
		if (!pending) return;
		this.pendingByTurn.delete(turnId);
		this.unattributedTokens = Math.max(0, this.unattributedTokens - pending);
		this.add(turnId, model, effort, pending);
	}

	public snapshot(auxiliary?: SessionModelUsageSource): WorkbenchSessionUsage {
		const merged = new Map<string, WorkbenchModelUsage>();
		for (const usage of [...this.modelUsage.values(), ...(auxiliary?.snapshot ?? [])]) {
			const key = `${usage.model}\u0000${usage.effort ?? ""}`;
			const current = merged.get(key);
			merged.set(key, {
				model: usage.model, effort: usage.effort,
				interactiveRootTurns: (current?.interactiveRootTurns ?? 0) + usage.interactiveRootTurns,
				interactiveTokens: (current?.interactiveTokens ?? 0) + usage.interactiveTokens,
				detachedInvocations: (current?.detachedInvocations ?? 0) + usage.detachedInvocations,
				detachedTokens: (current?.detachedTokens ?? 0) + usage.detachedTokens,
				totalTokens: (current?.totalTokens ?? 0) + usage.totalTokens,
			});
		}
		const models = [...merged.values()].sort((left, right) => right.totalTokens - left.totalTokens || left.model.localeCompare(right.model));
		return { totalTokens: models.reduce((sum, usage) => sum + usage.totalTokens, 0) + this.unattributedTokens, unattributedTokens: this.unattributedTokens, models };
	}

	private attribute(turnId: string | undefined, delta: number): void {
		const binding = turnId ? this.turnModels.get(turnId) : undefined;
		if (turnId && binding) { this.add(turnId, binding.model, binding.effort, delta); return; }
		this.unattributedTokens += delta;
		if (turnId) this.pendingByTurn.set(turnId, (this.pendingByTurn.get(turnId) ?? 0) + delta);
	}

	private add(turnId: string, model: string, effort: string | null, delta: number): void {
		const key = `${model}\u0000${effort ?? ""}`;
		const current = this.modelUsage.get(key) ?? { model, effort, interactiveRootTurns: 0, interactiveTokens: 0, detachedInvocations: 0, detachedTokens: 0, totalTokens: 0 };
		const first = !this.observedTurns.has(turnId);
		if (first) this.observedTurns.add(turnId);
		this.modelUsage.set(key, { ...current, interactiveRootTurns: current.interactiveRootTurns + (first ? 1 : 0), interactiveTokens: current.interactiveTokens + delta, totalTokens: current.totalTokens + delta });
	}
}

function projectContextUsage(params: Readonly<Record<string, unknown>>): WorkbenchContextUsage | null {
	const tokenUsage = record(params.tokenUsage); const last = record(tokenUsage?.last); const usedTokens = last?.totalTokens; const contextWindow = tokenUsage?.modelContextWindow;
	if (typeof usedTokens !== "number" || !Number.isFinite(usedTokens) || usedTokens < 0 || typeof contextWindow !== "number" || !Number.isFinite(contextWindow) || contextWindow <= 0) return null;
	const effectiveWindow = Math.max(1, contextWindow - NATIVE_CONTEXT_BASELINE_TOKENS);
	const effectiveUsed = Math.max(0, usedTokens - NATIVE_CONTEXT_BASELINE_TOKENS);
	return Object.freeze({ usedTokens, contextWindow, percent: Math.min(100, Math.round((effectiveUsed / effectiveWindow) * 1_000) / 10) });
}
function projectThreadTotalTokens(params: Readonly<Record<string, unknown>>): number | null { const value = record(record(params.tokenUsage)?.total)?.totalTokens; return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null; }
function record(value: unknown): Record<string, unknown> | null { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
