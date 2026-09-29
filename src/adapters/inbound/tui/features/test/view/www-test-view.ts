import type { Component                    } from "@earendil-works/pi-tui"                             ;
import      { projectRequestTestWorkspace  } from "@/core/domain/observability/request-test-workspace" ;
import type {
              ObservedTestRun            ,
              ObservedTestSuite          ,
              RequestTestWorkspace       ,
                                           } from "@/core/domain/observability/request-test-workspace" ;
import type { WorkbenchSnapshot            } from "@/core/domain/work/workbench"                       ;
import type { PlanActivity                 } from "@/core/domain/work/workbench"                       ;
import type { OutputLanguage                } from "@/core/domain/execution/output-language"            ;
import      { a, fit, oneLine, prose, safe } from "@/adapters/inbound/tui/foundation/theme/www-theme"  ;

const count       = (value: number | null): string => value === null ? "—" : String(value)                                                                                                                                          ;
const elapsed     = (value: number | null): string => value === null ? "—" : value < 1000 ? `${value}ms` : value < 60_000 ? `${(value / 1000).toFixed(1)}s` : `${Math.floor(value / 60_000)}m${Math.floor(value % 60_000 / 1000)}s` ;
const symbol      = (status: ObservedTestRun["status"]): string => status === "passed" ? "✓" : status === "failed" ? "!" : status === "running" ? "●" : "○"                                                                         ;
const statusLabel = (run: ObservedTestRun, language: OutputLanguage): string => language === "en"
	? run.status === "passed" && (run.pass === null || run.fail === null) ? "COMPLETED" : run.status.toUpperCase()
	: run.status === "passed" && (run.pass === null || run.fail === null) ? "완료" : ({ running: "진행 중", passed: "통과", failed: "실패", unknown: "미확정" } as const)[run.status] ;
const colorStatus = (line: string): string => line.replace(/^[✓!●○]/u, glyph => glyph === "✓" ? a.success(glyph) : glyph === "!" ? a.failure(glyph) : glyph === "●" ? a.active(glyph) : a.muted(glyph))                             ;
const result      = (run: ObservedTestRun): string => run.pass === null || run.fail === null || run.skip === null ? "—" : `${run.pass} / ${run.pass + run.fail + run.skip}`                                                         ;
const suiteResult = (suite: ObservedTestSuite): string => `${suite.pass} / ${suite.pass + suite.fail + suite.skip}${suite.fail ? " !" : ""}`                                                                                        ;
const row = (name: string, value: string, time: string, width: number): string => {
	const timeWidth  = 7                                               ;
	const valueWidth = 12                                              ;
	const nameWidth  = Math.max(6, width - timeWidth - valueWidth - 2) ;
	return fit(`${oneLine(name, nameWidth).padEnd(nameWidth)} ${value.padStart(valueWidth)} ${time.padStart(timeWidth)}`, width);
};

export function projectWwwTestView(snapshot: WorkbenchSnapshot): RequestTestWorkspace {
	return projectRequestTestWorkspace({ activities: snapshot.activities, requireCodeChange: true });
}

