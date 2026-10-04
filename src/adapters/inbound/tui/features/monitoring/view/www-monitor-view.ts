import      { visibleWidth                } from "@earendil-works/pi-tui"                             ;
import type { Component                   } from "@earendil-works/pi-tui"                             ;
import type { RuntimeMonitorProjection    } from "@/core/domain/observability/runtime-monitor"        ;
import type { RequestRuntimeRecord        } from "@/core/domain/execution/request-runtime"            ;
import type { OutputLanguage              } from "@/core/domain/execution/output-language"            ;
import type { ProjectActivity             } from "@/core/domain/execution/project-activity"           ;
import type { WorkbenchSnapshot           } from "@/core/domain/work/workbench"                       ;
import      { projectRequestTestWorkspace } from "@/core/domain/observability/request-test-workspace" ;
import type { ObservedTestRun             } from "@/core/domain/observability/request-test-workspace" ;
import      {
              runtimeModeLabel          ,
              workbenchEffortLabel      ,
              workbenchModelLabel       ,
                                          } from "@/adapters/inbound/tui/foundation/labels"           ;
import      {
              a                         ,
              duration                  ,
              fit                       ,
              pair                      ,
              prose                     ,
              safe                      ,
              section                   ,
              telemetryDuration         ,
              wwwTitle                  ,
                                          } from "@/adapters/inbound/tui/foundation/theme/www-theme"  ;

/** Figma Monitor(142:3891): 요청 요약 스트립, 워터폴, 트레이스 트리, 결정 타임라인, 실패 테이블.
 *  모든 행은 실측 데이터(requestRuntime 이벤트·스테이지 시각·활동 저널)에서만 만들고,
 *  관측되지 않은 값은 미관측으로 표시한다. */
export class WwwMonitorView implements Component {
	private readonly immutableTestInputs = new WeakSet<object>();
	private testRunsCache: { immutable: boolean; activities: WorkbenchSnapshot["activities"]; revision: number; turnId: string | null | undefined; runs: ReturnType<typeof projectRequestTestWorkspace>["runs"] } | null = null;
	constructor(
		private readonly get         : () => RuntimeMonitorProjection  ,
		private readonly clock       = Date.now                        ,
		private readonly motion      = true                            ,
		private readonly getSnapshot : (() => WorkbenchSnapshot) | null = null,
		private readonly compact     = false                           ,
		private readonly selectedTestRunId: (() => string | null) | null = null,
		private readonly language: () => OutputLanguage = () => "ko",
		private readonly compactReportOnly = false,
		private readonly compactSection: "all" | "plan" | "progress" | "test" = "all",
	) {}
	invalidate(): void {}
	private label(ko: string, en: string): string { return this.language() === "en" ? en : ko; }

	render(width: number): string[] {
		const m        = this.get()                         ;
		const snapshot = this.getSnapshot?.() ?? null       ;
		const selected = this.selectedTestRunId?.() ?? null ;
		if (selected && snapshot) return document(this.selectedTestRun(snapshot, selected, width), width);
		if (this.compactReportOnly) return document(this.reportRows(m, snapshot, snapshot?.activeTurnId ?? snapshot?.workFlow.source?.turnId ?? m.requestRuntime?.turnId, width), width);
		if (this.compact) return document(this.runInspector(m, snapshot, width), width);
		if (this.isIdle(m)) return document(this.idleInspector(snapshot, width), width);
		const rows    = this.summaryStrip(m, snapshot, width) ;
		const request = m.requestRuntime ?? null              ;
		if (request) {
			rows.push(...this.waterfall(request, snapshot, width));
			rows.push(...this.traceTree(request, snapshot, width));
		}
		rows.push(...this.decisionsSection(request, width));
		rows.push(...this.failuresSection(request, m, width));
		rows.push(...this.layerSection(m, width));
		rows.push(...this.recentEventsSection(m, width));
		return document(rows, width);
	}

