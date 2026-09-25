import legacyJournal                                          from "./fixtures/legacy-execution-receipt.json";
import type { RuntimeToolHandler, RuntimeToolDefinition }     from "../src/core/ports/execution/runtime-tool-port";
import { REQUEST_STAGES }                                     from "../src/core/domain/execution/request-runtime";
import type { RequestRuntimeRecord }                          from "../src/core/domain/execution/request-runtime";
import { projectRequestTodo }                                 from "../src/core/domain/work/request-projections";
import { describe, expect, test }                             from "bun:test";
import type { ExecutorPort }                                  from "../src/core/ports/execution/executor-port";
import type {
	ActivityNarrationRequest,
	ActivityNarrator,
} from "../src/core/application/orchestration/activity-narrator";
import { ProjectWorkbench }                                   from "../src/core/application/orchestration/project-workbench";
import type {
	WorkbenchActivityJournal,
	WorkbenchTNoteSource,
	WorkbenchTodoSource,
} from "../src/core/application/orchestration/project-workbench";
import type {
	NativeApprovalResolution,
	NativeHarnessEvent,
	NativeThreadRead,
	NativeThreadList,
	NativeThreadResume,
	NativeThreadSnapshot,
	NativeThreadStart,
	NativeThreadSummary,
	NativeTurnInterrupt,
	NativeTurnSnapshot,
	NativeTurnStart,
	NativeTurnSteer,
	NativeTurnSteerResult,
} from "../src/core/domain/execution/native-session";
import type {
	ProjectActivity,
	ProjectActivityAppendResult,
	ProjectActivityInput,
} from "../src/core/domain/execution/project-activity";
import { CanonicalPromotionService, digestCanonicalDocument } from "../src/core/application/work/canonical-promotion";
import { ReviewService }                                      from "../src/core/application/review/review-service";
import { SessionModelUsageAccumulator }                       from "../src/core/application/session/session-model-usage";
import { TodoWriteConflictError }                             from "../src/core/application/work/todo-ledger";
import { WooEntry }                                           from "../src/core/application/orchestration/woo-entry";
import type { WooEntryCollection }                            from "../src/core/application/orchestration/woo-entry";
import type { TodoDocument }                                  from "../src/core/domain/work/todos";
import type { WorkFlowProjection }                            from "../src/core/domain/work";
import { ProviderReviewAdapter, sha256ReviewDigest }          from "../src/adapters/outbound/review/review-adapters";
import { TNoteService }                                       from "../src/core/application/work/t-note-service";
import type { DetachedTextGenerator }                         from "../src/core/application/orchestration/detached-text-generator";
import { FileTNoteStore }                                     from "../src/adapters/outbound/persistence/t-note-store";
import { projectTNoteCompletionIndex, sanitizeTNoteText }     from "../src/core/domain/work/t-notes";
import { mkdtemp, rm, writeFile, readFile, realpath }         from "node:fs/promises";
import { createHash }                                         from "node:crypto";
import { pinnedFileCapabilities }                             from "../src/adapters/outbound/workspace/pinned-file-capabilities";
import { tmpdir }                                             from "node:os";
import { join }                                               from "node:path";

import {
	ApprovalPreparationGateJournal,
	FakeActivityNarrator,
	FakeNativeHarness,
	MemoryJournal,
	MessageCompletionGateJournal,
	ToolObservationGateJournal,
	ready,
	todoDocument,
} from "./project-workbench.fixtures";

