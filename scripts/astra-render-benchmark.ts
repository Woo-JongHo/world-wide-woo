/** Actual Astra body + production shell replay. No providers, real files, or PTY. */
import { strict as assert } from "node:assert";
import { writeFile } from "node:fs/promises";
import chalk from "chalk";
import { truncateToWidth, type Component, type Terminal } from "@earendil-works/pi-tui";
import { renderLayoutFrame } from "@earendil-works/pi-tui/dist/layout.js";
import { astraFixture } from "../test/fixtures/astra-snapshot";
import { projectWorkFlow } from "../src/core/domain/work";
import type { ProjectWorkbench } from "../src/core/application/orchestration/project-workbench";
import { fit } from "../src/adapters/inbound/tui/foundation/theme/astra-theme";
import { AstraExecutionHeading, AstraInset, AstraWorkspace } from "../src/adapters/inbound/tui/shell/astra-surface";
import { runProjectWorkbenchShell } from "../src/adapters/inbound/tui/shell/workbench-shell";

chalk.level = 3;
const counts = (process.env.ASTRA_BENCH_COUNTS ?? "1000").split(",").map(Number);
const repetitions = Number(process.env.ASTRA_BENCH_REPS ?? 50);
assert(counts.every(n => Number.isInteger(n) && n >= 1 && n <= 10000));
assert(Number.isInteger(repetitions) && repetitions >= 5 && repetitions <= 500);
const configuredResizeBudget = process.env.ASTRA_BENCH_RESIZE_BUDGET_MS;
const resizeBudgetMs = configuredResizeBudget === undefined ? null : Number(configuredResizeBudget);
assert(resizeBudgetMs === null || Number.isFinite(resizeBudgetMs) && resizeBudgetMs > 0);
const sourceRevision = process.env.ASTRA_BENCH_SOURCE_HASH ?? "not-provided";
const began = performance.now();
const budgetMs = Number(process.env.ASTRA_BENCH_BUDGET_MS ?? 120000);
function budget() { assert(performance.now() - began < budgetMs, "benchmark runtime budget exceeded"); }
function distribution(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const percentile = (p: number) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)]!;
  return { samples: samples.length, p50: percentile(.5), p95: percentile(.95), p99: percentile(.99), max: sorted.at(-1)!, rawMs: samples };
}
function measure(fn: (i: number) => void, n = repetitions) {
  for (let i = -3; i < 0; i++) fn(i);
  const samples: number[] = [];
  for (let i = 0; i < n; i++) { budget(); const at = performance.now(); fn(i); samples.push(performance.now() - at); }
  return distribution(samples);
}
function measurePaired(left: (i: number) => void, right: (i: number) => void, n: number) {
  const leftSamples: number[] = [], rightSamples: number[] = [];
  const run = (fn: (i: number) => void, i: number, samples?: number[]) => {
    budget(); const at = performance.now(); fn(i); if (samples) samples.push(performance.now() - at);
  };
  for (let i = -4; i < 0; i++) {
    if (i % 2 === 0) { run(left, i); run(right, i); } else { run(right, i); run(left, i); }
  }
  for (let i = 0; i < n; i++) {
    if (i % 2 === 0) { run(left, i, leftSamples); run(right, i, rightSamples); }
    else { run(right, i, rightSamples); run(left, i, leftSamples); }
  }
  return { left: distribution(leftSamples), right: distribution(rightSamples) };
}
function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
}
function fixture(count: number) {
  const base = astraFixture("ready");
  const prototype = base.activities[0]!;
  const activities = Array.from({ length: count }, (_, i) => ({ ...prototype, id: `a-${i}`, sequence: i + 1,
    nativeRefs: { threadId: "perf", turnId: `turn-${i}`, itemId: `m-${i}` },
    payload: { role: i % 2 === 0 ? "user" : "assistant", text: `메시지 ${i}: 화면에 표시되는 문장과 **강조**, 코드 \`value\`의 렌더링을 확인합니다.\n\n두 번째 문단입니다.` } }));
  const chat = activities.map((activity, i) => ({ id: `m-${i}`, activityId: activity.id,
    role: i % 2 === 0 ? "user" as const : "assistant" as const, content: String(activity.payload.text), status: "completed" as const }));
  const snapshot = deepFreeze({
    ...base,
    threadId: "perf",
    activities,
    chat,
    workFlow: projectWorkFlow([]),
    journalSequence: count,
  });
  assert(Object.isFrozen(snapshot) && Object.isFrozen(snapshot.activities) && Object.isFrozen(snapshot.chat));
	return snapshot;
}

