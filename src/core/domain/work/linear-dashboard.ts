export type LinearDashboardState = "loading" | "ready" | "stale" | "unavailable";

export interface LinearDashboardIssue {
	readonly id: string;
	readonly title: string;
	readonly status: string;
	readonly statusType?: string;
	readonly dueDate: string | null;
	readonly updatedAt?: string | null;
}
export interface LinearDashboardUpdate {
	readonly body: string;
	readonly createdAt: string | null;
}
export interface LinearDashboardMilestone {
	readonly name: string;
	readonly targetDate: string | null;
}
export interface LinearProjectDashboard {
	readonly state: LinearDashboardState;
	readonly projectName: string;
	readonly fetchedAt: string | null;
	readonly issues: readonly LinearDashboardIssue[];
	readonly update: LinearDashboardUpdate | null;
	readonly milestones: readonly LinearDashboardMilestone[];
	readonly error: string | null;
}
export const EMPTY_LINEAR_PROJECT_DASHBOARD: LinearProjectDashboard = Object.freeze({
	state: "unavailable", projectName: "Linear 프로젝트", fetchedAt: null, issues: Object.freeze([]), update: null, milestones: Object.freeze([]), error: "Linear Dashboard가 연결되지 않았습니다.",
});
