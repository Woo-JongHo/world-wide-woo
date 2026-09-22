import { describe, expect, test } from "bun:test";
import { Editor, ProcessTerminal, TuiAltScreen, VStack, stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import chalk from "chalk";
import { renderLayoutFrame } from "@earendil-works/pi-tui/dist/layout.js";
import { astraFixture } from "./fixtures/astra-snapshot";
import type { WorkbenchSnapshot } from "../src/core/domain/work/workbench";
import { AstraCommandPalette, AstraComposer, AstraExecutionHeading, AstraHeader, AstraHud, AstraSheet, AstraViewSwitcher, AstraWorkspace, ASTRA_COMMANDS, ASTRA_VIEWS } from "../src/adapters/inbound/tui/shell/astra-surface";
import { AstraTranscriptView, astraConversationLabels, astraExecutionIsLive, astraNowLabel, astraTNoteMarkdown, astraToolRows, executionHeading } from "../src/adapters/inbound/tui/features/chat/astra-execution";
import { AstraPlanView } from "../src/adapters/inbound/tui/features/plan/astra-plan-view";
import { AstraWorkflowView } from "../src/adapters/inbound/tui/features/workflow/astra-workflow-view";
import { AstraContextView } from "../src/adapters/inbound/tui/features/context/astra-context-view";
import { AstraCacheRail, AstraCacheView } from "../src/adapters/inbound/tui/features/cache/astra-cache-view";
import { WwwDashboardView } from "../src/adapters/inbound/tui/features/dashboard/entry-dashboard-view";
import { composeCacheTelemetry } from "../src/core/domain/observability/cache-telemetry";
import { AstraHistoryView } from "../src/adapters/inbound/tui/features/session/astra-history-view";
import { AstraStatsView } from "../src/adapters/inbound/tui/features/stats/astra-stats-view";
import { projectObservabilityDashboard } from "../src/core/domain/observability/observability-dashboard";
import { projectSessionStats } from "../src/core/domain/observability/session-stats";
import { projectPerformance } from "../src/core/domain/work/performance";
import { ApprovalOverlay } from "../src/adapters/inbound/tui/features/approval/approval-overlay";
import { NativeThreadPicker } from "../src/adapters/inbound/tui/features/session/native-thread-picker";
import { a, astraColors, astraEditorTheme, astraPalette, astraPulse, duration } from "../src/adapters/inbound/tui/foundation/theme/astra-theme";
import { astraQuotaHudRows, astraUsageLine } from "../src/adapters/inbound/tui/features/usage/astra-usage";
import { requestRuntimeMotionActive, requestRuntimeRows, requestStatusGradient } from "../src/adapters/inbound/tui/features/monitoring/request-runtime-view";
import type { UsageSnapshot } from "../src/core/ports";

describe("Astra execution console", () => {
	test("aligns the Plan side rail with the Chat readiness heading and keeps navigation hints hidden", () => {
		const s = astraFixture("ready");
		const workspace = new AstraWorkspace(() => s, () => [], () => 20, Date.now, false, null, undefined, new AstraExecutionHeading(() => s));
		const root = new VStack([
			{ component: new AstraHeader(() => s, () => "execution", "/test/astra"), basis: 2, minSize: 2 },
			{ component: workspace.component, basis: 0, grow: 1, minSize: 1 },
		]);
		const lines = renderLayoutFrame(root, 120, 24, () => undefined).lines.map(stripTerminalSequences);
		const readinessRow = lines.findIndex(line => line.includes("▎"));
		const planRow = lines.findIndex(line => line.includes("Plan"));
		expect(planRow).toBe(readinessRow);
		expect(lines.join("\n")).not.toContain("Ctrl+G 화면");
		expect(lines.join("\n")).not.toContain("Ctrl+G 2 Plan");
	});

	test("shows a configured Goal only in the top header with a persistent gradient", () => {
		const level = chalk.level; chalk.level = 3;
		try {
			const s = astraFixture("ready");
			const withoutGoal = new AstraHeader(() => s, () => "Chat", "/repo/99_www", () => 0).render(100).join("\n");
			expect(stripTerminalSequences(withoutGoal)).toContain("astra  99_www / Chat");
			expect(stripTerminalSequences(withoutGoal)).not.toContain("Goal");
			s.sessionGoal = { text: "사용자가 설정한 장기 목표", sourceActivityId: "goal", updatedAt: "2026-09-22" };
			const first = new AstraHeader(() => s, () => "Chat", "/repo/99_www", () => 0).render(100).join("\n");
			const next = new AstraHeader(() => s, () => "Chat", "/repo/99_www", () => 480).render(100).join("\n");
			expect(stripTerminalSequences(first)).toContain("Goal  사용자가 설정한 장기 목표");
			expect(first).not.toBe(next);
			expect(stripTerminalSequences(new AstraHeader(() => s, () => "Chat", "/repo/99_www", () => 0).render(24).join("\n"))).toContain("Goal  사용자가");
			const side = stripTerminalSequences(new AstraPlanView(() => s).render(80).join("\n"));
			expect(side).not.toContain("사용자가 설정한 장기 목표");
		} finally { chalk.level = level; }
	});

	test("shows the existing WWW welcome wordmark on the first empty loading screen", () => {
		const s = astraFixture("loading");
		s.chat = [];
		s.activities = [];
		s.workFlow = { ...s.workFlow, steps: [], completedCount: 0 };
		const view = new AstraTranscriptView(s);
		view.playWelcomeIntro(() => undefined);
		const output = stripTerminalSequences(view.render(80).join("\n"));
		expect(output).toContain("██╗");
		expect(output).not.toContain("ORBITING PAIR");
		expect(output).not.toContain("GUARDIAN");
		expect(output).toContain("🐙 Wooni · Native Project Workbench");
		expect(output).not.toContain("실행을 맡기고");
		view.dispose();
	});

	test("Request status uses bounded motion and settles after completion", () => {
		const level = chalk.level; chalk.level = 3;
		try {
			const runningA = requestStatusGradient("running", "running", 0);
			const runningB = requestStatusGradient("running", "running", 4);
			expect(stripTerminalSequences(runningA)).toBe("running");
			expect(stripTerminalSequences(runningB)).toBe("running");
			expect(runningA).not.toBe(runningB);
			expect(requestRuntimeMotionActive({ status: "pending", completedAt: null }, 10_000)).toBe(true);
			expect(requestRuntimeMotionActive({ status: "running", completedAt: null }, 10_000)).toBe(true);
			expect(requestRuntimeMotionActive({ status: "completed", completedAt: new Date(9_500).toISOString() }, 10_000)).toBe(true);
			expect(requestRuntimeMotionActive({ status: "completed", completedAt: new Date(8_000).toISOString() }, 10_000)).toBe(false);
			expect(requestRuntimeMotionActive({ status: "failed", completedAt: new Date(9_500).toISOString() }, 10_000)).toBe(false);
		} finally { chalk.level = level; }
	});
	test("Now waits for interpreted activity instead of exposing a Native event", () => {
		expect(astraNowLabel(astraFixture())).toBe("현재 단계의 작업 내용을 정리하는 중");
		expect(astraNowLabel(astraFixture("ready"))).toBeNull();
	});
	test("the Plan rail shows plan progress without individual tool activity", () => {
		const output = stripTerminalSequences(new AstraPlanView(() => astraFixture()).render(100).join("\n"));
		const plan = output.indexOf("Plan"), activity = output.indexOf("Activity"), proposal = output.indexOf("Next");
		expect(plan).toBeGreaterThanOrEqual(0);
		expect(activity).toBeGreaterThan(plan);
		expect(proposal).toBeGreaterThan(activity);
		expect(output).not.toContain("Todo");
		expect(output).not.toContain("Verify");
		expect(output).not.toContain("PROPOSAL");
		expect(output).not.toContain("Proposal");
		const progress = output.slice(activity, proposal);
		expect(progress).toContain("정리된 세부 작업이 도착하면 이곳에 표시합니다.");
		expect(progress).not.toContain("중복 이벤트 재현 및 경계 수정");
		expect(progress).not.toContain("재개 시나리오를 테스트하는 중");
		expect(progress).not.toContain("Trace");
	});
	test("an empty plan waits for plan events even while tools are active", () => {
		const s = astraFixture();
		s.workFlow = { ...s.workFlow, steps: [], source: null, completedCount: 0, currentStepNumber: null };
		const output = stripTerminalSequences(new AstraPlanView(() => s).render(100).join("\n"));
		expect(output).toContain("현재 요청에서 전달받은 계획이 없습니다.");
		expect(output).toContain("정리된 세부 작업이 도착하면 이곳에 표시합니다.");
		expect(output).not.toContain("재개 시나리오를 테스트하는 중");
	});
	test("Plan cards show completion and failure while Activity waits for interpreted actions", () => {
		const s = astraFixture();
		s.workFlow = { ...s.workFlow, steps: s.workFlow.steps.map(step => ({ ...step, status: "completed" as const })) };
		const view = new AstraPlanView(() => s);
		const completed = stripTerminalSequences(view.render(100).join("\n"));
		expect(completed).toContain("3/3");
		expect(completed).not.toContain("╭ 완료");
		expect(completed).toContain("재개 시나리오 회귀 검증");
		s.workFlow = { ...s.workFlow, steps: s.workFlow.steps.map((step, index) => ({ ...step, status: index === 1 ? "failed" as const : step.status })) };
		const failed = stripTerminalSequences(view.render(100).join("\n"));
		expect(failed.slice(0, failed.indexOf("Activity"))).toContain("╭ 실패");
		expect(failed).not.toContain("재개 시나리오를 테스트하는 중");
	});
	test("the progress highlight moves without implying a percentage, and stops for approval", () => {
		const level = chalk.level; chalk.level = 3;
		try {
			expect(astraPulse(4)).not.toBe(astraPulse(8)); expect(visibleWidth(astraPulse(8))).toBe(12);
			const s = astraFixture(); let now = Date.parse("2026-09-11T09:42:10.000Z");
			const heading = new AstraExecutionHeading(() => s, undefined, () => now);
			const initial = heading.render(80); now += 240;
			expect(heading.render(80)[1]).not.toBe(initial[1]); expect(stripTerminalSequences(initial[1]!)).toContain("Working");
			expect(stripTerminalSequences(initial[1]!)).toMatch(/1 termina/u); expect(stripTerminalSequences(initial[1]!)).not.toContain("Esc");
			expect(stripTerminalSequences(initial[1]!)).not.toContain("%");
			s.pendingApproval = { requestId: 1, callbackId: null, kind: "command", params: {}, refs: {}, availableDecisions: ["accept", "decline"] };
			expect(astraExecutionIsLive(s)).toBe(false); expect(heading.render(80)).toHaveLength(2);
			s.pendingApproval = null; s.phase = "ready";
			s.activities = [...s.activities,
				{ ...s.activities[1]!, id: "turn-complete", sequence: 99, recordedAt: "2026-09-11T09:42:12.000Z", phase: "completed", payload: { method: "turn/completed" } },
				{ ...s.activities[1]!, id: "child-start", sequence: 100, recordedAt: "2026-09-11T09:42:20.000Z", nativeRefs: { threadId: "child-thread", turnId: "child-turn" }, payload: { method: "turn/started" } },
				{ ...s.activities[1]!, id: "child-complete", sequence: 101, recordedAt: "2026-09-11T09:42:50.000Z", phase: "completed", nativeRefs: { threadId: "child-thread", turnId: "child-turn" }, payload: { method: "turn/completed" } },
			];
			expect(astraExecutionIsLive(s)).toBe(false);
			const completed = stripTerminalSequences(heading.render(80)[1]!);
			expect(completed).toContain("처리 11s"); expect(completed).toContain("종료");
			s.activities = s.activities.map(activity => activity.id === "turn-complete" ? { ...activity, phase: "failed" as const, payload: { method: "turn/failed" } } : activity);
			const failed = stripTerminalSequences(heading.render(80)[1]!);
			expect(failed).toContain("! 실패까지 11s"); expect(failed).not.toContain("✓");
			s.activities = s.activities.map(activity => activity.id === "turn-complete" ? { ...activity, phase: "cancelled" as const, payload: { method: "turn/interrupted" } } : activity);
			const interrupted = stripTerminalSequences(heading.render(80)[1]!);
			expect(interrupted).toContain("− 중단까지 11s"); expect(interrupted).not.toContain("✓");
			s.phase = "working"; s.activeTurnId = null; s.activities = s.activities.filter(activity => activity.id !== "turn-complete" && activity.id !== "child-complete");
			const resumed = stripTerminalSequences(heading.render(80)[1]!);
			expect(resumed).toContain("Working (9s ·"); expect(resumed).toMatch(/1 termina/u); expect(resumed).not.toContain("Esc to interrupt"); expect(resumed).not.toContain("시간 관측 대기");
		} finally { chalk.level = level; }
	});
	test("Working states name the current task without a separate interruption row", () => {
		const s = astraFixture();
		const heading = new AstraExecutionHeading(() => s, undefined, () => Date.parse("2026-09-11T09:42:10.000Z"));
		const rows = heading.render(120).map(stripTerminalSequences);
		expect(rows.join("\n")).toContain("현재 단계의 작업 내용을 정리하는 중");
		expect(rows[1]).toContain("Working");
		expect(rows.join("\n")).not.toContain("Esc");
	});
	test("durations use whole h m s units without milliseconds", () => {
		expect(duration(240)).toBe("0s");
		expect(duration(12_900)).toBe("12s");
		expect(duration(65_900)).toBe("1m 5s");
		expect(duration(3_665_900)).toBe("1h 1m 5s");
		for (const value of [duration(240), duration(12_900), duration(65_900), duration(3_665_900)]) expect(value).not.toMatch(/\.|ms/u);
	});
	test("the actual editor keeps its text coordinates and bottom boundary on focus changes", () => {
		const tui = new TuiAltScreen(new ProcessTerminal()), editor = new Editor(tui, astraEditorTheme, { paddingX: 2 });
		editor.setText("보존할 입력"); editor.focused = true;
		const composer = new AstraComposer(editor, editor, () => astraFixture("ready"));
		const focused = composer.render(80); const child = editor.render(80);
		expect(focused.slice(1, -1)).toEqual(child.slice(1, -1));
		expect(stripTerminalSequences(focused[0]!)).toContain("› GPT-5.6-Sol · High");
		expect(stripTerminalSequences(focused[0]!)).not.toContain("여기에 작성한다.");
		expect(stripTerminalSequences(focused[0]!)).toContain("GPT-5.6-Sol · High");
		expect(stripTerminalSequences(focused.at(-1)!)).toMatch(/─{20}/u);
		editor.focused = false; expect(stripTerminalSequences(composer.render(80)[0]!)).toContain("· GPT-5.6-Sol · High");
		expect(stripTerminalSequences(composer.render(80)[0]!)).not.toContain("여기에 작성한다.");
		expect(stripTerminalSequences(composer.render(80)[0]!)).toContain("GPT-5.6-Sol · High");
		expect(composer.render(40).every(row => visibleWidth(row) <= 40)).toBe(true);
	});
	test("shows Queue delivery as an input placeholder while a turn is working", () => {
		const tui = new TuiAltScreen(new ProcessTerminal()), editor = new Editor(tui, astraEditorTheme, { paddingX: 2 });
		editor.focused = true;
		const output = stripTerminalSequences(new AstraComposer(editor, editor, () => astraFixture("working")).render(80).join("\n"));
		expect(output).toContain("Queue · Esc 전송");
		expect(output).not.toContain("여기에 작성한다.");
	});
	test("running Bash shows bounded live output; finished commands fold and failed output stays open", () => {
		const source = astraFixture().activities.find(x => x.id === "tool-2")!;
		const live = { ...source, payload: { params: { item: { command: "git status\nprintf test", aggregatedOutput: Array.from({ length: 20 }, (_, i) => `output-${i}`).join("\n") } } } };
		const rows = astraToolRows(live, 40, false), plain = stripTerminalSequences(rows.join("\n"));
		expect(plain).toContain("Bash"); expect(plain).toContain("실행 중"); expect(plain).toContain("$ git status");
		for (let index = 15; index < 20; index += 1) expect(plain).toContain(`output-${index}`);
		expect(plain).not.toContain("output-14"); expect(plain).toContain("최신 5줄"); expect(plain).toContain("Ctrl+E 전체"); expect(rows.every(row => visibleWidth(row) <= 40)).toBe(true);
		const finished = { ...live, phase: "completed" as const };
		expect(astraToolRows(finished, 40, false)).toHaveLength(1);
		expect(astraToolRows(finished, 40, true).join("\n")).toContain("output-0");
		const failed = { ...live, phase: "failed" as const };
		const failedPlain = stripTerminalSequences(astraToolRows(failed, 40, false).join("\n"));
		expect(failedPlain).toContain("output-19");
		expect(failedPlain).not.toContain("output-14");
		expect(stripTerminalSequences(astraToolRows(failed, 40, true).join("\n"))).toContain("output-0");
	});
	test("scrolled multiline drafts retain focus rails, hidden-line counts and autocomplete coordinates", () => {
		class FixedTerminal extends ProcessTerminal { override get rows(): number { return 24; } }
		const editor = new Editor(new TuiAltScreen(new FixedTerminal()), astraEditorTheme, { paddingX: 2 });
		editor.setText(Array.from({ length: 40 }, (_, i) => `line ${i}`).join("\n")); editor.focused = true;
		const child = { invalidate: () => editor.invalidate(), render: (width: number) => [...editor.render(width), "AUTOCOMPLETE"] };
		const s = astraFixture("ready"), composer = new AstraComposer(child, editor, () => s);
		const initial = composer.render(80), raw = child.render(80);
		expect(stripTerminalSequences(initial[0]!)).toContain("› GPT-5.6-Sol · High  ↑ 33 more");
		expect(initial.slice(1, -2)).toEqual(raw.slice(1, -2)); expect(initial.at(-1)).toBe("AUTOCOMPLETE");
		expect(stripTerminalSequences(initial.at(-2)!)).toStartWith("  ─");
		for (let i = 0; i < 39; i++) editor.handleInput("\x1b[A");
		editor.focused = false;
		const top = composer.render(80);
		expect(stripTerminalSequences(top[0]!)).toContain("· GPT-5.6-Sol · High");
		expect(stripTerminalSequences(top[0]!)).not.toContain("여기에 작성한다.");
		expect(stripTerminalSequences(top.at(-2)!)).toContain("↓ 33 more");
		expect(top.slice(1, -2)).toEqual(child.render(80).slice(1, -2));
		expect(composer.render(40).every(row => visibleWidth(row) <= 40)).toBe(true);
	});
	test("Context dashboard follows the spectrometer layout at wide and compact widths without inventing token slices", () => {
		const s = astraFixture();
		s.skillInventory = { count: 2, names: ["woo-entry", "woo-code-readability"], sourceRevision: "git:fixture", digest: "a".repeat(64) };
		const wide = new AstraContextView(() => s).render(120).map(stripTerminalSequences);
		const wideOutput = wide.join("\n");
		expect(wideOutput).toContain("Context Dashboard");
		for (const label of ["TOTAL CAPACITY", "USED TOKENS", "FREE SPACE", "COMPRESSION", "LAST RETRIEV", "ACTIVE MODEL", "EFFORT CONFIG"]) expect(wideOutput).toContain(label);
		expect(wideOutput).toContain("CONTEXT ACCUMULATION SPECTROMETER");
		expect(wideOutput).toContain("LOADED CAPABILITIES & SESSION INPUTS");
		expect(wideOutput).toContain("Skills  2");
		expect(wideOutput).toContain("woo-entry");
		expect(wideOutput).toContain("MCP");
		expect(wideOutput).toContain("Memory");
		expect(wideOutput).toContain("token allocation unobserved");
		expect(wide.every(row => visibleWidth(row) <= 120)).toBe(true);
		const compact = new AstraContextView(() => s).render(60).map(stripTerminalSequences);
		expect(compact.join("\n")).toContain("Context Dashboard");
		expect(compact.join("\n")).toContain("Free Space");
		expect(compact.every(row => visibleWidth(row) <= 60)).toBe(true);
	});
	test("Context occupancy meter and label share the whole-window ratio even with stale snapshot percent", () => {
		const snapshot = astraFixture();
		snapshot.contextUsage = { usedTokens: 100_000, contextWindow: 200_000, percent: 46.8 };
		for (const width of [60, 80, 120]) {
			const rows = new AstraContextView(() => snapshot).render(width).map(stripTerminalSequences);
			const meter = rows.find(row => row.includes("█"))!;
			const filled = [...meter].filter(cell => cell === "█").length;
			const empty = [...meter].filter(cell => cell === "░").length;
			expect(Math.abs(filled - empty)).toBeLessThanOrEqual(1);
			expect(rows.join("\n")).toMatch(/OVERALL CONTEXT OCCUPANCY\s+50%/u);
			expect(rows.every(row => visibleWidth(row) <= width)).toBe(true);
		}
	});
	test("Context preserves Figma lower analysis landmarks in an 80-column main pane with the rail visible", () => {
		const snapshot = astraFixture();
		snapshot.skillInventory = { count: 2, names: ["woo-entry", "woo-code-readability"], sourceRevision: "git:fixture", digest: "b".repeat(64) };
		snapshot.mcpServers = [{ name: "figma", enabled: true, status: "connected", tools: ["get_design_context"] }];
		const mainRows = new AstraContextView(() => snapshot).render(80).map(stripTerminalSequences);
		const main = mainRows.join("\n");
		for (const landmark of [
			"CONTEXT COMPOSITION BREAKDOWN",
			"CONTEXT CHANGE ACTIVITY",
			"CONTEXT DIAGNOSTICS EVENT GRID",
			"SYSTEM DEPENDENCY MAP",
			"CONTEXT INSIGHTS",
			"TOP ITEMS BY SIZE",
			"STATE CHANGE ALERTS",
		]) expect(main).toContain(landmark);
		expect(main).toMatch(/source token shares are not\s+reported/u);
		expect(main).toContain("OVERALL CONTEXT OCCUPANCY");
		expect(main).toContain("SOURCE TOKEN ALLOCATION");
		expect(main).toContain("Source token allocation unavailable");
		expect(main).not.toMatch(/(?:SYS|CONV|SKILL|MCP|MEM|WORK|RUNT)[^\n]*░/u);
		expect(main).not.toMatch(/MCP[^\n]*64%/u);
		expect(main).toContain("per-item context byte sizes for ranking");
		expect(main).toContain("No Native context-change event feed");
		expect(mainRows.every(row => visibleWidth(row) <= 80)).toBe(true);

		const workspace = new AstraWorkspace(() => snapshot, () => []);
		workspace.show("context");
		const frame = renderLayoutFrame(workspace.component, 120, 100, () => {});
		const workspaceOutput = frame.lines.map(stripTerminalSequences).join("\n");
		for (const railHeading of ["LOADED SKILLS", "MCP SERVERS", "STORAGE METRICS"]) expect(workspaceOutput).toContain(railHeading);
		expect(workspaceOutput).toContain("[2 UNITS]");
		expect(workspaceOutput).toContain("ACTIVE");
		expect(workspaceOutput).toContain("ONLINE");
		expect(workspaceOutput).toContain("CONTEXT COMPOSITION BREAKDOWN");
		expect(frame.lines.every(row => visibleWidth(row) <= 120)).toBe(true);
	});
	test("Cache dashboard renders logical byte distribution and live reuse diagnostics", () => {
		const telemetry = composeCacheTelemetry({
			collectedAt: "2026-09-22T00:00:00.000Z",
			observations: [{ id: "render", entries: 24, logicalBytes: 1024, hits: 9, misses: 1, evictions: 2, latencyMs: 1.5, lastAccessedAt: null }],
		});
		const output = stripTerminalSequences(new AstraCacheView(() => telemetry).render(60).join("\n"));
		expect(output).toContain("Cache Controller");
		expect(output).toContain("AGI Workbench 7 layers");
		for (const label of ["Transcript", "Render", "Context Projection", "Usage Snapshot", "Model Catalog", "Dashboard Data", "Session Read"]) expect(output).toContain(label);
		expect(output).toContain("1.0 KiB");
		expect(output).toContain("90%");
		expect(output).toContain("unobserved");
		for (const label of ["Logical byte distribution", "Hit / Miss & Eviction Trends", "Access Heatmap", "Miss Diagnostics", "Telemetry Flow"]) expect(output).toContain(label);
		expect(output).toContain("100% of observed bytes");
		expect(output).toContain("Capacity limit unavailable");
		expect(output).not.toContain("Occupancy");
		expect(output).toContain("Cycle trend unavailable");
		expect(output).toContain("Access timestamp buckets are not collected.");
		expect(output).toContain("TTL, cold-start, invalidation, and upstream causes are not");
		expect(output).toContain("observed layers → cache telemetry snapshot → Cache dashboard");
		const wide = new AstraCacheView(() => telemetry).render(120).map(stripTerminalSequences);
		expect(wide.join("\n")).toContain("CACHE SLICE");
		expect(wide.join("\n")).toContain("LAST ACCESS");
		expect(wide.every(row => visibleWidth(row) <= 120)).toBe(true);
		const compact = new AstraCacheView(() => telemetry).render(60).map(stripTerminalSequences);
		expect(compact.every(row => visibleWidth(row) <= 60)).toBe(true);
		const rail = stripTerminalSequences(new AstraCacheRail(() => telemetry).render(38).join("\n"));
		expect(rail).toContain("6 unobserved");
		expect(rail).toContain("Force eviction purge");
		expect(rail).toContain("24-hour trend");
	});
	test("Context quota details reject non-finite percentages and clamp out-of-range values", () => {
		const usage: UsageSnapshot[] = [{ provider: "openai-codex", state: "ready", fetchedAt: 1, limits: [NaN, Infinity, -5, 120].map((remainingPercent, i) => ({ label: `limit${i}`, remainingPercent, status: "unknown" })) }];
		const output = stripTerminalSequences(new AstraContextView(() => astraFixture(), () => usage).render(80).join("\n"));
		expect(output).not.toMatch(/NaN|Infinity/u); expect(output).toContain("limit0  —"); expect(output).toContain("limit1  —");
		expect(output).toContain("limit2  0% 남음"); expect(output).toContain("limit3  100% 남음");
	});
	test.each([NaN, Infinity, -5, 120])("Context never exposes invalid percentages: %s", percent => {
		const s = astraFixture(); s.contextUsage = { ...s.contextUsage!, percent };
		const context = stripTerminalSequences(new AstraContextView(() => s).render(80).join("\n"));
		expect(context).not.toMatch(/NaN|Infinity|-5%|120%/u);
		expect(context).toMatch(/OVERALL CONTEXT OCCUPANCY\s+14%/u);
	});
	test("quota remains readable at 80 columns, with stale and missing values distinguished", () => {
		const usage: UsageSnapshot[] = [
			{ provider: "openai-codex", state: "ready", fetchedAt: 1, limits: [{ label: "7 days", remainingPercent: 62, status: "ok" }] },
			{ provider: "anthropic", state: "ready", fetchedAt: 1, stale: true, limits: [{ label: "7 days", remainingPercent: 9, status: "warning" }] },
			{ provider: "google", state: "auth-required", fetchedAt: 1, limits: [] },
		];
		const row = stripTerminalSequences(astraUsageLine(usage, 76));
		expect(row).toContain("Codex 62%"); expect(row).toContain("Claude 9%*"); expect(row).toContain("Antigravity 로그인 필요");
		expect(row).not.toMatch(/구독 잔여|\bleft\b|\breset\b/u);
		expect(row).not.toMatch(/7d|5h/u);
		expect(visibleWidth(row)).toBeLessThanOrEqual(76);
		expect(astraUsageLine([{ ...usage[0]!, limits: [{ label: "7 days", remainingPercent: NaN, status: "unknown" }] }], 76)).not.toContain("NaN");
		expect(stripTerminalSequences(astraUsageLine([{ ...usage[0]!, limits: [] }], 76))).not.toContain("조회 실패");
		const s = astraFixture(); const hud = new AstraHud(() => s, () => usage, false);
		const rows = hud.render(80);
		const text = stripTerminalSequences(rows.join("\n"));
		expect(rows.length).toBeGreaterThanOrEqual(2);
		expect(text).toContain("manual mode");
		expect(text).not.toContain("승인");
		expect(text).not.toContain("권한");
		expect(text).toContain("Context 28k / 200k 14%");
		expect(text).not.toMatch(/구독 잔여|\bleft\b|\breset\b/u);
		expect(text).toContain("Codex"); expect(text).toContain("62%");
		expect(text).toContain("Claude"); expect(text).toContain("9%");
		expect(text).toContain("Antigravity"); expect(text).toContain("login");
		for (const width of [20, 40, 80, 120, 200]) {
			const rendered = hud.render(width);
			expect(rendered.every(row => visibleWidth(row) <= width)).toBe(true);
		}
		const wide = stripTerminalSequences(hud.render(200).join("\n"));
		expect(wide).toContain("Codex"); expect(wide).toContain("62%");
		expect(wide).toContain("Antigravity"); expect(wide).toContain("login");
		s.permissionMode = "all";
		s.pendingApproval = { requestId: 1, callbackId: null, kind: "command", params: {}, refs: {}, availableDecisions: ["accept", "decline"] };
		const pending = stripTerminalSequences(hud.render(200).join("\n"));
		expect(pending).toContain("bypass mode"); expect(pending).not.toContain("승인 대기");
		s.permissionMode = "manual"; s.collaborationMode = "plan";
		expect(stripTerminalSequences(hud.render(200).join("\n"))).toContain("plan mode");
		s.hud = { showUsage: false, showContext: true };
		expect(stripTerminalSequences(hud.render(80)[0]!)).toBe("");
	});
	test("HUD uses a provider header and two compact quota rows with runtime on the final row", () => {
		const level = chalk.level;
		chalk.level = 3;
		try {
		const now = Date.parse("2026-09-12T09:00:00Z");
		const usage: UsageSnapshot[] = [
			{ provider: "openai-codex", state: "ready", fetchedAt: 1, limits: [
				{ label: "7 days", remainingPercent: 88, resetsAt: now + 7_200_000, status: "ok" },
				{ label: "5 hours", remainingPercent: 42, resetsAt: now + 5_280_000, status: "ok" },
			] },
		];
		const rows = astraQuotaHudRows(usage, 120, now, false);
		const plain = rows.map(stripTerminalSequences);
		expect(rows).toHaveLength(3);
		for (const provider of ["Codex", "Claude", "Antigravity", "Z.AI"]) expect(plain[0]).toContain(provider);
		expect(plain[0]!.indexOf("Claude") - plain[0]!.indexOf("Codex")).toBe(18);
		expect(plain[1]).toContain("7d overall");
		expect(plain[1]).toContain("[  88% 2h 00m  ]");
		expect(plain[2]).toContain("5h session");
		expect(plain[2]).toContain("[  42% 1h 28m  ]");
		expect(rows.join("\n")).toContain("\x1b[48;2;");
		expect((rows[1]!.match(/\x1b\[48;2;/gu) ?? []).length).toBeGreaterThanOrEqual(4);
		expect((rows[2]!.match(/\x1b\[48;2;/gu) ?? []).length).toBeGreaterThanOrEqual(5);
		expect(astraPalette.codex).toBe(astraPalette.text);
		expect(astraPalette.claude).toBe(astraPalette.active);

		const snapshot = astraFixture();
		const hud = new AstraHud(() => snapshot, () => usage, false);
		const hudRows = hud.render(120).map(stripTerminalSequences);
		expect(hudRows).toHaveLength(3);
		expect(hudRows[2]).toMatch(/manual mode · Context 28k \/ 200k 14%\s*$/u);
		} finally { chalk.level = level; }
	});
	test("Claude와 Z.AI의 주간·5시간 한도를 넓은 HUD에서 모두 표시한다", () => {
		const usage: UsageSnapshot[] = [
			{ provider: "anthropic", state: "ready", fetchedAt: 1, limits: [
				{ label: "Claude 7 Day", remainingPercent: 84, resetsAt: Date.parse("2026-09-17T00:00:00Z"), status: "ok" },
				{ label: "Claude 5 Hour", remainingPercent: 12, resetsAt: Date.parse("2026-09-12T12:30:00Z"), status: "ok" },
			] },
			{ provider: "zai", state: "ready", fetchedAt: 1, limits: [
				{ label: "Z.AI Weekly Credit Quota", remainingPercent: 76, resetsAt: Date.parse("2026-09-17T00:00:00Z"), status: "ok" },
				{ label: "Z.AI 5 Hours Credit Quota", remainingPercent: 98, resetsAt: Date.parse("2026-09-12T12:30:00Z"), status: "ok" },
			] },
		];
		const row = stripTerminalSequences(astraUsageLine(usage, 240, "gpt-5.6-sol", Date.parse("2026-09-12T09:00:00Z")));
		expect(row).toContain("Claude");
		expect(row).toContain("7d · 84% · 4d 15h");
		expect(row).toContain("5h · 12% · 3h 30m");
		expect(row).toContain("Z.AI");
		expect(row).toContain("7d · 76% · 4d 15h");
		expect(row).toContain("5h · 98% · 3h 30m");
		expect(row).not.toMatch(/구독 잔여|\bleft\b|\breset\b/u);
	});
	test("role headings and every provider have stable, distinct visual identities", () => {
		const level = chalk.level; chalk.level = 3;
		try {
			expect(a.caption("보조 정보")).toContain("\x1b[3m");
			const s = astraFixture("ready");
			s.tnotes = [{ id: "color-note", title: "요약", summary: "질문 요약 본문", updatedAt: "2026-09-12T00:00:00Z", sourceActivityIds: ["request"] }];
			s.activities = [...s.activities, { ...s.activities[0]!, id: "system-info", sequence: 102, payload: { role: "system", text: "시스템 안내" } }];
			s.chat = [...s.chat, { id: "system-message", activityId: "system-info", role: "system", content: "시스템 안내", status: "completed" }];
			const transcript = new AstraTranscriptView(s).render(80).join("\n");
		for (const label of ["REQ 1", "RES 1-1", "Notice", "질문 요약"]) expect(transcript).toContain(label);
		expect(transcript).not.toContain("▰");
		expect(new AstraPlanView(() => s).render(80).join("\n")).toContain("Plan");
		const answerRow = transcript.split("\n").find(row => stripTerminalSequences(row).includes("기존 이벤트와 재개 이벤트가 같은 경로로 합쳐집니다."));
		expect(answerRow).toContain("\x1b[37m");
		expect(new Set([astraPalette.request, astraPalette.response, astraPalette.tool, astraPalette.plan, astraPalette.note, astraPalette.info]).size).toBe(6);
			const usage = astraUsageLine([], 80);
			for (const provider of [astraPalette.codex, astraPalette.claude, astraPalette.gemini, astraPalette.zai]) expect(provider).not.toBe(astraPalette.secondary);
			expect(usage).toContain("\x1b[");
		for (const name of ["Codex", "Claude", "Antigravity", "Z.AI"]) expect(stripTerminalSequences(astraUsageLine([], 120))).toContain(name);
		const allReady: UsageSnapshot[] = [
			["openai-codex", 62], ["anthropic", 9], ["google", 83], ["zai", 91],
		].map(([provider, remainingPercent]) => ({ provider: provider as UsageSnapshot["provider"], state: "ready", fetchedAt: 1, limits: [{ label: "7 days", remainingPercent: Number(remainingPercent), status: "ok" }] }));
		const compactUsage = astraUsageLine(allReady, 120);
		for (const name of ["Codex", "Claude", "Antigravity", "Z.AI"]) expect(stripTerminalSequences(compactUsage)).toContain(name);
		expect(compactUsage).toContain(a.success("62%"));
		expect(compactUsage).toContain(a.failure("9%"));
		} finally { chalk.level = level; }
	});
	test("numbers each assistant response within its preceding Request", () => {
		const s = astraFixture("ready");
		const tail = s.activities.at(-1)!;
		const message = (id: string, sequence: number, role: "user" | "assistant", text: string) => ({ ...tail, id, sequence, kind: "message" as const, phase: "completed" as const, payload: { role, text } });
		s.activities = [...s.activities, message("answer-followup", 7, "assistant", "첫 요청의 두 번째 응답"), message("request-2", 8, "user", "두 번째 요청"), message("answer-2", 9, "assistant", "두 번째 요청의 응답")];
		s.chat = [...s.chat,
			{ id: "m3", activityId: "answer-followup", role: "assistant", content: "첫 요청의 두 번째 응답", status: "completed" },
			{ id: "m4", activityId: "request-2", role: "user", content: "두 번째 요청", status: "completed" },
			{ id: "m5", activityId: "answer-2", role: "assistant", content: "두 번째 요청의 응답", status: "completed" },
		];
		expect([...astraConversationLabels(s.chat).values()]).toEqual(["REQ 1", "RES 1-1", "RES 1-2", "REQ 2", "RES 2-1"]);
		const transcript = stripTerminalSequences(new AstraTranscriptView(s).render(100).join("\n"));
		for (const label of ["REQ 1", "RES 1-1", "RES 1-2", "REQ 2", "RES 2-1"]) expect(transcript).toContain(label);
	});
	test("Plan shows Native steps while Next only looks toward user input", () => {
		const s = astraFixture("ready");
		const tracedStep = s.workFlow.steps[1]!;
		s.workFlow = {
			...s.workFlow,
			steps: s.workFlow.steps.map((step, index) => index === 1 ? {
				...step,
				activityIds: ["tool-1"],
				observationCount: 1,
				association: {
					attribution: "inferred" as const,
					activityIds: ["tool-1"],
					observationActivityIds: ["answer"],
					sources: [{ turnId: "preview-turn", startSequence: 3, endSequence: null, activityIds: ["tool-1"], observationActivityIds: ["answer"] }],
				},
			} : step),
			observationCount: s.workFlow.observationCount + 1,
		};
		const planRevision = { sourceRevisionKeyDigest: "a".repeat(64), activityId: "plan", sequence: 3, sourceDigest: `sha256:${"b".repeat(64)}` };
		const rootExecution = { provider: "openai-codex", model: "gpt-5.6-sol", agentId: null, threadId: "preview-thread", runId: "preview-turn" };
		s.todo = {
			version: 1, revision: 1, ownerSessionId: "preview-thread", storyId: null, title: "동기화 Todo", updatedAt: "2026-09-12T00:00:00.000Z",
			source: { kind: "native-plan", threadKeyDigest: "c".repeat(64), turnId: "preview-turn", input: null, planRevision, rootExecution },
			items: s.workFlow.steps.map((step, index) => ({ id: `step-${index}`, content: step.title, status: step.status === "running" ? "in_progress" as const : step.status === "completed" ? "completed" as const : "pending" as const, evidenceIds: [], details: [] })),
		};
		s.requestRuntime = [];
		const projected = stripTerminalSequences(new AstraPlanView(() => s).render(100).join("\n"));
		expect(projected).toContain("Plan");
		expect(projected).toContain("Activity");
		expect(projected).toContain("Next");
		expect(projected).not.toContain("Proposal");
		expect(projected).not.toContain("Plan 세부");
		expect(projected).not.toContain("Todo");
		expect(projected).not.toContain("RUNTIME_PLAN");
		expect(projected).not.toContain("/trace");
		expect(projected).not.toContain("세부 Plan 관측 없음");
		s.todo = { ...s.todo, source: undefined, items: [{ id: "manual", content: "수동으로 추가한 후속 작업", status: "pending", evidenceIds: [], details: [] }] };
		s.chatQueue = [{ id: "queued", content: "다음 입력으로 오류 로그도 확인해줘", queuedAt: "2026-09-12T00:00:01.000Z" }];
		const manual = stripTerminalSequences(new AstraPlanView(() => s).render(100).join("\n"));
		const proposal = manual.slice(manual.indexOf("Next"));
		expect(proposal).toContain("다음 입력으로 오류 로그도 확인해줘");
		expect(proposal).not.toContain("수동으로 추가한 후속 작업");
	});
	test("the real Plan presentation never substitutes a previous request for the current plan", () => {
		const s = astraFixture();
		const oldRequest: NonNullable<WorkbenchSnapshot["requestRuntime"]>[number] = {
			schemaVersion: 1, protocolVersion: 2, requestId: "old-request", threadId: s.threadId, turnId: "old-turn",
			objective: "이전 요청", status: "completed", attempt: 1, previousAttempts: [], completedAt: "2026-09-20T01:00:00Z", startedAt: "2026-09-20T00:00:00Z",
			requiredDeliveries: [], deliveries: [], actions: [], issues: [], events: [],
			stages: [{ id: "EXECUTE", status: "completed", goal: "이전 요청 계획", input: [], owner: "orchestrator", model: null, agents: [], tools: [], output: null, evidence: [], decision: null, skipReason: null, startedAt: null, completedAt: null, next: null, evidenceAfterSequence: 0, tasks: [] }],
		};
		s.requestRuntime = [oldRequest];
		const presentation = { motionActive: requestRuntimeMotionActive, rows: requestRuntimeRows };
		for (const compact of [false, true]) for (const width of [24, 100]) {
			const view = new AstraPlanView(() => s, compact, Date.now, false, presentation);
			const rows = view.render(width);
			const plain = stripTerminalSequences(rows.join("\n"));
			expect(rows.every(row => visibleWidth(row) <= width)).toBe(true);
			expect(plain).toContain("1/3");
			expect(plain).not.toContain("계획 단계 처리가 끝났습니다.");
			expect(plain).not.toContain("재개 시나리오를 테스트하는 중");
		}
		s.workFlow = { ...s.workFlow, source: null, steps: [] };
		expect(stripTerminalSequences(new AstraPlanView(() => s, false, Date.now, false, presentation).render(100).join("\n"))).toContain("현재 요청에서 전달받은 계획이 없습니다.");
		s.requestRuntime = [{ ...oldRequest, turnId: s.activeTurnId, status: "running", completedAt: null, stages: oldRequest.stages.map(stage => ({ ...stage, status: "running", goal: "현재 계획 단계" })) }];
		const current = stripTerminalSequences(new AstraPlanView(() => s, true, Date.now, false, presentation).render(100).join("\n"));
		expect(current).toContain("현재 계획 단계");
		expect(current).not.toContain("╭ 진행 중");
		expect(current).not.toContain("재개 시나리오를 테스트하는 중");
	});
	test("Runtime Plan 단계가 Native Plan보다 최신이면 완료 진행을 우선 표시한다", () => {
		const s = astraFixture("ready");
		s.requestRuntime = [{
			requestId: "request-4", turnId: "preview-turn", status: "completed", attempt: 1, previousAttempts: [], completedAt: null,
			stages: ["understand", "decompose", "ground", "deliver"].map((id, index) => ({ id, status: index < 3 ? "completed" : "running", tasks: [], goal: "", output: null, skipReason: null })),
			requiredDeliveries: [], deliveries: [], actions: [], issues: [],
		}] as unknown as WorkbenchSnapshot["requestRuntime"];
		const runtimePresentation = { motionActive: () => false, rows: () => ["RUNTIME_PLAN 3/4"], nowLabel: () => null };
		const projected = stripTerminalSequences(new AstraPlanView(() => s, false, Date.now, false, runtimePresentation).render(100).join("\n"));
		expect(projected).toContain("RUNTIME_PLAN 3/4");
		expect(projected).not.toContain("Plan 세부");
		expect(projected).not.toContain("/trace");
	});
	test("all screen shortcuts work as a prefix sequence without function keys", () => {
		const chosen: string[] = [];
		for (const [key, command] of ASTRA_VIEWS) { const menu = new AstraViewSwitcher(c => chosen.push(c), () => {}, () => {}); menu.handleInput(key); expect(chosen.at(-1)).toBe(command); }
		let closed = false; const menu = new AstraViewSwitcher(c => chosen.push(c), () => { closed = true; }, () => {});
		menu.handleInput("\x1b"); expect(closed).toBe(true); expect(chosen).toHaveLength(9);
	});
	test("Workflow 화면은 실제 Request 단계와 Subagent 관측을 표시한다", () => {
		const s = astraFixture("ready");
		s.requestRuntime = [{ schemaVersion: 1, protocolVersion: 2, requestId: "request-1", threadId: s.threadId, turnId: s.activeTurnId, objective: "Workflow 화면을 만든다", status: "running", attempt: 1, previousAttempts: [], deliveries: [], requiredDeliveries: [], events: [], startedAt: "2026-09-20T00:00:00Z", completedAt: null, issues: [], actions: [], stages: [{ id: "EXECUTE", status: "running", goal: "실제 배선을 연결한다", input: [], owner: "orchestrator", model: null, agents: ["agent-1"], tools: [], output: null, evidence: [], decision: null, skipReason: null, startedAt: null, completedAt: null, next: "VERIFY", evidenceAfterSequence: 0, tasks: [] }] }];
		s.delegation = [{ sourceThreadId: s.threadId ?? "thread", turnId: s.activeTurnId ?? "turn", activityIds: ["agent-activity"], itemIds: ["agent-item"], tasks: [{ ref: "agent-ref", id: "agent-1", attempt: 1, parentId: s.threadId, parentRef: null, role: "reviewer", status: "running", task: "Workflow 결과를 검토한다", model: "gpt-5.6-sol", reasoningEffort: "high", activities: [], result: null }] }];
		const output = stripTerminalSequences(new AstraWorkflowView(() => s).render(100).join("\n"));
		for (const value of ["Workflow", "Workflow 화면을 만든다", "EXECUTE · running", "Subagents", "reviewer", "Workflow 결과를 검토한다"]) expect(output).toContain(value);
	});
	test("Workflow는 넓은 카드와 좁은 행에서 현재 Turn의 7단계와 실제 위임만 투영한다", () => {
		const s = astraFixture("ready");
		s.activeTurnId = "live-turn";
		const statuses = ["completed", "completed", "completed", "running", "pending", "pending", "pending"] as const;
		s.requestRuntime = [{
			schemaVersion: 1, protocolVersion: 2, requestId: "current-request", threadId: s.threadId, turnId: s.activeTurnId,
			objective: "현재 Request의 실제 실행", status: "running", attempt: 2, previousAttempts: [], deliveries: [], requiredDeliveries: [], events: [], startedAt: "2026-09-22T00:00:00Z", completedAt: null, issues: [], actions: [],
			stages: ["UNDERSTAND", "DECOMPOSE", "GROUND", "DECIDE", "EXECUTE", "VERIFY", "DELIVER"].map((id, index) => ({ id, status: statuses[index]!, goal: `${id} 근거`, input: [], owner: "orchestrator", model: null, agents: [], tools: [], output: null, evidence: [], decision: null, skipReason: null, startedAt: null, completedAt: null, next: null, evidenceAfterSequence: 0, tasks: [] })),
		}] as unknown as WorkbenchSnapshot["requestRuntime"];
		s.delegation = [{ sourceThreadId: s.threadId ?? "thread", turnId: s.activeTurnId ?? "turn", activityIds: ["a"], itemIds: ["i"], tasks: [{ ref: "worker-ref", id: "worker-1", attempt: 1, parentId: s.threadId, parentRef: null, role: "verifier", status: "running", task: "실제 검증 실행", model: "gpt-5.6-sol", reasoningEffort: "high", activities: [], result: null }] }];
		const view = new AstraWorkflowView(() => s);
		const wide = view.render(120);
		const compact = view.render(52);
		const railWidth = view.render(80);
		for (const rows of [wide, compact]) expect(rows.every(row => visibleWidth(row) <= (rows === wide ? 120 : 52))).toBe(true);
		const wideText = stripTerminalSequences(wide.join("\n"));
		const compactText = stripTerminalSequences(compact.join("\n"));
		for (const text of [wideText, compactText]) for (const value of ["UNDERSTAND · completed", "DELIVER · pending", "verifier", "실제 검증 실행"]) expect(text).toContain(value);
		expect(wideText).toContain("7-STAGE REQUEST");
		expect(compactText).toContain("Goal");
		const railText = stripTerminalSequences(railWidth.join("\n"));
		for (const landmark of ["Subagents · delegation relationship tree", "Parallel execution pipeline", "Active work queue & retry counts", "Subagent state matrix", "State change event log"]) expect(railText).toContain(landmark);
		expect(railText).toContain("unavailable");
		expect(railWidth.every(row => visibleWidth(row) <= 80)).toBe(true);

		const workspace = new AstraWorkspace(() => s, () => []);
		workspace.show("workflow");
		const workspaceFrame = renderLayoutFrame(workspace.component, 120, 100, () => {}).lines;
		const workspaceText = stripTerminalSequences(workspaceFrame.join("\n"));
		expect(workspaceText).toContain("Workflow overview");
		expect(workspaceText).toContain("Active process");
		expect(workspaceFrame.every(row => visibleWidth(row) <= 120)).toBe(true);

		s.requestRuntime = [{ ...s.requestRuntime![0]!, turnId: "previous-turn", objective: "이전 Request를 보이면 안 된다" }];
		const stale = stripTerminalSequences(view.render(100).join("\n"));
		expect(stale).toContain("현재 Turn에 연결된 Request 관측이 없습니다.");
		expect(stale).not.toContain("이전 Request를 보이면 안 된다");
	});
	test("question summaries live inside ZChat rather than a separate slash screen", () => {
		const s = astraFixture("ready"); s.tnotes = [{ id: "n1", title: "대시보드 안 뜨는 이유", summary: "질문: 대시보드 안 뜨는 이유\nReason: 시작 경로와 요구가 충돌했습니다.\nProposal: 시작 화면에 로고를 함께 표시하는 방향을 선택했습니다.\nAction: 시작 화면 조립과 회귀 테스트를 변경했습니다.\nResult: 코드와 문서를 동기화했고 GitHub와 Linear는 변경하지 않았습니다.\nTest:\nTotal 1/2\n01. bun test test/astra-ui.test.ts : 1.2s · passed\n02. bun test test/project-workbench.test.ts : 0.8s · failed", updatedAt: "2026-09-11T00:00:00Z", sourceActivityIds: ["request"] }];
		const workspace = new AstraWorkspace(() => s, () => []);
		const full = new AstraTranscriptView(s).render(80).join("\n");
		expect(astraTNoteMarkdown(s.tnotes[0]!)).toBe("## 대시보드 안 뜨는 이유\n\n## Report\n\n### Reason\n\n시작 경로와 요구가 충돌했습니다.\n\n### Action\n\n시작 화면 조립과 회귀 테스트를 변경했습니다.\n\n### Test\n\nTotal 1/2\n01. bun test test/astra-ui.test.ts : 1.2s · passed\n02. bun test test/project-workbench.test.ts : 0.8s · failed\n\n### Result\n\n코드와 문서를 동기화했고 GitHub와 Linear는 변경하지 않았습니다.");
		expect(full).toContain("대시보드 안 뜨는 이유"); expect(full).toContain("Reason"); expect(full).not.toContain("Expected outcome"); expect(full).not.toContain("PROPOSAL"); expect(full).toContain("REPORT"); expect(full).not.toContain("NEXT ACTION"); expect(full).toContain("PARTIAL · TEST 1/2"); expect(full).toContain("Action"); expect(full).toContain("Result"); expect(full).toContain("Test"); expect(full).toContain("Total 1/2"); expect(full).toContain("Evidence 1"); expect(full).toContain("/source request");
		const plan = stripTerminalSequences(new AstraPlanView(() => s).render(80).join("\n"));
		expect(plan).toContain("Plan"); expect(plan).not.toContain("PROPOSAL"); expect(plan).not.toContain("시작 화면에 로고를 함께 표시하는 방향을 선택했습니다.");
		const plainRows = stripTerminalSequences(full).split("\n");
		const report = plainRows.findIndex(row => row.includes("REPORT"));
		const result = plainRows.findIndex(row => row.includes("Result"));
		const reason = plainRows.findIndex(row => row.includes("Reason"));
		const footer = plainRows.findIndex(row => row.includes("Evidence 1"));
		expect(report).toBeGreaterThanOrEqual(0); expect(result).toBeGreaterThan(report); expect(reason).toBeGreaterThan(result); expect(footer).toBeGreaterThan(reason);
		for (const width of [1, 3, 4, 20, 40, 80]) {
			const minimal = { ...s, chat: [], activities: [] };
			for (const row of new AstraTranscriptView(minimal).render(width)) expect(visibleWidth(row)).toBeLessThanOrEqual(width);
		}
		const level = chalk.level; chalk.level = 3;
		try {
			const colored = new AstraTranscriptView(s).render(80);
			const reasonRow = colored.find(row => stripTerminalSequences(row).includes("Reason"))!;
			const resultRow = colored.find(row => stripTerminalSequences(row).includes("Result"))!;
			expect(reasonRow).toContain(a.secondary("Reason"));
			expect(resultRow).toContain(a.secondary("Result"));
			for (const label of ["Reason", "Action", "Test", "Result"] as const) {
				const row = colored.find(row => stripTerminalSequences(row).includes(label!))!;
				expect(row).toContain(label);
				expect(row).not.toMatch(/\x1b\[(?:3[1-6]|9[0-6])m/u);
			}
		} finally { chalk.level = level; }
		expect(ASTRA_VIEWS.flat()).not.toContain("/tnotes");
		expect(ASTRA_COMMANDS.some(command => command.name === "tnotes")).toBe(false);
		expect(ASTRA_COMMANDS.some(command => command.name === "tnote")).toBe(false);
	});
	test("legacy three-field Notes remain readable after the report migration", () => {
		const legacy = { id: "legacy", title: "기존 질문", summary: "질문: 기존 질문\n왜: 기존 이유입니다.\n결과: 기존 결과입니다.", updatedAt: "2026-09-01T00:00:00Z", sourceActivityIds: [] };
		expect(astraTNoteMarkdown(legacy)).toBe("## 기존 질문\n\n## 원인\n\n기존 이유입니다.\n\n## 결과\n\n기존 결과입니다.");
	});
	test("Report remains one Note group after its source Response", () => {
		const s = astraFixture("ready");
		s.tnotes = [{
			id: "linked-report",
			title: "연결 상태를 확인한다",
			summary: "질문: 연결 상태를 확인한다\nReason: 연결 경계를 대조했습니다.\nProposal: 원래 관계를 복원합니다.\nAction: Projection을 수정했습니다.\nResult: 같은 종료 보고서로 표시됩니다.\nTest:\nTotal 1/1\n01. bun test : 1s · passed",
			updatedAt: "2026-09-13T00:00:00Z",
			sourceActivityIds: ["request", "answer"],
		}];
		const rendered = new AstraTranscriptView(s).render(100);
		const rows = rendered.map(stripTerminalSequences);
		const response = rows.findIndex(row => row.includes("RES 1-1"));
		const report = rows.findIndex(row => row.includes("REPORT"));
		const evidence = rows.findIndex(row => row.startsWith("│") && row.includes("Evidence 2") && row.includes("/source answer"));
		const closing = rows.findIndex((row, index) => index > report && row.trim() === "");
		expect([response < report, report < evidence, evidence < closing]).toEqual([true, true, true]);
		expect(rows.some(row => row.includes("PROPOSAL"))).toBe(false);
		expect(rows.some(row => row.startsWith("├─") || row.startsWith("└─ "))).toBe(false);
		const coloredEvidence = rendered[evidence]!;
		expect(coloredEvidence).toContain(a.secondary("Evidence 2"));
		expect(coloredEvidence).toContain(a.active("/source answer"));
	});
	test("Report stays in the execution transcript and an old proposal does not become live Plan", () => {
		const s = astraFixture("ready");
		s.tnotes = [{
			id: "separated-proposal-report",
			title: "연결 상태를 확인한다",
			summary: "질문: 연결 상태를 확인한다\nReason: 연결 경계를 대조했습니다.\nProposal: 원래 관계를 복원합니다.\nAction: Projection을 수정했습니다.\nResult: 같은 종료 보고서로 표시됩니다.\nTest:\nTotal 1/1\n01. bun test : 1s · passed",
			updatedAt: "2026-09-13T00:00:00Z",
			sourceActivityIds: ["request", "answer"],
		}];
		const transcript = stripTerminalSequences(new AstraTranscriptView(s).render(100).join("\n"));
		const plan = stripTerminalSequences(new AstraPlanView(() => s).render(100).join("\n"));
		expect(transcript).not.toContain("PROPOSAL");
		expect(transcript).toContain("REPORT");
		expect(plan).toContain("Plan");
		expect(plan).not.toContain("PROPOSAL");
		expect(plan).not.toContain("원래 관계를 복원합니다.");
	});
	test("Report keeps semantic state, long fields, and full source commands readable at every width", () => {
		const source = "source-12345678-1234-1234-1234-123456789abc";
		const report = (id: string, test: string) => ({
			id: `tnote-12345678-1234-1234-1234-123456789${id}`,
			title: "긴 실행 결과",
			summary: `질문: 긴 실행 결과\nReason: ${"재현한 원인과 관측을 분리해 기록했습니다. ".repeat(6).trim()}\nProposal: 다음 실행 후보를 검토합니다.\nAction: ${"기존 경로를 확인하고 회귀 테스트와 렌더링 폭을 반복 검증했습니다. ".repeat(6).trim()}\nResult: ${"핵심 결론은 기본 foreground로 유지하며 상태는 헤더에서만 나타냅니다. ".repeat(6).trim()}\nTest:\n${test}`,
			updatedAt: "2026-09-13T00:00:00Z",
			sourceActivityIds: [source],
		});
		const states = [
			["done", "Total 2/2\n01. bun test : 1s · passed\n02. bun test : 1s · passed", "DONE · TEST 2/2"],
			["partial", "Total 1/2\n01. bun test : 1s · passed\n02. bun test : 1s · failed", "PARTIAL · TEST 1/2"],
			["failed", "Total 0/2\n01. bun test : 1s · failed\n02. bun test : 1s · failed", "FAILED · TEST 0/2"],
			["none", "Total 0/0\n테스트 실행 관측 없음", "NO TEST"],
		] as const;
		for (const [id, test, label] of states) {
			const snapshot = { ...astraFixture("ready"), activities: [], chat: [], tnotes: [report(id, test)] };
			const wide = stripTerminalSequences(new AstraTranscriptView(snapshot).render(220).join("\n"));
			expect(wide).toContain(label);
			expect(wide).toContain(source);
			for (const width of [20, 40, 80, 120, 220]) {
				const rows = new AstraTranscriptView(snapshot).render(width);
				expect(rows.every(row => visibleWidth(row) <= width)).toBe(true);
			}
		}
	});
	test("activity ticks do not invalidate Astra's durable transcript", () => {
		const view = new AstraTranscriptView(astraFixture("working"));
		const rendered = view.render(80);
		const before = view.cacheMetrics();
		view.syncActivity(null, () => {});
		expect(view.render(80)).toEqual(rendered);
		expect(view.cacheMetrics().exactCountBuilds).toBe(before.exactCountBuilds);
	});
	test("snapshot-only telemetry updates reuse Astra's visible transcript", () => {
		const snapshot = astraFixture("working");
		const view = new AstraTranscriptView(snapshot);
		const rendered = view.render(80);
		const before = view.cacheMetrics();
		view.update({ ...snapshot, revision: snapshot.revision + 1, contextUsage: { usedTokens: 30_000, contextWindow: 200_000, percent: 15 } });
		expect(view.render(80)).toEqual(rendered);
		expect(view.cacheMetrics().exactCountBuilds).toBe(before.exactCountBuilds);
	});
	test("copied durable arrays do not rebuild the visible transcript", () => {
		const snapshot = astraFixture("working");
		const view = new AstraTranscriptView(snapshot);
		const rendered = view.render(80);
		const before = view.cacheMetrics();
		view.update({
			...snapshot,
			revision: snapshot.revision + 1,
			activities: [...snapshot.activities],
			chat: [...snapshot.chat],
			tnotes: [...snapshot.tnotes],
		});
		expect(view.render(80)).toEqual(rendered);
		expect(view.cacheMetrics().exactCountBuilds).toBe(before.exactCountBuilds);
	});
	test("native startup telemetry does not leave an empty execution screen", () => {
		const s = astraFixture("ready");
		s.chat = []; s.activities = s.activities.filter(x => x.kind === "progress");
		expect(new AstraTranscriptView(s).render(80).join("\n")).toContain("실행을 맡기고");
	});
	test("long Linear metadata stays in Context instead of taking over the idle execution viewport", () => {
		const s = astraFixture("ready"); s.chat = []; s.activities = [];
		s.linearDashboard = { state: "ready", projectName: "Astra project", fetchedAt: null, update: { body: "METADATA_DETAIL ".repeat(100), createdAt: null }, issues: [{ id: "WOO-1", title: "linked issue", status: "In Progress", dueDate: null }], comments: [], milestones: [], error: null };
		const output = new AstraTranscriptView(s).render(80).join("\n");
		expect(output).not.toContain("METADATA_DETAIL"); expect(output).toContain("/context");
		const context = new AstraContextView(() => s).render(80).join("\n");
		expect(context).toContain("METADATA_DETAIL"); expect(context).toContain("WOO-1");
	});
	test.each([[80, 24], [112, 32], [160, 48], [60, 18], [80, 10]])("keeps execution and controls readable at %i×%i", (width, height) => {
		const s = astraFixture();
		const workspace = new AstraWorkspace(() => s, () => []);
		const root = new VStack([
			{ component: new AstraHeader(() => s, () => "execution", "/repo/astra"), basis: 2, minSize: 2 },
			{ component: new AstraExecutionHeading(() => s), basis: 2, minSize: 2 },
			{ component: workspace.component, basis: 0, grow: 1, minSize: 1 },
			{ component: new AstraHud(() => s), basis: 2, minSize: 1, maxSize: 2 },
		]);
		const frame = renderLayoutFrame(root, width, height, () => {});
		const plain = frame.lines.map(stripTerminalSequences).join("\n");
		expect(frame.lines).toHaveLength(height);
		expect(frame.lines.every(row => visibleWidth(row) <= width)).toBe(true);
		expect(plain).toContain("실행 중"); expect(plain).not.toContain("Esc 중단"); expect(plain).not.toMatch(/구독 잔여|\bleft\b|\breset\b/u);
		if (width >= 112) expect(plain).toContain("세션과 이벤트 결합 지점 확인");
		workspace.show("plan");
		const plan = renderLayoutFrame(workspace.component, width, height, () => {}).lines.join("\n");
		expect(plan).toContain("Plan"); expect(plan).toContain("중복 이벤트");
	});
	test("Cache keeps lower analysis landmarks in the actual 120-column workspace and hides its rail compactly", () => {
		const snapshot = astraFixture();
		const workspace = new AstraWorkspace(() => snapshot, () => []);
		workspace.show("cache");
		const frame = renderLayoutFrame(workspace.component, 120, 60, () => {});
		const cacheWide = stripTerminalSequences(frame.lines.join("\n"));
		expect(cacheWide).toContain("CACHE SLICE");
		expect(cacheWide).toContain("LAST AC");
		expect(cacheWide).toContain("Cache health");
		expect(cacheWide).toContain("Cache actions");
		const railLine = frame.lines.map(stripTerminalSequences).find(line => line.includes("Cache health"));
		expect(railLine?.indexOf("Cache health")).toBeGreaterThanOrEqual(80);
		expect(frame.lines.every(row => visibleWidth(row) <= 120)).toBe(true);
		workspace.scrolls.cache.scrollBy(200);
		const lowerFrame = renderLayoutFrame(workspace.component, 120, 60, () => {});
		const lower = stripTerminalSequences(lowerFrame.lines.join("\n"));
		for (const label of ["Logical byte distribution", "Hit / Miss & Eviction Trends", "Access Heatmap", "Miss Diagnostics", "Telemetry Flow"]) expect(lower).toContain(label);
		const compactFrame = renderLayoutFrame(workspace.component, 80, 24, () => {});
		const compact = stripTerminalSequences(compactFrame.lines.join("\n"));
		expect(compact).not.toContain("Cache health");
		expect(compactFrame.lines.every(row => visibleWidth(row) <= 80)).toBe(true);
	});
	test("Usage keeps every Figma lower hierarchy panel in the actual 120-column workspace rail split", () => {
		const snapshot = astraFixture();
		snapshot.sessionUsage = {
			totalTokens: 1_500,
			observedTotalTokens: 1_500,
			unattributedTokens: 100,
			models: [{ model: "gpt-5.6-sol", effort: "high", interactiveRootTurns: 2, interactiveTokens: 1_200, detachedInvocations: 1, detachedTokens: 300, totalTokens: 1_500 }],
			observationCoverage: { interactive: true, detached: true },
		};
		const usage: UsageSnapshot[] = [{ provider: "openai-codex", state: "ready", fetchedAt: 1, limits: [{ label: "7 days", remainingPercent: 62, status: "ok" }] }];
		const workspace = new AstraWorkspace(() => snapshot, () => usage);
		workspace.show("usage");
		const frame = renderLayoutFrame(workspace.component, 120, 60, () => {});
		const wide = stripTerminalSequences(frame.lines.join("\n"));
		for (const label of ["Model Telemetry", "Provider Availability Window", "Workbench Metrics"]) expect(wide).toContain(label);
		const railLine = frame.lines.map(stripTerminalSequences).find(line => line.includes("Workbench Metrics"));
		expect(railLine?.indexOf("Workbench Metrics")).toBeGreaterThanOrEqual(80);
		expect(frame.lines.every(row => visibleWidth(row) <= 120)).toBe(true);
		workspace.scrolls.usage.scrollBy(200);
		const lowerFrame = renderLayoutFrame(workspace.component, 120, 60, () => {});
		const lower = stripTerminalSequences(lowerFrame.lines.join("\n"));
		for (const label of ["Model Effort Distribution", "Provider Load Ratio", "Token Consumption Matrix", "Performance Trend"]) expect(lower).toContain(label);
		const compactFrame = renderLayoutFrame(workspace.component, 80, 24, () => {});
		const compact = stripTerminalSequences(compactFrame.lines.join("\n"));
		expect(compact).not.toContain("Workbench Metrics");
		expect(compactFrame.lines.every(row => visibleWidth(row) <= 80)).toBe(true);
	});
	test("Dashboard keeps summary, router, proportion, and heatmap panels in the actual 120-column workspace rail split", () => {
		const snapshot = astraFixture("working");
		const workspace = new AstraWorkspace(
			() => snapshot,
			() => [],
			height => height,
			Date.now,
			false,
			null,
			new WwwDashboardView(() => snapshot),
		);
		workspace.show("dashboard");
		const frame = renderLayoutFrame(workspace.component, 120, 60, () => {});
		const output = stripTerminalSequences(frame.lines.join("\n"));
		for (const landmark of ["SESSION", "EVENTS", "TOKENS", "CONTEXT", "HEALTH", "SYSTEM MODULE ROUTER", "TOKEN ALLOCATION / PROPORTION", "INPUT / OUTPUT / CACHE", "ACTIVITY HEATMAP", "Session context"]) expect(output).toContain(landmark);
		expect(frame.lines.every(row => visibleWidth(row) <= 120)).toBe(true);
	});
	test("keeps newlines, code, draft and the latest tool visible without raw reasoning", () => {
		const s = { ...astraFixture(), draft: "검증 결과:\n\n```ts\nconst seen = new Set();\n```", reasoningDraft: "PRIVATE_REASONING_SENTINEL" };
		const view = new AstraTranscriptView(s); view.expanded = true;
		const output = stripTerminalSequences(view.render(80).join("\n"));
		expect(output).toContain("const seen = new Set();"); expect(output).toContain("bun test"); expect(output).toContain("새 이벤트 한 번만 표시");
		expect(output).not.toContain("PRIVATE_REASONING_SENTINEL");
	});
	test("preserves reading position across streaming and resize, then follows on End", () => {
		let s = astraFixture();
		s = { ...s, chat: Array.from({ length: 40 }, (_, i) => ({ ...s.chat[0]!, id: `m${i}`, activityId: `a${i}`, content: `request ${i}\n두 번째 행`, role: "user" })) };
		s.activities = [...s.activities, ...s.chat.map((message, i) => ({ ...s.activities[0]!, id: message.activityId, sequence: 100 + i, payload: { role: "user", text: message.content } }))];
		const workspace = new AstraWorkspace(() => s, () => []), scroll = workspace.scrolls.execution;
		renderLayoutFrame(workspace.component, 120, 20, () => {});
		scroll.scrollBy(-15); const previous = scroll.scrollTop;
		s = { ...s, draft: "new streaming response" }; workspace.transcript.update(s);
		renderLayoutFrame(workspace.component, 120, 20, () => {});
		expect(scroll.scrollTop).toBe(previous); expect(scroll.isFollowingEnd).toBe(false);
		renderLayoutFrame(workspace.component, 80, 18, () => {}); expect(scroll.isFollowingEnd).toBe(false);
		scroll.scrollToEnd(); expect(scroll.isFollowingEnd).toBe(true);
	});
	test("durable messages require activity order while optimistic user delivery remains visible", () => {
		const s = astraFixture();
		s.chat = [...s.chat, { id: "orphan", activityId: "missing", role: "assistant", content: "UNORDERED_ASSISTANT", status: "completed" }, { id: "optimistic", activityId: "not-recorded", role: "user", content: "PENDING_REQUEST", status: "streaming" }];
		const output = new AstraTranscriptView(s).render(80).join("\n");
		expect(output).not.toContain("UNORDERED_ASSISTANT"); expect(output).toContain("PENDING_REQUEST");
	});
	test("approval outranks running state, and no unobserved metric becomes zero", () => {
		const s = astraFixture(); s.pendingApproval = { requestId: 1, callbackId: null, kind: "command", params: { command: "git status" }, refs: {}, availableDecisions: ["accept", "decline"] };
		expect(executionHeading(s).state).toBe("승인 대기");
		const stats = new AstraStatsView(() => projectSessionStats(s), () => "session", () => null).render(80).join("\n");
		expect(stripTerminalSequences(stats)).toMatch(/관측 토큰\s+—/u);
	});
	test("a completed command with nonzero exit remains a visible failure even when output is collapsed", () => {
		const activity = astraFixture().activities.find(x => x.id === "tool-1")!;
		const failed = { ...activity, payload: { params: { item: { command: "bun test", exitCode: 1, aggregatedOutput: "REGRESSION_FAILURE" } } } };
		const output = stripTerminalSequences(astraToolRows(failed, 80, false).join("\n"));
		expect(output).toContain("! bun test"); expect(output).toContain("exit 1"); expect(output).toContain("REGRESSION_FAILURE"); expect(output).toContain("/source tool-1");
	});
	test("searching commands does not execute them and includes retained workflows", () => {
		for (const name of ["dashboard", "history", "cache", "usage"]) {
			expect(ASTRA_COMMANDS.some(command => command.name === name)).toBe(true);
		}
		const chosen: string[] = []; const palette = new AstraCommandPalette(c => chosen.push(c), () => {}, () => {});
		palette.handleInput("promote"); expect(chosen).toHaveLength(0);
		expect(palette.render(70).join("\n")).toContain("/promote");
		palette.handleInput("\r"); expect(chosen).toEqual(["/promote "]);
	});
	test("a small colourless palette follows the selected command rather than the search prompt", () => {
		const palette = new AstraCommandPalette(() => {}, () => {}, () => {});
		const noColour = { invalidate: () => palette.invalidate(), handleInput: (data: string) => palette.handleInput(data), render: (width: number) => palette.render(width).map(stripTerminalSequences) };
		const sheet = new AstraSheet(noColour, () => 11);
		sheet.render(68);
		for (let i = 0; i < 6; i++) { sheet.handleInput("\x1b[B"); sheet.render(68); }
		const output = stripTerminalSequences(sheet.render(68).join("\n"));
		expect(output).toContain("› /dashboard");
	});
	test("Astra resume selection uses its own presentation without changing selected Native identity", () => {
		let chosen = "";
		const picker = new NativeThreadPicker([{ id: "native-1", cwd: "/astra", preview: "continue task", updatedAt: 1, status: "idle" }], id => { chosen = id; }, () => {}, "astra");
		const rows = picker.render(80);
		expect(stripTerminalSequences(rows.join("\n"))).toContain("astra / resume");
		expect(rows.every(row => visibleWidth(row) <= 80)).toBe(true);
		picker.handleInput("\r"); expect(chosen).toBe("native-1");
	});
	test("long approval sheets expose choices through paging without deciding on Escape", () => {
		let resolved = false, closed = false;
		const overlay = new ApprovalOverlay({ requestId: 3, callbackId: null, kind: "command", params: { command: "printf test", reason: "긴 설명 ".repeat(100) }, refs: {}, availableDecisions: ["accept", "decline"] }, () => {}, () => { resolved = true; }, () => { closed = true; }, astraColors);
		const sheet = new AstraSheet(overlay, () => 15);
		for (let i = 0; i < 10; i++) { sheet.render(60); sheet.handleInput("\u001b[6~"); }
		expect(stripTerminalSequences(sheet.render(60).join("\n"))).toContain("거절");
		sheet.handleInput("\u001b"); expect(closed).toBe(true); expect(resolved).toBe(false);
	});
	test("moving approval selection reveals the action without hiding details on initial open", () => {
		const overlay = new ApprovalOverlay({ requestId: 3, callbackId: null, kind: "command", params: { command: "printf test", reason: "긴 설명 ".repeat(100) }, refs: {}, availableDecisions: ["accept", "decline"] }, () => {}, () => {}, () => {}, astraColors);
		const sheet = new AstraSheet(overlay, () => 15);
		const first = stripTerminalSequences(sheet.render(60).join("\n"));
		expect(first).toContain("printf test"); expect(first).toContain("▸ 1. 승인"); expect(first).toContain("2. 거절");
		sheet.handleInput("\x1b[B");
		expect(stripTerminalSequences(sheet.render(60).join("\n"))).toContain("▸ 2. 거절");
	});
	test("pinned controls never skip candidate lines during paging", () => {
		const body = Array.from({ length: 60 }, (_, i) => `candidate-${i}`), actions = ["▸ 1. 승인", "  2. 거절", "Enter 결정 / Esc 보류"];
		const sheet = new AstraSheet({ invalidate() {}, render: () => [...body, ...actions], renderActions: () => actions }, () => 19);
		const seen = new Set<string>();
		for (let page = 0; page < 20; page++) {
			const rows = sheet.render(72); expect(rows.length).toBeLessThanOrEqual(19);
			const output = stripTerminalSequences(rows.join("\n")); expect(output).toContain("▸ 1. 승인");
			for (const match of output.matchAll(/candidate-\d+/gu)) seen.add(match[0]);
			sheet.handleInput("\x1b[6~");
		}
		expect(seen.size).toBe(60);
	});
	test("an active auth prompt is revealed without preventing manual paging back to its explanation", () => {
		const sheet = new AstraSheet({ invalidate() {}, render: () => ["explanation-start", ...Array(25).fill("OAuth instructions"), "> 입력 중…"] }, () => 19, { followPrompt: true });
		expect(stripTerminalSequences(sheet.render(72).join("\n"))).toContain("> 입력 중…");
		for (let i = 0; i < 5; i++) sheet.handleInput("\x1b[5~");
		expect(sheet.render(72).join("\n")).toContain("explanation-start");
	});
	test("one turn finishing never claims the long-term goal is complete", () => {
		const s = astraFixture("ready");
		s.sessionGoal = { text: "장기 리팩터링 목표", sourceActivityId: "goal", updatedAt: "2026-09-11" };
		s.executionRun = { runId: "run", threadId: "preview-thread", turnId: "preview-turn", phase: "completed", waitReason: null, objective: "한 단계", tasks: [], activeActivity: null, evidence: [], activities: [], lastSequence: 9, checkpoint: { runId: "run", sequence: 9, digest: "checkpoint" }, rejectedEventIds: [], receipt: { receiptId: "receipt", receiptDigest: "digest", checkpointDigest: "checkpoint", runId: "run", threadId: "preview-thread", turnId: "preview-turn", status: "completed", objective: "실행한 한 단계", changed: [], verification: [{ command: "bun test", status: "failed", result: "실패", evidenceRefs: [] }], evidenceRefs: [], remaining: [{ summary: "회귀 수정", blocking: true }], completedAt: "2026-09-11", terminalSource: { id: "terminal", sequence: 9, sourceDigest: "digest" } } };
		s.performance = projectPerformance({ activities: s.activities, run: s.executionRun, flow: s.workFlow });
		const heading = executionHeading(s);
		expect(heading.state).toBe("검토 필요"); expect(heading.attention).toBe(true); expect(heading.title).toBe("실행한 한 단계"); expect(heading.detail).toContain("검증 실패"); expect(heading.detail).toContain("필수 잔여 1개");
	});
	test("an accepted but unloaded source keeps its exact identity instead of reporting no selection", () => {
		const s = astraFixture(); s.selectedActivityId = "unloaded-agent-activity";
		const output = new AstraContextView(() => s, () => [], true).render(80).join("\n");
		expect(output).toContain("unloaded-agent-activity"); expect(output).toContain("기록 미포함"); expect(output).toContain("대체하지 않았습니다");
	});
	test("history keeps every keyboard selection in the first 11 lines at 80×24", () => {
		const sessions = Array.from({ length: 12 }, (_, i) => ({ sessionId: `session-${i}`, projectId: "astra", result: "completed" as const, boundary: "observed" as const, startedAt: null, endedAt: null, failures: 0, retries: 0, usage: null }));
		const d = projectObservabilityDashboard(sessions, { state: "observed", streamsRead: 12, skippedStreams: 0, observedFrom: null, observedUntil: null });
		for (let index = 0; index < 12; index++) {
			const text = stripTerminalSequences(new AstraHistoryView(() => d, () => index).render(80).slice(0, 11).join("\n"));
			expect(text).toContain(d.recentSessions[index]!.sessionId);
			expect(text).toContain("›");
		}
	});
	test("source renderer keeps exact identity and filters secret envelopes", () => {
		const s = astraFixture(); s.selectedActivityId = "tool-1";
		s.activities = s.activities.map(x => x.id === "tool-1" ? { ...x, payload: { ...x.payload, apiKey: "SECRET_SENTINEL", reasoning: "PRIVATE_SENTINEL" } } : x);
		const output = new AstraContextView(() => s, () => [], true).render(80).join("\n");
		expect(output).toContain("tool-1"); expect(output).not.toContain("SECRET_SENTINEL"); expect(output).not.toContain("PRIVATE_SENTINEL");
	});
});