function bodyWorkspace(get: () => ReturnType<typeof fixture>) {
  const clock = () => Date.parse("2026-09-24T09:42:10.000Z");
  return new AstraWorkspace(
    get,
    () => [],
    height => height,
    clock,
    false,
    null,
    undefined,
    new AstraExecutionHeading(get, undefined, clock, false),
  );
}

function measureDurableFirstFrame(count: number, kind: "append" | "journal-bump") {
	let snapshot = fixture(count);
	const workspace = bodyWorkspace(() => snapshot);
	const layout = () => renderLayoutFrame(workspace.component, 80, 24, () => {});
	layout();
	const sampleCount = Math.min(repetitions, 5);
	const prepare = (iteration: number) => {
		if (kind === "journal-bump") {
			return deepFreeze({ ...snapshot, journalSequence: snapshot.journalSequence + 1 });
		} else {
			const sequence = snapshot.activities.length + 1;
			const id = `durable-benchmark-${iteration}-${sequence}`;
			const role = sequence % 2 === 0 ? "assistant" as const : "user" as const;
			const content = `durable append ${iteration} 한글 👩🏽‍💻 e\u0301\n\n정확한 첫 frame count를 측정합니다.`;
			const prototype = snapshot.activities.at(-1)!;
			const activity = deepFreeze({
				...prototype,
				id: `activity-${id}`,
				sequence,
				nativeRefs: { threadId: "perf", turnId: `turn-${id}`, itemId: id },
				payload: { role, text: content },
			});
			const message = deepFreeze({ id, activityId: activity.id, role, content, status: "completed" as const });
			const next = deepFreeze({
				...snapshot,
				revision: snapshot.revision + 1,
				journalSequence: snapshot.journalSequence + 1,
				activities: [...snapshot.activities, activity],
				chat: [...snapshot.chat, message],
			});
			assert(Object.isFrozen(activity) && Object.isFrozen(message) && Object.isFrozen(next.activities) && Object.isFrozen(next.chat));
			return next;
		}
	};
	const advance = (next: ReturnType<typeof fixture>) => {
		snapshot = next;
		workspace.transcript.update(snapshot);
		assert.equal(layout().lines.length, 24);
	};
	for (let i = -3; i < 0; i++) advance(prepare(i));
	const before = workspace.transcript.cacheMetrics();
	const rssBefore = process.memoryUsage().rss;
	const samples: number[] = [];
	for (let i = 0; i < sampleCount; i++) {
		budget();
		const next = prepare(i);
		const at = performance.now();
		advance(next);
		samples.push(performance.now() - at);
	}
	const after = workspace.transcript.cacheMetrics();
	const result = {
		definition: kind === "append"
			? "Append one completed durable chat/activity pair, update transcript, then time its first 80x24 renderLayoutFrame."
			: "Change only journalSequence with durable arrays reference-identical, update transcript, then time its first 80x24 renderLayoutFrame.",
		target: "Diagnostic only: expose exact-count rebuild cost; no acceptance threshold is assigned.",
		body: distribution(samples),
		lazy: metricDelta(after, before),
		memory: { rssBefore, rssAfter: process.memoryUsage().rss },
	};
	workspace.transcript.dispose();
	return result;
}

