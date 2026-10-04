import      {
              truncateToWidth  ,
              visibleWidth     ,
              wrapTextWithAnsi ,
                                 } from "@earendil-works/pi-tui"                                                       ;
import      { colors, semantic   } from "@/adapters/inbound/tui/foundation/theme/theme"                                ;
import type {
              OperationReport  ,
              OperationStatus  ,
                                 } from "@/adapters/inbound/tui/features/tnote/view-model/operation-report-view-model" ;

const NARROW_WIDTH = 60 ;
const WIDE_WIDTH   = 90 ;

/** Renders a completed request as a scan-first operation report at any terminal width. */
export function renderOperationReport(report: OperationReport, width: number): string[] {
	const contentWidth = Math.max(1, width);
	const rows = [
		colors.highlight("OUTPUT · OPERATION REPORT"),
		"═".repeat(contentWidth),
		"",
		...snapshotRows(report, contentWidth),
		...narrativeSection("01. 요청 목적 · 접근", report.purposeAndApproach, contentWidth),
		...activitySection(report, contentWidth),
		...resultSection(report, contentWidth),
		...blockingSection(report, contentWidth),
		...modelSection(report, contentWidth),
		...metricsSection(report, contentWidth),
		...evaluationSection(report, contentWidth),
		...listSection("09. 후속 권고", report.nextApproach, contentWidth, false),
		...changeSection(report, contentWidth),
		...fileSection(report, contentWidth),
		...evidenceSection(report, contentWidth),
		...testSection(report, contentWidth),
	];
	return rows.map(rowValue => fit(rowValue, contentWidth));
}

function snapshotRows(report: OperationReport, width: number): string[] {
	const values = [
		["결과", statusText(report.status)],
		["소요시간", duration(report.durationMs)],
		["모델", report.models[0]?.model ?? "UNKNOWN"],
		["총 토큰", report.tokens.total === null ? "—" : number(report.tokens.total)],
		["테스트", statusText(report.tests.status)],
	];
	if (width < NARROW_WIDTH) return values.flatMap(([label, value]) => [label ?? "", `  ${value ?? ""}`]).concat("");
	const rows: string[] = [];
	for (let index = 0; index < values.length; index += 2) {
		const left = values[index], right = values[index + 1];
		rows.push(pair(left?.[0] ?? "", left?.[1] ?? "", right?.[0] ?? "", right?.[1] ?? "", width));
	}
	rows.push("");
	return rows;
}

function resultSection(report: OperationReport, width: number): string[] {
	return [...heading("03. 결과", width), ...(width < NARROW_WIDTH ? narrowResultRows(report) : wideResultRows(report, width))];
}

function activitySection(report: OperationReport, width: number): string[] {
	const rows   = [...heading("02. 주요 작업", width)] ;
	const cursor = { oldLine: 1, newLine: 1 }           ;
	report.activities.forEach((activity, index) => {
		if (/^(?:[✓△✕—]\s*)?(?:CHANGE|CHECK)\b/iu.test(activity.description)) {
			rows.push(...wrapped(activity.description, width));
			if (/\bCHANGE\b/iu.test(activity.description) && report.activities[index + 1]?.description.startsWith("│ ")) {
				cursor.oldLine = 1;
				cursor.newLine = 1;
				rows.push(colors.muted("     OLD  NEW"));
			}
			return;
		}
		if (activity.description.startsWith("│ ")) {
			rows.push(...diffRows(activity.description, width, cursor));
			return;
		}
		const marker = activity.status === null ? "·" : statusSymbol(activity.status);
		rows.push(...wrapped(activity.description, width, `${String(index + 1).padStart(2, "0")}  ${marker}  `));
	});
	rows.push("");
	return rows;
}

function diffRows(value: string, width: number, cursor: { oldLine: number; newLine: number }): string[] {
	const content = value.slice(2)                                                 ;
	const hunk    = /^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/u.exec(content) ;
	if (hunk) {
		cursor.oldLine = Number.parseInt(hunk[1] ?? "1", 10);
		cursor.newLine = Number.parseInt(hunk[2] ?? "1", 10);
		return [semantic.diffContext(`   ·    ·   ${content}`)];
	}
	const marker    = content.startsWith("+") ? "+" : content.startsWith("-") ? "-" : " " ;
	const code      = marker === " " ? content : content.slice(1)                         ;
	const oldNumber = marker === "+" ? "" : String(cursor.oldLine)                        ;
	const newNumber = marker === "-" ? "" : String(cursor.newLine)                        ;
	if (marker !== "+") cursor.oldLine += 1;
	if (marker !== "-") cursor.newLine += 1;
	const color = content.startsWith("+") ? semantic.diffAdded
		: content.startsWith("-") ? semantic.diffRemoved
			: semantic.diffContext;
	const prefix       = `${oldNumber.padStart(4)} ${newNumber.padStart(4)} ${marker} ` ;
	const continuation = "          │ "                                                 ;
	const available    = Math.max(1, width - visibleWidth(prefix))                      ;
	return wrapTextWithAnsi(code, available).map((part, index) => color(`${index === 0 ? prefix : continuation}${part}`));
}

