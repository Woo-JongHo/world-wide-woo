import type { CommandStatus } from "./output";

export type MonitoringPhase = "starting" | "ready" | "streaming" | "error";

export interface MonitoringTool {
	readonly name: string;
	readonly status: CommandStatus;
}

export interface MonitoringSnapshot {
	readonly sessionId: string;
	readonly projectName: string;
	readonly cwd: string;
	readonly provider: string;
	readonly model: string;
	readonly effort: string;
	readonly phase: MonitoringPhase;
	readonly activityLabel: string | null;
	readonly startedAt: number;
	readonly updatedAt: number;
	readonly elapsedMs: number;
	readonly turns: Readonly<{
		user: number;
		assistant: number;
		cancelled: number;
	}>;
	readonly tools: Readonly<{
		running: number;
		passed: number;
		failed: number;
		cancelled: number;
		active: MonitoringTool | null;
		latest: MonitoringTool | null;
	}>;
	readonly todo: Readonly<{
		completed: number;
		total: number;
		detailCompleted: number;
		detailTotal: number;
		activeContent: string | null;
	}>;
}