export function renderWwwTestView(workspace: RequestTestWorkspace, width: number, selectedRunId: string | null = null, language: OutputLanguage = "ko", narrations: readonly PlanActivity[] = []): string[] {
	const rows: string[] = ["VERIFY", a.rule("─".repeat(Math.max(1, width)))];
	if (!workspace.runs.length) return [...rows, a.muted(language === "en" ? "UNOBSERVED" : "관측된 검증 없음")].map(line => fit(line, width));
	const latest      = workspace.runs.find(run => run.id === selectedRunId) ?? workspace.runs.at(-1)!                                                            ;
	const attempts    = workspace.runs.filter(run => run.command === latest.command)                                                                              ;
	const recentRuns  = workspace.runs.slice(-8)                                                                                                                  ;
	const visibleRuns = recentRuns.some(run => run.id === latest.id) ? recentRuns : [latest, ...workspace.runs.slice(-7)].sort((a, b) => a.sequence - b.sequence) ;
	if (workspace.runs.length > 1) {
		for (const run of visibleRuns) rows.push(row(`${run.id === latest.id ? ">" : " "}${symbol(run.status)} ${run.command}`, result(run), elapsed(run.durationMs), width));
		if (workspace.runs.length > visibleRuns.length) rows.push(a.muted(`+ ${workspace.runs.length - visibleRuns.length} ${language === "en" ? "commands" : "개 명령"} · Monitor`));
		rows.push("");
	}
	rows.push(`${symbol(latest.status)} ${statusLabel(latest, language)}  ${elapsed(latest.durationMs)}`, "", language === "en" ? "COMMAND" : "실행 명령", ...prose(safe(latest.command), width), "", language === "en" ? "TEST RESULT" : "검증 결과");
	const narration = latest.turnId ? narrations.find(item => item.id === `${latest.turnId}:${latest.id}`) : undefined;
	rows.push("", a.info(language === "en" ? "WHAT THIS TEST CHECKS" : "이 테스트가 확인하는 것"), ...prose(safe(narration?.summary || (language === "en" ? "Explanation not observed yet" : "설명 미관측")), width));
	const ordered       = [...latest.suites].sort((a, b) => Number(b.fail > 0) - Number(a.fail > 0)) ;
	const visibleSuites = ordered.slice(0, 8)                                                        ;
	for (const suite of visibleSuites) {
		rows.push(row(`${suite.fail ? "!" : latest.status === "running" ? "●" : "✓"} ${suite.name}`, suiteResult(suite), elapsed(suite.durationMs), width));
		if (suite.name.length > Math.max(6, width - 21)) rows.push(...prose(`  ${safe(suite.name)}`, width));
		if (suite.fail) for (const failure of suite.failures) {
			rows.push(...prose(`  ✕ ${safe(failure.name)}`, width));
			if (failure.rawError) rows.push(...failure.rawError.split("\n").filter(Boolean).slice(0, 4).flatMap(line => prose(`    ${safe(line)}`, width)));
		}
	}
	if (ordered.length > visibleSuites.length) rows.push(a.muted(`+ ${ordered.length - visibleSuites.length} ${language === "en" ? "suites" : "개 테스트 묶음"} · Monitor`));
	rows.push("", a.rule("─".repeat(Math.max(1, width))), `${language === "en" ? "PASS" : "통과"} ${count(latest.pass)} │ ${language === "en" ? "FAIL" : "실패"} ${count(latest.fail)} │ ${language === "en" ? "SKIP" : "건너뜀"} ${count(latest.skip)}`, `${language === "en" ? "EXIT" : "종료 코드"} ${count(latest.exitCode)} │ ${language === "en" ? "TIME" : "소요"} ${elapsed(latest.durationMs)}`);
	if (latest.outputTruncated) rows.push(a.muted(latest.totalsSource === "unobserved" ? language === "en" ? "Output truncated · totals UNOBSERVED" : "출력 일부 생략 · 총계 미관측" : language === "en" ? "Output truncated · runner totals observed; suite list may be partial" : "출력 일부 생략 · 테스트 목록은 일부만 관측"));
	if (latest.totalsSource === "log-readback") rows.push(a.muted(language === "en" ? "Totals read back from the redirected test log" : "저장된 테스트 로그를 다시 읽어 총계를 확인했습니다"));
	if (attempts.length > 1) {
		rows.push("", language === "en" ? "ATTEMPTS" : "검증 시도");
		for (const [index, run] of attempts.entries()) rows.push(row(`#${index + 1} ${symbol(run.status)} ${statusLabel(run, language)}`, result(run), elapsed(run.durationMs), width));
		for (const run of attempts.slice(0, -1).filter(attempt => attempt.status === "failed").slice(-1)) {
			for (const suite of run.suites.filter(candidate => candidate.fail).slice(0, 1)) {
				rows.push(...prose(`  ! ${safe(suite.name)}`, width));
				for (const failure of suite.failures.slice(0, 1)) rows.push(...prose(`    ✕ ${safe(failure.name)}`, width));
			}
		}
	}
	rows.push("", a.muted(language === "en" ? "Enter / M  Open Monitor" : "Enter / M  Monitor 열기"));
	return rows.map(line => colorStatus(fit(line, width)));
}

export class WwwTestView implements Component {
	private selectedRunId: string | null = null;
	constructor(private readonly getProjection: () => RequestTestWorkspace, private readonly language: () => OutputLanguage = () => "ko", private readonly getNarrations: () => readonly PlanActivity[] = () => []) {}
	invalidate(): void {}
	get selectedRun(): ObservedTestRun | null {
		const runs = this.getProjection().runs;
		return runs.find(run => run.id === this.selectedRunId) ?? runs.at(-1) ?? null;
	}
	moveSelection(offset: number): void {
		const runs = this.getProjection().runs;
		if (!runs.length) return;
		const index = runs.findIndex(run => run.id === this.selectedRunId);
		this.selectedRunId = runs[Math.max(0, Math.min(runs.length - 1, (index < 0 ? runs.length - 1 : index) + offset))]!.id;
	}
	render(width: number): string[] { return renderWwwTestView(this.getProjection(), width, this.selectedRunId, this.language(), this.getNarrations()); }
}
