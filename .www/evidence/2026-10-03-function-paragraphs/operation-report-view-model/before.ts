import type { NoteFeatureProjection } from "@/core/application/orchestration/workbench-feature-reads.js";
import { parseCanonicalTNoteReport }  from "@/core/application/work/t-note-service.js";
import type { WorkbenchTNote }        from "@/core/domain/work/workbench.js";

export type OperationStatus = "success" | "partial" | "failed" | "none" | "not-run" | "not-observed" | "unknown";

export interface OperationReportModelUsage {
	readonly role     : string        ;
	readonly provider : string | null ;
	readonly model    : string | null ;
	readonly effort   : string | null ;
}

export interface OperationReportActivity {
	readonly description : string                 ;
	readonly status      : OperationStatus | null ;
}

export interface OperationReportResult {
	readonly target : string          ;
	readonly action : string          ;
	readonly status : OperationStatus ;
}

export interface OperationReportChange {
	readonly area   : string          ;
	readonly status : OperationStatus ;
	readonly detail : string          ;
}

export interface OperationReportEvidence {
	readonly type  : string ;
	readonly value : string ;
}

export interface OperationReportFile {
	readonly path    : string          ;
	readonly summary : string          ;
	readonly status  : OperationStatus ;
	readonly added   : number | null   ;
	readonly deleted : number | null   ;
}

export interface OperationReportTokenUsage {
	readonly input  : number | null ;
	readonly output : number | null ;
	readonly total  : number | null ;
}

export interface OperationReportBlockingItem {
	readonly status : "partial" | "failed" ;
	readonly target : string               ;
	readonly reason : string               ;
}

export interface OperationReportComparison {
	readonly basis       : string        ;
	readonly previousId  : string        ;
	readonly totalTokens : number | null ;
}

export interface OperationReportTestSummary {
	readonly status     : OperationStatus                                                                                               ;
	readonly total      : number | null                                                                                                 ;
	readonly passed     : number | null                                                                                                 ;
	readonly failed     : number | null                                                                                                 ;
	readonly skipped    : number | null                                                                                                 ;
	readonly durationMs : number | null                                                                                                 ;
	readonly checks     : readonly { readonly command: string; readonly status: OperationStatus; readonly durationMs: number | null }[] ;
}

export interface OperationReport {
	readonly title              : string                                 ;
	readonly status             : OperationStatus                        ;
	readonly purposeAndApproach : string                                 ;
	readonly activities         : readonly OperationReportActivity[]     ;
	readonly results            : readonly OperationReportResult[]       ;
	readonly delaysAndBlocks    : string                                 ;
	readonly blocking           : readonly OperationReportBlockingItem[] ;
	readonly strengths          : string                                 ;
	readonly selfAssessment     : string                                 ;
	readonly nextApproach       : readonly string[]                      ;
	readonly changes            : readonly OperationReportChange[]       ;
	readonly evidence           : readonly OperationReportEvidence[]     ;
	readonly files              : readonly OperationReportFile[]         ;
	readonly source             : readonly string[]                      ;
	readonly models             : readonly OperationReportModelUsage[]   ;
	readonly durationMs         : number | null                          ;
	readonly tokens             : OperationReportTokenUsage              ;
	readonly comparison         : OperationReportComparison | null       ;
	readonly tests              : OperationReportTestSummary             ;
}

type OperationRuntime = {
	readonly turnId       : string | null                                                                                         ;
	readonly primaryModel : string | null                                                                                         ;
	readonly effort       : string | null                                                                                         ;
	readonly durationMs   : number | null                                                                                         ;
	readonly totalTokens  : number | null                                                                                         ;
	readonly files        : readonly { readonly kind: string; readonly ref: string; readonly summary: string }[]                  ;
	readonly receipt      : { readonly id: string; readonly digest: string; readonly status: string } | null                      ;
	readonly verification : readonly { readonly command: string; readonly status: "passed" | "failed" | "skipped" | "unknown" }[] ;
};

type OperationProjection = Pick<NoteFeatureProjection, "runtime"> & {
	readonly runtime?     : OperationRuntime ;
	readonly previousNote?: WorkbenchTNote   ;
};