	private selectedTestRun(snapshot: WorkbenchSnapshot, runId: string, width: number): string[] {
		const activity = [...snapshot.activities].reverse().find(candidate => candidate.kind === "tool" && (candidate.nativeRefs.itemId === runId || candidate.id === runId));
		if (!activity) return [...section("MONITOR / TEST", width), a.muted(this.label("미관측", "UNOBSERVED"))];
		const params = activity.payload.params && typeof activity.payload.params === "object" ? activity.payload.params as Record<string, unknown> : {}                                                   ;
		const item   = params.item && typeof params.item === "object" ? params.item as Record<string, unknown> : {}                                                                                       ;
		const rows   = [...section("MONITOR / TEST", width), kv("COMMAND", item.command), kv("CWD", item.cwd), kv("EXIT", item.exitCode), kv("OBSERVED", activity.recordedAt), kv("SOURCE", activity.id)] ;
		for (const field of ["stdout", "stderr", "aggregatedOutput"] as const) {
			if (typeof item[field] !== "string" || !item[field]) continue;
			rows.push("", a.muted(field.toUpperCase()), ...item[field].split("\n").map(line => safe(line)));
		}
		if (activity.payload.observationTruncated === true) rows.push("", a.attention(this.label("수집된 출력 일부 생략", "Captured output truncated")));
		return rows;
	}

	private runInspector(m: RuntimeMonitorProjection, snapshot: WorkbenchSnapshot | null, width: number): string[] {
		const planTurnId   = snapshot?.activeTurnId ?? snapshot?.workFlow.source?.turnId ?? m.requestRuntime?.turnId              ;
		const currentPlan  = snapshot !== null && snapshot.workFlow.source?.turnId === planTurnId                                 ;
		const planTasks    = currentPlan ? snapshot.workFlow.steps : []                                                           ;
		const request      = snapshot?.requestRuntime?.findLast(item => item.turnId === planTurnId && item.protocolVersion === 4) ;
		const progress     = this.nativeProgress(snapshot, planTurnId)                                                            ;
		const planProgress = (snapshot?.planActivities ?? []).filter(item => item.turnId === planTurnId).slice(-5)                ;
		const done         = planTasks.filter(task => task.status === "completed").length                                         ;
		const rows         = [idleHeader("PLAN", width, a.plan)]                                                                  ;
		if (planTasks.length === 0) rows.push(a.muted(request?.planDecision
			? request.planDecision.required ? this.label("필요 결정 · Native Plan 대기", "Required · awaiting Native Plan") : `${this.label("불필요", "Not required")} · ${safe(request.planDecision.reason)}`
			: request ? this.label("Plan 판단 대기", "Awaiting Plan decision") : this.label("계획 미보고", "No plan reported")));
		else for (const task of planTasks) rows.push(...prose(stageInk(task.status)(`${stageMark(task.status)} ${safe(task.title)}`), width));
		rows.push("", pair(planTasks.length ? `${done} / ${planTasks.length}` : "—", "", width));
		if (this.compactSection === "plan") return rows;
		const progressStart = rows.length;
		rows.push("", idleHeader("PROGRESS", width, a.info));
		if (planProgress.length) for (const item of planProgress) rows.push(...prose(stageInk(item.status)(`${stageMark(item.status)} ${safe(item.summary)}`), width));
		else if (progress.length) for (const item of progress) rows.push(...prose(stageInk(item.status)(`${stageMark(item.status)} ${safe(item.summary)}`), width));
		else rows.push(a.muted(this.label("Native 진행 보고 대기 · Chat에서 실행 내용 확인", "Awaiting Native progress · see Chat for execution")));
		if (this.compactSection === "progress") return rows.slice(progressStart + 1);
		const testStart = rows.length;
		rows.push("", idleHeader("TEST", width, a.tool));
		const testRuns = snapshot ? this.testRunsFor(snapshot, planTurnId) : [];
		if (!testRuns.length) rows.push(a.muted(this.label("검증 실행 관측 대기", "Awaiting observed test runs")));
		if (testRuns.length) {
			const latestNarration = testRuns.at(-1)?.turnId ? snapshot?.toolActions?.find(item => item.id === `${testRuns.at(-1)!.turnId}:${testRuns.at(-1)!.id}`) : undefined;
			rows.push(...prose(a.info(`${this.label("테스트 설명", "Test purpose")} · ${safe(latestNarration?.summary || this.label("미관측", "Unobserved"))}`), width));
			const pass      = observedSum(testRuns.map(run => run.pass))                                                      ;
			const fail      = observedSum(testRuns.map(run => run.fail))                                                      ;
			const passWidth = Math.max(3, String(pass ?? "—").length, ...testRuns.map(run => String(run.pass ?? "—").length)) ;
			const failWidth = Math.max(3, String(fail ?? "—").length, ...testRuns.map(run => String(run.fail ?? "—").length)) ;
			rows.push(testRow("RESULT", "TIME", "P", "F", width, passWidth, failWidth), a.rule("─".repeat(Math.max(1, width))));
			for (const run of testRuns.slice(-4)) rows.push(testRow(`${run.status === "passed" ? "✓" : run.status === "failed" ? "×" : "·"} ${testCommand(run.command)}`, telemetryDuration(run.durationMs), String(run.pass ?? "—"), String(run.fail ?? "—"), width, passWidth, failWidth));
			const latest = testRuns.at(-1)!;
			rows.push("", ...prose(safe(testCommand(latest.command)), width));
			if (latest.executedCommand && latest.executedCommand !== testCommand(latest.command)) rows.push(...prose(`  ${this.label("실행", "Executed")}: ${safe(latest.executedCommand)}`, width));
			for (const suite of latest.suites.slice(0, 8)) rows.push(...prose(`  ${safe(suite.name)} · ${suite.pass}P ${suite.fail}F ${suite.skip}S`, width));
			if (latest.suites.length > 8) rows.push(a.muted(this.language() === "en" ? `  +${latest.suites.length - 8} files · /test` : `  +${latest.suites.length - 8}개 파일 · /test`));
			if (!latest.suites.length && !latest.executedCommand) rows.push(a.muted(this.label("  테스트 구성 미관측 · /test", "  Test configuration unobserved · /test")));
			if (latest.totalsSource === "log-readback") rows.push(a.muted(this.label("  출력 파일 재조회로 총계 확인", "  Totals confirmed from saved output")));
			if (latest.outputTruncated) rows.push(a.muted(latest.totalsSource === "unobserved" ? this.label("  출력 일부 생략 · 총계 미관측", "  Output truncated · totals unobserved") : this.label("  출력 일부 생략 · 파일/실패 목록은 일부만 관측", "  Output truncated · file and failure lists may be partial")));
			const failed = testRuns.findLast(run => run.status === "failed");
			if (failed) rows.push(...this.failedTestRows(failed, width));
		}
		if (testRuns.length > 4) rows.push(a.muted(`+${testRuns.length - 4} more · /test`));
		return this.compactSection === "test" ? rows.slice(testStart + 1) : rows;
	}

