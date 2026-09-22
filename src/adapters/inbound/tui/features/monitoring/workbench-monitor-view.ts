/**
 * Temporary compatibility home for Monitoring while the execution UI is split
 * into feature-owned modules. The Monitoring feature integrator moves this file.
 */
import { wrapTextWithAnsi, type Component } from "@earendil-works/pi-tui";
import type { ProjectActivity } from "../../../../../core/domain/execution/project-activity";
import { sanitizeTerminalTextExcerpt } from "../../../../../core/domain/execution/terminal";
import { projectNativeDelegation, type SemanticWorkStep, type WorkStepStatus } from "../../../../../core/domain/work";
import type { WorkbenchSnapshot } from "../../../../../core/domain/work/workbench";
import { colors } from "../../foundation/theme/theme";

const PUBLIC_SOURCE_OMISSION = "… 공개 Source 일부 생략 …";

function hiddenKey(key: string): boolean {
	const normalized = key.replace(/[-_]/gu, "").toLowerCase();
	return normalized.includes("reasoning") || normalized.includes("thought") || normalized.includes("analysis")
		|| normalized.startsWith("raw") || normalized.endsWith("token") || normalized.endsWith("secret")
		|| normalized.endsWith("password") || normalized.endsWith("credential")
		|| normalized.endsWith("authorization") || normalized.endsWith("apikey");
}

function boundedPublicProjection(value: unknown): { readonly value: unknown; readonly omitted: boolean } {
	let omitted = false;
	let items = 0;
	const project = (candidate: unknown, depth: number): unknown => {
		if (typeof candidate === "string") {
			if (candidate.length <= 2_400) return sanitizeTerminalTextExcerpt(candidate, 2_400, "head-tail");
			omitted = true;
			return sanitizeTerminalTextExcerpt(candidate, 2_400, "head-tail");
		}
		if (candidate === null || typeof candidate !== "object") return candidate;
		if (depth >= 5 || items >= 100) { omitted = true; return "[공개 Source 일부 생략]"; }
		if (Array.isArray(candidate)) {
			if (candidate.length > 40) omitted = true;
			return candidate.slice(0, 40).map(item => { items += 1; return project(item, depth + 1); });
		}
		const result: Record<string, unknown> = {};
		for (const [key, item] of Object.entries(candidate as Readonly<Record<string, unknown>>)) {
			if (hiddenKey(key)) { omitted = true; continue; }
			if (items >= 100 || Object.keys(result).length >= 40) { omitted = true; break; }
			items += 1;
			result[key] = project(item, depth + 1);
		}
		return result;
	};
	return { value: project(value, 0), omitted };
}

function traceStatusLabel(status: WorkStepStatus): string {
	if (status === "completed") return "완료";
	if (status === "running") return "진행";
	if (status === "failed") return "실패";
	if (status === "cancelled") return "중단";
	return "대기";
}

function traceActivityIds(step: SemanticWorkStep): readonly string[] {
	if (!step.association) return [];
	return [...new Set(step.association.sources.flatMap(source => [
		...source.activityIds,
		...source.observationActivityIds,
	]))];
}

function monitorTraceRows(snapshot: WorkbenchSnapshot, width: number): string[] {
	if (!snapshot.workFlow.source) return [
		colors.secondary("Tracer · Native Plan과 관측 실행"),
		colors.muted("현재 요청에서 공개 Plan Source가 관측되지 않았습니다."),
	];
	const activities = new Map(snapshot.activities.map(activity => [activity.id, activity]));
	const rows: string[] = [
		colors.secondary("Tracer · Native Plan과 관측 실행"),
		colors.muted("Plan과 Activity의 연결은 관측 순서로 추론되며, 확정된 Native 관계가 아닙니다."),
	];
	for (const step of snapshot.workFlow.steps) {
		const activityIds = traceActivityIds(step);
		rows.push(`${colors.text(`${step.number}. ${step.title}`)} · ${traceStatusLabel(step.status)}`);
		if (activityIds.length === 0) {
			rows.push(colors.muted("   Trace · 연결된 공개 실행 없음"));
			continue;
		}
		rows.push(colors.muted(`   Trace · inferred · ${activityIds.length}개`));
		for (const activityId of activityIds) {
			const activity = activities.get(activityId);
			rows.push(activity
				? `   ${traceTreeBranch(activity.kind)} ${traceNodeLabel(activity)} · ${activity.phase} · ${activityId} · /trace ${activityId}`
				: colors.warning(`   ↳ 원본 부재 · ${activityId}`));
		}
	}
	return rows.flatMap(row => wrapTextWithAnsi(row, width));
}

function traceTreeBranch(kind: ProjectActivity["kind"]): string {
	if (kind === "approval") return "├─ 승인";
	if (kind === "tool") return "├─ 도구";
	if (kind === "file-change") return "├─ 결과";
	if (kind === "message") return "├─ Agent";
	return "├─ 실행";
}