function metricDelta(after: ReturnType<AstraWorkspace["transcript"]["cacheMetrics"]>, before?: ReturnType<AstraWorkspace["transcript"]["cacheMetrics"]>) {
  const baseline = before ?? {
    exactCountBuilds: 0, exactCountBuildMs: 0, requestedRows: 0, requestedMaterializationMs: 0, renderedBlocks: 0,
    durableGraphBuilds: 0, durableGraphBuildMs: 0, durableGenerationNoopReuses: 0,
    durableCountReusedBlocks: 0, durableCountRenderedBlocks: 0,
  };
  return {
    exactCountBuilds: after.exactCountBuilds - baseline.exactCountBuilds,
    exactCountBuildMs: after.exactCountBuildMs - baseline.exactCountBuildMs,
    requestedRows: after.requestedRows - baseline.requestedRows,
    requestedMaterializationMs: after.requestedMaterializationMs - baseline.requestedMaterializationMs,
    renderedBlocks: after.renderedBlocks - baseline.renderedBlocks,
    durableGraphBuilds: after.durableGraphBuilds - baseline.durableGraphBuilds,
    durableGraphBuildMs: after.durableGraphBuildMs - baseline.durableGraphBuildMs,
    durableGenerationNoopReuses: after.durableGenerationNoopReuses - baseline.durableGenerationNoopReuses,
    durableCountReusedBlocks: after.durableCountReusedBlocks - baseline.durableCountReusedBlocks,
    durableCountRenderedBlocks: after.durableCountRenderedBlocks - baseline.durableCountRenderedBlocks,
    retainedDurableBlocks: after.durableBlockCount,
    retainedVolatileBlocks: after.volatileBlockCount,
    retainedMarkdownEntries: after.markdownEntries,
    retainedRowEntries: after.rowEntries,
    retainedRowLogicalBytes: after.rowLogicalBytes,
    retainedWidthStates: after.widthStates,
    retainedWidthMetadataLogicalBytes: after.widthMetadataLogicalBytes,
  };
}

function runFocusedVerification() {
  const verificationRepetitions = Math.min(repetitions, 20);
  const fitRows = Array.from({ length: 2_000 }, (_, i) => `행 ${i} · 한글 👩🏽‍💻 e\u0301와 grapheme 폭 계산을 확인합니다`);
  let observedLength = 0;
  const fitPair = measurePaired(
    () => { for (const row of fitRows) observedLength += fit(row, 80).length; },
    () => { for (const row of fitRows) observedLength += truncateToWidth(row, 80, "…", true).length; },
    verificationRepetitions,
  );
  const fitPadding = { production: fitPair.left, delegated: fitPair.right };
  assert(observedLength > 0);

  const rows = Array.from({ length: 6_000 }, (_, i) => `\x1b[38;2;95;174;255m반복 기록 ${i % 600} 👩🏽‍💻 e\u0301\x1b[39m`);
  const child: Component = { invalidate() {}, render() { return rows; } };
  const inset = new AstraInset(child);
  inset.render(80);
  const moveLastToFront = () => { rows.unshift(rows.pop()!); };
  const movedPair = measurePaired(
    () => { moveLastToFront(); observedLength += inset.render(80).length; },
    () => {
      moveLastToFront();
      observedLength += rows.map(row => fit(`  ${row}`, 80)).length;
    },
    verificationRepetitions,
  );
  const movedRepeated = { cached: movedPair.left, uncached: movedPair.right };
  assert.deepEqual(inset.render(80), rows.map(row => fit(`  ${row}`, 80)));
  return {
    fitPadding: { ...fitPadding, p50Ratio: fitPadding.production.p50 / fitPadding.delegated.p50 },
    movedRepeated: { ...movedRepeated, p50Ratio: movedRepeated.cached.p50 / movedRepeated.uncached.p50 },
  };
}