	private nativeProgress(snapshot: WorkbenchSnapshot | null, turnId: string | null | undefined): NonNullable<WorkbenchSnapshot["toolActions"]> {
		if (!snapshot || !turnId) return [];
		return (snapshot.toolActions ?? []).filter(item => item.turnId === turnId).slice(-5);
	}

	private activityItem(activity: ProjectActivity): Readonly<Record<string, unknown>> {
		const params   = activity.payload.params                                                                     ;
		const envelope = params && typeof params === "object" ? params as Record<string, unknown> : activity.payload ;
		const item     = envelope.item                                                                               ;
		return item && typeof item === "object" ? item as Record<string, unknown> : envelope;
	}

	private reportRows(m: RuntimeMonitorProjection, snapshot: WorkbenchSnapshot | null, turnId: string | null | undefined, width: number): string[] {
		const rows = ["", idleHeader("STATUS", width, a.response)];
		if (!snapshot || !turnId) return [...rows, a.muted(this.label("현재 질문 관측 대기", "Awaiting current request observations"))];
		const activities = snapshot.activities.filter(activity => activity.nativeRefs.turnId === turnId)                                               ;
		const toolIds    = new Set(activities.filter(activity => activity.kind === "tool").map(activity => activity.nativeRefs.itemId ?? activity.id)) ;
		const paths      = new Set<string>()                                                                                                           ;
		for (const activity of activities) {
			if (activity.kind !== "file-change" || activity.phase !== "completed") continue;
			const item = this.activityItem(activity);
			if (typeof item.path === "string") paths.add(item.path);
			if (Array.isArray(item.changes)) for (const change of item.changes) {
				if (change && typeof change === "object" && typeof change.path === "string") paths.add(change.path);
			}
		}
		const request = m.requestRuntime?.turnId === turnId ? m.requestRuntime : null                                                            ;
		const start   = request ? Date.parse(request.startedAt) : NaN                                                                            ;
		const end     = request?.completedAt ? Date.parse(request.completedAt) : this.clock()                                                    ;
		const elapsed = Number.isFinite(start) && Number.isFinite(end) ? duration(Math.max(0, end - start)) : this.label("미관측", "Unobserved") ;
		const fields = [
			[this.label("모델", "Model"), snapshot?.model ?? m.model ?? this.label("미관측", "Unobserved")],
			[this.label("토큰", "Tokens"), this.label("질문 단위 미관측", "Unobserved for this request")],
			[this.label("질문 상태", "Request state"), request?.status ?? this.label("미관측", "Unobserved")],
			[this.label("경과", "Elapsed"), `${elapsed}${request && !request.completedAt ? this.label(" · 진행 중", " · running") : ""}`],
			[this.label("도구 관측", "Tools observed"), toolIds.size ? String(toolIds.size) : this.label("미관측", "Unobserved")],
			[this.label("변경 파일 관측", "Changed files observed"), paths.size ? String(paths.size) : this.label("미관측", "Unobserved")],
			[this.label("Native 계획", "Native plan"), snapshot?.workFlow.source?.turnId === turnId && snapshot.workFlow.steps.length ? `${snapshot.workFlow.steps.filter(step => step.status === "completed").length} / ${snapshot.workFlow.steps.length}` : this.label("미관측", "Unobserved")],
		];
		for (const [label, value] of fields) rows.push(...prose(`${label}: ${safe(value)}`, width));
		rows.push(a.muted(this.label("진행 설명: 관측된 Native 활동", "Progress: observed Native activity")));
		rows.push(a.muted(this.label("현재 질문의 로컬 관측 · /monitor", "Current request local observations · /monitor")));
		return rows;
	}

