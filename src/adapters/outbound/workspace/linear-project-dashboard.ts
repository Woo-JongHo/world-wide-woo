import type {
	LinearDashboardComment,
	LinearDashboardIssue,
	LinearDashboardMilestone,
	LinearDashboardUpdate,
	LinearProjectDashboard,
} from "@/core/domain/work/linear-dashboard.js";
import type { LinearProjectDashboardReader } from "@/core/ports/integration/linear-project-dashboard-port";

export interface LinearMcpToolCaller {
	callMcpTool(input: {
		server   : string ;
		threadId : string ;
		tool     : string ;
		/** Omit when the selected MCP tool has no arguments. */
		arguments?: unknown;
	}): Promise<{
		content            : readonly unknown[] ;
		structuredContent? : unknown            ;
		isError?           : boolean | null     ;
	}>;
}

export interface LinearProjectDashboardConfig {
	readonly server      : string ;
	readonly projectId   : string ;
	readonly projectName : string ;
}

export class McpLinearProjectDashboard implements LinearProjectDashboardReader {
	public constructor(
		private readonly caller: LinearMcpToolCaller,
		private readonly config: LinearProjectDashboardConfig,
	) {}

	public async refresh(threadId: string): Promise<LinearProjectDashboard> {
		const [issues, updates, milestones, comments] = await Promise.all([
			this.call("list_issues", {
				project : this.config.projectId,
				limit   : 20,
				orderBy : "updatedAt",
				fields  : ["id", "title", "status", "statusType", "updatedAt", "dueDate"],
			}, threadId),
			this.call("get_status_updates", {
				project : this.config.projectId,
				type    : "project",
				limit   : 1,
			}, threadId),
			this.call("list_milestones", { project: this.config.projectId }, threadId),
			this.call("list_comments", {
				projectId : this.config.projectId,
				limit     : 5,
				orderBy   : "createdAt",
			}, threadId).catch(() => ({ comments: [] })),
		]);
		return {
			state       : "ready",
			projectName : this.config.projectName,
			fetchedAt   : new Date().toISOString(),
			issues      : projectIssues(issues),
			update      : projectUpdate(updates),
			comments    : projectComments(comments),
			milestones  : projectMilestones(milestones),
			error       : null,
		};
	}

	private async call(tool: string, arguments_: unknown, threadId: string): Promise<unknown> {
		const result = await this.caller.callMcpTool({
			server: this.config.server,
			threadId,
			tool,
			...(arguments_ === undefined ? {} : { arguments: arguments_ }),
		});
		if (result.isError) throw new Error(`Linear MCP ${tool} 요청이 실패했습니다.`);
		if (result.structuredContent !== undefined) return result.structuredContent;
		const content = result.content.map(textContent).find(value => value !== null);
		return content === undefined ? {} : JSON.parse(content);
	}
}

function record(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? value as Record<string, unknown>
		: {};
}

function list(value: unknown, key: string): readonly Record<string, unknown>[] {
	const candidate = record(value)[key];
	return Array.isArray(candidate) ? candidate.map(record) : [];
}

function text(value: unknown): string {
	return typeof value === "string" ? value : "";
}

function textContent(value: unknown): string | null {
	const candidate = record(value).text;
	return typeof candidate === "string" ? candidate : null;
}

function projectIssues(value: unknown): readonly LinearDashboardIssue[] {
	return list(value, "issues")
		.filter(issue => text(issue.statusType) !== "completed" && text(issue.statusType) !== "canceled")
		.map(issue => {
			const statusType = text(issue.statusType);
			return {
				id        : text(issue.id),
				title     : text(issue.title),
				status    : text(issue.status) || "상태 미확인",
				dueDate   : typeof issue.dueDate === "string" ? issue.dueDate : null,
				updatedAt : typeof issue.updatedAt === "string" ? issue.updatedAt : null,
				...(statusType === "" ? {} : { statusType }),
			};
		})
		.filter(issue => issue.id && issue.title);
}

function projectUpdate(value: unknown): LinearDashboardUpdate | null {
	const entry = list(value, "statusUpdates")[0] ?? list(value, "updates")[0];
	if (!entry) return null;
	const body = text(entry.body);
	return body === ""
		? null
		: { body, createdAt: typeof entry.createdAt === "string" ? entry.createdAt : null };
}

function projectComments(value: unknown): readonly LinearDashboardComment[] {
	return list(value, "comments")
		.map(comment => {
			const author = record(comment.author);
			return {
				id        : text(comment.id),
				body      : text(comment.body),
				createdAt : typeof comment.createdAt === "string" ? comment.createdAt : null,
				author    : text(author.name) || null,
			};
		})
		.filter(comment => comment.id && comment.body);
}

function projectMilestones(value: unknown): readonly LinearDashboardMilestone[] {
	return list(value, "milestones")
		.map(milestone => ({
			name: text(milestone.name),
			targetDate: typeof milestone.targetDate === "string"
				? milestone.targetDate
				: typeof milestone.dueDate === "string" ? milestone.dueDate : null,
		}))
		.filter(milestone => milestone.name);
}
