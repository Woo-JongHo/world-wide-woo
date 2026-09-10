import { describe, expect, test } from "bun:test";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import type { ProjectActivity, ProjectActivityPhase } from "../src/core/domain/execution/project-activity";
import type { WorkbenchSnapshot } from "../src/core/domain/work/workbench";
import { projectNativeDelegation, projectWorkFlow, type DplanHash } from "../src/core/domain/work";
import { projectWorkbenchDelegationSections, renderDelegationDetail, renderDelegationSummary } from "../src/adapters/inbound/tui/dashboard/delegation-tree-view";
import { WorkbenchChatView } from "../src/adapters/inbound/tui/chat/workbench-views";

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

	test("keeps lifecycle, identity, and attempts authoritative when events arrive out of order", () => {
		const activities = [
			collabActivity(1, "early", { type: "subAgentActivity", id: "early", kind: "started", agentThreadId: "child", agentPath: "/root/Worker" }),
			collabActivity(2, "spawn-a", { type: "collabAgentToolCall", id: "spawn-a", tool: "spawnAgent", status: "completed", senderThreadId: ROOT_THREAD, receiverThreadIds: ["child"], prompt: "First assignment" }),
			collabActivity(3, "message", { type: "collabAgentToolCall", id: "message", tool: "sendMessage", status: "completed", senderThreadId: ROOT_THREAD, receiverThreadIds: ["child"], prompt: "Do not retask", agentsStates: { child: { status: "running" } } }),
			collabActivity(4, "done", { type: "subAgentActivity", id: "done", kind: "completed", agentThreadId: "child", message: "First result" }),
			collabActivity(5, "spawn-b", { type: "collabAgentToolCall", id: "spawn-b", tool: "spawnAgent", status: "completed", senderThreadId: ROOT_THREAD, receiverThreadIds: ["child"], prompt: "Second assignment", agentsStates: { child: { status: "errored", message: "Second failed" } } }),
		];
		const tasks = projectNativeDelegation(activities, ROOT_THREAD)[0]!.tasks;
		expect(tasks).toHaveLength(2);
		expect(tasks[0]).toMatchObject({ attempt: 1, parentId: ROOT_THREAD, role: "Worker", task: "First assignment", status: "completed", result: "First result" });
		expect(tasks[1]).toMatchObject({ attempt: 2, parentId: ROOT_THREAD, task: "Second assignment", status: "failed", result: null });
		expect(tasks[0]!.ref).not.toBe(tasks[1]!.ref);
	});

	test("resolves nested ownership across turns and attaches only public child work", () => {
		const childSpawn = collabActivity(1, "child-spawn", {
			type: "collabAgentToolCall", id: "child-spawn", tool: "spawnAgent", status: "completed",
			senderThreadId: ROOT_THREAD, receiverThreadIds: ["child"], prompt: "Own child task",
			agentsStates: { child: { status: "running" } },
		}, "completed", ROOT_THREAD, "root-turn");
		const grandchildSpawn = collabActivity(3, "grandchild-spawn", {
			type: "collabAgentToolCall", id: "grandchild-spawn", tool: "spawnAgent", status: "completed",
			senderThreadId: "child", receiverThreadIds: ["grandchild"], prompt: "Nested task",
			agentsStates: { grandchild: { status: "running" } },
		}, "completed", "child", "child-turn");
		const childTool: ProjectActivity = {
			...childSpawn, id: "child-tool", sequence: 2, kind: "tool", phase: "completed",
			nativeRefs: { threadId: "child", turnId: "child-turn", itemId: "tool-1" },
			payload: { method: "item/completed", params: { item: { type: "commandExecution", tool: "shell", output: "tests passed" } } },
		};
		const childReasoning: ProjectActivity = {
			...childTool, id: "child-reasoning", sequence: 4, kind: "progress", nativeRefs: { threadId: "child", turnId: "child-turn", itemId: "reasoning-1" },
			payload: { method: "item/reasoning/completed", params: { item: { type: "reasoning", text: "private chain" } } },
		};
		const unrelated = collabActivity(5, "other-spawn", {
			type: "collabAgentToolCall", id: "other-spawn", tool: "spawnAgent", status: "completed",
			senderThreadId: "other-root", receiverThreadIds: ["other-child"], prompt: "Unrelated",
		}, "completed", "other-root", "other-turn");
		const projections = projectNativeDelegation([childSpawn, childTool, grandchildSpawn, childReasoning, unrelated], ROOT_THREAD);
		const tasks = projections.flatMap((projection) => projection.tasks);
		expect(tasks.map((task) => task.id)).toEqual(["child", "grandchild"]);
		expect(tasks.find((task) => task.id === "grandchild")?.parentRef).toBe(tasks.find((task) => task.id === "child")?.ref);
		expect(tasks.find((task) => task.id === "child")?.activities).toEqual(expect.arrayContaining([
			expect.objectContaining({ activityId: "child-tool", kind: "shell", message: "tests passed" }),
		]));
		expect(JSON.stringify(tasks)).not.toContain("private chain");
		expect(JSON.stringify(tasks)).not.toContain("Unrelated");
	});

	test("scopes repeated native spawn item ids by sender thread and turn", () => {
		const projections = projectNativeDelegation([
			collabActivity(1, "root-spawn", { type: "collabAgentToolCall", id: "spawn", tool: "spawnAgent", senderThreadId: ROOT_THREAD, receiverThreadIds: ["child"], prompt: "Child", agentsStates: { child: { status: "running" } } }, "completed", ROOT_THREAD, "root-turn"),
			collabActivity(2, "nested-spawn", { type: "collabAgentToolCall", id: "spawn", tool: "spawnAgent", senderThreadId: "child", receiverThreadIds: ["grandchild"], prompt: "Grandchild", agentsStates: { grandchild: { status: "running" } } }, "completed", "child", "child-turn"),
		], ROOT_THREAD);
		const tasks = projections.flatMap((projection) => projection.tasks);
		expect(tasks.map((task) => task.id)).toEqual(["child", "grandchild"]);
		expect(tasks[1]!.parentRef).toBe(tasks[0]!.ref);
	});

	test("keeps delayed child-turn events on their bound attempt and rejects ambiguous new turns", () => {
		const spawnOne = collabActivity(1, "spawn-one", {
			type: "collabAgentToolCall", id: "spawn-one", tool: "spawnAgent", senderThreadId: ROOT_THREAD,
			receiverThreadIds: ["child"], prompt: "Attempt one", agentsStates: { child: { status: "running" } },
		}, "completed", ROOT_THREAD, "root-turn");
		const childEvent = (sequence: number, id: string, turnId: string, output: string): ProjectActivity => ({
			...spawnOne, id, sequence, kind: "tool", phase: "completed",
			nativeRefs: { threadId: "child", turnId, itemId: id },
			payload: { method: "item/completed", params: { item: { type: "commandExecution", tool: "shell", output } } },
		});
		const spawnTwo = collabActivity(3, "spawn-two", {
			type: "collabAgentToolCall", id: "spawn-two", tool: "spawnAgent", senderThreadId: ROOT_THREAD,
			receiverThreadIds: ["child"], prompt: "Attempt two", agentsStates: { child: { status: "running" } },
		}, "completed", ROOT_THREAD, "root-turn");
		const tasks = projectNativeDelegation([
			spawnOne,
			childEvent(2, "old-first", "child-old-turn", "old first"),
			spawnTwo,
			childEvent(4, "old-delayed", "child-old-turn", "old delayed"),
			childEvent(5, "ambiguous", "child-new-unknown-turn", "must not not attach"),
		], ROOT_THREAD).flatMap((projection) => projection.tasks);
		expect(tasks).toHaveLength(2);
		expect(tasks[0]!.activities.map((activity) => activity.activityId)).toEqual(expect.arrayContaining(["old-first", "old-delayed"]));
		expect(tasks[1]!.activities.map((activity) => activity.activityId)).not.toContain("old-delayed");
		expect(JSON.stringify(tasks)).not.toContain("must not attach");
	});

	test("renders an aggregate parentRef tree in DFS order with sanitized selectable refs", () => {
		const base = { attempt: 1, role: null, status: "running" as const, task: null, model: null, reasoningEffort: null, activities: [], result: null };
		const tasks = [
			{ ...base, ref: "root\u001b[31m", id: "root", role: "root", parentId: ROOT_THREAD, parentRef: null },
			{ ...base, ref: "sibling", id: "sibling", role: "sibling", parentId: ROOT_THREAD, parentRef: null },
			{ ...base, ref: "child", id: "child", role: "Child\u001b[2J", parentId: "root", parentRef: "root\u001b[31m" },
		];
		const output = stripTerminalSequences(renderDelegationSummary(tasks, "goal", 120).join("\n"));
		expect(output.indexOf("root · running")).toBeLessThan(output.indexOf("Child · running"));
		expect(output.indexOf("Child · running")).toBeLessThan(output.indexOf("sibling · running"));
		expect(output).toContain("Ref: root");
		expect(output).toContain("│  └─");
		const detail = stripTerminalSequences(renderDelegationDetail({ ...tasks[2]!, model: "bad\u001b[31m", activities: [{ activityId: "a", itemId: "i", kind: "tool\u001b[2J", message: "ok", senderId: null, receiverIds: [], attribution: "observed", source: { turnId: "t", itemId: "i" } }] }, 120).join("\n"));
		expect(detail).not.toContain("\u001b");
		expect(detail).toContain("Ref: child");
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