	private failedTestRows(run: ObservedTestRun, width: number): string[] {
		const rows = ["", a.failure(this.language() === "en" ? `× failed ${run.fail ?? "count unobserved"}` : `× 실패 ${run.fail === null ? "건수 미관측" : `${run.fail}건`}`)];
		for (const name of run.failureNames.slice(0, 8)) rows.push(...prose(`  × ${safe(name)}`, width));
		if (run.fail !== null && run.fail > run.failureNames.length) rows.push(a.muted(this.language() === "en" ? `  ${run.fail - run.failureNames.length} failures were not found in output` : `  나머지 ${run.fail - run.failureNames.length}건은 출력에서 확인되지 않음`));
		if (!run.failureNames.length) rows.push(a.muted(this.label("  실패 항목 미관측", "  Failure details unobserved") + ` · exit ${run.exitCode ?? "—"} · /test`));
		return rows;
	}

	private testRunsFor(snapshot: WorkbenchSnapshot, turnId: string | null | undefined): ReturnType<typeof projectRequestTestWorkspace>["runs"] {
		if (!turnId) return [];
		if (this.testRunsCache?.activities === snapshot.activities && (this.testRunsCache.immutable || this.testRunsCache.revision === snapshot.revision) && this.testRunsCache.turnId === turnId) return this.testRunsCache.runs;
		const runs = projectRequestTestWorkspace({ activities: snapshot.activities.filter(activity => activity.nativeRefs.turnId === turnId), requireCodeChange: true }).runs;
		this.testRunsCache = { immutable: this.immutableTestInput(snapshot.activities), activities: snapshot.activities, revision: snapshot.revision, turnId, runs };
		return runs;
	}

	/** Trust reference reuse only after validating the complete frozen input tree. */
	private immutableTestInput(value: unknown, visiting = new Set<object>()): boolean {
		if (value === null || typeof value !== "object") return typeof value !== "function";
		if (this.immutableTestInputs.has(value)) return true;
		if (!Object.isFrozen(value) || visiting.has(value)) return false;
		const prototype = Object.getPrototypeOf(value);
		if (prototype !== Object.prototype && prototype !== Array.prototype && prototype !== null) return false;
		visiting.add(value);
		for (const key of Reflect.ownKeys(value)) {
			const descriptor = Object.getOwnPropertyDescriptor(value, key);
			if (!descriptor || !("value" in descriptor) || !this.immutableTestInput(descriptor.value, visiting)) return false;
		}
		visiting.delete(value);
		this.immutableTestInputs.add(value);
		return true;
	}

	private isIdle(m: RuntimeMonitorProjection): boolean {
		return m.state === "idle"
			&& !m.requestRuntime
			&& !m.activeRequest
			&& !m.currentTool
			&& !m.approval
			&& !m.layerPerformance?.current;
	}

