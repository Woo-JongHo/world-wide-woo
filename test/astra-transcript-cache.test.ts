import { expect, test }                          from "bun:test";
import { stripTerminalSequences }                from "@earendil-works/pi-tui";
import { renderLayoutFrame }                     from "@earendil-works/pi-tui/dist/layout.js";
import { AstraTranscriptView }                   from "../src/adapters/inbound/tui/features/chat/astra-execution";
import { AstraExecutionHeading, AstraWorkspace } from "../src/adapters/inbound/tui/shell/astra-surface";
import { astraFixture }                          from "./fixtures/astra-snapshot";

function largeHistory(count: number) {
	const snapshot  = astraFixture("ready")                                                                                                               ;
	const prototype = snapshot.activities[0]!                                                                                                             ;
	const content   = (index: number) => `marker-${index}: 화면에 표시되는 문장과 **강조**, 코드 \`value\`의 렌더링을 확인합니다.\n\n두 번째 문단입니다.` ;
	snapshot.activities = Array.from({ length: count }, (_, index) => ({
		...prototype,
		id         : `activity-${index}`,
		sequence   : index + 1,
		nativeRefs : { threadId: "large-thread", turnId: `turn-${index}`, itemId: `message-${index}` },
		payload    : { role: index % 2 === 0 ? "user" : "assistant", text: content(index) },
	}));
	snapshot.chat = snapshot.activities.map((activity, index) => ({
		id         : `message-${index}`,
		activityId : activity.id,
		role       : index % 2 === 0 ? "user" as const : "assistant" as const,
		content    : content(index),
		status     : "completed" as const,
	}));
	snapshot.threadId = "large-thread";
	snapshot.journalSequence = snapshot.activities.length;
	return snapshot;
}

function deepFreezeFixture<T>(value: T, seen = new WeakSet<object>()): T {
	if (!value || typeof value !== "object" || seen.has(value)) return value;
	seen.add(value);
	for (const child of Object.values(value as Record<string, unknown>)) deepFreezeFixture(child, seen);
	return Object.isFrozen(value) ? value : Object.freeze(value);
}

function immutableHistory(count: number) {
	return deepFreezeFixture(largeHistory(count));
}

function immutableToolHistory(count: number) {
	const snapshot = astraFixture("ready");
	const prototype = snapshot.activities.find(activity => activity.id === "tool-1")!;
	snapshot.activities = Array.from({ length: count }, (_, index) => ({
		...prototype,
		id         : `tool-${index}`,
		sequence   : index + 1,
		nativeRefs : { threadId: "tool-thread", turnId: `turn-${index}`, itemId: `item-${index}` },
		payload    : { params: { item: { type: "commandExecution", command: `command-${index}`, aggregatedOutput: `output-${index}`, exitCode: 0 } } },
	}));
	snapshot.chat            = []            ;
	snapshot.tnotes          = []            ;
	snapshot.threadId        = "tool-thread" ;
	snapshot.journalSequence = count         ;
	return deepFreezeFixture(snapshot);
}

test("두 폭 exact index는 byte 출력을 보존하고 최근 폭 metadata만 유지한다", () => {
	const view        = new AstraTranscriptView(astraFixture("ready")) ;
	const first80     = view.render(80)                                ;
	const first120    = view.render(120)                               ;
	const afterWidths = view.cacheMetrics()                            ;
	expect(view.render(80)).toEqual(first80);
	const exposed = view.render(80);
	exposed[0] = "호출자가 바꾼 행";
	expect(view.render(120)).toEqual(first120);
	expect(view.render(80)).toEqual(first80);
	expect(view.cacheMetrics().exactCountBuilds).toBe(afterWidths.exactCountBuilds);
	expect(view.cacheMetrics().widthStates).toBeLessThanOrEqual(8);
	expect(view.cacheMetrics().rowLogicalBytes).toBeLessThanOrEqual(8 * 1024 * 1024);
});

