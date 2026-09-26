import { expect, test }                                              from "bun:test";
import {
	Markdown,
	getScrollRowCount,
	readScrollRows,
	stripTerminalSequences,
	truncateToWidth,
} from "@earendil-works/pi-tui";
import type { Component, ScrollRowSource }                           from "@earendil-works/pi-tui";
import { getScrollViewBox, getScrollbarGeometry, renderLayoutFrame } from "@earendil-works/pi-tui/dist/layout.js";
import { WwwTranscriptView, wwwConversationLabels }                  from "../src/adapters/inbound/tui/features/chat/view/www-execution";
import { ChatScrollView }                                            from "../src/adapters/inbound/tui/features/chat/view/chat-scroll.view";
import { WwwInset, WwwWorkspace }                                    from "../src/adapters/inbound/tui/shell/www-surface";
import { a, wwwMarkdownTheme, wwwTitle, fit, pair, safe }            from "../src/adapters/inbound/tui/foundation/theme/www-theme";
import { wwwFixture }                                                from "./fixtures/www-snapshot";

function history(count: number) {
	const snapshot = wwwFixture("ready");
	const activity = snapshot.activities[0]!;
	snapshot.chat = Array.from({ length: count }, (_, index) => ({
		id         : `message-${index}`,
		activityId : `activity-${index}`,
		role       : index % 2 ? "assistant" as const : "user" as const,
		content    : `marker-${index} 한글 👩🏽‍💻 e\u0301\n두 번째 줄 ${"wrap ".repeat(index % 7)}`,
		status     : "completed" as const,
	}));
	snapshot.activities = snapshot.chat.map((message, index) => ({
		...activity,
		id         : message.activityId,
		sequence   : index + 1,
		nativeRefs : { threadId: "lazy-thread", turnId: `turn-${index}`, itemId: message.id },
		payload    : { role: message.role, text: message.content },
	}));
	snapshot.threadId = "lazy-thread";
	snapshot.journalSequence = snapshot.activities.length;
	return snapshot;
}

function deepFreezeFixture<T>(value: T, seen = new WeakSet<object>()): T {
	if (!value || typeof value !== "object" || seen.has(value)) return value;
	seen.add(value);
	for (const child of Object.values(value as Record<string, unknown>)) deepFreezeFixture(child, seen);
	return Object.isFrozen(value) ? value : Object.freeze(value);
}

function immutableLargeBodyHistory(count: number, bodyBytes = 4 * 1024) {
	const snapshot = history(count);
	const content = (index: number) => {
		const marker = `large-body-marker-${index}\n`;
		const padding = bodyBytes - Buffer.byteLength(marker);
		if (padding < 0) throw new RangeError("large body marker exceeds fixture byte budget");
		return marker + "x".repeat(padding);
	};
	snapshot.chat = snapshot.chat.map((message, index) => ({ ...message, content: content(index) }));
	snapshot.activities = snapshot.activities.map((activity, index) => ({
		...activity,
		payload: { role: snapshot.chat[index]!.role, text: snapshot.chat[index]!.content },
	}));
	return deepFreezeFixture(snapshot);
}

function responseFrameOracle(label: string, status: string, bodyRows: readonly string[], width: number): string[] {
	// Mirrors the mirrored-glyph response marker in www-execution.ts.
	const title = `${a.response("❮")} ${wwwTitle(label, a.response)}`;
	if (width < 5) return ["", pair(title, a.muted(status), width), ...bodyRows, ""].map(row => fit(row, width));
	const inside  = width - 2                                                                            ;
	const heading = truncateToWidth(` ${title}${status ? `  ${a.muted(status)}` : ""} `, width - 2, "…") ;
	const body    = bodyRows.map(row => `${a.rule("│")} ${fit(row, inside)}`)                            ;
	return ["", fit(heading, width), ...body, ""].map(row => fit(row, width));
}

