import { describe, expect, test } from "bun:test";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import type { ProjectActivity, ProjectActivityPhase } from "../src/domain/project-activity";
import type { WorkbenchSnapshot } from "../src/domain/workbench";
import { projectNativeDelegation, projectWorkFlow, type DplanHash } from "../src/domain/work-steps";
import { projectWorkbenchDelegationSections } from "../src/presentation/tui/delegation-tree-view";
import { WorkbenchChatView } from "../src/presentation/tui/workbench-views";

const ROOT_THREAD = "thread-root";
const TURN = "turn-delegation";
const hash: DplanHash = {
	sha256Hex: (input) => new Bun.CryptoHasher("sha256").update(input).digest("hex"),
};

function collabActivity(
	sequence: number,
	id: string,
	item: Readonly<Record<string, unknown>>,
	phase: ProjectActivityPhase = "completed",
	threadId = ROOT_THREAD,
	turnId = TURN,
): ProjectActivity {
	return {
		schemaVersion: 1,
		id,
		projectId: "sample-project",
		sequence,
		recordedAt: `2026-09-01T23:${String(10 + sequence).padStart(2, "0")}:00.000Z`,
		kind: item.type === "subAgentActivity" ? "progress" : "tool",
		phase,
		provider: "openai-codex",
		nativeRefs: { threadId, turnId, itemId: typeof item.id === "string" ? item.id : id },
		sourceDigest: `sha256:${String(sequence).padStart(64, "0")}`,
		payload: { method: phase === "started" ? "item/started" : "item/completed", params: { item } },
	};
}

function collaborationActivities(): readonly ProjectActivity[] {
	return [
		collabActivity(1, "spawn-core-start", {
			type: "collabAgentToolCall",
			id: "spawn-core",
			tool: "spawnAgent",
			status: "inProgress",
			senderThreadId: ROOT_THREAD,
			receiverThreadIds: ["thread-core"],
			prompt: "SessionGoal and T-note contracts\nDo not edit unrelated files.",
			model: "openai-codex/gpt-5.6-terra",
			reasoningEffort: "high",
			agentsStates: { "thread-core": { status: "running", message: null } },
		}, "started"),
		collabActivity(2, "spawn-core-done", {
			type: "collabAgentToolCall",
			id: "spawn-core",
			tool: "spawnAgent",
			status: "completed",
			senderThreadId: ROOT_THREAD,
			receiverThreadIds: ["thread-core"],
			prompt: "SessionGoal and T-note contracts",
			model: "openai-codex/gpt-5.6-terra",
			reasoningEffort: "high",
			agentsStates: { "thread-core": { status: "running", message: "apply_patch" } },
		}),
		collabActivity(3, "path-core", {
			type: "subAgentActivity", id: "path-core", kind: "started",
			agentThreadId: "thread-core", agentPath: "/root/CoreContracts",
		}),
		collabActivity(4, "spawn-todo", {
			type: "collabAgentToolCall",
			id: "spawn-todo",
			tool: "spawnAgent",
			status: "completed",
			senderThreadId: ROOT_THREAD,
			receiverThreadIds: ["thread-todo"],
			prompt: "Todo what why enforcement",
			model: "openai-codex/gpt-5.6-terra",
			reasoningEffort: "high",
			agentsStates: { "thread-todo": { status: "completed", message: "focused tests passed" } },
		}),
		collabActivity(5, "path-todo", {
			type: "subAgentActivity", id: "path-todo", kind: "completed",
			agentThreadId: "thread-todo", agentPath: "/root/TodoContract",
		}),
		collabActivity(6, "irc-out", {
			type: "collabAgentToolCall",
			id: "irc-out",
			tool: "sendMessage",
			status: "completed",
			senderThreadId: ROOT_THREAD,
			receiverThreadIds: ["thread-core"],
			prompt: "계약별 부정 테스트까지 결과에 포함하세요.",
			agentsStates: { "thread-core": { status: "running", message: "apply_patch" } },
		}),
		collabActivity(7, "irc-in", {
			type: "collabAgentToolCall",
			id: "irc-in",
			tool: "sendMessage",
			status: "completed",
			senderThreadId: "thread-todo",
			receiverThreadIds: [ROOT_THREAD],
			prompt: "집중 테스트가 통과했습니다.",
			agentsStates: { "thread-todo": { status: "completed", message: "focused tests passed" } },
		}, "completed", "thread-todo"),
	];
}

