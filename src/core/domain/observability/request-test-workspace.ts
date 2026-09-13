import type { ProjectActivity } from "../execution/project-activity";
import type { RequestRuntimeRecord, RequestStageStatus, RequestTestKind } from "../execution/request-runtime";

export type RequestTestStatus = "running" | "passed" | "failed" | "blocked" | "skipped" | "planned" | "unknown";
export interface RequestTestCheck {
	readonly id: string;
	readonly kind: RequestTestKind;
	readonly title: string;
	readonly purpose: string;
	readonly status: RequestTestStatus;
	readonly command: string | null;
	readonly evidenceActivityId: string | null;
}
export interface RequestTestGroup {
	readonly requestId: string;
	readonly question: string;
	readonly status: RequestTestStatus;
	readonly rationale: string;
	readonly checks: readonly RequestTestCheck[];
}
export interface RequestTestWorkspace {
	readonly groups: readonly RequestTestGroup[];
	readonly totals: Readonly<Record<RequestTestStatus, number>>;
}

const emptyTotals = (): Record<RequestTestStatus, number> => ({ running: 0, passed: 0, failed: 0, blocked: 0, skipped: 0, planned: 0, unknown: 0 });
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const terminal = (activity: ProjectActivity): RequestTestStatus => {
	const item = record(record(activity.payload.params).item);
	if (activity.phase === "failed" || activity.phase === "cancelled" || typeof item.exitCode === "number" && item.exitCode !== 0) return "failed";
	if (activity.phase === "started" || activity.phase === "updated") return "running";
	return activity.phase === "completed" && item.exitCode === 0 ? "passed" : "unknown";
};
const stageStatus = (status: RequestStageStatus): RequestTestStatus => status === "completed" ? "passed" : status === "pending" ? "planned" : status;
const commandOf = (activity: ProjectActivity | undefined): string | null => {
	const item = record(record(activity?.payload.params).item);
	return typeof item.command === "string" ? item.command : null;
};
const kindOf = (command: string | null): RequestTestKind => {
	if (!command) return "unclassified";
	if (/\b(?:e2e|end-to-end|canary|--live|black.?box)\b/iu.test(command)) return "black-box";
	if (/\b(?:tsc|typecheck|lint|build)\b/iu.test(command) || /\b(?:bun|npm|pnpm|yarn)\s+(?:run\s+)?check\b/iu.test(command)) return "static-analysis";
	if (/\b(?:integration)\b/iu.test(command)) return "integration";
	if (/\b(?:regression)\b/iu.test(command)) return "regression";
	if (/\b(?:test|pytest|vitest|jest)\b/iu.test(command)) return "unit";
	return "unclassified";
};
const testLike = (activity: ProjectActivity): boolean => {
	const command = commandOf(activity);
	return activity.kind === "tool" && !!command && /(?:^|\s)(?:test|check|lint|build|typecheck|tsc)(?:\s|$)|\b(?:pytest|vitest|jest|bun\s+test|cargo\s+test|go\s+test)\b/iu.test(command);
};

/** One question-oriented projection over canonical Runtime and Activity records. */
export function projectRequestTestWorkspace(input: {
	readonly requests?: readonly RequestRuntimeRecord[];
	readonly activities: readonly ProjectActivity[];
}): RequestTestWorkspace {
	const activities = [...input.activities].sort((left, right) => left.sequence - right.sequence);
	const byId = new Map(activities.map(activity => [activity.id, activity]));
	const groups: RequestTestGroup[] = [];
	for (const request of input.requests ?? []) {
		const verify = request.stages.find(stage => stage.id === "VERIFY")!;
		const evidenceChecks = verify.evidence.map(evidence => {
			const activity = byId.get(evidence.activityId);
			return { id: evidence.activityId, kind: kindOf(commandOf(activity)), title: commandOf(activity) ?? "검증 Evidence", purpose: verify.output ?? "검증 목적이 Runtime에 기록되지 않음", status: activity ? terminal(activity) : evidence.status === "passed" ? "passed" as const : evidence.status === "failed" ? "failed" as const : "unknown" as const, command: commandOf(activity), evidenceActivityId: evidence.activityId };
		});
		const evidenceIds = new Set(evidenceChecks.map(check => check.evidenceActivityId));
		const taskChecks = verify.tasks.map(task => ({ id: task.id, kind: task.verification?.kind ?? "unclassified" as const, title: task.title, purpose: task.verification?.purpose ?? verify.output ?? "검증 목표가 계획에 기록되지 않았습니다.", status: task.status === "completed" ? "unknown" as const : task.status === "blocked" ? "blocked" as const : task.status === "running" ? "running" as const : "planned" as const, command: null, evidenceActivityId: null }));
		const turnChecks = activities.filter(activity => activity.nativeRefs.turnId === request.turnId && testLike(activity) && !evidenceIds.has(activity.id)).map(activity => ({ id: activity.id, kind: kindOf(commandOf(activity)), title: commandOf(activity)!, purpose: verify.output ?? "검증 목적이 Runtime에 기록되지 않음", status: terminal(activity), command: commandOf(activity), evidenceActivityId: activity.id }));
		groups.push({ requestId: request.requestId, question: request.objective, status: stageStatus(verify.status), rationale: verify.output ?? (verify.status === "pending" ? "검증 계획이 아직 확정되지 않았습니다." : verify.skipReason ?? "검증 목적이 Runtime에 기록되지 않았습니다."), checks: [...taskChecks, ...evidenceChecks, ...turnChecks] });
	}
	if (!groups.length) {
		const requests = activities.filter(activity => activity.kind === "message" && activity.phase === "completed" && (activity.payload.role === "user" || activity.payload.direction === "outbound"));
		for (const [index, request] of requests.entries()) {
			const end = requests[index + 1]?.sequence ?? Number.POSITIVE_INFINITY;
			const checks = activities.filter(activity => activity.sequence > request.sequence && activity.sequence < end && testLike(activity)).map(activity => ({ id: activity.id, kind: kindOf(commandOf(activity)), title: commandOf(activity)!, purpose: "검증 목적이 Runtime에 기록되지 않았습니다.", status: terminal(activity), command: commandOf(activity), evidenceActivityId: activity.id }));
			groups.push({ requestId: request.id, question: String(request.payload.text ?? "질문 원문 미관측"), status: checks.some(check => check.status === "failed") ? "failed" : checks.some(check => check.status === "running") ? "running" : checks.length && checks.every(check => check.status === "passed") ? "passed" : "unknown", rationale: checks.length ? "과거 실행에서 테스트 명령은 관측됐지만 VERIFY 이유는 기록되지 않았습니다." : "이 질문에 연결된 테스트를 관측하지 못했습니다.", checks });
		}
	}
	const totals = emptyTotals();
	for (const group of groups) totals[group.status] += 1;
	return { groups: groups.reverse(), totals };
}