/** Independent dense composition for this message-only fixture. */
function denseOracle(snapshot: ReturnType<typeof history>, insetWidth: number): string[] {
	const transcriptWidth = insetWidth > 6 ? insetWidth - 2 : insetWidth                         ;
	const labels          = wwwConversationLabels(snapshot.chat)                                 ;
	const byActivity      = new Map(snapshot.chat.map(message => [message.activityId, message])) ;
	const rows: string[]  = []                                                                   ;
	for (const activity of snapshot.activities) {
		const message = byActivity.get(activity.id)!;
		const ink = message.role === "user" ? a.request : a.response;
		if (message.role === "assistant") {
			const markdown = new Markdown(safe(message.content, 24_000), 0, 0, wwwMarkdownTheme);
			const bodyWidth = Math.max(1, transcriptWidth >= 5 ? transcriptWidth - 4 : transcriptWidth);
			rows.push(...responseFrameOracle(labels.get(message.id)!, message.status === "completed" ? "" : message.status, markdown.render(bodyWidth).map(row => a.answer(row)), transcriptWidth));
		} else {
			const markdown = new Markdown(safe(message.content, 24_000), 0, 0, wwwMarkdownTheme);
			rows.push("", pair(`${a.request("❯")} ${wwwTitle(labels.get(message.id)!, ink)}`, "", transcriptWidth));
			rows.push(...markdown.render(Math.max(1, transcriptWidth - 2)).map(row => `  ${a.text(row)}`), "");
		}
	}
	return rows.map(row => fit(`${insetWidth > 6 ? " " : ""}${fit(row, transcriptWidth)}`, insetWidth));
}

test("실제 WwwWorkspace frame은 dense oracle과 같고 viewport 범위만 요청한다", () => {
	const snapshot = history(100);
	const workspace = new WwwWorkspace(() => snapshot, () => []);
	workspace.toggleSidebar();
	const transcript = workspace.transcript as WwwTranscriptView & {
		scrollRows?: (width: number) => ScrollRowSource;
	};
	expect(typeof transcript.scrollRows).toBe("function");
	const original = transcript.scrollRows!.bind(transcript);
	const requests: Array<{ start: number; count: number }> = [];
	transcript.scrollRows = width => {
		const source = original(width);
		return {
			rowCount: source.rowCount,
			rows(start, count) {
				requests.push({ start, count });
				return source.rows(start, count);
			},
		};
	};

	const frame  = renderLayoutFrame(workspace.component, 80, 20, () => undefined) ;
	const scroll = workspace.scrolls.execution                                     ;
	const box    = getScrollViewBox(frame, scroll)!                                ;
	expect(box.scrollContent).toBeDefined();
	const frameRequests = requests.slice()                                                    ;
	const full          = readScrollRows(box.scrollContent!, 0, box.children[0]!.rect.height) ;
	const dense         = denseOracle(snapshot, box.children[0]!.rect.width)                  ;

	expect(full).toEqual(dense);
	expect(frameRequests.length).toBeGreaterThan(0);
	expect(frameRequests.every(request => request.count <= scroll.viewportHeight + 4)).toBe(true);
});

test("실제 WwwWorkspace frame은 새 volatile draft를 count와 paint 사이 재사용한다", () => {
	let snapshot = deepFreezeFixture(history(40));
	const workspace = new WwwWorkspace(() => snapshot, () => []);
	workspace.toggleSidebar();
	renderLayoutFrame(workspace.component, 80, 20, () => undefined);
	const before = workspace.transcript.cacheMetrics();
	const draft = "진행 중 👩🏽‍💻 e\u0301 [링크](https://example.com)\n\n```ts\nconst value = 1;\n" + "긴 문단 한글 wrap. ".repeat(1_000);
	snapshot = { ...snapshot, phase: "working", draft };
	workspace.transcript.update(snapshot);

	const frame = renderLayoutFrame(workspace.component, 80, 20, () => undefined)                      ;
	const box   = getScrollViewBox(frame, workspace.scrolls.execution)!                                ;
	const after = workspace.transcript.cacheMetrics()                                                  ;
	const full  = readScrollRows(box.scrollContent!, 0, getScrollRowCount(box.scrollContent!))         ;
	const dense = new WwwInset(new WwwTranscriptView(snapshot), 1).render(box.children[0]!.rect.width) ;

	expect(full).toEqual(dense);
	expect(stripTerminalSequences(frame.lines.join("\n"))).toContain("긴 문단");
	expect(after.exactCountBuilds - before.exactCountBuilds).toBe(1);
	expect(after.renderedBlocks - before.renderedBlocks).toBe(1);
});