	private idleInspector(snapshot: WorkbenchSnapshot | null, width: number): string[] {
		const servers = snapshot?.mcpServers ?? []                                                                                                 ;
		const ready   = servers.filter(server => server.enabled && ["ready", "connected", "running"].includes(server.status.toLowerCase())).length ;
		const mode    = runtimeModeLabel(snapshot?.permissionMode, snapshot?.collaborationMode).replace(/ mode$/u, "")                             ;
		return [
			idleHeader("SYSTEM", width),
			a.success("● READY"),
			idleRow(this.label("세션", "Session"), snapshot?.phase === "ready" ? this.label("활성", "Active") : snapshot?.phase ?? "—", width),
			idleRow(this.label("모드", "Mode"), mode, width),
			idleRow(this.label("모델", "Model"), workbenchModelLabel(snapshot?.activeModel ?? snapshot?.model), width),
			idleRow(this.label("추론", "Effort"), workbenchEffortLabel(snapshot?.effort), width),
			"",
			idleHeader("RUNTIME", width),
			idleRow(this.label("스킬", "Skills"), snapshot?.skillInventory?.count ?? "—", width),
			idleRow("MCP", `${ready} / ${servers.length}`, width),
			idleRow(this.label("캐시", "Cache"), "—", width),
			idleRow(this.label("맥락", "Context"), snapshot?.contextUsage ? `${snapshot.contextUsage.percent}%` : "—", width),
			"",
			idleHeader("SHORTCUTS", width),
			idleRow("/monitor", "Monitor", width),
			idleRow("Ctrl+G", this.label("화면", "Views"), width),
			idleRow("Ctrl+P", this.label("명령", "Commands"), width),
			idleRow("Tab", this.label("읽기/입력", "Read/Input"), width),
		];
	}

