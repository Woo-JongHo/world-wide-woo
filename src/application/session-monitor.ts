import type { MonitoringSnapshot, MonitoringTool } from "../domain/monitoring";
import { todoDetailProgress, todoProgress, type TodoDocument } from "../domain/todos";
import type { ToolResultSnapshot } from "../domain/output";
import { SessionRuntime, type SessionSnapshot } from "./session-runtime";
import type { TodoController } from "./ports";

export type MonitoringListener = (snapshot: MonitoringSnapshot) => void;
export interface MonitoringSource {
	readonly snapshot: MonitoringSnapshot;
	subscribe(listener: MonitoringListener): () => void;
}

/** Read-only projection of session and Todo state for monitoring surfaces. */
export class SessionMonitor implements MonitoringSource {
	private readonly listeners = new Set<MonitoringListener>();
	private readonly startedAt: number;
	private runtimeSnapshot: SessionSnapshot;
	private todoSnapshot: TodoDocument | null;
	private current: MonitoringSnapshot;
	private readonly unsubscribeRuntime: () => void;
	private readonly unsubscribeTodo: () => void;
	private disposed = false;

	public constructor(
		runtime: SessionRuntime,
		todos: TodoController,
		private readonly now: () => number = Date.now,
	) {
		this.startedAt = this.now();
		this.runtimeSnapshot = runtime.snapshot;
		this.todoSnapshot = todos.snapshot;
		this.current = this.project(this.startedAt);
		this.unsubscribeRuntime = runtime.subscribe((snapshot) => {
			if (!this.disposed) this.updateRuntime(snapshot);
		});
		this.unsubscribeTodo = todos.subscribe((snapshot) => {
			if (!this.disposed) this.updateTodos(snapshot);
		});
	}

	public get snapshot(): MonitoringSnapshot {
		return this.current;
	}

	public subscribe(listener: MonitoringListener): () => void {
		this.listeners.add(listener);
		try {
			listener(this.current);
		} catch {
			this.listeners.delete(listener);
		}
		if (this.disposed) this.listeners.delete(listener);
		return () => this.listeners.delete(listener);
	}

	public dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.unsubscribeRuntime();
		this.unsubscribeTodo();
		this.listeners.clear();
	}

	private updateRuntime(snapshot: SessionSnapshot): void {
		this.runtimeSnapshot = snapshot;
		this.publish();
	}

	private updateTodos(snapshot: TodoDocument | null): void {
		this.todoSnapshot = snapshot;
		this.publish();
	}

	private publish(): void {
		this.current = this.project(this.now());
		for (const listener of this.listeners) {
			try {
				listener(this.current);
			} catch {
				this.listeners.delete(listener);
			}
		}
	}

	private project(updatedAt: number): MonitoringSnapshot {
		const runtime = this.runtimeSnapshot;
		const turns = { user: 0, assistant: 0, cancelled: 0 };
		for (const turn of runtime.turns) {
			turns[turn.role] += 1;
			if (turn.outcome === "cancelled") turns.cancelled += 1;
		}
		const tools = toolSummary(runtime.tools);
		const progress = this.todoSnapshot ? todoProgress(this.todoSnapshot) : { completed: 0, total: 0 };
		const detailProgress = this.todoSnapshot ? todoDetailProgress(this.todoSnapshot) : { completed: 0, total: 0 };
		const activeItem = this.todoSnapshot?.items.find(item => item.status === "in_progress");
		const activeContent = activeItem?.details.find(detail => detail.status === "in_progress")?.content ?? activeItem?.content ?? null;
		return Object.freeze({
			sessionId: runtime.id,
			projectName: runtime.projectName,
			cwd: runtime.cwd,
			provider: runtime.settings.provider,
			model: runtime.settings.model,
			effort: runtime.settings.effort,
			phase: runtime.phase,
			activityLabel: runtime.activity?.label ?? null,
			startedAt: this.startedAt,
			updatedAt,
			elapsedMs: Math.max(0, updatedAt - this.startedAt),
			turns: Object.freeze(turns),
			tools,
			todo: Object.freeze({
				completed: progress.completed,
				total: progress.total,
				detailCompleted: detailProgress.completed,
				detailTotal: detailProgress.total,
				activeContent,
			}),
		});
	}
}

function toolSummary(snapshots: readonly ToolResultSnapshot[]): MonitoringSnapshot["tools"] {
	const totals = { running: 0, passed: 0, failed: 0, cancelled: 0 };
	let active: MonitoringTool | null = null;
	let latest: MonitoringTool | null = null;
	for (const snapshot of snapshots) {
		const tool = Object.freeze({ name: "shell" in snapshot ? snapshot.shell : snapshot.toolName, status: snapshot.status });
		latest = tool;
		if (snapshot.status === "running") active = tool;
		if (snapshot.status in totals) totals[snapshot.status as keyof typeof totals] += 1;
	}
	return Object.freeze({ ...totals, active, latest });
}