/** Retain at most one recent frame; benchmark output must not itself grow with history. */
class MemoryTerminal implements Terminal {
  columns = 80; rows = 24; kittyProtocolActive = false; started = false; stopped = false; output = ""; writes = 0;
  input: (data: string) => void = () => { throw new Error("terminal not started"); };
  resize: () => void = () => {};
  onFrame?: () => void;
  start(input: (data: string) => void, resize: () => void) { this.started = true; this.input = input; this.resize = resize; }
  stop() { this.stopped = true; }
  async drainInput() { this.input = () => {}; }
  write(data: string) {
    this.output = (this.output + data).slice(-65536); this.writes++;
    // Ignore title/cursor/progress-only writes. A committed paint ends synchronized output.
    if (data.includes("\x1b[?2026l")) this.onFrame?.();
  }
  moveBy(n: number) { this.write(`\x1b[${Math.abs(n)}${n > 0 ? "B" : "A"}`); }
  hideCursor() { this.write("\x1b[?25l"); } showCursor() { this.write("\x1b[?25h"); }
  clearLine() { this.write("\x1b[2K"); } clearFromCursor() { this.write("\x1b[J"); }
  clearScreen() { this.write("\x1b[2J"); } setTitle(title: string) { this.write(`\x1b]0;${title}\x07`); }
  setProgress(active: boolean) { this.write(active ? "\x1b]9;4;3\x07" : "\x1b]9;4;0\x07"); }
  frame(action: () => void): Promise<number> {
    return new Promise((resolve, reject) => {
      const at = performance.now();
      const timer = setTimeout(() => { this.onFrame = undefined; reject(new Error("no committed frame within 10s")); }, 10000);
      this.onFrame = () => { this.onFrame = undefined; clearTimeout(timer); resolve(performance.now() - at); };
      try { action(); } catch (error) { clearTimeout(timer); this.onFrame = undefined; reject(error); }
    });
  }
}
const tick = () => new Promise(resolve => setTimeout(resolve, 40));
async function waitForOutput(terminal: MemoryTerminal, marker: string, timeoutMs = 10_000) {
	const deadline = performance.now() + timeoutMs;
	while (!terminal.output.includes(marker) && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
	assert(terminal.output.includes(marker), "latest streaming draft was not painted within the bounded wait");
}
const results = [];
for (const count of counts) {
  let snapshot = fixture(count);
  const workspace = bodyWorkspace(() => snapshot);
  const layout = () => renderLayoutFrame(workspace.component, 80, 24, () => {});
  const coldStart = performance.now(); layout(); const coldBodyMs = performance.now() - coldStart;
  const coldLazy = metricDelta(workspace.transcript.cacheMetrics());
  const warmBody = measure(() => { assert.equal(layout().lines.length, 24); });
  const draftSnapshots = Array.from({ length: repetitions + 3 }, (_, index) => deepFreeze({
    ...snapshot, phase: "working" as const, draft: `응답 작성 중 ${index - 3}. ` + "길이가 고정된 본문입니다. ".repeat(50),
  }));
  const draftBody = measure(i => {
    snapshot = draftSnapshots[i + 3]!;
    workspace.transcript.update(snapshot); layout();
  });
  const draftBytes = Buffer.byteLength(snapshot.draft);
  const longDraftRepetitions = Math.min(repetitions, 20);
  const longDraftSnapshots = Array.from({ length: longDraftRepetitions + 3 }, (_, index) => deepFreeze({
    ...snapshot, draft: `응답 작성 중 ${index - 3}. ` + "길이가 고정된 본문입니다. ".repeat(1000),
  }));
  const longDraftBody = measure(i => {
    snapshot = longDraftSnapshots[i + 3]!;
    workspace.transcript.update(snapshot); layout();
  }, longDraftRepetitions);
  const longDraftBytes = Buffer.byteLength(snapshot.draft);
  snapshot = deepFreeze({ ...snapshot, phase: "ready" as const, draft: "" }); workspace.transcript.update(snapshot);
  const beforeUnseen = workspace.transcript.cacheMetrics();
  const unseenWidthStartedAt = performance.now();
  assert.equal(renderLayoutFrame(workspace.component, 120, 24, () => {}).lines.length, 24);
  const unseenWidthBodyMs = performance.now() - unseenWidthStartedAt;
  const unseenWidthLazy = metricDelta(workspace.transcript.cacheMetrics(), beforeUnseen);
  const resize = measure(i => { const width = i % 2 === 0 ? 80 : 120; assert.equal(renderLayoutFrame(workspace.component, width, 24, () => {}).lines.length, 24); }, 6);
  renderLayoutFrame(workspace.component, 80, 24, () => {});
  renderLayoutFrame(workspace.component, 120, 24, () => {});
  const beforeWarmRepeatedResize = workspace.transcript.cacheMetrics();
  const warmRepeatedResizeBody = measure(i => {
    const width = i % 2 === 0 ? 80 : 120;
    assert.equal(renderLayoutFrame(workspace.component, width, 24, () => {}).lines.length, 24);
  }, Math.min(repetitions, 20));
  const warmRepeatedResizeLazy = metricDelta(workspace.transcript.cacheMetrics(), beforeWarmRepeatedResize);
	const retainedLazyResources = workspace.transcript.cacheMetrics();
	workspace.transcript.dispose();
	const durableAppendFirstFrame = measureDurableFirstFrame(count, "append");
	const journalBumpFirstFrame = measureDurableFirstFrame(count, "journal-bump");

  snapshot = fixture(count);
  const terminal = new MemoryTerminal(); let submitted = ""; let closed = false;
  let publishSnapshot: (value: typeof snapshot) => void = () => { throw new Error("production shell subscription not installed"); };
  const workbench = { snapshot, subscribe(fn: (value: typeof snapshot) => void) { publishSnapshot = fn; fn(snapshot); return () => { publishSnapshot = () => {}; }; },
    async dispatch(command: { type: string; text?: string }) { if (command.type === "chat.send") submitted = command.text!; return { state: "rejected", commandId: "bench", reason: "offline replay" }; },
    async close() { closed = true; } } as unknown as ProjectWorkbench;
  let memoryTerminalInput, streamingDraftBytes, streamingMemoryTerminalInput, idleWrites;
  let replayFailed = false;
  let replayError: unknown;
  try {
    runProjectWorkbenchShell({ design: "astra", terminal, cwd: "/benchmark/astra", workbench,
      usage: { async refresh() { return []; }, startPolling(fn) { fn([]); return () => {}; } },
      auth: { methods: () => [], status: async provider => ({ state: "configured", provider, type: "oauth", source: "offline replay" }), login: async () => { throw new Error("not allowed"); }, logout: async () => {} },
      composerDraft: { initialText: "", save: async () => {}, clear: async () => {} }, releaseSessionLease: async () => {},
    });
    await tick();
    assert(terminal.output.includes("astra"), "production shell did not paint");
    const writes = terminal.writes; await new Promise(resolve => setTimeout(resolve, 300)); idleWrites = terminal.writes - writes;
    const samples: number[] = []; let text = "";
    for (let i = 0; i < repetitions; i++) {
      budget(); const character = i % 2 ? "나" : "가"; text += character;
      samples.push(await terminal.frame(() => terminal.input(character)));
    }
    memoryTerminalInput = distribution(samples);
    terminal.input("\r"); await tick(); assert.equal(submitted, text, "input was dropped or duplicated");
		const streamingMarker = (index: number) => `STREAM_FRAME_${index}_PAINTED`;
		const streamingSnapshots = Array.from({ length: repetitions }, (_, index) => deepFreeze({
			...snapshot,
			revision: snapshot.revision + index + 1,
			phase: "working" as const,
			draft: `streaming ${index}. ` + "길이가 고정된 본문입니다. ".repeat(1000) + `\n\n${streamingMarker(index)}`,
		}));
		streamingDraftBytes = Buffer.byteLength(streamingSnapshots.at(-1)!.draft);
		const streamingSamples: number[] = [];
		let streamingText = "";
		for (let i = 0; i < repetitions; i++) {
			budget();
			const character = i % 2 ? "라" : "다";
			streamingText += character;
			streamingSamples.push(await terminal.frame(() => {
				snapshot = streamingSnapshots[i]!;
				publishSnapshot(snapshot);
				terminal.input(character);
			}));
		}
		streamingMemoryTerminalInput = distribution(streamingSamples);
		await waitForOutput(terminal, streamingMarker(repetitions - 1));
		terminal.input("\r"); await tick();
		assert.equal(submitted, text + streamingText, "streaming input was dropped or duplicated");
  } catch (error) {
    replayFailed = true;
    replayError = error;
  }
  let cleanupFailed = false;
  let cleanupError: unknown;
  try {
    if (terminal.started) {
      terminal.input("\x03"); terminal.input("\x03"); await tick();
      assert(closed && terminal.stopped, "production shell did not close cleanly");
    }
  } catch (error) {
    cleanupFailed = true;
    cleanupError = error;
  }
	if (replayFailed && cleanupFailed) throw new AggregateError([replayError, cleanupError], "production shell replay and cleanup both failed", { cause: replayError });
	if (replayFailed) throw replayError;
	if (cleanupFailed) throw cleanupError;
	const result = { count, columns: 80, rows: 24, coldBodyMs, warmBody, draftBytes, draftBody, longDraftBytes, longDraftBody,
		coldLazy, unseenWidthBodyMs, unseenWidthLazy, resizeBody: resize, warmRepeatedResizeBody, warmRepeatedResizeLazy,
		retainedLazyResources, durableAppendFirstFrame, journalBumpFirstFrame,
		memoryTerminalInput, streamingDraftBytes, streamingMemoryTerminalInput, idleWrites, memory: process.memoryUsage() };
  results.push(result); console.log(JSON.stringify(result));
}
// Run microbenchmarks after actual body/shell scenarios so coldBodyMs remains the first layout.
const focusedVerification = runFocusedVerification();
const failing = results.filter(r => r.warmBody.p95 > 16 || r.draftBody.p95 > 32 || r.longDraftBody.p95 > 32
  || r.memoryTerminalInput!.p95 > 50 || r.memoryTerminalInput!.p99 > 100 || r.idleWrites !== 0
	|| r.streamingMemoryTerminalInput!.p95 > 50 || r.streamingMemoryTerminalInput!.p99 > 100
  || resizeBudgetMs !== null && r.warmRepeatedResizeBody.p95 > resizeBudgetMs);
const failingChecks = [
  ...(focusedVerification.fitPadding.p50Ratio > 1.35 ? ["fit-padding-single-pass"] : []),
  ...(focusedVerification.movedRepeated.p50Ratio > .35 ? ["inset-moved-repeated-reuse"] : []),
];
const report = { verdict: failing.length || failingChecks.length ? "RED" : "GREEN", failingCounts: failing.map(r => r.count), failingChecks, bun: Bun.version, sourceRevision,
	durationMs: performance.now() - began, focusedVerification, results,
	scope: "Actual Astra body with AstraExecutionHeading + production shell, with deeply frozen production-contract snapshots and non-overlapping durable graph-build, exact count-build/repair, and requested-row materialization counters from the public transcript resource surface. Fixture construction/freezing is outside frame timing. Warm body and short/long draft repeat with immutable durable history and references unchanged; cold/unseen-width and durable append/journal-bump are separately measured first frames across configured history sizes. memoryTerminalInput measures ready-state input to synchronized frame write. streamingMemoryTerminalInput publishes one immutable ~37KB working-draft update and then measures the prioritized input's first synchronized frame while that scheduled stream update may still be pending; it does not claim newest-draft paint latency. A separate untimed bounded assertion requires the final unique draft marker to be painted. Intentional working animation is excluded from idleWrites. No PTY/terminal pixel/backpressure/provider/snapshot projection. Cold body is not cold process startup. p99 is descriptive at small sample sizes. Not Native parity.",
  criteria: { fitPaddingP50Ratio: 1.35, insetMovedRepeatedP50Ratio: .35, warmBodyP95Ms: 16, draftBodyP95Ms: 32, longDraftBodyP95Ms: 32, memoryTerminalInputP95Ms: 50, memoryTerminalInputP99Ms: 100, idleWrites: 0,
		streamingMemoryTerminalInputP95Ms: 50, streamingMemoryTerminalInputP99Ms: 100,
    warmRepeatedResizeBodyP95Ms: resizeBudgetMs } };
if (process.env.ASTRA_BENCH_OUTPUT) await writeFile(process.env.ASTRA_BENCH_OUTPUT, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ ...report, results: undefined }));
process.exitCode = failing.length || failingChecks.length ? 1 : 0;