test("두 폭을 방문한 immutable large-body history의 durable append는 기존 block count를 다시 만들지 않는다", () => {
	let snapshot = immutableLargeBodyHistory(256);
	const workspace = new WwwWorkspace(() => snapshot, () => []);
	workspace.toggleSidebar();
	renderLayoutFrame(workspace.component, 80, 24, () => undefined);
	renderLayoutFrame(workspace.component, 120, 24, () => undefined);
	const before = workspace.transcript.cacheMetrics();

	const content    = "large-body-append-marker 한글 👩🏽‍💻 e\u0301" ;
	const sequence   = snapshot.activities.length + 1               ;
	const id         = `message-${sequence}`                        ;
	const activityId = `activity-${sequence}`                       ;
	const prototype  = snapshot.activities.at(-1)!                  ;
	const activity = {
		...prototype,
		id: activityId,
		sequence,
		nativeRefs: { threadId: "lazy-thread", turnId: `turn-${sequence}`, itemId: id },
		payload: { role: "assistant", text: content },
	} as const;
	snapshot = deepFreezeFixture({
		...snapshot,
		revision        : snapshot.revision + 1,
		journalSequence : sequence,
		activities      : [...snapshot.activities, activity],
		chat            : [...snapshot.chat, { id, activityId, role: "assistant" as const, content, status: "completed" as const }],
	});
	workspace.transcript.update(snapshot);

	const frame                = renderLayoutFrame(workspace.component, 80, 24, () => undefined)                      ;
	const box                  = getScrollViewBox(frame, workspace.scrolls.execution)!                                ;
	const afterFirstFrame      = workspace.transcript.cacheMetrics()                                                  ;
	const rowCount             = getScrollRowCount(box.scrollContent!)                                                ;
	const full                 = readScrollRows(box.scrollContent!, 0, rowCount)                                      ;
	const freshPublicReference = new WwwInset(new WwwTranscriptView(snapshot), 1).render(box.children[0]!.rect.width) ;
	const plain                = stripTerminalSequences(full.join("\n"))                                              ;

	expect(full).toEqual(freshPublicReference);
	expect(box.children[0]!.rect.height).toBe(rowCount);
	expect(plain).toContain("large-body-marker-0");
	expect(plain).toContain("large-body-marker-255");
	expect(plain).toContain("large-body-append-marker");
	expect(afterFirstFrame.durableCountReusedBlocks - before.durableCountReusedBlocks).toBe(256 * 2);
	expect(afterFirstFrame.durableCountRenderedBlocks - before.durableCountRenderedBlocks).toBe(2);
	expect(afterFirstFrame.renderedBlocks - before.renderedBlocks).toBe(4);
}, 30_000);

test("100개 volatile draft revision은 이전 handoff rows를 남기지 않는다", () => {
	let snapshot = deepFreezeFixture(history(20));
	const workspace = new WwwWorkspace(() => snapshot, () => []);
	workspace.toggleSidebar();
	renderLayoutFrame(workspace.component, 80, 20, () => undefined);
	const before = workspace.transcript.cacheMetrics();
	let frame = renderLayoutFrame(workspace.component, 80, 20, () => undefined);
	for (let revision = 0; revision < 100; revision += 1) {
		snapshot = { ...snapshot, phase: "working", draft: `revision-${revision} 👩🏽‍💻 e\u0301\n\n\`\`\`ts\nconst value = ${revision};` };
		workspace.transcript.update(snapshot);
		frame = renderLayoutFrame(workspace.component, 80, 20, () => undefined);
	}
	const after = workspace.transcript.cacheMetrics();

	expect(stripTerminalSequences(frame.lines.join("\n"))).toContain("const value = 99;");
	expect(after.exactCountBuilds - before.exactCountBuilds).toBe(100);
	expect(after.renderedBlocks - before.renderedBlocks).toBe(100);
	expect(after.rowLogicalBytes).toBeLessThanOrEqual(8 * 1024 * 1024);
});

