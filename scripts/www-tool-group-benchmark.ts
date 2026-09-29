/** Measures a 24-command Chat group as narrated explanations arrive one by one. */
import { strict as assert }       from "node:assert";
import { writeFile }              from "node:fs/promises";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
import { WwwTranscriptView }      from "../src/adapters/inbound/tui/features/chat/view/www-execution";
import { wwwFixture }             from "../test/fixtures/www-snapshot";

function freeze<T>(value: T, seen = new WeakSet<object>()): T {
	if (!value || typeof value !== "object" || seen.has(value)) return value;
	seen.add(value);
	for (const child of Object.values(value as Record<string, unknown>)) freeze(child, seen);
	return Object.isFrozen(value) ? value : Object.freeze(value);
}

function distribution(values: readonly number[]) {
	const sorted = [...values].sort((left, right) => left - right);
	const percentile = (part: number) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * part) - 1)] ?? 0;
	return { count: values.length, p50: percentile(0.5), p95: percentile(0.95), max: sorted.at(-1) ?? 0 };
}

const count = 24;
const width = 80;
const viewportRows = 24;
const base = wwwFixture("ready");
const prototype = base.activities.find(activity => activity.id === "tool-1")!;
const activities = Array.from({ length: count }, (_, index) => ({
	...prototype, id: `bench-tool-${index}`, sequence: index + 1,
	nativeRefs: { threadId: "bench-thread", turnId: "bench-turn", itemId: `bench-item-${index}` },
	payload: { params: { item: { type: "commandExecution", command: `sed -n '1,125p' src/core/file-${index}.ts`, exitCode: 0 } } },
}));
let snapshot = freeze({ ...base, threadId: "bench-thread", activeTurnId: null, activities, chat: [], tnotes: [], journalSequence: count, toolActions: [] as Array<{ id: string; turnId: string; stepId: string; stepTitle: string; summary: string; status: "completed"; sequence: number }> });
const view = new WwwTranscriptView(snapshot);
const paint = () => {
	const source = view.scrollRows(width);
	return stripTerminalSequences(source.rows(Math.max(0, source.rowCount - viewportRows), viewportRows).join("\n"));
};
const started = performance.now();
const pendingFrame = paint();
const initialMs = performance.now() - started;
assert(pendingFrame.includes("설명 준비 중") && pendingFrame.includes("Git Bash · Input"));
const repaintMs: number[] = [];
const renderedBlocks: number[] = [];
for (let index = 0; index < count; index++) {
	const previous = view.cacheMetrics();
	const narration = freeze({ id: `bench-turn:bench-item-${index}`, turnId: "bench-turn", stepId: "chat-tool-action", stepTitle: "Chat 도구 행동", summary: `소스 파일 ${index}의 내용을 확인합니다.`, status: "completed" as const, sequence: index + 1 });
	const next = freeze({ ...snapshot, revision: snapshot.revision + 1, toolActions: [...snapshot.toolActions, narration] });
	const at = performance.now();
	view.update(next);
	const frame = paint();
	repaintMs.push(performance.now() - at);
	renderedBlocks.push(view.cacheMetrics().durableCountRenderedBlocks - previous.durableCountRenderedBlocks);
	if (index === count - 1) assert(frame.includes(`소스 파일 ${index}의 내용을 확인합니다.`));
	snapshot = next;
}
const report = {
	schemaVersion: 1,
	scenario: "24 grouped completed commands; one immutable narration appended per frame; 80x24 viewport",
	initialMs,
	narrationRepaintMs: distribution(repaintMs),
	renderedBlocksPerNarration: distribution(renderedBlocks),
	limitations: "Synthetic local projection and viewport materialization only; no LLM latency, PTY flush, provider stream, or terminal pixels.",
};
const output = process.env.WWW_TOOL_BENCH_OUTPUT;
if (output) await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report));
view.dispose();
