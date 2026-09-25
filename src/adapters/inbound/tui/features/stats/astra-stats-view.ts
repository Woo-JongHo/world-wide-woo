import type { Component }                   from "@earendil-works/pi-tui";
import type { ObservabilitySessionSummary } from "@/core/domain/observability/observability-dashboard";
import type { SessionStatsSnapshot }        from "@/core/domain/observability/session-stats";
import {
	a,
	duration,
	fit,
	mark,
	number,
	oneLine,
	pair,
	prose,
	safe,
	section,
} from "@/adapters/inbound/tui/foundation/theme/astra-theme";

function document(rows: string[], width: number): string[] { return rows.flatMap(row => prose(row, width)); }
function kv(label: string, value: unknown): string { return `${a.muted(fit(label, 20))} ${a.text(safe(value ?? "—"))}`; }
function hiddenKey(key: string): boolean {
	const normalized = key.replace(/[-_]/gu, "").toLowerCase();
	return normalized.includes("reasoning") || normalized.includes("thought") || normalized.includes("analysis")
		|| normalized.startsWith("raw") || normalized.endsWith("token") || normalized.endsWith("secret")
		|| normalized.endsWith("password") || normalized.endsWith("credential")
		|| normalized.endsWith("authorization") || normalized.endsWith("apikey");
}
function json(value: unknown, width: number): string[] {
	const text = JSON.stringify(value, (key, item) => hiddenKey(key) ? undefined : item, 2);
	return prose(a.muted(safe(text, 10_000)), width);
}

export class AstraStatsView implements Component {
	constructor(private readonly get: () => SessionStatsSnapshot, private readonly target: () => "session" | "diagnostics" | "latest" | number, private readonly historical: () => ObservabilitySessionSummary | null) {}
	invalidate(): void {}
	render(width: number): string[] {
		const s = this.get(), target = this.target(), history = this.historical();
		const rows = section("세션 검토", width, history ? "이전 세션" : s.coverage);
		if (history && target === "session") return document([...rows, kv("Session", history.sessionId), kv("결과", history.result), kv("Project", history.projectId), kv("관측 범위", history.boundary), kv("토큰", number(history.usage?.totalTokens)), kv("실패 / 재시도", `${number(history.failures)} / ${number(history.retries)}`), kv("시작", history.startedAt), kv("종료", history.endedAt), "", a.muted("이전 세션의 상세 요청·실시간 실행은 관측되지 않습니다.")], width);
		if (target === "diagnostics") return document([...rows, ...section("관측 진단", width), ...json(s.diagnostics, width), ...section("측정 근거", width), ...json({ lifecycle: s.lifecycle, performance: s.performance, coverage: s.usageObservationCoverage }, width)], width);
		if (target === "latest" || typeof target === "number") {
			const request = target === "latest" ? s.requests.details.at(-1) : s.requests.details.find(r => r.ordinal === target);
			if (!request) return document([...rows, a.muted("이 요청의 기록이 없습니다."), "/stats 세션으로 돌아가기"], width);
			return document([...rows, ...section(`요청 #${request.ordinal}`, width, request.lifecycle), safe(request.excerpt || "요청 본문 미관측"), "", kv("경과", duration(request.observedElapsedMs)), kv("모델", request.models.join(", ")), kv("Request", request.requestId), kv("Turn", request.turnId), ...section("근거", width), ...request.sourceActivityIds.map(id => `/source ${safe(id)}`)], width);
		}
		const l = s.lifecycle, p = s.performance;
		rows.push(a.strong(safe(s.claims.purpose.text === "unknown" ? "세션 목표 미설정" : s.claims.purpose.text)), a.muted(`상태 ${s.state}  /  ${l.rootTurns} root turns`), "");
		rows.push(`${number(l.completedRootTurns)} 완료    ${number(l.activeRootTurns)} 실행    ${number(l.failedRootTurns)} 실패    ${number(l.cancelledRootTurns)} 중단`);
		rows.push(...section("실행 성능", width), kv("첫 출력 평균", `${duration(p.averageFirstOutputMs)}   ${p.firstOutputObservations}회 관측`), kv("완료 턴 평균", `${duration(p.averageCompletedRootTurnMs)}   ${p.completedRootTurnDurationObservations}쌍`), kv("도구 누적 시간", `${duration(p.pairedToolTimeMs)}   ${p.pairedToolObservations}쌍`), kv("승인 대기", `${duration(p.totalApprovalWaitMs)}   ${p.pairedApprovalWaitObservations}쌍`), kv("관측 시간 범위", duration(p.journalSpanMs)), kv("관측 토큰", number(s.observedTotalTokens)), a.muted("도구 시간은 중첩될 수 있습니다. 실행 완료율은 업무 수락률이 아닙니다."));
		rows.push(...section("모델 사용", width), a.muted(`interactive ${s.usageObservationCoverage.interactive ? "관측" : "미관측"} / detached ${s.usageObservationCoverage.detached ? "관측" : "미관측"}`));
		for (const m of s.modelUsage) rows.push(pair(`${safe(m.model)} ${a.muted(m.effort || "")}`, `${number(m.totalTokens)} tokens`, width), a.muted(`  ${m.namespace} / ${m.namespace === "interactive" ? `${m.interactiveRootTurns} turns` : `${m.detachedInvocations} calls`}`));
		if (s.unattributedUsage) rows.push(a.attention(safe(s.unattributedUsage.warning)));
		rows.push(...section("요청", width, String(s.requests.submitted)));
		for (const r of s.requests.shortlist) rows.push(fit(`${mark(r.lifecycle)} #${r.ordinal}  ${oneLine(r.excerpt || "본문 미관측")}`, width), a.muted(`   ${r.lifecycle}   ${duration(r.observedElapsedMs)}   /stats #${r.ordinal}`));
		if (s.requests.omittedCount) rows.push(a.muted(`${s.requests.omittedCount}개 상세 기록은 현재 관측 범위 밖입니다.`));
		rows.push(...section("검토할 사항", width));
		for (const i of s.issues) rows.push(`${i.recovered ? a.muted("✓") : a.attention("!")} ${safe(i.summary)}`, ...(i.activityId ? [a.muted(`/source ${safe(i.activityId)}`)] : []));
		if (!s.issues.length) rows.push(a.muted("관측된 오케스트레이션 문제가 없습니다."));
		rows.push(...section("결과", width), safe(s.claims.result.text), a.muted(`근거 ${s.claims.result.authority} / 독립 검증 ${s.claims.result.independentlyVerified ? "확인" : "미확인"}`), "", a.muted("/stats diagnostics 측정 근거 / /stats latest 최근 요청"));
		return document(rows, width);
	}
}