function traceNodeLabel(activity: ProjectActivity): string {
	const params = activity.payload.params;
	const item = params && typeof params === "object" && !Array.isArray(params)
		? (params as Readonly<Record<string, unknown>>).item
		: null;
	const type = item && typeof item === "object" && !Array.isArray(item)
		? (item as Readonly<Record<string, unknown>>).type
		: null;
	return typeof type === "string" && type.trim() ? type : activity.kind;
}

function selectedSourceRows(snapshot: WorkbenchSnapshot, width: number): string[] {
	if (!snapshot.selectedActivityId) return [
		colors.secondary("Trace·Source · 선택한 실행 없음"),
		colors.muted("Plan·Trace 목록의 /trace <activity-id>로 공개 Source를 엽니다."),
	];
	const selected = snapshot.activities.find(activity => activity.id === snapshot.selectedActivityId);
	if (!selected) return [
		colors.warning("Trace·Source · 선택한 Activity의 원본 부재"),
		colors.muted(`activityId ${snapshot.selectedActivityId} · 다른 실행으로 대신하지 않았습니다.`),
	];
	const projection = boundedPublicProjection(selected.payload);
	const serialized = JSON.stringify(projection.value, null, 2);
	const publicRows = serialized
		? serialized.split(/\r?\n/u).flatMap(line => wrapTextWithAnsi(line, width))
		: [colors.muted("보존된 공개 내용 없음")];
	return [
		colors.secondary(`Trace·Source · ${selected.id} · ${selected.kind} · ${selected.phase}`),
		colors.text("공개 내용 · 보존된 관측 projection"),
		...publicRows,
		...(projection.omitted ? [colors.warning(PUBLIC_SOURCE_OMISSION)] : []),
		colors.muted(`관측 ID · activity ${selected.id}`),
		colors.muted("이 화면은 provider 원본 전체가 아니라 보존된 공개 관측만 보여줍니다."),
	].flatMap(row => wrapTextWithAnsi(row, width));
}

/** Read-only execution projection; it deliberately does not own a session or transcript. */
export class WorkbenchMonitorView implements Component {
	constructor(private readonly getSnapshot: () => WorkbenchSnapshot) {}
	invalidate(): void {}
	render(width: number): string[] {
		const snapshot = this.getSnapshot();
		const contentWidth = Math.max(1, width);
		const currentStep = snapshot.workFlow.currentStepNumber === null
			? null
			: snapshot.workFlow.steps.find(step => step.number === snapshot.workFlow.currentStepNumber);
		const run = snapshot.executionRun;
		const live = run?.activeActivity
			? `${run.activeActivity.kind} · ${sanitizeTerminalTextExcerpt(run.activeActivity.text || run.activeActivity.method, 180, "head-tail")}`
			: snapshot.liveActivity
				? `${snapshot.liveActivity.kind} · ${sanitizeTerminalTextExcerpt(snapshot.liveActivity.text || snapshot.liveActivity.method, 180, "head-tail")}`
				: "대기 중인 실행 없음";
		const rows = [
			colors.accent("Monitor · 실행 관측"),
			colors.muted("읽기 전용 · Chat과 Todo는 같은 Workbench 상태를 사용합니다."), "",
			`${colors.secondary("Activity")} · ${snapshot.activityCount ?? snapshot.activities.length}개 · journal ${snapshot.journalSequence}`,
			`${colors.secondary("Turn")} · ${currentStep ? `${currentStep.number}/${snapshot.workFlow.steps.length} · ${currentStep.title}` : "진행 단계 없음"}`,
			`${colors.secondary("Live")} · ${live}`,
			...(run ? [`${colors.secondary("Run")} · ${run.runId} · ${run.phase}${run.receipt ? ` · receipt ${run.receipt.receiptDigest}` : ` · checkpoint ${run.checkpoint.digest}`}`] : []),
			`${colors.secondary("Queue")} · ${snapshot.chatQueue.length}개${snapshot.pendingApproval ? " · 승인 대기" : ""}`,
			`${colors.secondary("MCP")} · ${snapshot.mcpServers.length === 0 ? "서버 없음" : snapshot.mcpServers.map(server => `${server.name} ${server.enabled ? "활성" : "비활성"} · ${server.status} · 도구 ${server.tools.length}개`).join(" | ")}`,
			`${colors.secondary("Delegation")} · ${projectNativeDelegation(snapshot.activities, snapshot.threadId).length}개 실행 그룹`,
			"", ...monitorTraceRows(snapshot, contentWidth), "", ...selectedSourceRows(snapshot, contentWidth),
			...(snapshot.resumeCoverage?.mode === "partial-local-journal"
				? [colors.warning("관측 범위 · 재개 뒤 이 프로세스가 수집한 Activity만 표시합니다.")]
				: []),
		];
		return rows.flatMap(row => wrapTextWithAnsi(row, contentWidth));
	}
}
