import { describe, expect, test } from "bun:test";
import { McpLinearProjectDashboard } from "../src/adapters/outbound/workspace/linear-project-dashboard";

describe("McpLinearProjectDashboard", () => {
	test("returns one ready snapshot from the Linear project reads and recent comments", async () => {
		const calls: Array<{ tool: string; arguments: unknown }> = [];
		const dashboard = new McpLinearProjectDashboard({
			callMcpTool: async ({ tool, arguments: arguments_ }) => {
				calls.push({ tool, arguments: arguments_ });
				const value = tool === "list_issues"
					? { issues: [{ id: "WOO-907", title: "입장 Dashboard", status: "Backlog", statusType: "backlog" }] }
					: tool === "get_status_updates"
						? { statusUpdates: [{ body: "진행 중", createdAt: "2026-09-09T00:00:00.000Z" }] }
						: tool === "list_comments"
							? { comments: [{ id: "comment-1", body: "활동 기록", createdAt: "2026-09-09T01:00:00.000Z", author: { name: "우종호" } }] }
							: { milestones: [{ name: "v0.1.0", targetDate: "2026-09-30" }] };
				return { content: [], structuredContent: value };
			},
		}, { server: "linear-woo", projectId: "project-1", projectName: "World Wide Woo" });

		const result = await dashboard.refresh("thread-1");
		expect(result).toMatchObject({
			state: "ready",
			projectName: "World Wide Woo",
			issues: [{ id: "WOO-907", title: "입장 Dashboard" }],
			update: { body: "진행 중" },
			comments: [{ id: "comment-1", body: "활동 기록", author: "우종호" }],
			milestones: [{ name: "v0.1.0", targetDate: "2026-09-30" }],
		});
		expect(calls.map(call => call.tool).sort()).toEqual(["get_status_updates", "list_comments", "list_issues", "list_milestones"]);
		expect(calls.find(call => call.tool === "get_status_updates")?.arguments).toEqual({
			project: "project-1", type: "project", limit: 1,
		});
		expect(calls.find(call => call.tool === "list_milestones")?.arguments).toEqual({ project: "project-1" });
		expect(calls.find(call => call.tool === "list_comments")?.arguments).toEqual({ projectId: "project-1", limit: 5, orderBy: "createdAt" });
	});

	test("keeps the dashboard alive when the optional comment read fails", async () => {
		const dashboard = new McpLinearProjectDashboard({
			callMcpTool: async ({ tool }) => tool === "list_comments" ? ({ content: [], isError: true }) : ({ content: [], structuredContent: { issues: [], statusUpdates: [], milestones: [] } }),
		}, { server: "linear-woo", projectId: "project-1", projectName: "World Wide Woo" });

		await expect(dashboard.refresh("thread-1")).resolves.toMatchObject({ state: "ready", comments: [] });
	});

	test("rejects a failed Linear read so the Workbench can choose unavailable or stale", async () => {
		const dashboard = new McpLinearProjectDashboard({
			callMcpTool: async () => ({ content: [], isError: true }),
		}, { server: "linear-woo", projectId: "project-1", projectName: "World Wide Woo" });

		expect(dashboard.refresh("thread-1")).rejects.toThrow("Linear MCP");
	});
});