function modelSection(report: OperationReport, width: number): string[] {
	return [...heading("05. 모델 · 토큰 · Runtime", width), ...(width < WIDE_WIDTH ? narrowModelRows(report) : wideModelRows(report, width))];
}

function tokenComparisonRows(report: OperationReport): string[] {
	const rows: string[] = [];
	if (report.tokens.input !== null && report.tokens.output !== null && report.tokens.output > 0) {
		rows.push(`Input : Output  ${(report.tokens.input / report.tokens.output).toFixed(1)} : 1`);
	}
	if (report.comparison?.totalTokens !== null && report.comparison) {
		const delta = report.tokens.total === null ? null : report.tokens.total - report.comparison.totalTokens;
		rows.push(`Previous total  ${number(report.comparison.totalTokens)}  Δ ${signedDelta(delta)}`);
	}
	rows.push(`Compare with   ${report.comparison?.basis ?? "No comparable previous run"}`, "");
	return rows;
}

function metricsSection(report: OperationReport, width: number): string[] {
	const changed        = report.files.length > 0 ? String(report.files.length) : report.changes.some(change => change.status === "none") ? "0" : "—" ;
	const added          = sumObserved(report.files.map(file => file.added))                                                                           ;
	const deleted        = sumObserved(report.files.map(file => file.deleted))                                                                         ;
	const previousTokens = report.comparison?.totalTokens ?? null                                                                                      ;
	const metrics = [
		["Duration", duration(report.durationMs), "—", "—"],
		["Tokens", metric(report.tokens.total), metric(previousTokens), signedDelta(report.tokens.total !== null && previousTokens !== null ? report.tokens.total - previousTokens : null)],
		["Retries", "—", "—", "—"],
		["Failures", report.tests.failed === null ? "—" : String(report.tests.failed), "—", "—"],
		["Tests", report.tests.total === null ? "—" : String(report.tests.total), "—", "—"],
		["Files changed", changed, "—", "—"],
		["Lines added", metric(added), "—", "—"],
		["Lines deleted", metric(deleted), "—", "—"],
	];
	const rows = [...heading("07. 실행 지표 · 이전 실행 비교", width)];
	if (width < NARROW_WIDTH) for (const [label, current, previous, delta] of metrics) rows.push(label ?? "", `  Current   ${current ?? "—"}`, `  Previous  ${previous ?? "—"}`, `  Δ         ${delta ?? "—"}`);
	else if (width < WIDE_WIDTH) for (const [label, current, previous, delta] of metrics) rows.push(`${label ?? ""}  ${current ?? "—"}  ← ${previous ?? "—"}  Δ ${delta ?? "—"}`);
	else {
		const widths = [Math.max(12, width - 42), 14, 14, 10];
		rows.push(row(["METRIC", "CURRENT", "PREVIOUS", "Δ"], widths));
		for (const metricRow of metrics) rows.push(row(metricRow.map(value => value ?? "—"), widths, true));
	}
	rows.push("");
	return rows;
}

function changeSection(report: OperationReport, width: number): string[] {
	return [...heading("10. 변경 상태", width), ...(width < NARROW_WIDTH ? narrowChangeRows(report, width) : wideChangeRows(report, width))];
}

function fileSection(report: OperationReport, width: number): string[] {
	if (report.files.length === 0) return [];
	return [...heading("11. 변경 파일", width), ...(width < NARROW_WIDTH ? narrowFileRows(report, width) : wideFileRows(report, width))];
}

function blockingSection(report: OperationReport, width: number): string[] {
	const rows = [...heading("04. 장시간 · 차단 작업", width), `총 진행 시간  ${duration(report.durationMs)}`, ""];
	if (report.blocking.length === 0) rows.push("— NONE", "");
	else for (const item of report.blocking) rows.push(`${statusSymbol(item.status)} ${item.target}`, ...wrapped(item.reason, width, "  "), "");
	return rows;
}