test("같은 thread의 동일 길이 durable 내용 변경은 이전 block을 재사용하지 않는다", () => {
	const original         = astraFixture("ready")                                                         ;
	const changedActivity  = { ...original.activities[4]!, payload: { role: "assistant", text: "OMEGA" } } ;
	const originalActivity = { ...changedActivity, payload: { role: "assistant", text: "ALPHA" } }         ;
	const before = {
		...original,
		activities: original.activities.map(activity => activity.id === originalActivity.id ? originalActivity : activity),
		chat: original.chat.map(message => message.activityId === originalActivity.id ? { ...message, content: "ALPHA" } : message),
	};
	const view = new AstraTranscriptView(before);
	view.render(80); view.render(120);
	const beforeMetrics = view.cacheMetrics();
	const after = {
		...before,
		activities: before.activities.map(activity => activity.id === changedActivity.id ? changedActivity : activity),
		chat: before.chat.map(message => message.activityId === changedActivity.id ? { ...message, content: "OMEGA" } : message),
	};
	view.update(after);
	const actualRows = view.render(120);
	const actual = stripTerminalSequences(actualRows.join("\n"));
	expect(actualRows).toEqual(new AstraTranscriptView(after).render(120));
	expect(actual).toContain("OMEGA");
	expect(actual).not.toContain("ALPHA");
	expect(view.cacheMetrics().durableCountRenderedBlocks).toBeGreaterThan(beforeMetrics.durableCountRenderedBlocks);
});

test("thread, expanded, invalidate와 dispose는 generation 자원을 정확히 폐기한다", () => {
	const snapshot = astraFixture("ready");
	const view = new AstraTranscriptView(snapshot);
	view.render(80);
	const beforeSwitch = view.cacheMetrics();
	view.update({ ...snapshot, threadId: "next-thread" });
	view.render(80);
	expect(view.cacheMetrics().durableGraphBuilds).toBeGreaterThan(beforeSwitch.durableGraphBuilds);
	expect(view.cacheMetrics().durableCountRenderedBlocks).toBeGreaterThan(beforeSwitch.durableCountRenderedBlocks);
	view.expanded = true;
	expect(view.render(80).length).toBeGreaterThan(0);
	view.invalidate();
	expect(view.cacheMetrics().rowEntries).toBe(0);
	expect(view.cacheMetrics().widthStates).toBe(0);
	view.render(80); view.dispose();
	expect(view.cacheMetrics().rowEntries).toBe(0);
	expect(view.cacheMetrics().widthStates).toBe(0);
});

test("5,000개 exact source를 끝까지 chunk 순회해 누락 없이 출력하고 row cache 상한을 지킨다", () => {
	const snapshot       = largeHistory(5_000)               ;
	const view           = new AstraTranscriptView(snapshot) ;
	const source         = view.scrollRows(80)               ;
	const rows: string[] = []                                ;
	for (let start = 0; start < source.rowCount; start += 256) rows.push(...source.rows(start, Math.min(256, source.rowCount - start)));
	const plain = stripTerminalSequences(rows.join("\n"));
	expect(rows).toHaveLength(source.rowCount);
	expect(plain).toContain("marker-0");
	expect(plain).toContain("marker-4999");
	for (let index = 0; index < 5_000; index += 1) expect(plain.split(`marker-${index}:`)).toHaveLength(2);
	expect(view.cacheMetrics().rowLogicalBytes).toBeLessThanOrEqual(8 * 1024 * 1024);
	expect(view.cacheMetrics().widthMetadataLogicalBytes).toBeLessThanOrEqual(4 * 1024 * 1024);
}, 20_000);

test("oversized block도 원문 출력은 유지하고 bounded row cache 밖에서 동작한다", () => {
	const snapshot = astraFixture("ready");
	snapshot.activities      = [snapshot.activities[0]!] ;
	snapshot.chat            = [snapshot.chat[0]!]       ;
	snapshot.journalSequence = 1                         ;
	const view = new AstraTranscriptView(snapshot);
	const rows = view.render(1_100_000);
	expect(rows.some(row => row.includes(snapshot.chat[0]!.content))).toBe(true);
	expect(view.cacheMetrics().rowLogicalBytes).toBeLessThanOrEqual(8 * 1024 * 1024);
});