test("exact source는 expanded/thread/append/draft/error 세대에서도 full range와 chunk range가 같다", () => {
	let snapshot = history(100);
	const view = new WwwTranscriptView(snapshot);
	const assertRanges = (width: number) => {
		const source = view.scrollRows(width);
		const chunked: string[] = [];
		for (let start = 0; start < source.rowCount; start += 17) chunked.push(...source.rows(start, Math.min(17, source.rowCount - start)));
		expect(chunked).toEqual(view.render(width));
	};
	assertRanges(40);
	view.expanded = true; assertRanges(80);
	view.expanded = false;
	snapshot = { ...snapshot, threadId: "next-thread", draft: "진행 중 👩🏽‍💻", error: "실패 e\u0301" };
	view.update(snapshot); assertRanges(80);
	const appended = history(101);
	view.update({ ...appended, draft: "", error: null }); assertRanges(120);
	expect(stripTerminalSequences(view.render(120).join("\n"))).toContain("marker-100");
});

test("빈 화면에서 첫 durable append가 생기면 안내 block을 남기지 않는다", () => {
	const empty = history(0);
	const view = new WwwTranscriptView(empty);
	expect(stripTerminalSequences(view.render(80).join("\n"))).toContain("실행을 맡기고");
	const appended = history(1);
	view.update(appended);
	const output = stripTerminalSequences(view.render(80).join("\n"));
	expect(output).toContain("marker-0");
	expect(output).not.toContain("실행을 맡기고");
});

test("exact height는 follow-tail, disable-follow와 scrollbar geometry를 유지한다", () => {
	let snapshot = history(300);
	const workspace = new WwwWorkspace(() => snapshot, () => []);
	workspace.toggleSidebar();
	const scroll = workspace.scrolls.execution                                     ;
	let frame    = renderLayoutFrame(workspace.component, 80, 20, () => undefined) ;
	let box      = getScrollViewBox(frame, scroll)!                                ;
	expect(box.children[0]!.rect.height).toBe(getScrollRowCount(box.scrollContent!));
	expect(scroll.scrollTop).toBe(box.children[0]!.rect.height - box.rect.height);

	snapshot = history(301); workspace.transcript.update(snapshot);
	frame = renderLayoutFrame(workspace.component, 80, 20, () => undefined);
	box = getScrollViewBox(frame, scroll)!;
	expect(scroll.isFollowingEnd).toBe(true);
	expect(scroll.scrollTop).toBe(box.children[0]!.rect.height - box.rect.height);

	scroll.scrollBy(-30);
	const readingTop = scroll.scrollTop;
	snapshot = history(302); workspace.transcript.update(snapshot);
	frame = renderLayoutFrame(workspace.component, 80, 20, () => undefined);
	box = getScrollViewBox(frame, scroll)!;
	const geometry = getScrollbarGeometry(box)!;
	expect(scroll.isFollowingEnd).toBe(false);
	expect(scroll.scrollTop).toBe(readingTop);
	expect(geometry.maxScrollTop).toBe(box.children[0]!.rect.height - box.rect.height);
});

test("실제 lazy WwwWorkspace는 폭 왕복 뒤 읽던 marker와 follow=false를 보존한다", () => {
	const snapshot = history(80);
	const workspace = new WwwWorkspace(() => snapshot, () => []);
	workspace.toggleSidebar();
	const scroll = workspace.scrolls.execution;
	const visible = (width: number, height: number) => renderLayoutFrame(workspace.component, width, height, () => undefined)
		.lines.map(stripTerminalSequences).join("\n");

	visible(120, 20);
	scroll.scrollTo(120, { disableFollow: true });
	const before = visible(120, 20);
	const marker = /marker-\d+/u.exec(before)?.[0];
	expect(marker).toBeDefined();
	for (const width of [80, 40, 120]) {
		const frame = visible(width, 20);
		expect(frame).toContain(marker!);
		expect(scroll.isFollowingEnd).toBe(false);
	}
});

