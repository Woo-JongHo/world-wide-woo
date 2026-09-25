import { describe, expect, test }               from "bun:test";
import { renderLayoutFrame }                    from "@earendil-works/pi-tui/dist/layout.js";
import type { LayoutBox }                       from "@earendil-works/pi-tui/dist/layout.js";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import chalk                                    from "chalk";
import type { WorkbenchSnapshot }               from "../src/core/domain/work/workbench";
import { createDashboardLayout }                from "../src/adapters/inbound/tui/foundation/layout/dashboard-layout";
import { StatusLine, WorkspaceTodoView }        from "../src/adapters/inbound/tui/features/dashboard/shared-dashboard-views";
import { WorkbenchChatView }                    from "../src/adapters/inbound/tui/features/chat/workbench-views";
import { EntryDashboardView }                   from "../src/adapters/inbound/tui/features/dashboard/entry-dashboard-view";
import { TNotesSourceView }                     from "../src/adapters/inbound/tui/features/tnote/t-notes-source-view";
import { WorkbenchMonitorView }                 from "../src/adapters/inbound/tui/features/monitoring/workbench-monitor-view";
import { WorkbenchTracerView }                  from "../src/adapters/inbound/tui/features/trace/workbench-tracer-view";
import { boundedPublicProjection }              from "../src/adapters/inbound/tui/features/chat/bounded-public-projection";
import {
	approvalCardRows,
	projectApprovalBackgroundState,
} from "../src/adapters/inbound/tui/features/approval/approval-presentation";
import { projectWorkFlow }                      from "../src/core/domain/work";
import type { DplanHash }                       from "../src/core/domain/work";

import {
	allScrollContent,
	approvalPresentation,
	fixtureWorkFlow,
	hash,
	renderChatWithDashboard,
	snapshot,
} from "./workbench-views.fixtures";

