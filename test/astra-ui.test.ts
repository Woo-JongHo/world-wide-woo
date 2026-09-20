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
import { AstraHistoryView } from "../src/adapters/inbound/tui/features/session/astra-history-view";
import { AstraStatsView } from "../src/adapters/inbound/tui/features/stats/astra-stats-view";
import { projectObservabilityDashboard } from "../src/core/domain/observability/observability-dashboard";
import { projectSessionStats } from "../src/core/domain/observability/session-stats";
import { projectPerformance } from "../src/core/domain/work/performance";
import { ApprovalOverlay } from "../src/adapters/inbound/tui/features/approval/approval-overlay";
import { NativeThreadPicker } from "../src/adapters/inbound/tui/features/session/native-thread-picker";
import { a, astraColors, astraEditorTheme, astraPalette, astraPulse, duration } from "../src/adapters/inbound/tui/foundation/theme/astra-theme";
import { astraUsageLine } from "../src/adapters/inbound/tui/features/usage/astra-usage";
import { requestRuntimeMotionActive, requestStatusGradient } from "../src/adapters/inbound/tui/features/monitoring/request-runtime-view";
import type { UsageSnapshot } from "../src/core/ports";

describe("Astra execution console", () => {
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
	test("Now names the actual live activity instead of repeating the current Todo", () => {
		expect(astraNowLabel(astraFixture())).toBe("Bash · 재개 시나리오를 테스트하는 중");
		expect(astraNowLabel(astraFixture("ready"))).toBeNull();
	});
	test("the progress highlight moves without implying a percentage, and stops for approval", () => {
		const level = chalk.level; chalk.level = 3;
		try {
			expect(astraPulse(4)).not.toBe(astraPulse(8)); expect(visibleWidth(astraPulse(8))).toBe(12);
			const s = astraFixture(); let now = Date.parse("2026-09-11T09:42:10.000Z");
			const heading = new AstraExecutionHeading(() => s, undefined, () => now);
			const initial = heading.render(80); now += 240;
			expect(heading.render(80)[2]).not.toBe(initial[2]); expect(stripTerminalSequences(initial[2]!)).toContain("Working");
			expect(stripTerminalSequences(initial[2]!)).toContain("1 terminal running"); expect(stripTerminalSequences(initial[2]!)).toContain("Esc to interrupt");
			expect(stripTerminalSequences(initial[2]!)).not.toContain("%");
			s.pendingApproval = { requestId: 1, callbackId: null, kind: "command", params: {}, refs: {}, availableDecisions: ["accept", "decline"] };
			expect(astraExecutionIsLive(s)).toBe(false); expect(heading.render(80)[2]?.trim()).toBe("");
			s.pendingApproval = null; s.phase = "ready";
			s.activities = [...s.activities,
				{ ...s.activities[1]!, id: "turn-complete", sequence: 99, recordedAt: "2026-09-11T09:42:12.000Z", phase: "completed", payload: { method: "turn/completed" } },
				{ ...s.activities[1]!, id: "child-start", sequence: 100, recordedAt: "2026-09-11T09:42:20.000Z", nativeRefs: { threadId: "child-thread", turnId: "child-turn" }, payload: { method: "turn/started" } },
				{ ...s.activities[1]!, id: "child-complete", sequence: 101, recordedAt: "2026-09-11T09:42:50.000Z", phase: "completed", nativeRefs: { threadId: "child-thread", turnId: "child-turn" }, payload: { method: "turn/completed" } },
			];
			expect(astraExecutionIsLive(s)).toBe(false);
			const completed = stripTerminalSequences(heading.render(80)[2]!);
			expect(completed).toContain("처리 11s"); expect(completed).toContain("종료");
			s.activities = s.activities.map(activity => activity.id === "turn-complete" ? { ...activity, phase: "failed" as const, payload: { method: "turn/failed" } } : activity);
			const failed = stripTerminalSequences(heading.render(80)[2]!);
			expect(failed).toContain("! 실패까지 11s"); expect(failed).not.toContain("✓");
			s.activities = s.activities.map(activity => activity.id === "turn-complete" ? { ...activity, phase: "cancelled" as const, payload: { method: "turn/interrupted" } } : activity);
			const interrupted = stripTerminalSequences(heading.render(80)[2]!);
			expect(interrupted).toContain("− 중단까지 11s"); expect(interrupted).not.toContain("✓");
			s.phase = "working"; s.activeTurnId = null; s.activities = s.activities.filter(activity => activity.id !== "turn-complete" && activity.id !== "child-complete");
			const resumed = stripTerminalSequences(heading.render(80)[2]!);
			expect(resumed).toContain("Working (9s · Esc to interrupt)"); expect(resumed).not.toContain("시간 관측 대기");
		} finally { chalk.level = level; }
	});
	test("Working states name the current task and offer the live-monitor path", () => {
		const s = astraFixture();
		const heading = new AstraExecutionHeading(() => s, undefined, () => Date.parse("2026-09-11T09:42:10.000Z"));
		const rows = heading.render(120).map(stripTerminalSequences);
		expect(rows.join("\n")).toContain("Bash · 재개 시나리오를 테스트하는 중");
		expect(rows[2]).toContain("Working");
		expect(rows[2]).toContain("/monitor to view");
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
		expect(stripTerminalSequences(focused[0]!)).toContain("› 여기에 작성한다.");
		expect(stripTerminalSequences(focused[0]!)).toContain("gpt-5.6-sol · high");
		expect(stripTerminalSequences(focused.at(-1)!)).toMatch(/─{20}/u);
		editor.focused = false; expect(stripTerminalSequences(composer.render(80)[0]!)).toContain("· 여기에 작성한다.");
		expect(stripTerminalSequences(composer.render(80)[0]!)).toContain("gpt-5.6-sol · high");
		expect(composer.render(40).every(row => visibleWidth(row) <= 40)).toBe(true);
	});
	test("running Bash shows bounded live output; finished commands fold and failed output stays open", () => {
		const source = astraFixture().activities.find(x => x.id === "tool-2")!;
		const live = { ...source, payload: { params: { item: { command: "git status\nprintf test", aggregatedOutput: Array.from({ length: 20 }, (_, i) => `output-${i}`).join("\n") } } } };
		const rows = astraToolRows(live, 40, false), plain = stripTerminalSequences(rows.join("\n"));
		expect(plain).toContain("Bash"); expect(plain).toContain("실행 중"); expect(plain).toContain("$ git status"); expect(plain).toContain("output-19");
		expect(plain).not.toContain("output-0"); expect(plain).toContain("Ctrl+E 전체"); expect(rows.every(row => visibleWidth(row) <= 40)).toBe(true);
		const finished = { ...live, phase: "completed" as const };
		expect(astraToolRows(finished, 40, false)).toHaveLength(1);
		expect(astraToolRows(finished, 40, true).join("\n")).toContain("output-0");
	});
	test("scrolled multiline drafts retain focus rails, hidden-line counts and autocomplete coordinates", () => {
		class FixedTerminal extends ProcessTerminal { override get rows(): number { return 24; } }
		const editor = new Editor(new TuiAltScreen(new FixedTerminal()), astraEditorTheme, { paddingX: 2 });
		editor.setText(Array.from({ length: 40 }, (_, i) => `line ${i}`).join("\n")); editor.focused = true;
		const child = { invalidate: () => editor.invalidate(), render: (width: number) => [...editor.render(width), "AUTOCOMPLETE"] };
		const s = astraFixture("ready"), composer = new AstraComposer(child, editor, () => s);
		const initial = composer.render(80), raw = child.render(80);
		expect(stripTerminalSequences(initial[0]!)).toContain("› 여기에 작성한다. · gpt-5.6-sol · high · Manual  ↑ 33 more");
		expect(initial.slice(1, -2)).toEqual(raw.slice(1, -2)); expect(initial.at(-1)).toBe("AUTOCOMPLETE");
		expect(stripTerminalSequences(initial.at(-2)!)).toStartWith("  ─");
		for (let i = 0; i < 39; i++) editor.handleInput("\x1b[A");
		editor.focused = false;
		const top = composer.render(80);
		expect(stripTerminalSequences(top[0]!)).toContain("· 여기에 작성한다.");
		expect(stripTerminalSequences(top.at(-2)!)).toContain("↓ 33 more");
		expect(top.slice(1, -2)).toEqual(child.render(80).slice(1, -2));
		expect(composer.render(40).every(row => visibleWidth(row) <= 40)).toBe(true);
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
		expect(context).toContain(Number.isFinite(percent) ? `${Math.max(0, Math.min(100, percent))}%` : "–");
	});
	test("quota remains readable at 80 columns, with stale and missing values distinguished", () => {
		const usage: UsageSnapshot[] = [
			{ provider: "openai-codex", state: "ready", fetchedAt: 1, limits: [{ label: "7 days", remainingPercent: 62, status: "ok" }] },
			{ provider: "anthropic", state: "ready", fetchedAt: 1, stale: true, limits: [{ label: "7 days", remainingPercent: 9, status: "warning" }] },
			{ provider: "google", state: "auth-required", fetchedAt: 1, limits: [] },
		];
		const row = stripTerminalSequences(astraUsageLine(usage, 76));
		expect(row).toContain("구독 잔여"); expect(row).toContain("Codex 62%"); expect(row).toContain("Claude 9%*"); expect(row).toContain("Antigravity 로그인 필요");
		expect(row).not.toMatch(/7d|5h/u);
		expect(visibleWidth(row)).toBeLessThanOrEqual(76);
		expect(astraUsageLine([{ ...usage[0]!, limits: [{ label: "7 days", remainingPercent: NaN, status: "unknown" }] }], 76)).not.toContain("NaN");
		expect(stripTerminalSequences(astraUsageLine([{ ...usage[0]!, limits: [] }], 76))).not.toContain("조회 실패");
		const s = astraFixture(); const hud = new AstraHud(() => s, () => usage, false);
		const rows = hud.render(80);
		expect(rows).toHaveLength(1);
		expect(stripTerminalSequences(rows[0]!)).toContain("Manual");
		expect(stripTerminalSequences(rows[0]!)).not.toContain("승인");
		expect(stripTerminalSequences(rows[0]!)).not.toContain("권한");
		expect(stripTerminalSequences(rows[0]!)).toContain("Context 28k / 200k 14%");
		expect(stripTerminalSequences(rows[0]!)).toContain("구독 잔여");
		expect(stripTerminalSequences(rows[0]!)).toContain("Codex 62%");
		for (const width of [20, 40, 80, 120, 200]) {
			const rendered = hud.render(width);
			expect(rendered).toHaveLength(1);
			expect(visibleWidth(rendered[0]!)).toBeLessThanOrEqual(width);
		}
		const wide = stripTerminalSequences(hud.render(200)[0]!);
		expect(wide).toContain("Codex 62%");
		expect(wide).toContain("Antigravity 로그인 필요");
		s.permissionMode = "all";
		s.pendingApproval = { requestId: 1, callbackId: null, kind: "command", params: {}, refs: {}, availableDecisions: ["accept", "decline"] };
		const pending = stripTerminalSequences(hud.render(200)[0]!);
		expect(pending).toContain("Bypass"); expect(pending).not.toContain("승인 대기");
		s.permissionMode = "manual"; s.collaborationMode = "plan";
		expect(stripTerminalSequences(hud.render(200)[0]!)).toContain("Plan Mode");
		s.hud = { showUsage: false, showContext: true };
		expect(stripTerminalSequences(hud.render(80)[0]!)).toBe("");
	});
	test("Claude와 Z.AI의 주간·5시간 한도를 넓은 HUD에서 모두 표시한다", () => {
		const usage: UsageSnapshot[] = [
			{ provider: "anthropic", state: "ready", fetchedAt: 1, limits: [
				{ label: "Claude 7 Day", remainingPercent: 84, status: "ok" },
				{ label: "Claude 5 Hour", remainingPercent: 12, status: "ok" },
			] },
			{ provider: "zai", state: "ready", fetchedAt: 1, limits: [
				{ label: "Z.AI Weekly Credit Quota", remainingPercent: 76, status: "ok" },
				{ label: "Z.AI 5 Hours Credit Quota", remainingPercent: 98, status: "ok" },
			] },
		];
		const row = stripTerminalSequences(astraUsageLine(usage, 240));
		expect(row).toContain("Claude");
		expect(row).toContain("7d 84%");
		expect(row).toContain("5h 12%");
		expect(row).toContain("Z.AI");
		expect(row).toContain("7d 76%");
		expect(row).toContain("5h 98%");
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
		for (const label of ["▰", "Request 1", "Response 1-1", "Notice", "질문 요약"]) expect(transcript).toContain(label);
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
		expect([...astraConversationLabels(s.chat).values()]).toEqual(["Request 1", "Response 1-1", "Response 1-2", "Request 2", "Response 2-1"]);
		const transcript = stripTerminalSequences(new AstraTranscriptView(s).render(100).join("\n"));
		for (const label of ["Request 1", "Response 1-1", "Response 1-2", "Request 2", "Response 2-1"]) expect(transcript).toContain(label);
	});
	test("Plan Tracer follows WorkFlow actions and Response observations instead of Todo details", () => {
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
		s.requestRuntime = [{ status: "running" }] as unknown as WorkbenchSnapshot["requestRuntime"];
		const runtimePresentation = { motionActive: () => false, rows: () => ["RUNTIME_TODO_SHOULD_NOT_RENDER"], nowLabel: () => null };
		const projected = stripTerminalSequences(new AstraPlanView(() => s, false, Date.now, true, runtimePresentation).render(100).join("\n"));
		expect(projected.split(tracedStep.title)).toHaveLength(3);
		for (const step of s.workFlow.steps.filter(step => step.id !== tracedStep.id)) expect(projected.split(step.title)).toHaveLength(2);
		expect(projected).not.toContain("▰ Todo");
		expect(projected).toContain("Tracer");
		expect(projected).toContain(`실행 · /trace tool-1`);
		expect(projected).toContain("관측 · Response");
		expect(projected).toContain("기존 이벤트와 재개 이벤트가 같은 경로로 합쳐집니다.");
		expect(projected).toContain("/trace answer");
		expect(projected).not.toContain("세부 Tracer 관측 없음");
		expect(projected).not.toContain("RUNTIME_TODO_SHOULD_NOT_RENDER");
		s.todo = { ...s.todo, source: undefined, items: [{ id: "manual", content: "수동으로 추가한 후속 작업", status: "pending", evidenceIds: [], details: [] }] };
		const manual = stripTerminalSequences(new AstraPlanView(() => s).render(100).join("\n"));
		expect(manual).toContain("Todo"); expect(manual).toContain("수동으로 추가한 후속 작업");
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
		expect(projected).toContain("Tracer");
		expect(projected).toContain("실행 · /trace tool-1");
		expect(projected).toContain("관측 · Observation · /trace tool-2");
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
		expect(projected).toContain("Tracer");
		expect(projected).toContain("실행 · /trace tool-1");
		expect(projected).toContain("관측 · Observation · /trace tool-2");
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
	test("question summaries live inside ZChat rather than a separate slash screen", () => {
		const s = astraFixture("ready"); s.tnotes = [{ id: "n1", title: "대시보드 안 뜨는 이유", summary: "질문: 대시보드 안 뜨는 이유\nReason: 시작 경로와 요구가 충돌했습니다.\nProposal: 시작 화면에 로고를 함께 표시하는 방향을 선택했습니다.\nAction: 시작 화면 조립과 회귀 테스트를 변경했습니다.\nResult: 코드와 문서를 동기화했고 GitHub와 Linear는 변경하지 않았습니다.\nTest:\nTotal 1/2\n01. bun test test/astra-ui.test.ts : 1.2s · passed\n02. bun test test/project-workbench.test.ts : 0.8s · failed", updatedAt: "2026-09-11T00:00:00Z", sourceActivityIds: ["request"] }];
		const workspace = new AstraWorkspace(() => s, () => []);
		const full = new AstraTranscriptView(s).render(80).join("\n");
		expect(astraTNoteMarkdown(s.tnotes[0]!)).toBe("## 대시보드 안 뜨는 이유\n\n## Report\n\n### Reason\n\n시작 경로와 요구가 충돌했습니다.\n\n### Action\n\n시작 화면 조립과 회귀 테스트를 변경했습니다.\n\n### Test\n\nTotal 1/2\n01. bun test test/astra-ui.test.ts : 1.2s · passed\n02. bun test test/project-workbench.test.ts : 0.8s · failed\n\n### Result\n\n코드와 문서를 동기화했고 GitHub와 Linear는 변경하지 않았습니다.");
		expect(full).toContain("대시보드 안 뜨는 이유"); expect(full).toContain("Reason"); expect(full).not.toContain("Expected outcome"); expect(full).not.toContain("PROPOSAL"); expect(full).toContain("REPORT"); expect(full).not.toContain("NEXT ACTION"); expect(full).toContain("PARTIAL · TEST 1/2"); expect(full).toContain("Action"); expect(full).toContain("Result"); expect(full).toContain("Test"); expect(full).toContain("Total 1/2"); expect(full).toContain("Evidence 1"); expect(full).toContain("/source request");
		const plan = stripTerminalSequences(new AstraPlanView(() => s).render(80).join("\n"));
		expect(plan).toContain("PROPOSAL"); expect(plan).toContain("시작 화면에 로고를 함께 표시하는 방향을 선택했습니다.");
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
	test("legacy three-field T-notes remain readable after the report migration", () => {
		const legacy = { id: "legacy", title: "기존 질문", summary: "질문: 기존 질문\n왜: 기존 이유입니다.\n결과: 기존 결과입니다.", updatedAt: "2026-09-01T00:00:00Z", sourceActivityIds: [] };
		expect(astraTNoteMarkdown(legacy)).toBe("## 기존 질문\n\n## 원인\n\n기존 이유입니다.\n\n## 결과\n\n기존 결과입니다.");
	});
	test("Report remains one T-note group after its source Response", () => {
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
		const response = rows.findIndex(row => row.includes("Response 1-1"));
		const report = rows.findIndex(row => row.startsWith("┌") && row.includes("REPORT"));
		const evidence = rows.findIndex(row => row.startsWith("│") && row.includes("Evidence 2") && row.includes("/source answer"));
		const closing = rows.findIndex((row, index) => index > report && row.startsWith("└"));
		expect([response < report, report < evidence, evidence < closing]).toEqual([true, true, true]);
		expect(rows.some(row => row.includes("PROPOSAL"))).toBe(false);
		expect(rows.some(row => row.startsWith("├─") || row.startsWith("└─ "))).toBe(false);
		const coloredEvidence = rendered[evidence]!;
		expect(coloredEvidence).toContain(a.secondary("Evidence 2"));
		expect(coloredEvidence).toContain(a.active("/source answer"));
	});
	test("Plan owns the proposal while the execution transcript owns the report", () => {
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
		expect(plan).toContain("PROPOSAL");
		expect(plan).toContain("원래 관계를 복원합니다.");
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
		s.linearDashboard = { state: "ready", projectName: "Astra project", fetchedAt: null, update: { body: "METADATA_DETAIL ".repeat(100), createdAt: null }, issues: [{ id: "WOO-1", title: "linked issue", status: "In Progress", dueDate: null }], milestones: [], error: null };
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
			{ component: new AstraExecutionHeading(() => s), basis: 3, minSize: 2 },
			{ component: workspace.component, basis: 0, grow: 1, minSize: 1 },
			{ component: new AstraHud(() => s), basis: 2, minSize: 1, maxSize: 2 },
		]);
		const frame = renderLayoutFrame(root, width, height, () => {});
		const plain = frame.lines.map(stripTerminalSequences).join("\n");
		expect(frame.lines).toHaveLength(height);
		expect(frame.lines.every(row => visibleWidth(row) <= width)).toBe(true);
		expect(plain).toContain("실행 중"); expect(plain).toContain("Esc 중단"); expect(plain).toContain("구독 잔여");
		expect(plain).not.toMatch(/[╭╮╰╯]/u);
		workspace.show("plan");
		const plan = renderLayoutFrame(workspace.component, width, height, () => {}).lines.join("\n");
		expect(plan).toContain("Plan"); expect(plan).toContain("중복 이벤트");
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
