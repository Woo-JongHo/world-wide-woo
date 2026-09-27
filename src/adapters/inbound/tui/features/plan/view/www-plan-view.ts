import type { Component }                               from "@earendil-works/pi-tui";
import type { RequestRuntimeRecord }                    from "@/core/domain/execution/request-runtime";
import type { PlanFeatureProjection }                   from "@/core/application/orchestration/workbench-feature-reads";
import { a, fit, joinedSections, prose, safe, section } from "@/adapters/inbound/tui/foundation/theme/www-theme";
import { compactStatusRows }                            from "@/adapters/inbound/tui/foundation/components/status-card";

/** The journal record shape arrives through the feature read projection, not the domain module. */
type PlanActivity = NonNullable<PlanFeatureProjection["planActivities"]>[number];

export interface PlanRuntimePresentation {
	readonly motionActive: (request: Pick<RequestRuntimeRecord, "status" | "completedAt">, now: number) => boolean;
	readonly rows: (request: RequestRuntimeRecord, width: number, compact: boolean, motionFrame: number, goal?: string | null, activityRows?: readonly string[]) => string[];
}

function stageRows(width: number): string[] {
	return [...section("STAGE", width, "미관측", a.plan), ...prose(a.muted("요청 Runtime이 시작되면 단계 상태를 표시합니다."), width)];
}

function planRows(snapshot: PlanFeatureProjection, width: number, compact: boolean): string[] {
	const steps = snapshot.workFlow.steps;
	const rows = [...section("PLAN", width, steps.length ? `${steps.filter(x => x.status === "completed").length}/${steps.length}` : "미관측", a.plan)];
	if (!steps.length) {
		const message = snapshot.workFlow.rejections.length
			? "전달받은 계획을 확인하지 못했습니다."
			: "현재 요청에서 전달받은 계획이 없습니다.";
		return [...rows, ...prose(a.muted(message), width)];
	}
	if (rows.at(-1) === "") rows.pop();
	for (const step of steps) rows.push(...compactStatusRows(step.title, step.status, width));
	return rows;
}

function progressEntries(snapshot: PlanFeatureProjection): readonly PlanActivity[] {
	const turnId                   = snapshot.workFlow.source?.turnId ?? snapshot.activeTurnId ?? snapshot.requestRuntime?.at(-1)?.turnId                                        ;
	const entries                  = [...(snapshot.planActivities ?? [])].filter(item => item.turnId === turnId).sort((left, right) => left.sequence - right.sequence).slice(-5) ;
	const merged  : PlanActivity[] = []                                                                                                                                          ;
	for (const item of entries) {
		const previous = merged.at(-1);
		if (previous && previous.summary === item.summary) merged[merged.length - 1] = item;
		else merged.push(item);
	}
	return merged;
}

function progressRows(snapshot: PlanFeatureProjection, width: number, compact = false): string[] {
	const entries = progressEntries(snapshot)                                                                 ;
	const rows    = [...section("PROGRESS", width, entries.length ? `최근 ${entries.length}개` : "", a.info)] ;
	if (rows.at(-1) === "") rows.pop();
	for (const item of entries) rows.push(...compactStatusRows(safe(item.summary, 3000), item.status, width, Number.MAX_SAFE_INTEGER));
	if (!entries.length) {
		const message = snapshot.planActivityStatus === "pending" ? "현재 단계의 작업 내용을 정리하는 중입니다."
			: snapshot.planActivityStatus === "unavailable" ? "작업 내용을 아직 정리하지 못했습니다."
			: snapshot.planActivityStatus === "disabled" ? "작업 내용 요약이 꺼져 있습니다."
			: "정리된 세부 작업이 도착하면 이곳에 표시합니다.";
		rows.push(...prose(a.muted(message), width));
	} else if (snapshot.planActivityStatus === "pending") rows.push(...prose(a.caption("새 작업 내용을 정리하는 중…"), width));
	return rows;
}

export class WwwPlanView implements Component {
	constructor(
		private readonly get: () => PlanFeatureProjection,
		private readonly compact = false,
		private readonly clock = Date.now,
		private readonly motion = true,
		private readonly runtimePresentation: PlanRuntimePresentation | null = null,
	) {}
	invalidate(): void {}
	render(width: number): string[] {
		const s       = this.get()                                                                                                 ;
		const turnId  = s.activeTurnId ?? s.workFlow.source?.turnId                                                                ;
		const request = turnId ? [...(s.requestRuntime ?? [])].reverse().find(r => r.turnId === turnId) : s.requestRuntime?.at(-1) ;
		if (request
			&& this.runtimePresentation
			&& Array.isArray(request.stages)
			&& request.stages.length > 0) {
			const now   = this.clock()                                                                                                                  ;
			const frame = this.motion && this.runtimePresentation.motionActive(request, now) ? Math.floor(now / 120) : 8                                ;
			const rows  = this.runtimePresentation.rows(request, width, this.compact, frame, s.sessionGoal?.text, progressRows(s, width, this.compact)) ;
			return (this.compact && rows[0] === "" ? rows.slice(1) : rows).map(row => fit(row, width));
		}
		const rows = joinedSections([stageRows(width), planRows(s, width, this.compact), progressRows(s, width, this.compact)]);
		return (this.compact && rows[0] === "" ? rows.slice(1) : rows).map(row => fit(row, width));
	}
}
