import type { Component }                               from "@earendil-works/pi-tui";
import type { RequestRuntimeRecord }                    from "@/core/domain/execution/request-runtime";
import type { PlanFeatureProjection }                   from "@/core/application/orchestration/workbench-feature-reads";
import type { OutputLanguage }                           from "@/core/domain/execution/output-language";
import { a, fit, joinedSections, prose, safe, section } from "@/adapters/inbound/tui/foundation/theme/www-theme";
import { compactStatusRows }                            from "@/adapters/inbound/tui/foundation/components/status-card";

/** The journal record shape arrives through the feature read projection, not the domain module. */
type PlanActivity = NonNullable<PlanFeatureProjection["planActivities"]>[number];

export interface PlanRuntimePresentation {
	readonly motionActive: (request: Pick<RequestRuntimeRecord, "status" | "completedAt">, now: number) => boolean;
	readonly rows: (request: RequestRuntimeRecord, width: number, compact: boolean, motionFrame: number, goal?: string | null, activityRows?: readonly string[], nativePlanRows?: readonly string[]) => string[];
}

function planRows(snapshot: PlanFeatureProjection, width: number, compact: boolean, language: OutputLanguage): string[] {
	const steps = snapshot.workFlow.steps;
	const rows = [...section("PLAN", width, steps.length ? `${steps.filter(x => x.status === "completed").length}/${steps.length}` : language === "en" ? "unobserved" : "미관측", a.plan)];
	if (!steps.length) {
		const message = snapshot.workFlow.rejections.length
			? language === "en" ? "The supplied plan could not be confirmed." : "전달받은 계획을 확인하지 못했습니다."
			: language === "en" ? "No plan has been supplied for this request." : "현재 요청에서 전달받은 계획이 없습니다.";
		return [...rows, ...prose(a.muted(message), width)];
	}
	if (rows.at(-1) === "") rows.pop();
	for (const step of steps) rows.push(...compactStatusRows(step.title, step.status, width, Number.MAX_SAFE_INTEGER));
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

function progressRows(snapshot: PlanFeatureProjection, width: number, compact = false, hasPlan = false, language: OutputLanguage = "ko"): string[] {
	const entries = hasPlan ? progressEntries(snapshot) : []                                                ;
	const rows    = [...section("PROGRESS", width, entries.length ? language === "en" ? `${entries.length} recent` : `최근 ${entries.length}개` : "", a.info)] ;
	if (rows.at(-1) === "") rows.pop();
	let previousStepId: string | null = null;
	for (const item of entries) {
		if (item.stepId !== previousStepId) rows.push(...prose(a.plan(safe(item.stepTitle, 300)), width));
		rows.push(...compactStatusRows(safe(item.summary, 3000), item.status, width, Number.MAX_SAFE_INTEGER));
		previousStepId = item.stepId;
	}
	if (!entries.length) {
		const message = !hasPlan ? language === "en" ? "Progress appears when the plan arrives." : "계획이 도착하면 작업 경과를 표시합니다."
			: snapshot.planActivityStatus === "unavailable" ? language === "en" ? "Work details are not available yet." : "작업 내용을 아직 정리하지 못했습니다."
			: snapshot.planActivityStatus === "disabled" ? language === "en" ? "Work summaries are disabled." : "작업 내용 요약이 꺼져 있습니다."
			: language === "en" ? "Detailed progress will appear here." : "정리된 세부 작업이 도착하면 이곳에 표시합니다.";
		rows.push(...prose(a.muted(message), width));
	}
	return rows;
}

export class WwwPlanView implements Component {
	constructor(
		private readonly get: () => PlanFeatureProjection,
		private readonly compact = false,
		private readonly clock = Date.now,
		private readonly motion = true,
		private readonly runtimePresentation: PlanRuntimePresentation | null = null,
		private readonly language: () => OutputLanguage = () => "ko",
	) {}
	invalidate(): void {}
	render(width: number): string[] {
		const s       = this.get()                                                                                                 ;
		const turnId  = s.activeTurnId ?? s.workFlow.source?.turnId                                                                ;
		const request = turnId ? [...(s.requestRuntime ?? [])].reverse().find(r => r.turnId === turnId) : s.requestRuntime?.at(-1) ;
		if (request?.protocolVersion === 2
			&& this.runtimePresentation
			&& Array.isArray(request.stages)
			&& request.stages.length > 0) {
			const now   = this.clock()                                                                                                                  ;
			const frame = this.motion && this.runtimePresentation.motionActive(request, now) ? Math.floor(now / 120) : 8                                ;
			const hasPlan = request.stages.some(stage => stage.tasks.length > 0) || s.workFlow.source?.turnId === turnId && s.workFlow.steps.length > 0 ;
			const nativePlanRows = s.workFlow.steps.length > 0 ? planRows(s, width, this.compact, this.language()) : undefined;
			const rows  = this.runtimePresentation.rows(request, width, this.compact, frame, s.sessionGoal?.text, progressRows(s, width, this.compact, hasPlan, this.language()), nativePlanRows) ;
			return (this.compact && rows[0] === "" ? rows.slice(1) : rows).map(row => fit(row, width));
		}
		const rows = joinedSections([planRows(s, width, this.compact, this.language()), progressRows(s, width, this.compact, s.workFlow.steps.length > 0, this.language())]);
		return (this.compact && rows[0] === "" ? rows.slice(1) : rows).map(row => fit(row, width));
	}
}