/** Converts one stored report and observed runtime facts into presentation-neutral report cells. */
export function projectOperationReport(note: WorkbenchTNote, projection: OperationProjection): OperationReport {
	const report = parseCanonicalTNoteReport(note.summary);
	const runtime = projection.runtime?.turnId === note.completion?.turnId ? projection.runtime : undefined;
	const models: OperationReportModelUsage[] = [{
		role     : "Primary Agent",
		provider : null,
		model    : runtime?.primaryModel ?? null,
		effort   : runtime?.effort ?? null,
	}];
	if (note.provenance) models.push({
		role     : "Detached Narrator",
		provider : note.provenance.provider,
		model    : note.provenance.model,
		effort   : null,
	});
	const selfAssessment = report?.selfAssessment ?? note.summary                                                      ;
	const changes        = changeRows(report?.changeStatus ?? "")                                                      ;
	const evidence       = lines(report?.commitAndEvidence ?? "").map(evidenceRow)                                     ;
	const activities     = lines(report?.keyWork ?? "").filter(isOperationReportLine).map(activityRow)                 ;
	const files          = fileRows(activities, runtime?.files ?? [])                                                  ;
	const tokens         = tokenUsage(report?.modelAndTokens ?? "", runtime?.totalTokens ?? null)                      ;
	const previousReport = projection.previousNote ? parseCanonicalTNoteReport(projection.previousNote.summary) : null ;
	const previousTokens = previousReport ? tokenUsage(previousReport.modelAndTokens, null) : null                     ;
	if (runtime?.receipt) {
		evidence.push({ type: "Receipt", value: runtime.receipt.id });
		evidence.push({ type: "Receipt Digest", value: runtime.receipt.digest });
	}
	return Object.freeze({
		title              : report?.title ?? note.title,
		status             : operationStatus(selfAssessment),
		purposeAndApproach : report?.purposeAndApproach ?? note.summary,
		activities         : Object.freeze(activities),
		results            : Object.freeze(changes.map(change => ({ target: change.area, action: change.detail, status: change.status }))),
		delaysAndBlocks    : report?.delaysAndBlocks ?? "관측 없음",
		blocking           : Object.freeze(blockingRows(report?.delaysAndBlocks ?? "")),
		strengths          : report?.strengths ?? "관측 없음",
		selfAssessment,
		nextApproach       : lines(report?.nextApproach ?? ""),
		changes,
		evidence   : Object.freeze(evidence),
		files      : Object.freeze(files),
		source     : Object.freeze(sourceRows(note)),
		models     : Object.freeze(models),
		durationMs : runtime?.durationMs ?? null,
		tokens,
		comparison: projection.previousNote ? Object.freeze({
			basis       : "Previous completed request · same title",
			previousId  : projection.previousNote.id,
			totalTokens : previousTokens?.total ?? null,
		}) : null,
		tests       : testSummary(report?.test, runtime?.verification ?? []),
	});
}

function fileRows(
	activities: readonly OperationReportActivity[],
	runtimeFiles: readonly { readonly kind: string; readonly ref: string; readonly summary: string }[],
): readonly OperationReportFile[] {
	const files = new Map<string, OperationReportFile>();
	for (const file of runtimeFiles) {
		const stats = lineStats(file.summary);
		files.set(repositoryPath(file.ref), Object.freeze({
			path    : repositoryPath(file.ref),
			summary : file.summary,
			status  : "success",
			added   : stats.added,
			deleted : stats.deleted,
		}));
	}
	for (const activity of activities) {
		const parsed = changeActivity(activity.description);
		if (!parsed) continue;
		files.set(parsed.path, Object.freeze({ ...parsed, status: activity.status ?? "unknown" }));
	}
	return Object.freeze([...files.values()]);
}

function changeActivity(value: string): Omit<OperationReportFile, "status"> | null {
	const match = /^(?:[✓△✕—]\s*)?(?:CHANGE|변경)\s+(.+?)\s+\+(\d+)\s+-(\d+)(?:\s+(?:done|완료))?$/iu.exec(value.trim());
	if (!match?.[1]) return null;
	return {
		path    : repositoryPath(match[1]),
		summary : `+${match[2]} -${match[3]}`,
		added   : Number.parseInt(match[2] ?? "0", 10),
		deleted : Number.parseInt(match[3] ?? "0", 10),
	};
}