test("8MiB보다 큰 volatile handoff는 보존하지 않고 exact rows로 fallback한다", () => {
	const snapshot = largeHistory(0);
	snapshot.phase = "working";
	snapshot.draft = "oversized volatile 👩🏽‍💻 e\u0301\n\n```ts\nconst partial = true;";
	const view       = new AstraTranscriptView(snapshot) ;
	const before     = view.cacheMetrics()               ;
	const source     = view.scrollRows(1_500_000)        ;
	const afterCount = view.cacheMetrics()               ;
	const rows       = source.rows(0, source.rowCount)   ;
	const afterRows  = view.cacheMetrics()               ;

	expect(rows).toHaveLength(source.rowCount);
	expect(stripTerminalSequences(rows.join("\n"))).toContain("oversized volatile");
	expect(afterCount.rowEntries).toBe(0);
	expect(afterRows.renderedBlocks - before.renderedBlocks).toBe(2);
	expect(afterRows.rowLogicalBytes).toBeLessThanOrEqual(8 * 1024 * 1024);
}, 30_000);

test("실제 AstraWorkspace는 visited 폭의 exact index를 재사용하고 visible block만 보존한다", () => {
	const snapshot = largeHistory(200);
	const workspace = new AstraWorkspace(() => snapshot, () => []);
	workspace.toggleSidebar();
	renderLayoutFrame(workspace.component, 80, 24, () => undefined);
	renderLayoutFrame(workspace.component, 120, 24, () => undefined);
	const afterWidths = workspace.transcript.cacheMetrics();
	renderLayoutFrame(workspace.component, 80, 24, () => undefined);
	expect(workspace.transcript.cacheMetrics().exactCountBuilds).toBe(afterWidths.exactCountBuilds);
	expect(workspace.transcript.cacheMetrics().requestedRows).toBeLessThan(snapshot.chat.length);
	expect(workspace.transcript.cacheMetrics().rowLogicalBytes).toBeLessThanOrEqual(8 * 1024 * 1024);
});

test("production execution heading은 긴 Chat을 매 frame dense render하지 않는다", () => {
	const snapshot = largeHistory(500);
	const workspace = new AstraWorkspace(
		() => snapshot,
		() => [],
		undefined,
		Date.now,
		true,
		null,
		undefined,
		new AstraExecutionHeading(() => snapshot),
	);
	workspace.toggleSidebar();
	renderLayoutFrame(workspace.component, 120, 36, () => undefined);
	const before = workspace.transcript.cacheMetrics();
	renderLayoutFrame(workspace.component, 120, 36, () => undefined);
	const after = workspace.transcript.cacheMetrics();

	expect(after.requestedRows - before.requestedRows).toBeLessThanOrEqual(64);
});

test("journal-only immutable revision은 graph와 retained-width repair를 모두 우회한다", () => {
	let snapshot = immutableHistory(64);
	const workspace = new AstraWorkspace(() => snapshot, () => []);
	workspace.toggleSidebar();
	renderLayoutFrame(workspace.component, 80, 24, () => undefined);
	renderLayoutFrame(workspace.component, 120, 24, () => undefined);
	const before = workspace.transcript.cacheMetrics();
	snapshot = Object.freeze({ ...snapshot, revision: snapshot.revision + 1, journalSequence: snapshot.journalSequence + 1 });
	workspace.transcript.update(snapshot);
	renderLayoutFrame(workspace.component, 80, 24, () => undefined);
	const after = workspace.transcript.cacheMetrics();

	expect(after.durableGenerationNoopReuses - before.durableGenerationNoopReuses).toBe(1);
	expect(after.durableGraphBuilds - before.durableGraphBuilds).toBe(0);
	expect(after.exactCountBuilds - before.exactCountBuilds).toBe(0);
	expect(after.durableCountReusedBlocks - before.durableCountReusedBlocks).toBe(0);
	expect(after.durableCountRenderedBlocks - before.durableCountRenderedBlocks).toBe(0);
});