function planInput(activities: readonly ProjectActivity[]) {
	const activity = activities[0]!;
	return {
		expectedThreadKey: activity.nativeRefs.threadId!,
		selectedTurnId: activity.nativeRefs.turnId!,
		hash,
	};
}

function workFlowFor(activities: readonly ProjectActivity[]) {
	const authority = planInput(activities);
	const [first] = activities;
	return projectWorkFlow([{
		...first!,
		id: "delegation-turn-start",
		sequence: 1,
		payload: { method: "turn/started" },
		sourceDigest: `sha256:${"1".padStart(64, "0")}`,
	}, {
		...first!,
		id: "delegation-plan",
		sequence: 2,
		payload: { method: "turn/plan/updated", params: { plan: [{ step: "delegation", status: "inProgress" }] } },
		sourceDigest: `sha256:${"2".padStart(64, "0")}`,
	}], new Map(), authority);
}

describe("Gajae-style delegation tree", () => {
	test("groups native agent lifecycle and IRC items without duplicating lifecycle updates", () => {
		const activities = collaborationActivities();
		const sections = projectWorkbenchDelegationSections(
			activities,
			"Resolve the consolidated verification blockers.",
			ROOT_THREAD,
			72,
		);
		expect(sections).toHaveLength(1);
		expect(sections[0]!.anchorActivityId).toBe("irc-in");
		expect(sections[0]!.activityIds).toHaveLength(7);

		const output = stripTerminalSequences(sections[0]!.rows.join("\n"));
		expect(output).toContain("Planning executor delegation structure");
		expect(output).toContain("Task: executor");
		expect(output).toContain("├─ Context");
		expect(output).toContain("Resolve the consolidated verification blockers.");
		expect(output).toContain("└─ Tasks: 2 agents");
		expect(output.match(/CoreContracts · running/gu)).toHaveLength(1);
		expect(output).toContain("TodoContract · completed");
		expect(output).toContain("Model: openai-codex/gpt-5.6-terra · high");
		expect(output).toContain("Description: SessionGoal and T-note contracts");
		expect(output).toContain("└─ apply_patch");
		expect(output).toContain("ⓘ Subagent: awaiting 1 of 2");
		expect(output).toContain("[IRC] you → CoreContracts");
		expect(output).toContain("[IRC] TodoContract → you");
		expect(sections[0]!.rows.every((line) => visibleWidth(line) <= 72)).toBe(true);
	});

	test("keeps agent names and states scoped to their native turn", () => {
		const activities = [
			collabActivity(10, "old-spawn", {
				type: "collabAgentToolCall", id: "old-spawn", tool: "spawnAgent", status: "completed",
				senderThreadId: ROOT_THREAD, receiverThreadIds: ["reused-agent"], prompt: "Old task",
				agentsStates: { "reused-agent": { status: "running", message: null } },
			}, "completed", ROOT_THREAD, "turn-old"),
			collabActivity(11, "old-path", {
				type: "subAgentActivity", id: "old-path", kind: "started",
				agentThreadId: "reused-agent", agentPath: "/root/OldAgent",
			}, "completed", ROOT_THREAD, "turn-old"),
			collabActivity(12, "new-spawn", {
				type: "collabAgentToolCall", id: "new-spawn", tool: "spawnAgent", status: "completed",
				senderThreadId: ROOT_THREAD, receiverThreadIds: ["reused-agent"], prompt: "New task",
				agentsStates: { "reused-agent": { status: "completed", message: null } },
			}, "completed", ROOT_THREAD, "turn-new"),
			collabActivity(13, "new-path", {
				type: "subAgentActivity", id: "new-path", kind: "completed",
				agentThreadId: "reused-agent", agentPath: "/root/NewAgent",
			}, "completed", ROOT_THREAD, "turn-new"),
		];
		const sections = projectWorkbenchDelegationSections(activities, "fallback", ROOT_THREAD, 72);
		expect(sections).toHaveLength(2);
		const oldOutput = stripTerminalSequences(sections[0]!.rows.join("\n"));
		const newOutput = stripTerminalSequences(sections[1]!.rows.join("\n"));
		expect(oldOutput).toContain("OldAgent · running");
		expect(oldOutput).not.toContain("NewAgent");
		expect(newOutput).toContain("NewAgent · completed");
		expect(newOutput).not.toContain("OldAgent");
	});

	test("uses the latest reordered lifecycle state for queued, failed, and cancelled agents", () => {
		const activities = [
			collabActivity(1, "spawn-agents", {
				type: "collabAgentToolCall", id: "spawn-agents", tool: "spawnAgent", status: "completed",
				senderThreadId: ROOT_THREAD, receiverThreadIds: ["queued", "failed", "cancelled"],
				prompt: "Run focused checks", settings: { model: "gpt-5.6-terra", reasoning_effort: "medium" },
				agentsStates: {
					queued: { status: "queued", message: "waiting" },
					failed: { status: "failed", message: "tool error" },
					cancelled: { status: "cancelled", message: "cancelled by parent" },
				},
			}),
			collabActivity(2, "queued-path", {
				type: "subAgentActivity", id: "queued-path", kind: "started",
				agentThreadId: "queued", agentPath: "/root/QueuedAgent",
			}),
			collabActivity(3, "spawn-agents-update", {
				type: "collabAgentToolCall", id: "spawn-agents", tool: "spawnAgent", status: "completed",
				senderThreadId: ROOT_THREAD, receiverThreadIds: ["queued", "failed", "cancelled"],
				prompt: "Run focused checks", settings: { model: "gpt-5.6-terra", reasoning_effort: "medium" },
				agentsStates: {
					queued: { status: "completed", message: "passed" },
					failed: { status: "failed", message: "tool error" },
					cancelled: { status: "cancelled", message: "cancelled by parent" },
				},
			}),
		];
		const sections = projectWorkbenchDelegationSections(activities, "goal", ROOT_THREAD, 72);
		const output = stripTerminalSequences(sections[0]!.rows.join("\n"));
		expect(output.match(/QueuedAgent · completed/gu)).toHaveLength(1);
		expect(output).toContain("Agent 2 · errored");
		expect(output).toContain("Agent 3 · interrupted");
		expect(output).toContain("Model: gpt-5.6-terra · medium");
		const narrow = projectWorkbenchDelegationSections(activities, "goal", ROOT_THREAD, 42);
		expect(narrow[0]!.rows.every((line) => visibleWidth(line) <= 42)).toBe(true);
	});

	test("preserves native nested activity messages while excluding ordinary collaboration tools", () => {
		const activities = [
			collabActivity(1, "spawn", {
				type: "collabAgentToolCall", id: "spawn", tool: "spawnAgent", status: "inProgress",
				senderThreadId: ROOT_THREAD, receiverThreadIds: ["agent-child"], prompt: "Inspect the native boundary",
				model: "gpt-5.6-terra", reasoningEffort: "high",
				agentsStates: { "agent-child": { status: "running", message: "Reading raw event fixtures" } },
			}),
			collabActivity(2, "nested-message", {
				type: "subAgentActivity", id: "nested-message", kind: "interacted",
				agentThreadId: "agent-child", agentPath: "/root/NativeObserver",
				message: "Found both lifecycle payloads",
			}),
			collabActivity(3, "ordinary-tool", {
				type: "collabToolCall", id: "ordinary-tool", tool: "search", status: "completed",
				senderThreadId: ROOT_THREAD, receiverThreadIds: ["agent-unrelated"],
			}),
		];
		const output = stripTerminalSequences(
			projectWorkbenchDelegationSections(activities, "goal", ROOT_THREAD, 100)[0]!.rows.join("\n"),
		);
		expect(output).toContain("NativeObserver · running");
		expect(output).toContain("Model: gpt-5.6-terra · high");
		expect(output).toContain("Found both lifecycle payloads");
		expect(output).not.toContain("agent-unrelated");
	});

	test("projects native call and subagent payloads into one stable delegated task", () => {
		const activities = [
			collabActivity(1, "spawn", {
				type: "collabAgentToolCall", id: "spawn-native", tool: "spawnAgent", status: "inProgress",
				senderThreadId: ROOT_THREAD, receiverThreadIds: ["agent-native"], prompt: "Audit event attribution",
				settings: { model: "gpt-5.6-terra", reasoning_effort: "medium" },
				agentsStates: { "agent-native": { status: "running", message: "Collecting lifecycle events" } },
			}),
			collabActivity(2, "subagent", {
				type: "subAgentActivity", id: "subagent-native", kind: "completed",
				agentThreadId: "agent-native", message: "Projection verified",
			}),
		];
		const projection = projectNativeDelegation(activities);
		expect(projection).toHaveLength(1);
		expect(projection[0]!.tasks).toEqual([expect.objectContaining({
			id: "agent-native",
			parentId: ROOT_THREAD,
			status: "completed",
			task: "Audit event attribution",
			model: "gpt-5.6-terra",
			reasoningEffort: "medium",
			activities: [
				expect.objectContaining({ itemId: "spawn-native", message: "Collecting lifecycle events" }),
				expect.objectContaining({ itemId: "subagent-native", message: "Projection verified" }),
			],
		})]);
	});

	test("renders the grouped tree in Chat instead of the old one-line collaboration notice", () => {
		const activities = collaborationActivities();
		const snapshot: WorkbenchSnapshot = {
			projectId: "sample-project",
			revision: 1,
			journalSequence: 7,
			phase: "working",
			mcpServers: [],
			threadId: ROOT_THREAD,
			activeTurnId: TURN,
			activities,
			selectedActivityId: null,
			pendingApproval: null,
			chat: [],
			chatQueue: [],
			draft: "",
			reasoningDraft: "",
			liveActivity: null,
			workFlow: workFlowFor(activities),
			tnotes: [],
			todo: null,
			actionResult: null,
			error: null,
		};
		const output = stripTerminalSequences(new WorkbenchChatView(snapshot).render(72).join("\n"));
		expect(output).toContain("Task: executor");
		expect(output).toContain("Tasks: 2 agents");
		expect(output).toContain("[IRC] you → CoreContracts");
		expect(output).not.toContain("작업 시작됨");
	});

	test("stays absent when the App Server has not emitted collaboration items", () => {
		expect(projectWorkbenchDelegationSections([], "goal", ROOT_THREAD, 72)).toEqual([]);
	});
	test("requires native turn and item references for observed trace nodes and keeps source visible when compact", () => {
		const observed = collaborationActivities().slice(0, 2);
		const missingItemRef = {
			...observed[0]!,
			id: "missing-item-ref",
			sequence: 8,
			nativeRefs: { threadId: ROOT_THREAD, turnId: TURN },
			sourceDigest: `sha256:${"8".padStart(64, "0")}`,
		};
		const sections = projectWorkbenchDelegationSections(
			[missingItemRef, ...observed],
			"goal",
			ROOT_THREAD,
			42,
		);
		expect(sections).toHaveLength(1);
		expect(sections[0]!.activityIds).not.toContain("missing-item-ref");
		expect(sections[0]).toMatchObject({
			attribution: "observed",
			source: { turnId: TURN },
		});
		const output = stripTerminalSequences(sections[0]!.rows.join("\n"));
		expect(output).toContain("Source: observed native turn/item");
		expect(sections[0]!.rows.every((line) => visibleWidth(line) <= 42)).toBe(true);
	});

	test("keeps a failed spawn visible before the server assigns a receiver thread", () => {
		const activities = [collabActivity(1, "spawn-failed", {
			type: "collabAgentToolCall",
			id: "spawn-failed",
			tool: "spawnAgent",
			status: "failed",
			senderThreadId: ROOT_THREAD,
			receiverThreadIds: [],
			prompt: "Presentation QA agent",
			agentsStates: {},
		})];
		const snapshot: WorkbenchSnapshot = {
			projectId: "sample-project", revision: 1, journalSequence: 1, phase: "working",
			mcpServers: [],
			threadId: ROOT_THREAD, activeTurnId: TURN, activities, selectedActivityId: null,
			pendingApproval: null, chat: [], chatQueue: [], draft: "", reasoningDraft: "",
			liveActivity: null, workFlow: workFlowFor(activities), tnotes: [], todo: null,
			actionResult: null, error: null,
		};
		const output = stripTerminalSequences(new WorkbenchChatView(snapshot).render(72).join("\n"));
		expect(output).toContain("Presentation QA agent 작업 실패");
		expect(output).not.toContain("단계 1");
	});
});