function lineStats(value: string): { readonly added: number | null; readonly deleted: number | null } {
	const match = /\+(\d+)\s+-(\d+)/u.exec(value);
	return {
		added   : match?.[1] ? Number.parseInt(match[1], 10) : null,
		deleted : match?.[2] ? Number.parseInt(match[2], 10) : null,
	};
}

function repositoryPath(value: string): string {
	const normalized = value.replace(/\\/gu, "/")     ;
	const marker     = "/src/"                        ;
	const testMarker = "/test/"                       ;
	const index      = normalized.lastIndexOf(marker) ;
	if (index >= 0) return normalized.slice(index + 1);
	const testIndex = normalized.lastIndexOf(testMarker);
	if (testIndex >= 0) return normalized.slice(testIndex + 1);
	return normalized;
}

function tokenUsage(value: string, observedTotal: number | null): OperationReportTokenUsage {
	const input  = tokenValue(value, "input")                                                                                 ;
	const output = tokenValue(value, "output")                                                                                ;
	const total  = observedTotal ?? tokenValue(value, "total") ?? (input !== null && output !== null ? input + output : null) ;
	return Object.freeze({ input, output, total });
}

function tokenValue(value: string, label: string): number | null {
	const match = new RegExp(`(?:^|\\b)${label}\\s*[:=]?\\s*([0-9][0-9,]*)`, "iu").exec(value);
	return match?.[1] ? Number.parseInt(match[1].replace(/,/gu, ""), 10) : null;
}

function blockingRows(value: string): readonly OperationReportBlockingItem[] {
	return lines(value).flatMap(line => {
		if (/관측 없음|없음|none/iu.test(line)) return [];
		const status = /실패|오류|차단|failed/iu.test(line) ? "failed" as const : "partial" as const;
		const [target, ...reason] = line.split(/\s*[·:]\s*/u);
		return reason.length > 0
			? [{ status, target: target || "Operation", reason: reason.join(" · ") }]
			: [{ status, target: "Operation", reason: line }];
	});
}

function activityRow(description: string): OperationReportActivity {
	return Object.freeze({ description, status: explicitStatus(description) });
}

function isOperationReportLine(value: string): boolean {
	return !/공개 Source 일부 생략/u.test(value);
}

function changeRows(value: string): readonly OperationReportChange[] {
	return Object.freeze(lines(value).map(detail => Object.freeze({
		area   : areaOf(detail),
		status : explicitStatus(detail) ?? "unknown",
		detail,
	})));
}

function evidenceRow(value: string): OperationReportEvidence {
	const match = /^(Linear Comment|Linear Receipt|Obsidian Receipt|Receipt File|Commit|Receipt)\s+(.+)$/iu.exec(value);
	return Object.freeze({ type: match?.[1] ?? "Evidence", value: match?.[2] ?? value });
}

function sourceRows(note: WorkbenchTNote): string[] {
	const rows = [
		`Note ${note.sequence ? `#${note.sequence}` : note.id} · ${note.format ?? "unknown"} · schema v1`,
		`저장 ${note.updatedAt}`,
		`Activity ${note.sourceActivityIds.length}개${note.sourceRange ? ` · sequence ${note.sourceRange.startSequence}–${note.sourceRange.endSequence}` : ""}`,
	];
	if (note.completion) rows.push(`Turn ${note.completion.threadId} / ${note.completion.turnId} · 질문 #${note.completion.number}`);
	return rows;
}

function areaOf(value: string): string {
	for (const [pattern, label] of [
		[/\bcode\b|코드/iu, "Code"],
		[/document|문서|obsidian/iu, "Document"],
		[/github/iu, "GitHub"],
		[/linear/iu, "Linear"],
		[/test|테스트/iu, "Test"],
	] as const) if (pattern.test(value)) return label;
	return "Operation";
}