test("한 snapshot에서 바뀐 N개 tool block은 retained 폭마다 정확히 N번만 count한다", () => {
	const changedCount = 6                                            ;
	let snapshot       = immutableToolHistory(changedCount)           ;
	const workspace    = new AstraWorkspace(() => snapshot, () => []) ;
	workspace.toggleSidebar();
	renderLayoutFrame(workspace.component, 80, 24, () => undefined);
	renderLayoutFrame(workspace.component, 120, 24, () => undefined);
	const before = workspace.transcript.cacheMetrics();
	snapshot = deepFreezeFixture({
		...snapshot,
		revision: snapshot.revision + 1,
		journalSequence: snapshot.journalSequence + changedCount,
		activities: snapshot.activities.map((activity, index) => ({
			...activity,
			phase: "failed" as const,
			payload: { params: { item: { type: "commandExecution", command: `changed-${index}`, aggregatedOutput: `changed-output-${index}`, exitCode: 1 } } },
		})),
	});
	workspace.transcript.update(snapshot);
	const frame = renderLayoutFrame(workspace.component, 80, 24, () => undefined) ;
	const after = workspace.transcript.cacheMetrics()                             ;
	const fresh = new AstraWorkspace(() => snapshot, () => [])                    ;
	fresh.toggleSidebar();
	const expected = renderLayoutFrame(fresh.component, 80, 24, () => undefined);

	expect(frame.lines).toEqual(expected.lines);
	expect(stripTerminalSequences(new AstraTranscriptView(snapshot).render(76).join("\n"))).toContain("changed-output-5");
	expect(after.durableCountRenderedBlocks - before.durableCountRenderedBlocks).toBe(changedCount * 2);
	expect(after.durableCountReusedBlocks - before.durableCountReusedBlocks).toBe(0);
});

test("shallow-frozen tool의 mutable grandchild는 identity count hit를 허용하지 않는다", () => {
	const snapshotBase = astraFixture("ready")                                                                                   ;
	const prototype    = snapshotBase.activities.find(activity => activity.id === "tool-1")!                                     ;
	const item         = { type: "commandExecution", command: "before-command", aggregatedOutput: "BEFORE_OUTPUT", exitCode: 0 } ;
	const payload      = Object.freeze({ params: Object.freeze({ item }) })                                                      ;
	const activity = Object.freeze({
		...prototype,
		id         : "shallow-tool",
		sequence   : 1,
		nativeRefs : Object.freeze({ threadId: "shallow-thread", turnId: "turn", itemId: "item" }),
		payload,
	});
	let snapshot = {
		...snapshotBase,
		activities      : Object.freeze([activity]),
		chat            : Object.freeze([]),
		tnotes          : Object.freeze([]),
		threadId        : "shallow-thread",
		journalSequence : 1,
	};
	const view = new AstraTranscriptView(snapshot);
	view.render(80); view.render(120);
	const before = view.cacheMetrics();
	item.command = "after-command";
	item.aggregatedOutput = "AFTER_OUTPUT";
	snapshot.revision += 1;
	snapshot.journalSequence = 2;
	view.update(snapshot);
	const output = stripTerminalSequences(view.render(80).join("\n"));
	const after = view.cacheMetrics();

	expect(output).toContain("after-command");
	expect(output).not.toContain("before-command");
	expect(after.durableGenerationNoopReuses - before.durableGenerationNoopReuses).toBe(0);
	expect(after.durableCountRenderedBlocks - before.durableCountRenderedBlocks).toBe(2);
});

test("live Terminal은 같은 5줄 window가 바뀌면 이전 row cache를 재사용하지 않는다", () => {
	const base = astraFixture("working");
	const makeSnapshot = (start: number) => ({
		...base,
		revision: base.revision + start,
		journalSequence: base.journalSequence + start,
		activities: base.activities.map(activity => activity.id === "tool-2" ? {
			...activity,
			payload: { params: { item: { command: "printf output", aggregatedOutput: Array.from({ length: 5 }, (_, index) => `output-${start + index}`).join("\n") } } },
		} : activity),
	});
	let snapshot = makeSnapshot(0)                                    ;
	const view   = new AstraTranscriptView(snapshot)                  ;
	const first  = stripTerminalSequences(view.render(80).join("\n")) ;
	const before = view.cacheMetrics()                                ;

	for (let index = 0; index < 5; index += 1) expect(first).toContain(`output-${index}`);
	expect(first).not.toContain("output-5");

	snapshot = makeSnapshot(5);
	view.update(snapshot);
	const second = stripTerminalSequences(view.render(80).join("\n"));
	const after = view.cacheMetrics();

	for (let index = 5; index < 10; index += 1) expect(second).toContain(`output-${index}`);
	expect(second).not.toContain("output-4");
	expect(after.durableCountRenderedBlocks).toBeGreaterThan(before.durableCountRenderedBlocks);
});

