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
import { AstraInset, AstraWorkspace } from "../src/adapters/inbound/tui/shell/astra-surface";
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
function fixture(count: number) {
  const snapshot = astraFixture("ready");
  const prototype = snapshot.activities[0]!;
  snapshot.activities = Array.from({ length: count }, (_, i) => ({ ...prototype, id: `a-${i}`, sequence: i + 1,
    nativeRefs: { threadId: "perf", turnId: `turn-${i}`, itemId: `m-${i}` },
    payload: { role: i % 2 === 0 ? "user" : "assistant", text: `메시지 ${i}: 화면에 표시되는 문장과 **강조**, 코드 \`value\`의 렌더링을 확인합니다.\n\n두 번째 문단입니다.` } }));
  snapshot.chat = snapshot.activities.map((a, i) => ({ id: `m-${i}`, activityId: a.id,
    role: i % 2 === 0 ? "user" as const : "assistant" as const, content: String(a.payload.text), status: "completed" as const }));
  snapshot.threadId = "perf"; snapshot.workFlow = projectWorkFlow([]); snapshot.journalSequence = count;
	return snapshot;
}

function measureDurableFirstFrame(count: number, kind: "append" | "journal-bump") {
	let snapshot = fixture(count);
	const workspace = new AstraWorkspace(() => snapshot, () => []);
	const layout = () => renderLayoutFrame(workspace.component, 80, 24, () => {});
	layout();
	const sampleCount = Math.min(repetitions, 5);
	const advance = (iteration: number) => {
		if (kind === "journal-bump") {
			snapshot = { ...snapshot, journalSequence: snapshot.journalSequence + 1 };
		} else {
			const sequence = snapshot.activities.length + 1;
			const id = `durable-benchmark-${iteration}-${sequence}`;
			const role = sequence % 2 === 0 ? "assistant" as const : "user" as const;
			const content = `durable append ${iteration} 한글 👩🏽‍💻 e\u0301\n\n정확한 첫 frame count를 측정합니다.`;
			const prototype = snapshot.activities.at(-1)!;
			const activity = {
				...prototype,
				id: `activity-${id}`,
				sequence,
				nativeRefs: { threadId: "perf", turnId: `turn-${id}`, itemId: id },
				payload: { role, text: content },
			};
			snapshot = {
				...snapshot,
				revision: snapshot.revision + 1,
				journalSequence: snapshot.journalSequence + 1,
				activities: [...snapshot.activities, activity],
				chat: [...snapshot.chat, { id, activityId: activity.id, role, content, status: "completed" as const }],
			};
		}
		workspace.transcript.update(snapshot);
		assert.equal(layout().lines.length, 24);
	};
	for (let i = -3; i < 0; i++) advance(i);
	const before = workspace.transcript.cacheMetrics();
	const rssBefore = process.memoryUsage().rss;
	const samples: number[] = [];
	for (let i = 0; i < sampleCount; i++) {
		budget();
		const at = performance.now();
		advance(i);
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
  columns = 80; rows = 24; kittyProtocolActive = false; stopped = false; output = ""; writes = 0;
  input: (data: string) => void = () => { throw new Error("terminal not started"); };
  resize: () => void = () => {};
  onFrame?: () => void;
  start(input: (data: string) => void, resize: () => void) { this.input = input; this.resize = resize; }
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
const results = [];
for (const count of counts) {
  let snapshot = fixture(count);
  const workspace = new AstraWorkspace(() => snapshot, () => []);
  const layout = () => renderLayoutFrame(workspace.component, 80, 24, () => {});
  const coldStart = performance.now(); layout(); const coldBodyMs = performance.now() - coldStart;
  const coldLazy = metricDelta(workspace.transcript.cacheMetrics());
  const warmBody = measure(() => { assert.equal(layout().lines.length, 24); });
  const draftBody = measure(i => {
    snapshot = { ...snapshot, phase: "working", draft: `응답 작성 중 ${i}. ` + "길이가 고정된 본문입니다. ".repeat(50) };
    workspace.transcript.update(snapshot); layout();
  });
  const draftBytes = Buffer.byteLength(snapshot.draft);
  const longDraftBody = measure(i => {
    snapshot = { ...snapshot, draft: `응답 작성 중 ${i}. ` + "길이가 고정된 본문입니다. ".repeat(1000) };
    workspace.transcript.update(snapshot); layout();
  }, Math.min(repetitions, 20));
  const longDraftBytes = Buffer.byteLength(snapshot.draft);
  snapshot = { ...snapshot, phase: "ready", draft: "" }; workspace.transcript.update(snapshot);
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
  const workbench = { snapshot, subscribe(fn: (value: typeof snapshot) => void) { fn(snapshot); return () => {}; },
    async dispatch(command: { type: string; text?: string }) { if (command.type === "chat.send") submitted = command.text!; return { state: "rejected", commandId: "bench", reason: "offline replay" }; },
    async close() { closed = true; } } as unknown as ProjectWorkbench;
  let memoryTerminalInput, idleWrites;
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
  } finally {
    terminal.input("\x03"); terminal.input("\x03"); await tick();
    assert(closed && terminal.stopped, "production shell did not close cleanly");
  }
	const result = { count, columns: 80, rows: 24, coldBodyMs, warmBody, draftBytes, draftBody, longDraftBytes, longDraftBody,
		coldLazy, unseenWidthBodyMs, unseenWidthLazy, resizeBody: resize, warmRepeatedResizeBody, warmRepeatedResizeLazy,
		retainedLazyResources, durableAppendFirstFrame, journalBumpFirstFrame,
		memoryTerminalInput, idleWrites, memory: process.memoryUsage() };
  results.push(result); console.log(JSON.stringify(result));
}
// Run microbenchmarks after actual body/shell scenarios so coldBodyMs remains the first layout.
const focusedVerification = runFocusedVerification();
const failing = results.filter(r => r.warmBody.p95 > 16 || r.draftBody.p95 > 32 || r.longDraftBody.p95 > 32
  || r.memoryTerminalInput!.p95 > 50 || r.memoryTerminalInput!.p99 > 100 || r.idleWrites !== 0
  || resizeBudgetMs !== null && r.warmRepeatedResizeBody.p95 > resizeBudgetMs);
const failingChecks = [
  ...(focusedVerification.fitPadding.p50Ratio > 1.35 ? ["fit-padding-single-pass"] : []),
  ...(focusedVerification.movedRepeated.p50Ratio > .35 ? ["inset-moved-repeated-reuse"] : []),
];
const report = { verdict: failing.length || failingChecks.length ? "RED" : "GREEN", failingCounts: failing.map(r => r.count), failingChecks, bun: Bun.version, sourceRevision,
	durationMs: performance.now() - began, focusedVerification, results,
	scope: "Actual Astra body + production shell, with non-overlapping durable graph-build, exact count-build/repair, and requested-row materialization counters from the public transcript resource surface. Warm body/draft/resize repeat with durable history and references unchanged; durable append and journal-bump are separately measured diagnostic first frames. MemoryTerminal input to synchronized frame write. No PTY/terminal pixel/backpressure/provider/snapshot projection. Cold body is not cold process startup. p99 is descriptive at small sample sizes. Not Native parity.",
  criteria: { fitPaddingP50Ratio: 1.35, insetMovedRepeatedP50Ratio: .35, warmBodyP95Ms: 16, draftBodyP95Ms: 32, longDraftBodyP95Ms: 32, memoryTerminalInputP95Ms: 50, memoryTerminalInputP99Ms: 100, idleWrites: 0,
    warmRepeatedResizeBodyP95Ms: resizeBudgetMs } };
if (process.env.ASTRA_BENCH_OUTPUT) await writeFile(process.env.ASTRA_BENCH_OUTPUT, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ ...report, results: undefined }));
process.exitCode = failing.length || failingChecks.length ? 1 : 0;
