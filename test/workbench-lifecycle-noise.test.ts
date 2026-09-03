import { describe, expect, test } from "bun:test";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
import type { ProjectActivity } from "../src/domain/project-activity";
import type { WorkbenchSnapshot } from "../src/domain/workbench";
import { projectWorkFlow } from "../src/domain/work-steps";
import { WorkbenchChatView } from "../src/presentation/tui/workbench-views";

function startup(sequence: number, server: string, status: string): ProjectActivity {
	return {
		schemaVersion: 1,
		id: `startup-${sequence}`,
		projectId: "sample-project",
		sequence,
		recordedAt: `2026-09-01T23:${String(sequence).padStart(2, "0")}:00.000Z`,
		kind: "progress",
		phase: "updated",
		provider: "openai-codex",
		nativeRefs: { threadId: "thread-root" },
		sourceDigest: `sha256:${String(sequence).padStart(64, "0")}`,
		payload: { method: "mcpServer/startupStatus/updated", params: { name: server, status } },
	};
}

describe("Workbench lifecycle noise filter", () => {
	test("keeps repeated MCP startup and retry telemetry out of Chat", () => {
		const message: ProjectActivity = {
			schemaVersion: 1, id: "message", projectId: "sample-project", sequence: 0,
			recordedAt: "2026-09-01T23:00:00.000Z", kind: "message", phase: "completed",
			provider: "openai-codex", nativeRefs: { threadId: "thread-root", itemId: "message" },
			sourceDigest: `sha256:${"0".repeat(64)}`,
			payload: { direction: "outbound", role: "user", text: "현재 작업을 계속합니다." },
		};
		const activities = [
			message,
			startup(1, "google-drive", "starting"),
			startup(2, "google-drive", "failed"),
			startup(3, "linear-woo", "starting"),
			startup(4, "linear-woo", "ready"),
			startup(5, "google-drive", "starting"),
			startup(6, "google-drive", "failed"),
		];
		const snapshot: WorkbenchSnapshot = {
			projectId: "sample-project", revision: 1, journalSequence: 6, phase: "ready",
			mcpServers: [],
			threadId: "thread-root", activeTurnId: null, activities, selectedActivityId: null,
			pendingApproval: null, chat: [{
				id: "message", role: "user", content: "현재 작업을 계속합니다.", activityId: "message", status: "completed",
			}], chatQueue: [], draft: "", reasoningDraft: "",
			liveActivity: null, workFlow: projectWorkFlow(activities), tnotes: [], todo: null,
			actionResult: null, error: null,
		};
		const output = stripTerminalSequences(new WorkbenchChatView(snapshot).render(72).join("\n"));
		expect(output).not.toContain("도구 서버");
		expect(output).not.toContain("google-drive");
		expect(output).not.toContain("linear-woo");
		expect(output).not.toContain("starting");
		expect(output).not.toContain("failed");
	});
});