test("accessor와 frozen Date/Map wrapper는 immutable identity 증거가 되지 않는다", () => {
	const makeView = (payload: Readonly<Record<string, unknown>>) => {
		const base = astraFixture("ready");
		const prototype = base.activities.find(activity => activity.id === "tool-1")!;
		const activity = Object.freeze({
			...prototype, id: "wrapper-tool", sequence: 1,
			nativeRefs: Object.freeze({ threadId: "wrapper-thread", turnId: "turn", itemId: "item" }), payload,
		});
		const snapshot = {
			...base, activities: Object.freeze([activity]), chat: Object.freeze([]), tnotes: Object.freeze([]),
			threadId: "wrapper-thread", journalSequence: 1,
		};
		const view = new AstraTranscriptView(snapshot);
		view.render(80); view.render(120);
		return { snapshot, view };
	};

	let accessorItem = { type: "commandExecution", command: "accessor-before", exitCode: 0 };
	const accessorPayload: Record<string, unknown> = {};
	Object.defineProperty(accessorPayload, "params", { enumerable: true, get: () => ({ item: accessorItem }) });
	Object.freeze(accessorPayload);
	const accessor = makeView(accessorPayload);
	const accessorBefore = accessor.view.cacheMetrics();
	accessorItem = { type: "commandExecution", command: "accessor-after", exitCode: 0 };
	accessor.view.update(accessor.snapshot);
	const accessorOutput = stripTerminalSequences(accessor.view.render(80).join("\n"));
	const accessorAfter = accessor.view.cacheMetrics();
	expect(accessorOutput).toContain("accessor-after");
	expect(accessorOutput).not.toContain("accessor-before");
	expect(accessorAfter.durableCountRenderedBlocks - accessorBefore.durableCountRenderedBlocks).toBe(2);

	const mutableDate = Object.freeze(new Date("2026-09-14T00:00:00.000Z"));
	const mutableMap = Object.freeze(new Map([["state", "before"]]));
	const wrapperPayload = deepFreezeFixture({
		params: { item: { type: "commandExecution", command: "wrapper-command", exitCode: 0, mutableDate, mutableMap } },
	});
	const wrapper = makeView(wrapperPayload);
	const wrapperBefore = wrapper.view.cacheMetrics();
	mutableDate.setUTCDate(15);
	mutableMap.set("state", "after");
	wrapper.view.update(wrapper.snapshot);
	expect(wrapper.view.render(80)).toEqual(new AstraTranscriptView(wrapper.snapshot).render(80));
	const wrapperAfter = wrapper.view.cacheMetrics();
	expect(wrapperAfter.durableCountRenderedBlocks - wrapperBefore.durableCountRenderedBlocks).toBe(2);
});

test("Note 한 개 변경은 tool count를 재사용하고 두 retained 폭의 note만 다시 count한다", () => {
	let snapshot: ReturnType<typeof astraFixture> = deepFreezeFixture({
		...immutableToolHistory(2),
		tnotes: [{ id: "note-1", title: "질문", summary: "before-note-summary", sourceActivityIds: ["tool-0"], updatedAt: "2026-09-14T00:00:00.000Z" }],
	});
	const view = new AstraTranscriptView(snapshot);
	view.render(80); view.render(120);
	const before = view.cacheMetrics();
	snapshot = deepFreezeFixture({
		...snapshot, revision: snapshot.revision + 1, journalSequence: snapshot.journalSequence + 1,
		tnotes: [{ ...snapshot.tnotes[0]!, summary: "after-note-summary", updatedAt: "2026-09-14T00:01:00.000Z" }],
	});
	view.update(snapshot);
	const rows = view.render(80);
	const after = view.cacheMetrics();

	expect(rows).toEqual(new AstraTranscriptView(snapshot).render(80));
	expect(stripTerminalSequences(rows.join("\n"))).toContain("after-note-summary");
	expect(after.durableCountRenderedBlocks - before.durableCountRenderedBlocks).toBe(2);
	expect(after.durableCountReusedBlocks - before.durableCountReusedBlocks).toBe(4);
});