function evaluationSection(report: OperationReport, width: number): string[] {
	return [...heading("08. 평가", width), "잘된 점", ...wrapped(report.strengths, width, "  • "), "", "업무 자체평가", ...wrapped(report.selfAssessment, width, "  "), "", "최종 판정", `  전체 요청  ${statusText(report.status)}`, ""];
}

function evidenceSection(report: OperationReport, width: number): string[] {
	const commit = report.evidence.find(item => item.type === "Commit")?.value ?? "—"                                                                                                             ;
	const rows   = [...heading("12. Commit · Evidence", width), "COMMIT", pair("Branch", "— UNKNOWN", "Commit", commit, width), pair("Working tree", "— UNKNOWN", "", "", width), "", "EVIDENCE"] ;
	if (report.evidence.length === 0) rows.push("— NONE");
	else if (width < NARROW_WIDTH) for (const evidence of report.evidence) rows.push(evidence.type, ...wrapped(evidence.value, width, "  "));
	else {
		const widths = [20, Math.max(18, width - 21)];
		rows.push(row(["TYPE", "VALUE"], widths));
		for (const evidence of report.evidence) rows.push(row([evidence.type, evidence.value], widths));
	}
	rows.push("", "SOURCE");
	for (const source of report.source) rows.push(...wrapped(source, width, "  "));
	rows.push("");
	return rows;
}

function testSection(report: OperationReport, width: number): string[] {
	const tests = report.tests                                                                                                                                                                                                                                                                                  ;
	const rows  = [...heading("13. Test", width), `Status       ${statusText(tests.status)}`, "", `Total        ${metric(tests.total)}`, `Passed       ${metric(tests.passed)}`, `Failed       ${metric(tests.failed)}`, `Skipped      ${metric(tests.skipped)}`, `Duration     ${duration(tests.durationMs)}`] ;
	if (tests.checks.length > 0) {
		rows.push("");
		for (const check of tests.checks) rows.push(...wrapped(`${statusText(check.status)}  ${check.command}  ${duration(check.durationMs)}`, width));
	}
	rows.push("");
	return rows;
}

function narrowResultRows(report: OperationReport): string[] {
	return [...report.results.flatMap(result => [result.target, `  ${result.action}`, `  ${statusText(result.status)}`]), "전체 판정", `  ${statusText(report.status)}`, ""];
}

function wideResultRows(report: OperationReport, width: number): string[] {
	const widths = [12, Math.max(18, width - 31), 16];
	return [
		row(["TARGET", "ACTION", "RESULT"], widths),
		...report.results.map(result => row([result.target, result.action, statusText(result.status)], widths)),
		row(["", "전체 판정", statusText(report.status)], widths),
		"",
	];
}

function narrowModelRows(report: OperationReport): string[] {
	return [
		...report.models.flatMap((model, index) => [
			model.role,
			`  Provider  ${model.provider ?? "—"}`,
			`  Model     ${model.model ?? "UNKNOWN"}`,
			`  Effort    ${model.effort ?? "—"}`,
			`  Input     ${index === 0 ? metric(report.tokens.input) : "—"}`,
			`  Output    ${index === 0 ? metric(report.tokens.output) : "—"}`,
			`  Total     ${index === 0 ? metric(report.tokens.total) : "—"}`,
			"",
		]),
		...tokenComparisonRows(report),
	];
}

function wideModelRows(report: OperationReport, width: number): string[] {
	const widths = [18, 12, Math.max(12, width - 76), 8, 10, 10, 12];
	return [
		row(["ROLE", "PROVIDER", "MODEL", "EFFORT", "INPUT", "OUTPUT", "TOTAL"], widths),
		...report.models.map((model, index) => row([
			model.role,
			model.provider ?? "—",
			model.model ?? "UNKNOWN",
			model.effort ?? "—",
			index === 0 ? metric(report.tokens.input) : "—",
			index === 0 ? metric(report.tokens.output) : "—",
			index === 0 ? metric(report.tokens.total) : "—",
		], widths, true)),
		"",
		...tokenComparisonRows(report),
	];
}

function narrowChangeRows(report: OperationReport, width: number): string[] {
	return [...report.changes.flatMap(change => [change.area, `  ${statusText(change.status)}`, ...wrapped(change.detail, width, "  ")]), ""];
}

function wideChangeRows(report: OperationReport, width: number): string[] {
	const widths = [12, 16, Math.max(18, width - 31)];
	return [row(["AREA", "STATUS", "DETAIL"], widths), ...report.changes.map(change => row([change.area, statusText(change.status), change.detail], widths)), ""];
}