function explicitStatus(value: string): OperationStatus | null {
	if (/^\s*✓/u.test(value)) return "success";
	if (/^\s*△/u.test(value)) return "partial";
	if (/^\s*✕/u.test(value)) return "failed";
	if (/^\s*—/u.test(value)) return "none";
	if (/(?:실패|오류|차단|성공|일치|적용|완료).{0,8}(?:않|못|없)|(?:미|불)(?:적용|일치|완료|성공)/iu.test(value)) return null;
	if (/부분 성공|partial/iu.test(value)) return "partial";
	if (/실패|failed|오류|차단/iu.test(value)) return "failed";
	if (/미실행|not run/iu.test(value)) return "not-run";
	if (/관측 (?:없음|안 됨)|not observed/iu.test(value)) return "not-observed";
	if (/변경 (?:없음|관측 없음)|\bnone\b/iu.test(value)) return "none";
	if (/(?:^|\s)(?:성공|일치|적용|완료|pass(?:ed)?|done|success|match|applied)(?:$|\s|[·,/])/iu.test(value)) return "success";
	return null;
}

function operationStatus(value: string): OperationStatus {
	if (/(?:부분 성공|실패|성공).{0,8}(?:않|못|없)/iu.test(value)) return "unknown";
	if (/(?:전체 (?:요청|판정)|최종 판정).{0,24}(?:부분 성공|partial)/iu.test(value)) return "partial";
	if (/(?:전체 (?:요청|판정)|최종 판정).{0,24}(?:실패|failed)/iu.test(value)) return "failed";
	if (/(?:전체 (?:요청|판정)|최종 판정).{0,24}(?:성공|success)/iu.test(value)) return "success";
	return "unknown";
}

function testSummary(
	value: string | undefined,
	verification: readonly { readonly command: string; readonly status: "passed" | "failed" | "skipped" | "unknown" }[],
): OperationReportTestSummary {
	if (!value && verification.length === 0) return { status: "not-observed", total: null, passed: null, failed: null, skipped: null, durationMs: null, checks: [] };
	if (!value) {
		const passed  = verification.filter(item => item.status === "passed").length                                                                      ;
		const failed  = verification.filter(item => item.status === "failed").length                                                                      ;
		const skipped = verification.filter(item => item.status === "skipped").length                                                                     ;
		const status  = failed > 0 ? "failed" : verification.every(item => item.status === "passed" || item.status === "skipped") ? "success" : "unknown" ;
		const checks  = verification.map(item => ({ command: item.command, status: verificationStatus(item.status), durationMs: null }))                  ;
		return { status, total: verification.length, passed, failed, skipped, durationMs: null, checks };
	}
	const total = /Total\s+(\d+)\/(\d+)/iu.exec(value);
	if (!total) return { status: /not run|미실행/iu.test(value) ? "not-run" : "not-observed", total: null, passed: null, failed: null, skipped: null, durationMs: null, checks: [] };
	const passed = [...value.matchAll(/·\s*passed\s*$/gimu)].length                                                ;
	const failed = [...value.matchAll(/·\s*failed\s*$/gimu)].length                                                ;
	const count  = Number.parseInt(total[2] ?? "0", 10)                                                            ;
	const status = count === 0 ? "not-observed" : failed > 0 ? "failed" : passed === count ? "success" : "unknown" ;
	const checks = lines(value).flatMap(testCheck)                                                                 ;
	const durationMs = checks.length > 0 && checks.every(check => check.durationMs !== null)
		? checks.reduce((sum, check) => sum + (check.durationMs ?? 0), 0)
		: null;
	return { status, total: count, passed, failed, skipped: null, durationMs, checks };
}

function testCheck(value: string): readonly { readonly command: string; readonly status: OperationStatus; readonly durationMs: number | null }[] {
	const match = /^\d+\.\s+(.+?)\s*:\s*([\d.]+)(ms|s)\s*·\s*(passed|failed|skipped|unknown)$/iu.exec(value);
	if (!match?.[1] || !match[2] || !match[3] || !match[4]) return [];
	const durationMs = Number.parseFloat(match[2]) * (match[3].toLowerCase() === "s" ? 1_000 : 1);
	return [{ command: match[1], status: verificationStatus(match[4]), durationMs }];
}

function verificationStatus(value: string): OperationStatus {
	return value === "passed" ? "success"
		: value === "failed" ? "failed"
			: value === "skipped" ? "not-run"
				: "unknown";
}

function lines(value: string): readonly string[] {
	return Object.freeze(value.split(/\r?\n/u).map(line => line.trim()).filter(Boolean));
}