describe("workbench public projection and layout views", () => {
	test("leaves the resting status line blank instead of advertising commands", () => {
		const output = stripTerminalSequences(new StatusLine("").render(240).join("\n"));
		expect(output.trim()).toBe("");
		expect(output).not.toContain("/model");
		expect(output).not.toContain("/woo-entry");
	});

	test("keeps immutable action results out of completed-question notes", () => {
		const withAction = {
			...snapshot,
			actionResult: {
				kind      : "promotion",
				title     : "Note promotion preview",
				body      : "--- Todo.md\n+++ Todo.md\n@@\n- old\n+ new\ncurrentSource: # current\npending: # pending",
				digest    : "a".repeat(64),
				createdAt : "2026-09-01T00:00:02.000Z",
			},
		} as WorkbenchSnapshot;
		const output = stripTerminalSequences(new TNotesSourceView(() => withAction).render(100).join("\n"));
		expect(output).toContain("note-1");
		expect(output).not.toContain("ACTION");
		expect(output).not.toContain("Note promotion preview");
		expect(output).not.toContain("currentSource");
	});

	test("keeps selected activity payloads out of completed-question notes", () => {
		const selected: WorkbenchSnapshot = {
			...snapshot,
			journalSequence: 7,
			activities: [{
				...snapshot.activities[0]!,
				id: "activity-public-7",
				sequence: 7,
				kind: "tool",
				phase: "completed",
				provider: "openai-codex",
				nativeRefs: { threadId: "thread-secret", turnId: "turn-secret", itemId: "item-secret" },
				sourceDigest: `sha256:${"b".repeat(64)}`,
				payload: {
					method: "item/completed",
					params: {
						item: {
							id               : "native-item-secret",
							type             : "commandExecution",
							command          : "bun test",
							aggregatedOutput : "12 pass",
							hiddenReasoning  : "비공개 판단",
							accessToken      : "source-token-secret",
						},
						rawEnvelope: { requestId: "rpc-secret", noisy: true },
					},
				},
			}],
			selectedActivityId: "activity-public-7",
			chat: [],
		};
		const output = stripTerminalSequences(new TNotesSourceView(() => selected).render(100).join("\n"));
		expect(output).not.toContain("activity-public-7");
		expect(output).not.toContain("bun test");
		expect(output).not.toContain("thread-secret");
		expect(output).not.toContain("native-item-secret");
		expect(output).not.toContain("rawEnvelope");
		expect(output).not.toContain("hiddenReasoning");
		expect(output).not.toContain("accessToken");
		expect(output).not.toContain("source-token-secret");
		expect(output).not.toContain("rpc-secret");
	});

	test("bounds public Source strings and total projection before JSON rendering", () => {
		const hugeOutput = `output-start AWS_SECRET_ACCESS_KEY=very-secret-value \u001b]0;front-osc-secret\u0007 https://user:password@example.com ${"x".repeat(5 * 1024 * 1024)} \u001b]2;tail-osc-secret\u0007 tail_token=tail-secret-value AKIA1234567890ABCDEF output-end`;
		const hugePayload = {
			method: "item/completed",
			params: {
				item: {
					type             : "commandExecution",
					command          : "large-output-command",
					aggregatedOutput : hugeOutput,
					accessToken      : "source-token-secret",
					hiddenReasoning  : "비공개 판단",
				},
				many: Object.fromEntries(Array.from({ length: 2_000 }, (_, index) => [`field-${index}`, "v".repeat(200)])),
			},
		};
		const startedAt  = performance.now()                    ;
		const projection = boundedPublicProjection(hugePayload) ;
		const serialized = JSON.stringify(projection.value)     ;
		expect(projection.omitted).toBe(true);
		expect(serialized.length).toBeLessThan(20_000);
		expect(serialized).toContain("output-start");
		expect(serialized).toContain("output-end");
		expect(serialized).not.toContain("source-token-secret");
		expect(serialized).not.toContain("비공개 판단");
		expect(serialized).not.toContain("very-secret-value");
		expect(serialized).not.toContain("front-osc-secret");
		expect(serialized).not.toContain("tail-osc-secret");
		expect(serialized).not.toContain("tail-secret-value");
		expect(serialized).not.toContain("user:password");
		expect(serialized).not.toContain("AKIA1234567890ABCDEF");

		const selected: WorkbenchSnapshot = {
			...snapshot,
			activities: [{ ...snapshot.activities[0]!, payload: hugePayload }],
			selectedActivityId: "activity-1",
		};
		const sourceView = new TNotesSourceView(() => selected)                      ;
		const output     = stripTerminalSequences(sourceView.render(100).join("\n")) ;
		const repeated   = stripTerminalSequences(sourceView.render(100).join("\n")) ;
		expect(performance.now() - startedAt).toBeLessThan(500);
		expect(output).not.toContain("SOURCE");
		expect(output).not.toContain("large-output-command");
		expect(output).not.toContain("output-start");
		expect(output).not.toContain("output-end");
		expect(output).not.toContain("source-token-secret");
		expect(output).not.toContain("비공개 판단");
		expect(output).not.toContain("very-secret-value");
		expect(output).not.toContain("front-osc-secret");
		expect(output).not.toContain("tail-osc-secret");
		expect(output).not.toContain("tail-secret-value");
		expect(repeated).toBe(output);
		expect(hugePayload.params.item.aggregatedOutput).toBe(hugeOutput);
	});

	test("bounds large work-step output without leaking edge credentials", () => {
		const outputText = `step-start password=front-password ${"x".repeat(3 * 1024 * 1024)} token=tail-token step-end`;
		const command: WorkbenchSnapshot = {
			...snapshot,
			activities: [{
				...snapshot.activities[0]!,
				id: "bounded-command",
				kind: "tool",
				payload: {
					method: "item/completed",
					params: { item: { type: "commandExecution", command: "large-command", aggregatedOutput: outputText } },
				},
			}],
			chat: [],
			selectedActivityId: null,
		};
		const output = stripTerminalSequences(new WorkbenchChatView({
			...command,
			workFlow: fixtureWorkFlow(command.activities),
		}).render(100).join("\n"));
		expect(output).toContain("step-end");
		expect(output).not.toContain("front-password");
		expect(output).not.toContain("tail-token");
		expect(output.length).toBeLessThan(8_000);
	});

	test("bounds action result body by characters and lines before rendering Source", () => {
		const actionOnly: WorkbenchSnapshot = {
			...snapshot,
			activities         : [],
			chat               : [],
			selectedActivityId : null,
			actionResult: {
				kind: "promotion",
				title: "large preview",
				body: [
					`action-start password=front-password ${"x".repeat(3 * 1024 * 1024)}`,
					...Array.from({ length: 220 }, (_, index) => `line-${String(index).padStart(3, "0")}`),
					"action-end token=tail-token",
				].join("\n"),
				createdAt: "2026-09-01T00:00:02.000Z",
			},
		};
		const output = stripTerminalSequences(new TNotesSourceView(() => actionOnly).render(100).join("\n"));
		expect(output).not.toContain("action-start");
		expect(output).not.toContain("action-end");
		expect(output).not.toContain("ACTION");
	});

	test.each([[120, 30], [70, 24]])("keeps titleless Chat, Notes, and Todo content reachable at %ix%i", (width, height) => {
		const layout = createDashboardLayout(
			() => "WWW · sample-project",
			{ color: text => text, component: new WorkbenchChatView(snapshot) },
			{ color: text => text, component: new TNotesSourceView(() => snapshot) },
			{ color: text => text, component: new WorkspaceTodoView(() => snapshot.todo) },
		);
		const frame = renderLayoutFrame(layout.component, width, height, () => undefined);
		const output = stripTerminalSequences([
			...frame.lines,
			...allScrollContent(frame.root),
		].join("\n"));
		expect(output).not.toContain("Chat · Native");
		expect(output).not.toContain("Notes · 질문별 요약");
		expect(output).not.toContain("Notes · 세션 요약");
		expect(output).not.toContain("Todo.md · 현재 작업");
		expect(output).toContain("결정 요약");
		expect(output).not.toContain("SOURCE");
	});

	test.each([40, 80, 120])("keeps an incomplete answer reachable through the full TUI layout at %i columns", (width) => {
		const incomplete: WorkbenchSnapshot = {
			...snapshot,
			activities: [{
				...snapshot.activities[0]!,
				payload: { role: "assistant", text: "레이아웃에 보존된 부분 답변", partial: true, finalObservation: "missing" },
			}],
			chat: [{
				...snapshot.chat[0]!,
				content: "레이아웃에 보존된 부분 답변",
				status: "incomplete",
				partial: true,
			}],
		};
		const layout = createDashboardLayout(
			() => "WWW · sample-project",
			{ color: text => text, component: new WorkbenchChatView(incomplete) },
			{ color: text => text, component: new TNotesSourceView(() => incomplete) },
			{ color: text => text, component: new WorkspaceTodoView(() => incomplete.todo) },
		);
		const frame = renderLayoutFrame(layout.component, width, 24, () => undefined);
		const output = stripTerminalSequences([
			...frame.lines,
			...allScrollContent(frame.root),
		].join("\n"));

		expect(output).toContain("레이아웃에 보존된 부분 답변");
		expect(output).toContain("부분 응답 · 최종 본문 미수신");
		expect(frame.lines.every((line) => visibleWidth(line) <= width)).toBe(true);
	});

	test("keeps following the newest user message when repeated delivery states extend Chat", () => {
		const failedConversation = (count: number): WorkbenchSnapshot => {
			const activities = Array.from({ length: count }, (_, index) => ({
				...snapshot.activities[0]!,
				id         : `failed-activity-${index + 1}`,
				sequence   : index + 1,
				kind       : "message" as const,
				phase      : "failed" as const,
				nativeRefs : { threadId: "thread-1", itemId: `failed-message-${index + 1}` },
				payload    : { direction: "outbound", role: "user", text: `반복 요청 ${index + 1}` },
			}));
			return {
				...snapshot,
				revision: count,
				journalSequence: count,
				activities,
				chat: activities.map((activity, index) => ({
					id         : activity.nativeRefs.itemId!,
					role       : "user" as const,
					content    : `반복 요청 ${index + 1}`,
					activityId : activity.id,
					status     : "failed" as const,
				})),
				workFlow: projectWorkFlow([]),
			};
		};
		const initial = failedConversation(6);
		const chat = new WorkbenchChatView(initial);
		const layout = createDashboardLayout(
			() => "WWW · sample-project",
			{ color: text => text, component: chat },
			{ color: text => text, component: new TNotesSourceView(() => initial) },
			{ color: text => text, component: new WorkspaceTodoView(() => null) },
		);
		renderLayoutFrame(layout.component, 120, 14, () => undefined);
		const previousScrollTop = layout.leftScroll.scrollTop;

		chat.update(failedConversation(7));
		const frame = renderLayoutFrame(layout.component, 120, 14, () => undefined);
		const output = stripTerminalSequences(frame.lines.join("\n"));

		expect(layout.leftScroll.isFollowingEnd).toBe(true);
		expect(layout.leftScroll.scrollTop).toBeGreaterThan(previousScrollTop);
		expect(output).toContain("반복 요청 7");
	});

	test("does not restore chat auto-follow while wheel scrolling concurrent streaming output", () => {
		const conversation = (count: number): WorkbenchSnapshot => {
			const activities = Array.from({ length: count }, (_, index) => ({
				...snapshot.activities[0]!,
				id         : `activity-${index}`,
				sequence   : index + 1,
				nativeRefs : { threadId: "thread-1", itemId: `message-${index}` },
				payload    : { role: "assistant", text: `streaming message ${index}\n${"detail\n".repeat(3)}` },
			}));
			return {
				...snapshot,
				revision: count,
				journalSequence: count,
				activities,
				chat: activities.map((activity, index) => ({
					id         : `message-${index}`,
					activityId : activity.id,
					role       : "assistant" as const,
					content    : `streaming message ${index}\n${"detail\n".repeat(3)}`,
					status     : "completed" as const,
				})),
			};
		};
		const chat = new WorkbenchChatView(conversation(12));
		const layout = createDashboardLayout(
			() => "WWW · sample-project",
			{ color: text => text, component: chat },
			{ color: text => text, component: new TNotesSourceView(() => snapshot) },
			{ color: text => text, component: new WorkspaceTodoView(() => null) },
		);
		renderLayoutFrame(layout.component, 120, 14, () => undefined);
		const offsets: number[] = [];

		for (const count of [13, 14, 15]) {
			chat.update(conversation(count));
			layout.leftScroll.scrollBy(-2);
			renderLayoutFrame(layout.component, 120, 14, () => undefined);
			offsets.push(layout.leftScroll.scrollTop);
		}

		expect(offsets[1]).toBeLessThan(offsets[0]!);
		expect(offsets[2]).toBeLessThan(offsets[1]!);
		expect(layout.leftScroll.isFollowingEnd).toBe(false);
		layout.leftScroll.scrollToEnd();
		expect(layout.leftScroll.isFollowingEnd).toBe(true);
	});
});


test("renders a local workflow result even before a Native conversation exists", () => {
	const output = stripTerminalSequences(new WorkbenchChatView({
		...snapshot, chat: [], activities: [], workFlow: { ...snapshot.workFlow, steps: [] },
		actionResult: { kind: "workflow", title: "로컬 Workflow 사전 검사", body: "Run: run-1\n로컬 사전 검사; 원격 미검증", createdAt: "2026-09-08T00:00:00Z" },
	}).render(80).join("\n"));
	expect(output).toContain("Run: run-1");
	expect(output).toContain("원격 미검증");
});