test("중복 본문 anchor는 실제 dense와 lazy frame에서 같은 first-match 휴리스틱을 따른다", () => {
	const repeated = history(80);
	const content = "같은 문장 👩🏽‍💻 e\u0301\n두 번째 반복 줄 " + "wrap ".repeat(8);
	repeated.chat = repeated.chat.map(message => ({ ...message, content }));
	repeated.activities = repeated.activities.map(activity => ({
		...activity,
		payload: { ...activity.payload, text: content },
	}));
	const lazyTranscript = new WwwTranscriptView(repeated);
	const denseTranscript = new WwwTranscriptView(repeated);
	const denseCompatibility: Component = {
		invalidate: () => denseTranscript.invalidate(),
		render: width => denseTranscript.render(width),
	};
	const options     = { follow: "end" as const, primary: true, overscroll: "contain" as const, scrollbar: "auto" as const } ;
	const lazyScroll  = new ChatScrollView(new WwwInset(lazyTranscript), options)                                             ;
	const denseScroll = new ChatScrollView(new WwwInset(denseCompatibility), options)                                         ;

	renderLayoutFrame(lazyScroll, 120, 20, () => undefined);
	renderLayoutFrame(denseScroll, 120, 20, () => undefined);
	lazyScroll.scrollTo(180, { disableFollow: true });
	denseScroll.scrollTo(180, { disableFollow: true });

	for (const width of [120, 80, 40, 120]) {
		const lazyFrame = renderLayoutFrame(lazyScroll, width, 20, () => undefined);
		const denseFrame = renderLayoutFrame(denseScroll, width, 20, () => undefined);
		expect(lazyFrame.lines).toEqual(denseFrame.lines);
		expect(lazyScroll.scrollTop).toBe(denseScroll.scrollTop);
		expect(lazyScroll.isFollowingEnd).toBe(false);
		expect(denseScroll.isFollowingEnd).toBe(false);
	}
});

test("과거를 읽을 때 volatile draft handoff는 marker와 disable-follow를 보존한다", () => {
	let snapshot = deepFreezeFixture(history(80));
	const workspace = new WwwWorkspace(() => snapshot, () => []);
	workspace.toggleSidebar();
	const scroll = workspace.scrolls.execution;
	renderLayoutFrame(workspace.component, 120, 20, () => undefined);
	scroll.scrollTo(120, { disableFollow: true });
	const beforeFrame   = renderLayoutFrame(workspace.component, 120, 20, () => undefined)                  ;
	const marker        = /marker-\d+/u.exec(beforeFrame.lines.map(stripTerminalSequences).join("\n"))?.[0] ;
	const beforeTop     = scroll.scrollTop                                                                  ;
	const beforeMetrics = workspace.transcript.cacheMetrics()                                               ;
	snapshot = { ...snapshot, phase: "working", draft: "새 응답 👩🏽‍💻 e\u0301\n\n```ts\nconst partial = true;" + " tail".repeat(1_000) };
	workspace.transcript.update(snapshot);

	const afterFrame   = renderLayoutFrame(workspace.component, 120, 20, () => undefined) ;
	const afterMetrics = workspace.transcript.cacheMetrics()                              ;
	const visible      = afterFrame.lines.map(stripTerminalSequences).join("\n")          ;

	expect(marker).toBeDefined();
	expect(visible).toContain(marker!);
	expect(scroll.scrollTop).toBe(beforeTop);
	expect(scroll.isFollowingEnd).toBe(false);
	expect(afterMetrics.renderedBlocks - beforeMetrics.renderedBlocks).toBe(1);
});