describe("ProjectWorkbench · recovery, approvals, and durable commands", () => {
	test("keeps deltas ephemeral and durably appends completed native observations before publishing", async () => {
		const native = new FakeNativeHarness();
		const journal = new MemoryJournal();
		const workbench = new ProjectWorkbench(native, journal, {
			projectId: "sample-project",
			cwd: "/workspace/sample",
		});
		await ready(workbench);
		const observedJournalSizes: number[] = [];
		const unsubscribe = workbench.subscribe((snapshot) => {
			if (snapshot.activities.length > 0) observedJournalSizes.push(journal.records.length);
		});
		native.emit({
			type   : "notification",
			method : "item/agentMessage/delta",
			refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "message-1" },
			params : { delta: "진행 중" },
		});
		await Bun.sleep(10);
		expect(journal.records).toHaveLength(0);
		expect(workbench.snapshot.journalSequence).toBe(0);
		expect(workbench.snapshot.draft).toBe("진행 중");
		native.emit({
			type   : "notification",
			method : "item/completed",
			refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "message-1" },
			params : { item: { type: "agentMessage", text: "진행 완료" } },
		});
		await Bun.sleep(10);
		expect(journal.records).toHaveLength(1);
		expect(observedJournalSizes).toEqual([1]);
		expect(workbench.snapshot.journalSequence).toBe(1);
		expect(workbench.snapshot.chat[0]?.content).toBe("진행 완료");
		expect(workbench.snapshot.draft).toBe("");
		expect(Object.isFrozen(workbench.snapshot)).toBe(true);
		expect(Object.isFrozen(workbench.snapshot.activities)).toBe(true);
		expect(() => (workbench.snapshot.activities as ProjectActivity[]).push(journal.records[0]!)).toThrow();
		unsubscribe();
		await workbench.close();
	});

	test("shares frozen durable projections across deltas after a large activity history", async () => {
		const native = new FakeNativeHarness();
		const journal = new MemoryJournal();
		for (let index = 0; index < 100; index += 1) {
			await journal.append({
				projectId    : "sample-project",
				kind         : "message",
				phase        : "completed",
				provider     : "openai-codex",
				nativeRefs   : { threadId: "thread-1", itemId: `history-${index}` },
				sourceDigest : `sha256:${String(index).padStart(64, "0")}`,
				payload: {
					role: "assistant",
					text: index === 99 ? `large:${"x".repeat(1024 * 1024)}` : `history-${index}`,
				},
			});
		}
		const workbench = new ProjectWorkbench(native, journal, {
			projectId      : "sample-project",
			cwd            : "/workspace/sample",
			resumeThreadId : "thread-1",
		});
		await ready(workbench);
		const before = workbench.snapshot;
		expect(before.activityCount).toBe(101);
		expect(before.activities).toHaveLength(101);
		const largeActivity = before.activities.find(activity => String(activity.payload.text).startsWith("large:"));
		const largeChat = before.chat.find(message => message.content.startsWith("large:"));
		expect(largeActivity).toBeDefined();
		expect(largeChat).toBeDefined();

		native.emit({
			type   : "notification",
			method : "item/agentMessage/delta",
			refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "draft-1" },
			params : { delta: "첫 delta" },
		});
		await Bun.sleep(10);
		const afterFirstDelta = workbench.snapshot;
		native.emit({
			type   : "notification",
			method : "item/agentMessage/delta",
			refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "draft-1" },
			params : { delta: " + 두 번째 delta" },
		});
		await Bun.sleep(10);
		const afterSecondDelta = workbench.snapshot;

		expect(afterFirstDelta.activities).toBe(before.activities);
		expect(afterSecondDelta.activities).toBe(before.activities);
		expect(afterSecondDelta.activities.find(activity => activity.id === largeActivity?.id)).toBe(largeActivity);
		expect(afterFirstDelta.chat).toBe(before.chat);
		expect(afterSecondDelta.chat).toBe(before.chat);
		expect(afterSecondDelta.journalSequence).toBe(before.journalSequence);
		expect(afterSecondDelta.revision).toBeGreaterThan(before.revision);
		expect(afterFirstDelta.draft).toBe("첫 delta");
		expect(afterSecondDelta.draft).toBe("첫 delta + 두 번째 delta");
		expect(Object.isFrozen(afterSecondDelta)).toBe(true);
		expect(Object.isFrozen(afterSecondDelta.activities)).toBe(true);
		expect(Object.isFrozen(largeActivity)).toBe(true);
		expect(Object.isFrozen(largeActivity?.payload)).toBe(true);
		expect(Object.isFrozen(afterSecondDelta.chat)).toBe(true);
		expect(Object.isFrozen(largeChat)).toBe(true);
		await workbench.close();
	});

	test("bounds live drafts and raw native envelopes while preserving the full safe completed assistant reply", async () => {
		const native = new FakeNativeHarness();
		const journal = new MemoryJournal();
		const workbench = new ProjectWorkbench(native, journal, {
			projectId: "sample-project",
			cwd: "/workspace/sample",
		});
		await ready(workbench);
		for (let index = 0; index < 80; index += 1) {
			native.emit({
				type   : "notification",
				method : "item/agentMessage/delta",
				refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "large-message" },
				params : { delta: `${String(index).padStart(2, "0")}:${"a".repeat(1020)}` },
			});
			native.emit({
				type   : "notification",
				method : "item/reasoning/delta",
				refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "large-reasoning" },
				params : { delta: `${String(index).padStart(2, "0")}:${"r".repeat(1020)}` },
			});
		}
		await Bun.sleep(10);

		expect(workbench.snapshot.draft.length).toBeLessThanOrEqual(32 * 1024);
		expect(workbench.snapshot.draft).toMatch(/^… 이전 출력 \d+자 생략\n/);
		expect(workbench.snapshot.draft).toEndWith(`79:${"a".repeat(1020)}`);
		expect(workbench.snapshot.reasoningDraft.length).toBeLessThanOrEqual(20 * 1024);
		expect(workbench.snapshot.reasoningDraft).toMatch(/^… 이전 출력 \d+자 생략\n/);
		expect(workbench.snapshot.reasoningDraft).toEndWith(`79:${"r".repeat(1020)}`);
		expect(journal.records).toHaveLength(0);

		const completedMessage = `complete password=message-secret\n${"m".repeat(40_000)}\nhttps://user:tail-secret@example.com/end`;
		const completedReasoning = `reasoning:${"q".repeat(30_000)}`;
		native.emit({
			type   : "notification",
			method : "item/completed",
			refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "large-message" },
			params : { item: { type: "agentMessage", text: completedMessage } },
		});
		native.emit({
			type   : "notification",
			method : "item/completed",
			refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "large-reasoning" },
			params : { item: { type: "reasoning", text: completedReasoning } },
		});
		await Bun.sleep(10);

		const storedMessage = ((journal.records[0]?.payload.params as { item?: { text?: string } })?.item?.text) ?? "";
		const publicMessage = String(journal.records[0]?.payload.text ?? "");
		expect(storedMessage.length).toBeLessThanOrEqual(32 * 1024);
		expect(storedMessage).toStartWith("complete password=[redacted]");
		expect(storedMessage).toContain("…[output truncated]");
		expect(storedMessage).toEndWith("https://[redacted]@example.com/end");
		expect(publicMessage.length).toBeGreaterThan(32 * 1024);
		expect(publicMessage).toStartWith("complete password=[redacted]");
		expect(publicMessage).not.toContain("…[output truncated]");
		expect(publicMessage).toEndWith("https://[redacted]@example.com/end");
		expect(journal.records[0]?.payload.observationTruncated).toBe(true);
		expect(journal.records[0]?.sourceDigest).toMatch(/^sha256:[a-f0-9]{64}$/u);
		expect(JSON.stringify(journal.records[0]?.payload)).not.toContain("message-secret");
		expect(JSON.stringify(journal.records[0]?.payload)).not.toContain("tail-secret");
		expect(journal.records[1]?.payload).toMatchObject({ classification: "reasoning", redacted: true });
		expect(JSON.stringify(journal.records[1]?.payload)).not.toContain(completedReasoning);
		expect(workbench.snapshot.draft).toBe("");
		expect(workbench.snapshot.reasoningDraft).toBe("");
		await workbench.close();
	});

	test("separates public reasoning summaries from raw reasoning content", async () => {
		const native = new FakeNativeHarness();
		const journal = new MemoryJournal();
		const workbench = new ProjectWorkbench(native, journal, {
			projectId: "sample-project",
			cwd: "/workspace/sample",
		});
		await ready(workbench);

		native.emit({
			type   : "notification",
			method : "item/reasoning/summaryTextDelta",
			refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "reasoning-1" },
			params : { delta: "Planning semantic color token adjustments" },
		});
		native.emit({
			type   : "notification",
			method : "item/reasoning/textDelta",
			refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "reasoning-1" },
			params : { delta: "raw chain of thought must stay hidden" },
		});
		await Bun.sleep(10);

		expect(workbench.snapshot.reasoningSummaryDraft).toBe("Planning semantic color token adjustments");
		expect(workbench.snapshot.reasoningSummaryDraft).not.toContain("raw chain of thought");

		native.emit({
			type   : "notification",
			method : "item/completed",
			refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "reasoning-1" },
			params: { item: {
				type    : "reasoning",
				summary : ["Planning semantic color token adjustments"],
				content : ["raw chain of thought must stay hidden"],
			} },
		});
		await Bun.sleep(10);

		expect(journal.records.at(-1)?.payload).toMatchObject({
			classification : "reasoning",
			redacted       : true,
			publicSummary  : "Planning semantic color token adjustments",
		});
		expect(JSON.stringify(journal.records.at(-1)?.payload)).not.toContain("raw chain of thought");
		expect(workbench.snapshot.reasoningSummaryDraft).toBe("");
		await workbench.close();
	});

	test("resumes without native turns and reconciles the opaque thread against local activity", async () => {
		const native = new FakeNativeHarness();
		const journal = new MemoryJournal();
		const workbench = new ProjectWorkbench(native, journal, {
			projectId      : "sample-project",
			cwd            : "/workspace/sample",
			resumeThreadId : "opaque-native-thread",
		});
		await ready(workbench);
		expect(native.resumeCalls).toBe(1);
		expect(native.readCalls).toBe(1);
		expect(native.resumeInputs).toEqual([{
			threadId: "opaque-native-thread",
			cwd: "/workspace/sample",
			approvalPolicy: "on-request",
			sandbox: "workspace-write",
			excludeTurns: true,
		}]);
		expect(native.readInputs).toEqual([{ threadId: "opaque-native-thread", includeTurns: true }]);
		expect(workbench.snapshot.threadId).toBe("opaque-native-thread");
		expect(workbench.snapshot.resumeCoverage).toEqual({
			mode                         : "partial-local-journal",
			processAttachedAt            : expect.any(String),
			priorProviderHistoryHydrated : false,
		});
		expect(workbench.snapshot.journalSequence).toBe(1);
		expect(journal.records[0]?.payload).toMatchObject({
			method: "thread/resume-local-reconciled",
			historyHydrated: false,
		});
		await workbench.close();
	});

	test("fails closed before reading or journaling when native resume returns another thread", async () => {
		const native = new FakeNativeHarness();
		native.resumeThreadId = "unexpected-thread";
		const journal = new MemoryJournal();
		const workbench = new ProjectWorkbench(native, journal, {
			projectId      : "sample-project",
			cwd            : "/workspace/sample",
			resumeThreadId : "requested-thread",
		});

		await expect(workbench.waitUntilReady()).rejects.toThrow("requested-thread");
		expect(native.readCalls).toBe(0);
		expect(journal.records).toEqual([]);
		await workbench.close();
	});

	test("fails closed before journaling when thread read returns another resumed thread", async () => {
		const native = new FakeNativeHarness();
		native.readThreadId = "unexpected-read-thread";
		const journal = new MemoryJournal();
		const workbench = new ProjectWorkbench(native, journal, {
			projectId      : "sample-project",
			cwd            : "/workspace/sample",
			resumeThreadId : "requested-thread",
		});

		await expect(workbench.waitUntilReady()).rejects.toThrow("unexpected-read-thread");
		expect(native.readInputs).toEqual([{ threadId: "requested-thread", includeTurns: true }]);
		expect(journal.records).toEqual([]);
		await workbench.close();
	});

	test("uses native idle state instead of reviving an unterminated historical turn on resume", async () => {
		const native = new FakeNativeHarness();
		native.readValue = {
			status: { type: "idle" },
			turns: [{ id: "turn-dead", status: "inProgress" }],
		};
		const journal = new MemoryJournal();
		journal.records.push({
			schemaVersion : 1,
			id            : "stale-turn-start",
			projectId     : "sample-project",
			sequence      : 1,
			recordedAt    : "2026-09-01T00:00:00.000Z",
			kind          : "progress",
			phase         : "started",
			provider      : "openai-codex",
			nativeRefs    : { threadId: "thread-1", turnId: "turn-dead" },
			sourceDigest  : `sha256:${"e".repeat(64)}`,
			payload       : { method: "turn/start" },
		});
		const workbench = new ProjectWorkbench(native, journal, {
			projectId      : "sample-project",
			cwd            : "/workspace/sample",
			resumeThreadId : "thread-1",
		});
		await ready(workbench);

		expect(workbench.snapshot.activeTurnId).toBeNull();
		expect(await workbench.dispatch({ type: "chat.send", text: "재개 후 새 요청" })).toMatchObject({ state: "accepted" });
		expect(native.startTurnInputs.map((input) => input.text)).toEqual(["재개 후 새 요청"]);
		await workbench.close();
	});

	test("queues behind the exact in-progress native turn discovered during resume", async () => {
		const native = new FakeNativeHarness();
		native.readValue = {
			status: { type: "active" },
			turns: [{ id: "turn-live", status: "inProgress" }],
		};
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
			projectId      : "sample-project",
			cwd            : "/workspace/sample",
			resumeThreadId : "thread-1",
		});
		await ready(workbench);

		expect(workbench.snapshot.activeTurnId).toBe("turn-live");
		expect(await workbench.dispatch({ type: "chat.send", text: "재개 대기 요청" })).toMatchObject({ state: "queued", position: 1 });
		native.emit({
			type   : "notification",
			method : "item/started",
			refs   : { threadId: "thread-1", turnId: "turn-live", itemId: "live-tool" },
			params : { item: { type: "commandExecution", command: "pwd" } },
		});
		await Bun.sleep(10);
		expect(workbench.snapshot.activeTurnId).toBe("turn-live");

		native.emit({ type: "notification", method: "turn/completed", refs: { threadId: "thread-1", turnId: "turn-live" }, params: {} });
		await Bun.sleep(10);
		expect(native.startTurnInputs.map((input) => input.text)).toEqual(["재개 대기 요청"]);
		expect(workbench.snapshot.chatQueue).toEqual([]);
		await workbench.close();
	});

	test("projects command output deltas as ephemeral tool activity rather than assistant text", async () => {
		const native = new FakeNativeHarness();
		const journal = new MemoryJournal();
		const workbench = new ProjectWorkbench(native, journal, {
			projectId: "sample-project",
			cwd: "/workspace/sample",
		});
		await ready(workbench);
		native.emit({
			type   : "notification",
			method : "item/commandExecution/outputDelta",
			refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "command-1" },
			params : { delta: "checking files\n" },
		});
		await Bun.sleep(10);
		expect(journal.records).toHaveLength(0);
		expect(workbench.snapshot.draft).toBe("");
		expect(workbench.snapshot.liveActivity).toMatchObject({
			method : "item/commandExecution/outputDelta",
			kind   : "tool",
			text   : "checking files\n",
		});
		await workbench.close();
	});

	test("does not clear live activity for the same item id completed by another turn", async () => {
		const native = new FakeNativeHarness();
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
			projectId: "sample-project",
			cwd: "/workspace/sample",
		});
		await ready(workbench);
		native.emit({
			type   : "notification",
			method : "item/commandExecution/outputDelta",
			refs   : { threadId: "thread-1", turnId: "turn-current", itemId: "same-command" },
			params : { delta: "현재 실행" },
		});
		await Bun.sleep(10);

		native.emit({
			type   : "notification",
			method : "item/completed",
			refs   : { threadId: "thread-1", turnId: "turn-old", itemId: "same-command" },
			params : { item: { type: "commandExecution", command: "pwd" } },
		});
		await Bun.sleep(10);

		expect(workbench.snapshot.liveActivity).toMatchObject({
			text: "현재 실행",
			nativeRefs: { threadId: "thread-1", turnId: "turn-current", itemId: "same-command" },
		});
		await workbench.close();
	});

	test("keeps sparse live deltas on one observed owner and clears its sparse completion", async () => {
		const native = new FakeNativeHarness();
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
			projectId: "sample-project",
			cwd: "/workspace/sample",
		});
		await ready(workbench);
		native.emit({
			type   : "notification",
			method : "item/commandExecution/outputDelta",
			refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "sparse-command" },
			params : { delta: "first" },
		});
		native.emit({
			type   : "notification",
			method : "item/commandExecution/outputDelta",
			refs   : { turnId: "turn-1", itemId: "sparse-command" },
			params : { delta: " second" },
		});
		await Bun.sleep(10);
		expect(workbench.snapshot.liveActivity?.text).toBe("first second");

		native.emit({
			type   : "notification",
			method : "item/completed",
			refs   : { threadId: "thread-1", itemId: "sparse-command" },
			params : { item: { type: "commandExecution", command: "pwd" } },
		});
		await Bun.sleep(10);
		expect(workbench.snapshot.liveActivity).toBeNull();
		await workbench.close();
	});

	test("bounds repeated live tool deltas to a recent tail with cumulative omission metadata", async () => {
		const native = new FakeNativeHarness();
		const journal = new MemoryJournal();
		const workbench = new ProjectWorkbench(native, journal, {
			projectId: "sample-project",
			cwd: "/workspace/sample",
		});
		await ready(workbench);
		for (let index = 0; index < 80; index += 1) {
			native.emit({
				type   : "notification",
				method : "item/commandExecution/outputDelta",
				refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "large-command" },
				params : { delta: `${String(index).padStart(2, "0")}:${"x".repeat(1020)}` },
			});
		}
		await Bun.sleep(10);

		const text = workbench.snapshot.liveActivity?.text ?? "";
		expect(text.length).toBeLessThanOrEqual(32 * 1024);
		expect(text).toStartWith("… 이전 출력 49200자 생략\n");
		expect(text).toEndWith(`79:${"x".repeat(1020)}`);
		expect(journal.records).toHaveLength(0);

		const completedOutput = `complete token=tool-secret\n${"z".repeat(40_000)}\ncommand-tail`;
		native.emit({
			type   : "notification",
			method : "item/completed",
			refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "large-command" },
			params : { item: { type: "commandExecution", text: completedOutput } },
		});
		await Bun.sleep(10);
		const storedOutput = ((journal.records[0]?.payload.params as { item?: { text?: string } })?.item?.text) ?? "";
		expect(storedOutput.length).toBeLessThanOrEqual(32 * 1024);
		expect(storedOutput).toStartWith("complete token=[redacted]");
		expect(storedOutput).toContain("…[output truncated]");
		expect(storedOutput).toEndWith("command-tail");
		expect(journal.records[0]?.payload.observationTruncated).toBe(true);
		expect(JSON.stringify(journal.records[0]?.payload)).not.toContain("tool-secret");
		expect(workbench.snapshot.liveActivity).toBeNull();
		await workbench.close();
	});

	test("journals MCP startup status as hidden progress instead of a Chat tool card", async () => {
		const native = new FakeNativeHarness();
		const journal = new MemoryJournal();
		const workbench = new ProjectWorkbench(native, journal, {
			projectId: "sample-project",
			cwd: "/workspace/sample",
		});
		await ready(workbench);
		native.emit({
			type   : "notification",
			method : "mcpServer/startupStatus/updated",
			refs   : {},
			params : { server: "filesystem", status: "ready", rawStartup: { noisy: true } },
		});
		await Bun.sleep(10);
		expect(journal.records[0]?.kind).toBe("progress");
		expect(workbench.snapshot.chat).toEqual([]);
		await workbench.close();
	});

	test("never infers a native resume from historical local activities", async () => {
		const historicalApproval = {
			requestId          : 91,
			callbackId         : "old-callback",
			kind               : "command" as const,
			refs               : { threadId: "th-old", approvalRequestId: 91, approvalCallbackId: "old-callback" },
			availableDecisions : ["decline" as const],
			params             : { command: "old" },
		};
		const journal = new MemoryJournal();
		journal.records.push({
			schemaVersion : 1,
			id            : "old-approval",
			projectId     : "sample-project",
			sequence      : 1,
			recordedAt    : "2026-09-01T00:00:00.000Z",
			kind          : "approval",
			phase         : "started",
			provider      : "openai-codex",
			nativeRefs    : historicalApproval.refs,
			sourceDigest  : `sha256:${"d".repeat(64)}`,
			payload       : { approval: historicalApproval },
		});
		journal.records.push({
			schemaVersion : 1,
			id            : "old-message",
			projectId     : "sample-project",
			sequence      : 2,
			recordedAt    : "2026-09-01T00:00:01.000Z",
			kind          : "message",
			phase         : "completed",
			provider      : "openai-codex",
			nativeRefs    : { threadId: "thread-1", itemId: "old-message" },
			sourceDigest  : `sha256:${"e".repeat(64)}`,
			payload       : { direction: "outbound", role: "user", text: "이전 세션 메시지" },
		});
		const native = new FakeNativeHarness();
		const fresh = new ProjectWorkbench(native, journal, {
			projectId: "sample-project",
			cwd: "/workspace/sample",
		});
		await ready(fresh);
		expect(fresh.snapshot.threadId).toBeNull();
		expect(fresh.snapshot.activities).toEqual([]);
		expect(fresh.snapshot.chat).toEqual([]);
		expect(fresh.snapshot.pendingApproval).toBeNull();
		expect(await fresh.dispatch({ type: "chat.send", text: "새 대화" })).toMatchObject({ state: "accepted" });
		expect(native.startThreadCalls).toBe(1);
		await fresh.close();

		const resumedNative = new FakeNativeHarness();
		const resumed = new ProjectWorkbench(resumedNative, journal, {
			projectId      : "sample-project",
			cwd            : "/workspace/sample",
			resumeThreadId : "thread-1",
		});
		await ready(resumed);
		expect(resumed.snapshot.threadId).toBe("thread-1");
		expect(resumed.snapshot.activities.every(activity => activity.nativeRefs.threadId === "thread-1")).toBe(true);
		expect(resumed.snapshot.chat.some(message => message.content === "이전 세션 메시지")).toBe(true);
		expect(resumed.snapshot.pendingApproval).toBeNull();
		await resumed.close();
	});

	test("returns uncertain without retrying an ambiguous native send", async () => {
		const native = new FakeNativeHarness();
		native.uncertain = true;
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
			projectId: "sample-project",
			cwd: "/workspace/sample",
		});
		await ready(workbench);
		const receipt = await workbench.dispatch({ type: "chat.send", text: "/skills" });
		expect(receipt).toMatchObject({ state: "uncertain", resolution: "manual-reconcile" });
		expect(native.startTurnCalls).toBe(1);
		expect(workbench.snapshot.chat.at(-1)?.content).toBe("/skills");
		expect(workbench.snapshot.chat.at(-1)?.status).toBe("failed");
		expect(await workbench.dispatch({ type: "chat.send", text: "불명확한 전송 뒤 요청" }))
			.toMatchObject({ state: "queued", position: 1 });
		expect(native.startTurnCalls).toBe(1);
		await workbench.close();
	});

	test("rejects invalid local commands without touching native state", async () => {
		const native = new FakeNativeHarness();
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
			projectId: "sample-project",
			cwd: "/workspace/sample",
		});
		await ready(workbench);
		expect(await workbench.dispatch({ type: "activity.select", activityId: "missing" }))
			.toMatchObject({
				state: "rejected",
				selection: { state: "failed", failure: { code: "activity_not_found" }, coverage: { mode: "fresh" } },
			});
		expect(await workbench.dispatch({ type: "trace.select", activityId: "missing" }))
			.toMatchObject({
				state: "rejected",
				selection: { state: "failed", failure: { code: "activity_not_found" }, coverage: { mode: "fresh" } },
			});
		expect(await workbench.dispatch({ type: "tnote.capture", activityIds: ["missing"] }))
			.toMatchObject({ state: "rejected" });
		expect(native.startTurnCalls).toBe(0);
		await workbench.close();
	});

	test("selects Trace by exact activity across turns that reuse an item id", async () => {
		const native = new FakeNativeHarness();
		const journal = new MemoryJournal();
		const workbench = new ProjectWorkbench(native, journal, {
			projectId: "sample-project",
			cwd: "/workspace/sample",
		});
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "첫 요청" });
		native.emit({
			type   : "notification",
			method : "turn/plan/updated",
			refs   : { threadId: "thread-1", turnId: "turn-1" },
			params : { plan: [{ step: "같은 제목", status: "inProgress" }] },
		});
		native.emit({
			type   : "notification",
			method : "item/completed",
			refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "same-item" },
			params : { item: { id: "same-item", type: "commandExecution", command: "first" } },
		});
		await Bun.sleep(10);
		const first = journal.records.find((activity) => activity.nativeRefs.turnId === "turn-1" && activity.nativeRefs.itemId === "same-item");
		expect(first).toBeDefined();
		expect(await workbench.dispatch({ type: "trace.select", activityId: first!.id })).toMatchObject({
			state: "accepted",
			selection: {
				state       : "selected",
				identity    : { activityId: first!.id, threadId: "thread-1", turnId: "turn-1", itemId: "same-item" },
				attribution : { identity: "observed", planAssociation: "inferred" },
			},
		});

		native.emit({ type: "notification", method: "turn/completed", refs: { threadId: "thread-1", turnId: "turn-1" }, params: {} });
		await Bun.sleep(10);
		await workbench.dispatch({ type: "chat.send", text: "둘째 요청" });
		native.emit({
			type   : "notification",
			method : "turn/plan/updated",
			refs   : { threadId: "thread-1", turnId: "turn-2" },
			params : { plan: [{ step: "같은 제목", status: "inProgress" }] },
		});
		native.emit({
			type   : "notification",
			method : "item/completed",
			refs   : { threadId: "thread-1", turnId: "turn-2", itemId: "same-item" },
			params : { item: { id: "same-item", type: "commandExecution", command: "second" } },
		});
		await Bun.sleep(10);
		const second = journal.records.find((activity) => activity.nativeRefs.turnId === "turn-2" && activity.nativeRefs.itemId === "same-item");
		expect(second).toBeDefined();
		expect(await workbench.dispatch({ type: "trace.select", activityId: second!.id })).toMatchObject({
			state: "accepted",
			selection: { state: "selected", identity: { activityId: second!.id, turnId: "turn-2", itemId: "same-item" } },
		});
		expect(await workbench.dispatch({ type: "trace.select", activityId: first!.id })).toMatchObject({
			state: "rejected",
			selection: { state: "failed", failure: { code: "turn_mismatch", activityId: first!.id } },
		});
		expect(await workbench.dispatch({ type: "trace.select", activityId: "same-item" })).toMatchObject({
			state: "rejected",
			selection: { state: "failed", failure: { code: "activity_not_found", activityId: "same-item" } },
		});
		expect(workbench.snapshot.selectedActivityId).toBe(second!.id);
		await workbench.close();
	});

	test("routes native approval and detached Note commands through their explicit ports", async () => {
		const native = new FakeNativeHarness();
		const journal = new MemoryJournal();
		const source: ProjectActivity = {
			schemaVersion : 1,
			id            : "source-1",
			projectId     : "sample-project",
			sequence      : 1,
			recordedAt    : "2026-09-01T00:00:00.000Z",
			kind          : "message",
			phase         : "completed",
			provider      : "openai-codex",
			nativeRefs    : { threadId: "thread-1", itemId: "item-1" },
			sourceDigest  : `sha256:${"b".repeat(64)}`,
			payload       : { text: "검토할 내용" },
		};
		journal.records.push(source);
		const tnotes = {
			async readAll() { return []; },
			async create(input: Parameters<NonNullable<ConstructorParameters<typeof ProjectWorkbench>[2]["tnotes"]>["create"]>[0]) {
				return {
					schemaVersion : 1 as const,
					id            : "note-1",
					sequence      : 1,
					createdAt     : "2026-09-01T00:00:01.000Z",
					packet: {
						schemaVersion : 1 as const,
						projectId     : input.projectId,
						range         : input.range,
						createdAt     : "2026-09-01T00:00:01.000Z",
						activities    : input.activities.map((activity) => ({ ...activity, nativeRefs: activity.nativeRefs ?? [] })),
						digest        : "c".repeat(64),
					},
					text: "질문: 선택한 활동\n왜: 선택한 활동을 확인했습니다.\n결과: 결정과 남은 위험을 요약했습니다.",
					provenance: { provider: "openai-codex", model: "gpt-5.6-sol", version: "test" },
				};
			},
		};
		const workbench = new ProjectWorkbench(native, journal, {
			projectId: "sample-project",
			cwd: "/workspace/sample",
			tnotes,
		});
		await ready(workbench);
		native.emit({
			type: "approval-requested",
			approval: {
				requestId          : 9,
				callbackId         : "callback-9",
				kind               : "command",
				refs               : { threadId: "thread-1", approvalRequestId: 9, approvalCallbackId: "callback-9" },
				availableDecisions : ["acceptForSession", "decline"],
				params             : { command: "git status" },
			},
		});
		await Bun.sleep(10);
		expect(workbench.snapshot.pendingApproval?.requestId).toBe(9);
		expect(await workbench.dispatch({ type: "approval.resolve", requestId: 9, response: { decision: "accept" } }))
			.toMatchObject({ state: "rejected" });
		expect(await workbench.dispatch({ type: "approval.resolve", requestId: 9, response: { decision: "acceptForSession" } }))
			.toMatchObject({ state: "accepted" });
		expect(native.approvalResponses).toEqual([{ requestId: 9, response: { decision: "acceptForSession" } }]);
		expect(await workbench.dispatch({ type: "tnote.capture-range", startSequence: 1, endSequence: 1 }))
			.toMatchObject({ state: "rejected" });
		await workbench.close();
	});

	test("reaches Todo mutations and preserves both CAS conflict documents in the immutable action result", async () => {
		let snapshot = todoDocument();
		const calls: string[] = [];
		const todos = {
			get snapshot() { return snapshot; },
			subscribe() { return () => undefined; },
			async create() { calls.push("create"); return snapshot; },
			async add() { calls.push("add"); return snapshot; },
			async addDetails() { calls.push("details"); return snapshot; },
			async start() { calls.push("start"); return snapshot; },
			async complete() { calls.push("complete"); return snapshot; },
			async block() { calls.push("block"); return snapshot; },
			async reopen() { calls.push("reopen"); return snapshot; },
			async recordEvidence() { calls.push("evidence"); return snapshot; },
			async importLegacy() { calls.push("import"); return "/workspace/.www/vault/Todo.md"; },
		};
		const journal = new MemoryJournal();
		journal.records.push({ schemaVersion: 1, id: "evidence-1", projectId: "sample-project", sequence: 1, recordedAt: "2026-09-01T00:00:00.000Z", kind: "tool", phase: "completed", provider: "openai-codex", nativeRefs: {}, sourceDigest: `sha256:${"a".repeat(64)}`, payload: {} });
		const workbench = new ProjectWorkbench(new FakeNativeHarness(), journal, { projectId: "sample-project", cwd: "/workspace/sample", todos });
		await ready(workbench);
		await workbench.dispatch({ type: "todo.create", title: "작업", items: ["구현"] });
		await workbench.dispatch({ type: "todo.add", placement: "after", content: "검증" });
		await workbench.dispatch({ type: "todo.details", itemId: "todo-1", details: ["세부"] });
		for (const action of ["start", "complete", "block", "reopen"] as const) await workbench.dispatch({ type: "todo.transition", action, itemId: "todo-1" });
		await workbench.dispatch({ type: "todo.evidence", activityId: "evidence-1" });
		await workbench.dispatch({ type: "todo.import-legacy" });
		expect(calls).toEqual(["create", "add", "details", "start", "complete", "block", "reopen", "evidence", "import"]);
		expect(workbench.snapshot.actionResult).toMatchObject({ kind: "todo", title: "Legacy Todo 가져오기" });
		expect(Object.isFrozen(workbench.snapshot.actionResult)).toBe(true);

		const pending = todoDocument(1);
		todos.create = async () => { throw new TodoWriteConflictError("# current", pending, snapshot); };
		expect(await workbench.dispatch({ type: "todo.create", title: "충돌", items: ["대기"] })).toMatchObject({ state: "rejected" });
		expect(workbench.snapshot.actionResult?.body).toContain("# current");
		expect(workbench.snapshot.actionResult?.body).toContain('"revision":1');
		await workbench.close();
	});

	test("promotes a full Note only after a one-time token and reviews only after exact digest approval", async () => {
		let canonicalBody = "";
		const promotions = new CanonicalPromotionService({
			read: async () => ({ body: canonicalBody, digest: digestCanonicalDocument(canonicalBody) }),
			writeAtomic: async (_target, expected, body) => {
				if (expected !== digestCanonicalDocument(canonicalBody)) return { status: "conflict" as const, document: { body: canonicalBody, digest: digestCanonicalDocument(canonicalBody) } };
				canonicalBody = body;
				return { status: "written" as const, document: { body, digest: digestCanonicalDocument(body) } };
			},
		});
		const reviewCalls: unknown[] = []                                                                                                                                                 ;
		const adapter                = new ProviderReviewAdapter("anthropic", "claude-opus-5", "test", { generate: async request => { reviewCalls.push(request); return "검토 완료"; } }) ;
		const reviews                = new ReviewService(new Map([["anthropic", adapter]]), sha256ReviewDigest)                                                                           ;
		const note = {
			schemaVersion: 1 as const, id: "note-1", sequence: 1, createdAt: "2026-09-01T00:00:01.000Z",
			packet: { schemaVersion: 1 as const, projectId: "sample-project", range: { startSequence: 1, endSequence: 1 }, createdAt: "2026-09-01T00:00:01.000Z", activities: [{ id: "source-1", sequence: 1, occurredAt: "2026-09-01T00:00:00.000Z", kind: "message.completed", title: "message", body: "source", nativeRefs: [] }], digest: "c".repeat(64) },
			text: "전체 Note 본문", provenance: { provider: "openai-codex", model: "gpt-5.6-sol", version: "test" },
		};
		const workbench = new ProjectWorkbench(new FakeNativeHarness(), new MemoryJournal(), {
			projectId: "sample-project", cwd: "/workspace/sample", promotions, reviews,
			tnotes: { readAll: async () => [note], create: async () => note },
		});
		await ready(workbench);
		const accepted = await workbench.dispatch({ type: "promotion.accept", noteId: "note-1", acceptedBy: "jongho" });
		expect(accepted).toMatchObject({ state: "accepted" });
		expect(canonicalBody).toBe("");
		const token = workbench.snapshot.actionResult?.body.match(/확인 토큰: (\S+)/u)?.[1];
		expect(token).toBeTruthy();
		expect(await workbench.dispatch({ type: "promotion.confirm", token: token! })).toMatchObject({ state: "accepted" });
		expect(canonicalBody).toContain("전체 Note 본문");
		expect(await workbench.dispatch({ type: "promotion.confirm", token: token! })).toMatchObject({ state: "rejected" });

		await workbench.dispatch({ type: "review.preview", provider: "anthropic", noteId: "note-1", request: "위험 검토", confirmedPublic: true });
		const digest = workbench.snapshot.actionResult?.digest;
		expect(digest).toMatch(/^[a-f0-9]{64}$/u);
		expect(reviewCalls).toHaveLength(0);
		const wrongDigest = `${digest?.startsWith("0") ? "1" : "0"}${digest?.slice(1)}`;
		expect(await workbench.dispatch({ type: "review.send", digest: wrongDigest })).toMatchObject({ state: "rejected" });
		expect(reviewCalls).toHaveLength(0);
		expect(await workbench.dispatch({ type: "review.send", digest: digest! })).toMatchObject({ state: "accepted" });
		expect(reviewCalls).toHaveLength(1);
		expect(workbench.snapshot.actionResult).toMatchObject({ kind: "review", title: "anthropic/claude-opus-5 검토 결과" });
		expect(workbench.snapshot.actionResult?.body).toContain("provenance");
		await workbench.close();
	});
	test("keeps clipped private envelopes out of the live and preserved public response", async () => {
		const native    = new FakeNativeHarness()                                                        ;
		const journal   = new MemoryJournal()                                                            ;
		const workbench = new ProjectWorkbench(native, journal, { projectId: "sample", cwd: "/sample" }) ;
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "긴 답변" });
		const refs = { threadId: "thread-1", turnId: "turn-1", itemId: "answer" };
		native.emit({ type: "notification", method: "item/agentMessage/delta", refs,
			params: { delta: "<analysis>\n" + "PRIVATE-SECRET\n".repeat(5000) } });
		await Bun.sleep(10);
		expect(workbench.snapshot.draft).not.toContain("PRIVATE-SECRET");
		native.emit({ type: "notification", method: "item/agentMessage/delta", refs,
			params: { delta: "MORE-PRIVATE\n</analysis>\n<answer>\n공개 답변" } });
		native.emit({ type: "notification", method: "turn/interrupted", refs: { threadId: "thread-1", turnId: "turn-1" }, params: {} });
		await Bun.sleep(10);
		const partial = workbench.snapshot.chat.find(message => message.role === "assistant");
		expect(partial?.status).toBe("cancelled");
		expect(partial?.content).toContain("표시를 보류");
		expect(JSON.stringify(journal.records)).not.toContain("PRIVATE-SECRET");
		expect(JSON.stringify(journal.records)).not.toContain("MORE-PRIVATE");
		await workbench.close();
	});

	test("isolates unknown message roles and refuses a source from another thread", async () => {
		const native    = new FakeNativeHarness()                                                        ;
		const journal   = new MemoryJournal()                                                            ;
		const workbench = new ProjectWorkbench(native, journal, { projectId: "sample", cwd: "/sample" }) ;
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "질문" });
		for (const [itemId, threadId, item] of [
			["invalid", "thread-1", { type: "alienMessage", text: "SECRET-PAYLOAD" }],
			["foreign", "other-thread", { type: "agentMessage", text: "다른 대화" }],
			["valid", "thread-1", { type: "agentMessage", text: "정상 복구" }],
		] as const) native.emit({ type: "notification", method: "item/completed", refs: { threadId, turnId: "turn-1", itemId }, params: { item } });
		await Bun.sleep(10);
		expect(workbench.snapshot.chat.some(message => message.role === "system" && message.content.includes("형식을 확인"))).toBe(true);
		expect(workbench.snapshot.chat.some(message => message.content.includes("SECRET-PAYLOAD"))).toBe(false);
		expect(workbench.snapshot.chat.some(message => message.content === "정상 복구")).toBe(true);
		const foreign = journal.records.find(activity => activity.nativeRefs.threadId === "other-thread")!;
		expect(await workbench.dispatch({ type: "activity.select", activityId: foreign.id })).toMatchObject({ state: "rejected" });
		expect(workbench.snapshot.selectedActivityId).toBeNull();
		await workbench.close();
	});

	test("projects the selected run as failed exactly once and appends one durable receipt", async () => {
		const native    = new FakeNativeHarness()                                                        ;
		const journal   = new MemoryJournal()                                                            ;
		const workbench = new ProjectWorkbench(native, journal, { projectId: "sample", cwd: "/sample" }) ;
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "실패 경로" });
		const event = {
			type   : "notification" as const,
			method : "turn/failed",
			refs   : { threadId: "thread-1", turnId: "turn-1" },
			params : { turn: { id: "turn-1", status: "failed" } },
		};
		native.emit(event);
		native.emit(event);
		await Bun.sleep(10);
		expect(workbench.snapshot.executionRun?.phase).toBe("failed");
		expect(workbench.snapshot.executionRun?.receipt?.status).toBe("failed");
		expect(journal.records.filter(activity => activity.payload.method === "execution/completion-receipt")).toHaveLength(1);
		await workbench.close();
	});

	test("keeps a tool failure recoverable until the authoritative turn completion", async () => {
		const native    = new FakeNativeHarness()                                                        ;
		const journal   = new MemoryJournal()                                                            ;
		const workbench = new ProjectWorkbench(native, journal, { projectId: "sample", cwd: "/sample" }) ;
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "도구 복구 경로" });
		const refs = { threadId: "thread-1", turnId: "turn-1", itemId: "tool-1" };
		native.emit({
			type: "notification",
			method: "item/commandExecution/failed",
			refs,
			params: { item: { type: "commandExecution", command: "false" } },
		});
		await Bun.sleep(10);
		expect(workbench.snapshot.executionRun?.phase).toBe("blocked");
		expect(workbench.snapshot.executionRun?.receipt).toBeNull();
		expect(journal.records.filter(activity => activity.payload.method === "execution/completion-receipt")).toHaveLength(0);
		native.emit({
			type   : "notification",
			method : "turn/completed",
			refs   : { threadId: "thread-1", turnId: "turn-1" },
			params : { turn: { id: "turn-1", status: "completed" } },
		});
		await Bun.sleep(10);
		expect(workbench.snapshot.executionRun?.receipt?.status).toBe("completed");
		expect(journal.records.filter(activity => activity.payload.method === "execution/completion-receipt")).toHaveLength(1);
		await workbench.close();
	});

	test("native command failure preserves the public plan and records recovery without accepting work", async () => {
		const native = new FakeNativeHarness();
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), { projectId: "sample", cwd: "/sample" });
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "구현과 검증" });
		const refs = { threadId: "thread-1", turnId: "turn-1" };
		const emit = async (method: string, params: Record<string, unknown>, itemId?: string) => {
			native.emit({ type: "notification", method, refs: { ...refs, ...(itemId ? { itemId } : {}) }, params });
			await Bun.sleep(10);
		};
		await emit("turn/plan/updated", { plan: [{ step: "구현과 회귀 검증", status: "inProgress" }] });
		await emit("item/completed", { item: { type: "commandExecution", command: "bun test", status: "completed", exitCode: 1, aggregatedOutput: "1 fail" } }, "test-fail");
		expect(workbench.snapshot.todo?.items[0]?.status).toBe("in_progress");
		expect(workbench.snapshot.workFlow.steps[0]?.status).toBe("running");
		expect(workbench.snapshot.executionRun?.tasks[0]?.status).toBe("running");
		expect(workbench.snapshot.executionRun?.phase).toBe("blocked");
		expect(workbench.snapshot.executionRun?.receipt).toBeNull();
		await emit("item/started", { item: { type: "commandExecution", command: "bun test" } }, "test-retry");
		expect(workbench.snapshot.executionRun?.phase).toBe("executing");
		await emit("item/completed", { item: { type: "commandExecution", command: "bun test", status: "completed", exitCode: 0, aggregatedOutput: "1 pass" } }, "test-retry");
		await emit("turn/completed", { turn: { id: "turn-1", status: "completed" } });
		const receipt = workbench.snapshot.executionRun?.receipt;
		expect(receipt?.status).toBe("completed");
		expect(receipt?.verification).toEqual([]);
		expect(receipt?.commandResults).toMatchObject([
			{ command: "bun test", exitCode: 1, status: "failed", output: "1 fail" },
			{ command: "bun test", exitCode: 0, status: "passed", output: "1 pass" },
		]);
		expect(receipt?.remaining).toContainEqual({ summary: "구현과 회귀 검증", blocking: false });
		expect(workbench.snapshot.todo?.items[0]?.status).toBe("blocked");
		await workbench.close();
	});

	test("Native replacement plans remain in Trace without replacing the seven Todo parents", async () => {
		const native = new FakeNativeHarness();
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), { projectId: "sample", cwd: "/sample" });
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "계획 변경" });
		const refs = { threadId: "thread-1", turnId: "turn-1" };
		for (const plan of [
			[{ step: "기존 단계", status: "inProgress" }],
			[{ step: "새 단계", status: "pending" }, { step: "완료 단계", status: "completed" }],
		]) {
			native.emit({ type: "notification", method: "turn/plan/updated", refs, params: { plan } });
			await Bun.sleep(10);
		}
		expect(workbench.snapshot.todo?.items.map(item => item.content)).toEqual([...REQUEST_STAGES]);
		expect(workbench.snapshot.workFlow.steps.map(step => [step.title, step.status])).toEqual([["새 단계", "pending"], ["완료 단계", "completed"]]);
		await workbench.close();
	});

	test("local workflow commands expose stored summary and reject mutation during native execution", async () => {
		const calls: string[] = []                                                              ;
		const summary         = "로컬 사전 검사; 원격 미검증\nRun: run-1\n다음 행동: 원격 확인" ;
		const native          = new FakeNativeHarness()                                         ;
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
			projectId: "sample", cwd: "/sample", localWorkflow: {
				run     : async id => { calls.push(`check:${id}`); return { summary }; },
				resume  : async id => { calls.push(`resume:${id}`); return { summary }; },
				inspect : async id => { calls.push(`show:${id}`); return { summary }; },
			},
		});
		await ready(workbench);
		expect(await workbench.dispatch({ type: "workflow.check", processId: "RPA-001" })).toMatchObject({ state: "accepted" });
		expect(workbench.snapshot.actionResult).toMatchObject({ kind: "workflow", body: summary });
		expect(await workbench.dispatch({ type: "workflow.resume", runId: "run-1" })).toMatchObject({ state: "accepted" });
		await workbench.dispatch({ type: "chat.send", text: "구현" });
		for (const command of [{ type: "workflow.check", processId: "RPA-001" }, { type: "workflow.resume", runId: "run-1" }] as const) {
			expect(await workbench.dispatch(command)).toMatchObject({ state: "rejected" });
		}
		expect(await workbench.dispatch({ type: "workflow.show", runId: "run-1" })).toMatchObject({ state: "accepted" });
		expect(calls).toEqual(["check:RPA-001", "resume:run-1", "show:run-1"]);
		await workbench.close();
	});

	test("resumes an authenticated legacy completion without replacing its receipt digest", async () => {
		const journal = new MemoryJournal();
		journal.records.push(...JSON.parse(JSON.stringify(legacyJournal.activities)));
		const workbench = new ProjectWorkbench(new FakeNativeHarness(), journal, { projectId: "legacy", cwd: "/sample", resumeThreadId: "thread" });
		await ready(workbench);
		expect(workbench.snapshot.phase).not.toBe("error");
		expect(workbench.snapshot.executionRun?.receipt?.receiptDigest).toBe(legacyJournal.receipt.receiptDigest);
		expect(journal.records.filter(record => record.payload.method === "execution/completion-receipt")).toHaveLength(1);
		await workbench.close();
		const corruptedJournal = new MemoryJournal();
		corruptedJournal.records.push(...JSON.parse(JSON.stringify(legacyJournal.activities)));
		const storedReceipt = corruptedJournal.records.at(-1)!.payload.receipt as Record<string, unknown>;
		storedReceipt.objective = "위조된 목적";
		const corrupted = new ProjectWorkbench(new FakeNativeHarness(), corruptedJournal, { projectId: "legacy", cwd: "/sample", resumeThreadId: "thread" });
		await ready(corrupted);
		expect(corrupted.snapshot.phase).toBe("error");
		expect(corrupted.snapshot.error).toContain("Receipt와 원본 관측이 일치하지 않습니다");
		expect(corrupted.snapshot.recordingReadOnly).toBe(true);
		expect(corrupted.snapshot.activities.some(activity => activity.payload.method === "execution/completion-receipt")).toBe(true);
		expect(await corrupted.dispatch({ type: "chat.send", text: "위조 receipt 상태에서 실행" }))
			.toMatchObject({ state: "rejected", reason: expect.stringContaining("읽기 전용") });
		expect(await corrupted.dispatch({ type: "agent.select", agentRef: null })).toMatchObject({ state: "accepted" });
		await corrupted.close();
	});
});