function narrowFileRows(report: OperationReport, width: number): string[] {
	return [...report.files.flatMap(file => [...wrapped(file.path, width), `  ${statusText(file.status)}`, `  ADD  ${signed(file.added, "+")}`, `  DEL  ${signed(file.deleted, "-")}`]), ""];
}

function wideFileRows(report: OperationReport, width: number): string[] {
	const widths = [Math.max(18, width - 31), 10, 8, 8];
	return [
		row(["FILE", "STATUS", "ADD", "DEL"], widths),
		...report.files.flatMap(file => [
			row([file.path, statusText(file.status), signed(file.added, "+"), signed(file.deleted, "-")], widths, true),
			...(file.added === null && file.deleted === null && file.summary ? wrapped(file.summary, width, "  ") : []),
		]),
		row([`${report.files.length} files`, "", signed(sumObserved(report.files.map(file => file.added)), "+"), signed(sumObserved(report.files.map(file => file.deleted)), "-")], widths, true),
		"",
	];
}

function narrativeSection(title: string, value: string, width: number): string[] { return [...heading(title, width), ...wrapped(value, width), ""]; }
function listSection(title: string, values: readonly string[], width: number, numbered: boolean): string[] {
	const rows = [...heading(title, width)];
	values.forEach((value, index) => rows.push(...wrapped(value, width, numbered ? `${String(index + 1).padStart(2, "0")}  ` : `${index + 1}. `)));
	rows.push("");
	return rows;
}
function heading(title: string, width: number): string[] { return ["─".repeat(width), colors.highlight(title), ""]; }
function wrapped(value: string, width: number, prefix = ""): string[] {
	const available = Math.max(1, width - visibleWidth(prefix));
	return value.split(/\r?\n/u).flatMap(line => wrapTextWithAnsi(line, available).map((part, index) => `${index === 0 ? prefix : " ".repeat(visibleWidth(prefix))}${part}`));
}
function pair(leftLabel: string, leftValue: string, rightLabel: string, rightValue: string, width: number): string {
	const half = Math.floor(width / 2);
	return `${cell(leftLabel, 12)}${cell(leftValue, half - 12)}${cell(rightLabel, 12)}${cell(rightValue, width - half - 12)}`;
}
function row(values: readonly string[], widths: readonly number[], right = false): string {
	return values.map((value, index) => right && index > 0 ? cellRight(value, widths[index] ?? 1) : cell(value, widths[index] ?? 1)).join(" ");
}
function cell(value: string, width: number): string { const clipped = truncateToWidth(value, Math.max(0, width)); return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped))); }
function cellRight(value: string, width: number): string { const clipped = truncateToWidth(value, Math.max(0, width)); return " ".repeat(Math.max(0, width - visibleWidth(clipped))) + clipped; }
function fit(value: string, width: number): string { return cell(value, width); }
function number(value: number): string { return new Intl.NumberFormat("en-US").format(value); }
function metric(value: number|null): string { return value === null ? "—" : number(value); }
function signed(value: number|null, sign: "+"|"-"): string { return value === null ? "—" : `${sign}${number(value)}`; }
function signedDelta(value: number|null): string { return value === null ? "—" : `${value > 0 ? "+" : ""}${number(value)}`; }
function sumObserved(values: readonly (number|null)[]): number|null {
	const observed = values.filter((value): value is number => value !== null);
	return observed.length > 0 ? observed.reduce((sum, value) => sum + value, 0) : null;
}
function duration(value: number|null): string {
	if (value === null) return "—";
	const seconds = Math.floor(value / 1_000), minutes = Math.floor(seconds / 60);
	return minutes > 0 ? String(minutes) + "m " + String(seconds % 60).padStart(2, "0") + "s" : String(seconds) + "s";
}
function statusText(status: OperationStatus): string {
	const value = status === "success" ? "✓ SUCCESS"
		: status === "partial" ? "△ PARTIAL"
			: status === "failed" ? "✕ FAILED"
				: status === "none" ? "— NONE"
					: status === "not-run" ? "— NOT RUN"
						: status === "not-observed" ? "— NOT OBSERVED"
							: "— UNKNOWN";
	if (status === "success") return colors.success(value);
	if (status === "partial") return colors.warning(value);
	if (status === "failed") return colors.error(value);
	return colors.muted(value);
}

function statusSymbol(status: OperationStatus): string {
	if (status === "success") return colors.success("✓");
	if (status === "partial") return colors.warning("△");
	if (status === "failed") return colors.error("✕");
	return colors.muted("—");
}
