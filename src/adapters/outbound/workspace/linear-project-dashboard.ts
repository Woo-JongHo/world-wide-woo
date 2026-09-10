import type { LinearDashboardIssue, LinearDashboardMilestone, LinearDashboardUpdate, LinearProjectDashboard } from "../../../core/domain/work/linear-dashboard.js";

export interface LinearMcpToolCaller {
	callMcpTool(input: { server: string; threadId: string; tool: string; arguments?: unknown }): Promise<{ content: readonly unknown[]; structuredContent?: unknown; isError?: boolean | null }>;
}
export interface LinearProjectDashboardConfig { readonly server: string; readonly projectId: string; readonly projectName: string; }

export class McpLinearProjectDashboard {
	public constructor(private readonly caller: LinearMcpToolCaller, private readonly config: LinearProjectDashboardConfig) {}
	public async refresh(threadId: string): Promise<LinearProjectDashboard> {
		const [issues, updates, milestones] = await Promise.all([
			this.call("list_issues", {
				project: this.config.projectId,
				limit: 20,
				orderBy: "updatedAt",
				fields: ["id", "title", "status", "statusType", "updatedAt", "dueDate"],
			}, threadId),
			this.call("get_status_updates", { project: this.config.projectId, type: "project", limit: 1 }, threadId),
			this.call("list_milestones", { project: this.config.projectId }, threadId),
		]);
		return { state: "ready", projectName: this.config.projectName, fetchedAt: new Date().toISOString(), issues: projectIssues(issues), update: projectUpdate(updates), milestones: projectMilestones(milestones), error: null };
	}
	private async call(tool: string, arguments_: unknown, threadId: string): Promise<unknown> {
		const result = await this.caller.callMcpTool({ server: this.config.server, threadId, tool, arguments: arguments_ });
		if (result.isError) throw new Error(`Linear MCP ${tool} 요청이 실패했습니다.`);
		if (result.structuredContent !== undefined) return result.structuredContent;
		const text = result.content.find(value => Boolean(value && typeof value === "object" && "text" in value && typeof (value as {text?:unknown}).text === "string")) as { text: string } | undefined;
		return text ? JSON.parse(text.text) : {};
	}
}
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function list(value: unknown, key: string): readonly Record<string, unknown>[] { const candidate = record(value)[key]; return Array.isArray(candidate) ? candidate.map(record) : []; }
function text(value: unknown): string { return typeof value === "string" ? value : ""; }
function projectIssues(value: unknown): readonly LinearDashboardIssue[] { return list(value, "issues").filter(issue => text(issue.statusType) !== "completed" && text(issue.statusType) !== "canceled").map(issue => ({ id: text(issue.id), title: text(issue.title), status: text(issue.status) || "상태 미확인", statusType: text(issue.statusType) || undefined, dueDate: typeof issue.dueDate === "string" ? issue.dueDate : null, updatedAt: typeof issue.updatedAt === "string" ? issue.updatedAt : null })).filter(issue => issue.id && issue.title); }
function projectUpdate(value: unknown): LinearDashboardUpdate | null { const entry = list(value, "statusUpdates")[0] ?? list(value, "updates")[0]; return entry && text(entry.body) ? { body: text(entry.body), createdAt: typeof entry.createdAt === "string" ? entry.createdAt : null } : null; }
function projectMilestones(value: unknown): readonly LinearDashboardMilestone[] { return list(value, "milestones").map(value => ({ name: text(value.name), targetDate: typeof value.targetDate === "string" ? value.targetDate : typeof value.dueDate === "string" ? value.dueDate : null })).filter(value => value.name); }