	/** run-summary-strip: RUN 번호·상태·경과와 MODEL/TOOL/FAILURE/RETRY/TOKENS/CONTEXT 카운터. */
	private summaryStrip(m: RuntimeMonitorProjection, snapshot: WorkbenchSnapshot | null, width: number): string[] {
		const request   = m.requestRuntime                                                                                                      ;
		const startedAt = request?.startedAt ? Date.parse(request.startedAt) : null                                                             ;
		const running   = request?.status === "running"                                                                                         ;
		const endedAt   = request?.completedAt ? Date.parse(request.completedAt) : this.clock()                                                 ;
		const elapsed   = startedAt !== null ? duration(Math.max(0, endedAt - startedAt)) : duration(null)                                      ;
		const stateInk  = running ? a.active : request?.status === "completed" ? a.success : request?.status === "failed" ? a.failure : a.muted ;
		const stateText = request?.status === "running" ? `● RUNNING ${elapsed}`
			: request?.status === "completed" ? `✓ COMPLETED ${elapsed}`
			: request?.status === "failed" ? `✕ FAILED ${elapsed}`
			: request ? `○ ${request.status.toUpperCase()} ${elapsed}`
			: "○ IDLE";
		const tokens  = snapshot?.sessionUsage?.totalTokens ;
		const context = snapshot?.contextUsage?.percent     ;
		const counters  = [
			`MODEL ${m.model ?? "—"}`,
			`TOOL ${m.currentTool?.label ?? "—"}`,
			`FAILURE ${m.failureCount}`,
			`RETRY ${m.retryCount}`,
			`TOKENS ${tokens === undefined ? "—" : safe(String(tokens))}`,
			`CONTEXT ${context === undefined ? "—" : `${context}%`}`,
		].join(a.muted(" │ "));
		return [
			...(request ? [pair(a.strong("QUESTION"), safe(request.objective || request.requestId), width)] : []),
			pair(`${a.strong(`RUN #${snapshot?.journalSequence ?? 0}`)}  ${stateInk(stateText)}`, a.muted(`Agent ${m.agent ?? "—"}`), width),
			a.muted(counters),
		];
	}

	/** RUN TRACE WATERFALL: 요청 시작 기준 오프셋에 체크포인트·도구 활동을 배치한다. */
	private waterfall(request: RequestRuntimeRecord, snapshot: WorkbenchSnapshot | null, width: number): string[] {
		const rows  = [pair(wwwTitle("RUN TRACE WATERFALL", a.plan), a.muted(`attempt ${request.attempt}`), width)] ;
		const start = request.startedAt ? Date.parse(request.startedAt) : Number.NaN                                ;
		if (!Number.isFinite(start)) return [...rows, a.muted(this.label("요청 시작 시각이 관측되지 않았습니다.", "Request start time was not observed."))];
		const observedEnd = request.completedAt ? Date.parse(request.completedAt) : this.clock()          ;
		const end         = Number.isFinite(observedEnd) && observedEnd > start ? observedEnd : start + 1 ;
		const windowMs    = end - start                                                                   ;
		const plotWidth   = Math.max(10, width - 20)                                                      ;
		const toCell      = (offsetMs: number): number => Number.isFinite(offsetMs)
			? Math.max(0, Math.min(plotWidth, Math.round((offsetMs / windowMs) * plotWidth)))
			: 0;

		const axisMarks: string[] = []                     ;
		const axisCells           = Math.max(1, plotWidth) ;
		for (let cell = 0; cell <= axisCells; cell += 1) {
			const at = start + (cell / axisCells) * windowMs;
			axisMarks.push(at % 60_000 < windowMs / axisCells ? "┊" : " ");
		}
		rows.push(a.muted(`  ${axisMarks.join("")}`));

		const toolRows: { offset: number; label: string; failed: boolean }[] = [];
		for (const activity of snapshot?.activities ?? []) {
			if (activity.kind !== "tool") continue;
			const offset = Date.parse(activity.recordedAt) - start;
			if (!Number.isFinite(offset) || offset < 0 || offset > windowMs) continue;
			toolRows.push({ offset, label: safe(toolLabel(activity.payload)), failed: activity.phase === "failed" });
		}
		toolRows.sort((left, right) => left.offset - right.offset);

		const span = (label: string, offsetMs: number, durationMs: number | null, ink: (text: string) => string, indent = ""): string => {
			const startCell = Math.min(plotWidth - 1, toCell(offsetMs))                           ;
			const endCell   = durationMs === null ? startCell + 1 : toCell(offsetMs + durationMs) ;
			const length    = Math.max(1, Math.min(plotWidth - startCell, endCell - startCell))   ;
			const bar       = ink("█".repeat(length))                                             ;
			return `${a.muted(`${indent}${label}`.slice(0, 16).padEnd(16))}${" ".repeat(Math.max(0, startCell))}${bar}`;
		};

		rows.push(span("REQUEST", 0, windowMs, a.muted));
		const checkpoints = request.checkpoints ?? [];
		for (const [index, item] of checkpoints.entries()) {
			if (!item.observedAt) continue;
			const checkpointStart = Date.parse(item.observedAt);
			if (!Number.isFinite(checkpointStart)) continue;
			const next          = checkpoints.slice(index + 1).find(candidate => candidate.observedAt)                                                           ;
			const checkpointEnd = next?.observedAt ? Date.parse(next.observedAt) : item.status === "running" ? this.clock() : checkpointStart + 1000             ;
			const ink           = item.status === "observed" ? a.success : item.status === "running" ? a.active : item.status === "failed" ? a.failure : a.muted ;
			rows.push(span(item.id, Math.max(0, checkpointStart - start), Number.isFinite(checkpointEnd) ? Math.max(1000, checkpointEnd - checkpointStart) : null, ink));
		}
		for (const tool of toolRows.slice(0, 8)) {
			rows.push(`${a.muted("  ↳ ".padEnd(18))}${" ".repeat(Math.max(0, toCell(tool.offset)))}${tool.failed ? a.failure("✕") : a.success("◆")} ${a.muted(fit(tool.label, Math.max(4, plotWidth - toCell(tool.offset) - 4)))}`);
		}
		return rows;
	}

	/** TRACE TREE: 세 체크포인트와 관측된 Native 도구 활동을 나열한다. */
	private traceTree(request: RequestRuntimeRecord, snapshot: WorkbenchSnapshot | null, width: number): string[] {
		const rows = [pair(`${a.active(`● ${request.objective || `RUN #${snapshot?.journalSequence ?? 0}`}`)}`, a.muted(snapshot?.model ?? this.label("모델 미관측", "Model unobserved")), width)];
		const tools = (snapshot?.activities ?? [])
			.filter(activity => activity.kind === "tool")
			.slice(-6)
			.reverse();
		for (const item of request.checkpoints ?? []) {
			const marker = item.status === "observed" ? a.success("✓") : item.status === "running" ? a.active("●") : item.status === "failed" ? a.failure("×") : a.muted("·");
			rows.push(fit(`${marker} ${safe(item.id)}${item.summary ? a.muted(` · ${safe(item.summary, 240)}`) : ""}`, width));
		}
		for (const tool of tools) rows.push(fit(`  ${a.tool("◆")} ${a.text(safe(toolLabel(tool.payload)))}`, width));
		if (rows.length === 1) rows.push(a.muted(this.label("관측된 활동이 없습니다.", "No activity observed.")));
		return rows;
	}

	/** DECISIONS TIMELINE: decision.created 이벤트를 요청 시작 기준 오프셋 시각으로 나열한다. */
	private decisionsSection(request: RequestRuntimeRecord | null, width: number): string[] {
		const rows  = [pair(wwwTitle("DECISIONS TIMELINE", a.plan), "", width)] ;
		const start = request?.startedAt ? Date.parse(request.startedAt) : null ;
		const decisions = (request?.events ?? [])
			.filter(event => event.type === "decision.created")
			.map(event => ({ at: Date.parse(event.at), stage: event.stage ?? "—", text: safe(event.reason ?? "") }))
			.filter(entry => !Number.isNaN(entry.at));
		if (!decisions.length) return [...rows, a.muted(this.label("아직 결정이 관측되지 않았습니다.", "No decisions observed yet."))];
		const first = start ?? Math.min(...decisions.map(entry => entry.at));
		for (const entry of decisions) {
			const offset = entry.at - first;
			rows.push(pair(`${a.muted(offsetClock(offset))}  ${a.attention(fit(entry.text, Math.max(8, width - 22)))}`, a.muted(entry.stage), width));
		}
		return rows;
	}

	/** ACTIVE FAILURES & RETRIES: 실패·차단 이벤트를 시각·대상·사유 테이블로 나열한다. */
	private failuresSection(request: RequestRuntimeRecord | null, m: RuntimeMonitorProjection, width: number): string[] {
		const rows = [pair(wwwTitle("ACTIVE FAILURES & RETRIES", a.failure), a.muted(this.language() === "en" ? `${m.failureCount} failures · ${m.retryCount} retries` : `실패 ${m.failureCount} · 재시도 ${m.retryCount}`), width)];
		const failures = (request?.events ?? [])
			.filter(event => ["stage.failed", "stage.blocked", "action.failed", "request.failed"].includes(event.type))
			.map(event => ({ at: Date.parse(event.at), stage: event.stage ?? "—", reason: safe(event.reason ?? event.type) }))
			.filter(entry => !Number.isNaN(entry.at))
			.slice(-6);
		if (!failures.length) return [...rows, a.success(this.label("관측된 실패가 없습니다.", "No failures observed."))];
		for (const failure of failures) rows.push(pair(`${a.failure(`✕ ${failure.stage}`)} ${a.muted(failure.reason.slice(0, Math.max(8, width - 24)))}`, a.muted(offsetClock(failure.at - (request?.startedAt ? Date.parse(request.startedAt) : failure.at))), width));
		return rows;
	}

	private layerSection(m: RuntimeMonitorProjection, width: number): string[] {
		if (!m.layerPerformance?.current) return [];
		const rows: string[] = []                               ;
		const trace          = m.layerPerformance.current       ;
		const render         = m.layerPerformance.window.render ;
		rows.push(...section("Render Health", width, render.slowCount ? "slow" : "healthy"));
		rows.push(
			kv("Current trace render", trace.renderMs === null ? "미관측" : `${telemetryDuration(trace.renderMs)}${trace.slowRender ? " · SLOW" : ""}`),
			kv("Slow frames", `${render.slowCount} / ${render.frameCount} (${render.slowRate}%) · > ${telemetryDuration(render.thresholdMs)}`),
			kv("Frame latency", `p50 ${telemetryDuration(render.latency.p50)} · p95 ${telemetryDuration(render.latency.p95)} · p99 ${telemetryDuration(render.latency.p99)}`),
			kv("Worst frame", render.worstFrameId && render.worstMs !== null ? `${render.worstFrameId} · ${telemetryDuration(render.worstMs)}` : "미관측"),
		);
		rows.push(...section("Layer Performance", width, `${trace.state} · ${trace.totalMs === null ? "total 미관측" : telemetryDuration(trace.totalMs)}`));
		for (const layer of trace.layers) {
			const wait = layer.waitMs === null ? "미관측" : telemetryDuration(layer.waitMs) ;
			const work = layer.workMs === null ? "미관측" : telemetryDuration(layer.workMs) ;
			rows.push(kv(layer.layerId, `wait ${wait} · work ${work}${layer.failed ? " · 실패" : ""}`));
		}
		const window = m.layerPerformance.window;
		rows.push(kv("Window", `${window.traceCount} traces · ${window.errorCount} trace failures`));
		return rows;
	}

	private recentEventsSection(m: RuntimeMonitorProjection, width: number): string[] {
		const rows = section(this.label("최근 이벤트", "Recent events"), width, this.language() === "en" ? `${m.recentEvents.length}` : `${m.recentEvents.length}개`);
		for (const event of m.recentEvents) rows.push(`${a.muted(safe(event.recordedAt.slice(11, 19)))}  ${a.active(safe(event.kind.toLowerCase()))}`, `  ${safe(event.label)}`, a.muted(`  /source ${safe(event.activityId)}`), "");
		if (!m.recentEvents.length) rows.push(a.muted(this.label("실행 이벤트가 아직 관측되지 않았습니다.", "No execution events observed yet.")));
		return rows;
	}
}

function toolLabel(payload: Readonly<Record<string, unknown>>): string {
	const text = payload.text;
	if (typeof text === "string" && text.trim()) return text;
	const method = payload.method;
	return typeof method === "string" ? method : "tool";
}

function document(rows: string[], width: number): string[] { return rows.flatMap(row => prose(row, width)); }
function kv(label: string, value: unknown): string { return `${a.muted(fit(label, 20))} ${a.text(safe(value ?? "—"))}`; }

function idleHeader(label: string, width: number, ink = a.muted): string {
	const title = ink(label);
	return `${title} ${a.rule("─".repeat(Math.max(0, width - visibleWidth(title) - 1)))}`;
}

function idleRow(label: string, value: unknown, width: number): string {
	const labelWidth = Math.min(12, Math.max(8, Math.floor(width * 0.36)));
	return `${a.muted(fit(label, labelWidth))}${a.text(fit(safe(value ?? "—"), Math.max(0, width - labelWidth)))}`;
}

function testRow(label: string, time: string, pass: string, fail: string, width: number, passWidth = 3, failWidth = 3): string {
	const columns   = `${fit(time, 6).padStart(6)} ${fit(pass, passWidth).padStart(passWidth)} ${fit(fail, failWidth).padStart(failWidth)}` ;
	const nameWidth = Math.max(6, width - visibleWidth(columns) - 1)                                                                        ;
	const name      = fit(safe(label), nameWidth)                                                                                           ;
	return `${name}${" ".repeat(Math.max(0, nameWidth - visibleWidth(name)))} ${columns}`;
}

function testCommand(command: string): string {
	return /^\/bin\/(?:zsh|bash)\s+-lcr?\s+(["'])([\s\S]*)\1$/u.exec(command.trim())?.[2] ?? command;
}

function observedSum(values: readonly (number | null)[]): number | null {
	return values.every(value => value !== null) ? values.reduce<number>((total, value) => total + value!, 0) : null;
}

function monitorAge(value: { readonly startedAt: string; readonly elapsedMs: number | null } | null | undefined): string {
	if (!value) return "미관측";
	return value.elapsedMs === null ? `${duration(Math.max(0, Date.now() - Date.parse(value.startedAt)))} / 종료 미관측` : duration(value.elapsedMs);
}

function stageMark(status: string): string {
	if (status === "completed" || status === "skipped") return "✓";
	if (status === "running") return "●";
	if (status === "failed") return "×";
	if (status === "blocked") return "Ⅱ";
	return "○";
}

function stageInk(status: string): (text: string) => string {
	if (status === "completed") return a.success;
	if (status === "running") return a.active;
	if (status === "failed" || status === "blocked") return a.failure;
	return a.muted;
}

function elapsedSince(startedAtMs: number, now: number): string { return duration(Math.max(0, now - startedAtMs)); }

function offsetClock(offsetMs: number): string {
	const totalSeconds = Math.max(0, Math.floor(offsetMs / 1000)) ;
	const minutes      = Math.floor(totalSeconds / 60)            ;
	const seconds      = totalSeconds % 60                        ;
	return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