test("anchor 없는 Note는 public rows에 정확히 한 번만 나타난다", () => {
	const marker = "UNANCHORED_NOTE_UNIQUE_MARKER";
	const snapshot = {
		...astraFixture("ready"),
		activities: [],
		chat: [],
		tnotes: [{
			id: "unanchored-note",
			title: "독립 질문",
			summary: marker,
			sourceActivityIds: ["missing-activity"],
			updatedAt: "2026-09-14T00:00:00.000Z",
		}],
		journalSequence: 0,
	};
	const view       = new AstraTranscriptView(snapshot)             ;
	const actualRows = view.render(40)                               ;
	const freshRows  = new AstraTranscriptView(snapshot).render(40)  ;
	const plain      = stripTerminalSequences(actualRows.join("\n")) ;

	expect(actualRows).toEqual(freshRows);
	expect(view.scrollRows(40).rowCount).toBe(freshRows.length);
	expect(plain.split(marker)).toHaveLength(2);
});

test("8MiB shared row LRU에서 durable/volatile 경합은 exact output과 bounded 재렌더를 유지한다", () => {
	const base        = immutableHistory(1)                                                                     ;
	const snapshot    = deepFreezeFixture({ ...base, phase: "working" as const, draft: "volatile-lru-marker" }) ;
	const view        = new AstraTranscriptView(snapshot)                                                       ;
	const source      = view.scrollRows(900_000)                                                                ;
	const first       = source.rows(0, source.rowCount)                                                         ;
	const afterFirst  = view.cacheMetrics()                                                                     ;
	const second      = source.rows(0, source.rowCount)                                                         ;
	const afterSecond = view.cacheMetrics()                                                                     ;

	expect(second).toEqual(first);
	expect(first.some(row => stripTerminalSequences(row).includes("marker-0"))).toBe(true);
	expect(first.some(row => stripTerminalSequences(row).includes("volatile-lru-marker"))).toBe(true);
	expect(afterFirst.rowLogicalBytes).toBeLessThanOrEqual(8 * 1024 * 1024);
	expect(afterSecond.rowLogicalBytes).toBeLessThanOrEqual(8 * 1024 * 1024);
	expect(afterSecond.renderedBlocks - afterFirst.renderedBlocks).toBe(2);
}, 15_000);

test("100 durable append generation 뒤에도 현재 width metadata와 shared row LRU만 남는다", () => {
	let snapshot = immutableHistory(8);
	const workspace = new AstraWorkspace(() => snapshot, () => []);
	workspace.toggleSidebar();
	renderLayoutFrame(workspace.component, 80, 20, () => undefined);
	renderLayoutFrame(workspace.component, 120, 20, () => undefined);
	for (let revision = 0; revision < 100; revision += 1) {
		const sequence   = snapshot.activities.length + 1    ;
		const activityId = `generation-activity-${revision}` ;
		const id         = `generation-message-${revision}`  ;
		const content    = `generation-marker-${revision}`   ;
		const activity = {
			...snapshot.activities.at(-1)!, id: activityId, sequence,
			nativeRefs: { threadId: "large-thread", turnId: `generation-turn-${revision}`, itemId: id },
			payload: { role: "assistant", text: content },
		};
		snapshot = deepFreezeFixture({
			...snapshot, revision: snapshot.revision + 1, journalSequence: sequence,
			activities: [...snapshot.activities, activity],
			chat: [...snapshot.chat, { id, activityId, role: "assistant" as const, content, status: "completed" as const }],
		});
		workspace.transcript.update(snapshot);
		renderLayoutFrame(workspace.component, revision % 2 === 0 ? 80 : 120, 20, () => undefined);
	}
	const metrics = workspace.transcript.cacheMetrics();
	const output = stripTerminalSequences(workspace.transcript.render(76).join("\n"));

	expect(output).toContain("generation-marker-99");
	expect(metrics.durableBlockCount).toBe(snapshot.chat.length);
	expect(metrics.markdownEntries).toBeLessThanOrEqual(metrics.durableBlockCount + metrics.volatileBlockCount);
	expect(metrics.widthStates).toBeLessThanOrEqual(8);
	expect(metrics.widthMetadataLogicalBytes).toBeLessThanOrEqual(4 * 1024 * 1024);
	expect(metrics.rowLogicalBytes).toBeLessThanOrEqual(8 * 1024 * 1024);
});

test("durable append의 ANSI 제거 byte rows는 고정 literal과 같다", () => {
	const base = astraFixture("ready");
	const prototype = base.activities[0]!;
	const firstActivity = {
		...prototype, id: "golden-activity-1", sequence: 1,
		nativeRefs: { threadId: "golden-thread", turnId: "golden-turn-1", itemId: "golden-message-1" },
		payload: { role: "user", text: "BYTE_GOLDEN" },
	};
	let snapshot: ReturnType<typeof astraFixture> = deepFreezeFixture({
		...base, activities: [firstActivity],
		chat: [{ id: "golden-message-1", activityId: firstActivity.id, role: "user" as const, content: "BYTE_GOLDEN", status: "completed" as const }],
		tnotes: [], threadId: "golden-thread", journalSequence: 1,
	});
	const view = new AstraTranscriptView(snapshot);
	view.render(30);
	const secondActivity = {
		...prototype, id: "golden-activity-2", sequence: 2,
		nativeRefs: { threadId: "golden-thread", turnId: "golden-turn-2", itemId: "golden-message-2" },
		payload: { role: "assistant", text: "APPEND_GOLDEN" },
	};
	snapshot = deepFreezeFixture({
		...snapshot, revision: snapshot.revision + 1, journalSequence: 2,
		activities: [...snapshot.activities, secondActivity],
		chat: [...snapshot.chat, { id: "golden-message-2", activityId: secondActivity.id, role: "assistant" as const, content: "APPEND_GOLDEN", status: "completed" as const }],
	});
	view.update(snapshot);

	expect(view.render(30).map(stripTerminalSequences)).toEqual([
		"                              ",
		"REQ 1                         ",
		"  BYTE_GOLDEN                 ",
		"                              ",
		"                              ",
		" RES 1-1                      ",
		"│ APPEND_GOLDEN               ",
		"                              ",
	]);
});

test("durable graph, exact-count repair, requested-row paint telemetry는 단계별로만 증가한다", () => {
	let snapshot = immutableHistory(4);
	const view = new AstraTranscriptView(snapshot);
	view.render(80);
	const before     = view.cacheMetrics()            ;
	const sequence   = snapshot.activities.length + 1 ;
	const activityId = "telemetry-activity"           ;
	const messageId  = "telemetry-message"            ;
	snapshot = deepFreezeFixture({
		...snapshot, revision: snapshot.revision + 1, journalSequence: sequence,
		activities: [...snapshot.activities, {
			...snapshot.activities.at(-1)!, id: activityId, sequence,
			nativeRefs: { threadId: "large-thread", turnId: "telemetry-turn", itemId: messageId },
			payload: { role: "assistant", text: "telemetry-body" },
		}],
		chat: [...snapshot.chat, { id: messageId, activityId, role: "assistant" as const, content: "telemetry-body", status: "completed" as const }],
	});
	view.update(snapshot);
	const source = view.scrollRows(80);
	const afterIndex = view.cacheMetrics();
	expect(source.rows(0, Math.min(4, source.rowCount))).toHaveLength(Math.min(4, source.rowCount));
	const afterPaint = view.cacheMetrics();
	const reused = view.scrollRows(80);
	expect(reused.rows(0, Math.min(4, reused.rowCount))).toHaveLength(Math.min(4, reused.rowCount));
	const afterReuse = view.cacheMetrics();

	for (const value of [afterIndex.durableGraphBuildMs, afterIndex.exactCountBuildMs, afterPaint.requestedMaterializationMs]) expect(Number.isFinite(value)).toBe(true);
	expect(afterIndex.durableGraphBuilds - before.durableGraphBuilds).toBe(1);
	expect(afterIndex.durableGraphBuildMs).toBeGreaterThanOrEqual(before.durableGraphBuildMs);
	expect(afterIndex.exactCountBuildMs).toBeGreaterThanOrEqual(before.exactCountBuildMs);
	expect(afterIndex.requestedMaterializationMs).toBe(before.requestedMaterializationMs);
	expect(afterPaint.durableGraphBuildMs).toBe(afterIndex.durableGraphBuildMs);
	expect(afterPaint.exactCountBuildMs).toBe(afterIndex.exactCountBuildMs);
	expect(afterPaint.requestedMaterializationMs).toBeGreaterThanOrEqual(afterIndex.requestedMaterializationMs);
	expect(afterReuse.widthCacheHits).toBeGreaterThan(afterPaint.widthCacheHits);
	expect(afterReuse.rowCacheHits).toBeGreaterThan(afterPaint.rowCacheHits);
	expect(afterReuse.rowCacheMisses).toBe(afterPaint.rowCacheMisses);
});
