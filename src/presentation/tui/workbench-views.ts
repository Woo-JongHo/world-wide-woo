import {
	Markdown,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
	type Component,
} from "@earendil-works/pi-tui";
import type { NativeApprovalRequest } from "../../domain/native-session";
import type { CompletionReport } from "../../domain/output";
import { projectBackgroundWorkState, type BackgroundWorkState } from "../../domain/native-session";
import { sanitizeCompletedAssistantResponse } from "../../domain/redaction";
import { sanitizeTerminalTextExcerpt, sanitizeTerminalTextUnbounded } from "../../domain/terminal";
import { projectTNoteCompletionIndex } from "../../domain/t-notes";
import { workbenchApprovalDecisions, type WorkbenchSnapshot } from "../../domain/workbench";
import { classifyWorkActivity, type SemanticWorkStep, type WorkStepStatus } from "../../domain/work-steps";
import { boundedPublicProjection } from "./bounded-public-projection";
import { colors, markdownTheme, semantic } from "./theme";
import { WorkbenchWelcomeView } from "./workbench-welcome";
import { isVisibleWorkStep, ObservationCard, WorkStepCard } from "./work-step-card";
import { projectWorkbenchDelegationSections } from "./delegation-tree-view";
import { CompletionSummaryCard } from "./result-cards";

const WORKBENCH_MARKDOWN_MAX_CHARS = 16 * 1024;
const WORKBENCH_MARKDOWN_MAX_LINES = 120;
const WORKBENCH_MARKDOWN_OMISSION = "… 응답 일부 생략 …";
const WORKBENCH_STEP_CACHE_LIMIT = 512;
const WORKBENCH_APPROVAL_DETAIL_MAX_CHARS = 200;
const TNOTE_VISIBLE_LIMIT = 20;
const TNOTE_SUMMARY_MAX_CHARS = 2 * 1024;
const TNOTE_SUMMARY_MAX_LINES = 24;
const TNOTE_OMISSION = "… 이전 T-note %d개 생략 · 최근 %d개 표시 …";
const TNOTE_SUMMARY_OMISSION = "… T-note 요약 일부 생략 …";

function fit(text: string, width: number): string {
	if (width <= 0) return "";
	const clipped = truncateToWidth(text, width);
	return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

function surfaceRows(rows: readonly string[], width: number, surface: (text: string) => string): string[] {
	return rows.map(row => surface(fit(row, width)));
}

function transcriptRows(rows: readonly string[], width: number): string[] {
	return rows.map((row) => truncateToWidth(row, Math.max(1, width)));
}

function boundedWorkbenchMarkdown(text: string): string {
	let candidate = text;
	if (candidate.length > WORKBENCH_MARKDOWN_MAX_CHARS) {
		const contentBudget = WORKBENCH_MARKDOWN_MAX_CHARS - WORKBENCH_MARKDOWN_OMISSION.length - 2;
		const headBudget = Math.floor(contentBudget / 2);
		candidate = `${candidate.slice(0, headBudget)}\n${WORKBENCH_MARKDOWN_OMISSION}\n${candidate.slice(-(contentBudget - headBudget))}`;
	}
	const lines = candidate.split(/\r?\n/u);
	if (lines.length <= WORKBENCH_MARKDOWN_MAX_LINES) return candidate;
	const headLineCount = Math.floor((WORKBENCH_MARKDOWN_MAX_LINES - 1) / 2);
	const tailLineCount = WORKBENCH_MARKDOWN_MAX_LINES - headLineCount - 1;
	let head = lines.slice(0, headLineCount).join("\n");
	let tail = lines.slice(-tailLineCount).join("\n");
	const contentBudget = WORKBENCH_MARKDOWN_MAX_CHARS - WORKBENCH_MARKDOWN_OMISSION.length - 2;
	if (head.length + tail.length > contentBudget) {
		const headBudget = Math.floor(contentBudget / 2);
		head = head.slice(0, headBudget);
		tail = tail.slice(-(contentBudget - headBudget));
	}
	return `${head}\n${WORKBENCH_MARKDOWN_OMISSION}\n${tail}`;
}

export function approvalKindLabel(kind: NativeApprovalRequest["kind"]): string {
	if (kind === "command") return "명령";
	if (kind === "file-change") return "파일 변경";
	return "권한";
}

export function approvalParamText(request: NativeApprovalRequest, key: string): string | null {
	const value = request.params[key];
	if (typeof value !== "string" || !value.trim()) return null;
	return sanitizeTerminalTextExcerpt(value, WORKBENCH_APPROVAL_DETAIL_MAX_CHARS, "head-tail")
		.replace(/\t/gu, "    ")
		.trim();
}

export function approvalFallback(request: NativeApprovalRequest): string {
	if (request.kind === "command") return "명령 실행에 승인이 필요합니다.";
	if (request.kind === "file-change") return "파일 변경에 승인이 필요합니다.";
	return "추가 권한이 필요합니다.";
}

export function approvalDetailLabel(request: NativeApprovalRequest): string {
	if (request.kind === "command") return "명령";
	if (request.kind === "file-change") return "변경";
	return "권한";
}

function approvalInstruction(request: NativeApprovalRequest): string {
	const decisions = workbenchApprovalDecisions(request);
	const instructions: string[] = [];
	if (decisions.includes("accept")) instructions.push("승인 /approve");
	if (decisions.includes("acceptForSession")) instructions.push("세션 /approve-session");
	if (decisions.includes("decline")) instructions.push("거절 /decline");
	if (instructions.length === 0) instructions.push("중단 /cancel");
	return instructions.join(" · ");
}

function approvalCardRows(
	request: NativeApprovalRequest,
	queueDepth: number,
	background: BackgroundWorkState,
	width: number,
): string[] {
	const command = approvalParamText(request, "command");
	const reason = approvalParamText(request, "reason");
	const cwd = approvalParamText(request, "cwd");
	const logicalRows = [
		colors.warning(`승인 필요 · ${approvalKindLabel(request.kind)}`),
		`${colors.accent(approvalDetailLabel(request))} · ${command ?? approvalFallback(request)}`,
		`${colors.accent("이유")} · ${reason ?? approvalFallback(request)}`,
		...(cwd ? [`${colors.accent("경로")} · ${cwd}`] : []),
		colors.muted(approvalInstruction(request)),
		colors.warning("현재 턴 일시중지 · 승인 결정을 기다립니다."),
		colors.muted(`백그라운드 작업 · ${background}`),
		...(queueDepth > 0 ? [colors.muted(`대기 메시지 ${queueDepth}개 · 승인 후 순서대로 전송`)] : []),
	];
	return logicalRows.flatMap(row => wrapTextWithAnsi(row, Math.max(1, width)));
}

function projectApprovalBackgroundState(activities: WorkbenchSnapshot["activities"]): BackgroundWorkState {
	return projectBackgroundWorkState(activities.flatMap((activity) => {
		const params = activity.payload.params;
		if (!params || typeof params !== "object" || Array.isArray(params)) return [];
		const item = (params as Readonly<Record<string, unknown>>).item;
		return item && typeof item === "object" && !Array.isArray(item) ? [item] : [];
	}));
}

function publicRecord(value: unknown): Readonly<Record<string, unknown>> | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? value as Readonly<Record<string, unknown>>
		: null;
}

function publicText(value: unknown, limit = 160): string | null {
	if (typeof value !== "string" || !value.trim()) return null;
	return sanitizeTerminalTextExcerpt(value, limit, "head-tail").trim();
}

/** Compact public lifecycle rows mirroring Codex App's chronological transcript. */
function publicTimelineActivityRows(
	activity: WorkbenchSnapshot["activities"][number],
	width: number,
): string[] | null {
	const method = publicText(activity.payload.method)?.toLowerCase() ?? "";
	const params = publicRecord(activity.payload.params);
	const item = publicRecord(params?.item);
	const itemType = publicText(item?.type)?.toLowerCase() ?? "";
	if (method === "turn/plan/updated") {
		const plan = Array.isArray(params?.plan) ? params.plan : [];
		const entries = plan.flatMap((value) => {
			const entry = publicRecord(value);
			const step = publicText(entry?.step, 240);
			if (!step) return [];
			const status = publicText(entry?.status)?.toLowerCase();
			const symbol = status === "completed" ? colors.success("✓")
				: status === "inprogress" || status === "in_progress" ? colors.accent("▸") : colors.muted("·");
			return [`${symbol} ${step}`];
		});
		if (entries.length === 0) return null;
		return [colors.secondary("Plan updated"), ...entries]
			.flatMap((line) => wrapTextWithAnsi(line, Math.max(1, width)));
	}
	if (itemType === "contextcompaction") return [colors.muted("컨텍스트가 자동으로 압축됨")];
	if (itemType === "collabtoolcall" || itemType === "collabagenttoolcall") {
		const prompt = publicText(item?.prompt, 120)?.split(/\r?\n/u)[0];
		const tool = publicText(item?.tool, 80);
		const label = prompt || tool || "서브에이전트";
		const nativeStatus = publicText(item?.status)?.toLowerCase() ?? "";
		const failed = activity.phase === "failed" || nativeStatus === "failed" || nativeStatus === "errored";
		const interrupted = activity.phase === "cancelled" || nativeStatus === "interrupted";
		const running = activity.phase === "started" || activity.phase === "updated"
			|| nativeStatus === "inprogress" || nativeStatus === "running";
		const state = failed ? "작업 실패" : interrupted ? "작업 중단됨" : running ? "작업 시작됨" : "작업 완료됨";
		const color = failed ? colors.error : interrupted ? colors.warning : running ? colors.accent : colors.success;
		return wrapTextWithAnsi(color(`${label} ${state}`), Math.max(1, width));
	}
	if (itemType === "websearch") {
		const query = publicText(item?.query, 180);
		return [colors.muted(query ? `웹에서 검색함 · ${query}` : "웹에서 검색함")];
	}
	if (itemType === "enteredreviewmode") return [colors.accent("독립 검토를 시작함")];
	if (itemType === "exitedreviewmode") return [colors.success("독립 검토를 마침")];
	if (activity.payload.classification === "reasoning") {
		const summary = publicText(activity.payload.publicSummary, 1_200);
		return summary ? summary.split(/\r?\n/u)
			.flatMap((line) => wrapTextWithAnsi(`판단 · ${line}`, Math.max(1, width)).map(semantic.reasoning)) : null;
	}
	// MCP startup/retry telemetry belongs in Source, not the user conversation.
	if (method === "mcpserver/startupstatus/updated") return null;
	return null;
}

const WORK_STEP_STATUS_LABEL: Record<WorkStepStatus, string> = {
	pending: "대기",
	running: "진행 중",
	completed: "완료",
	failed: "실패",
	cancelled: "중단",
};

function nativePlanStatus(value: unknown): WorkStepStatus {
	const status = publicText(value)?.replace(/[_-]/gu, "").toLowerCase();
	if (status === "completed" || status === "passed") return "completed";
	if (status === "inprogress" || status === "running") return "running";
	if (status === "failed" || status === "errored") return "failed";
	if (status === "cancelled" || status === "canceled" || status === "interrupted") return "cancelled";
	return "pending";
}

type CompletionEvidenceCategory = "inspect" | "change" | "verify";

interface CompletionEvidence {
	readonly category: CompletionEvidenceCategory;
	readonly label: string;
	readonly status: WorkStepStatus;
}

const COMPLETION_EVIDENCE_SECTIONS: readonly {
	readonly category: CompletionEvidenceCategory;
	readonly title: string;
}[] = [
	{ category: "inspect", title: "대상과 기준 확인" },
	{ category: "change", title: "변경과 실행" },
	{ category: "verify", title: "결과 검증" },
];

function completionActivityStatus(
	activity: WorkbenchSnapshot["activities"][number],
	item: Readonly<Record<string, unknown>> | null,
): WorkStepStatus {
	if (activity.phase === "failed") return "failed";
	if (activity.phase === "cancelled") return "cancelled";
	const itemStatus = nativePlanStatus(item?.status);
	if (itemStatus !== "pending") return itemStatus;
	if (activity.phase === "completed") return "completed";
	if (activity.phase === "started" || activity.phase === "updated") return "running";
	return "pending";
}

function isVerificationCommand(command: string): boolean {
	return /\b(?:bun|npm|pnpm|yarn)\s+(?:(?:run|exec)\s+)?(?:test|check|lint|build|typecheck|type-check)\b/iu.test(command)
		|| /\b(?:tsc|pytest|vitest|jest|ruff|mypy|eslint)\b/iu.test(command)
		|| /\b(?:cargo|go)\s+test\b/iu.test(command)
		|| /\bgit\s+diff\s+--check\b/iu.test(command);
}

function safeCompletionCommand(command: string): string {
	return command
		.replace(/(?:file:\/\/\/|~\/|(?<![A-Za-z0-9_.-])\/)[^\s'"`]+/gu, "[로컬 경로 숨김]")
		.replace(/\b[A-Za-z]:\\[^\s'"`]+/gu, "[로컬 경로 숨김]");
}

function completionFileChangeLabel(item: Readonly<Record<string, unknown>> | null): string {
	const changes = Array.isArray(item?.changes) ? item.changes : [];
	const paths = changes.flatMap((value) => {
		const path = publicText(publicRecord(value)?.path, 120);
		if (!path) return [];
		return /^(?:file:\/\/\/|~\/|\.\.\/|\/|[A-Za-z]:\\)/u.test(path)
			? ["[로컬 경로 숨김]"]
			: [path];
	});
	const unique = [...new Set(paths)];
	if (unique.length === 0) return "파일 변경";
	const visible = unique.slice(0, 3).join(", ");
	return unique.length > 3 ? `파일 변경 · ${visible} 외 ${unique.length - 3}개` : `파일 변경 · ${visible}`;
}

function completionEvidence(
	activity: WorkbenchSnapshot["activities"][number],
): CompletionEvidence | null {
	if (!isVisibleWorkStep(activity.kind)) return null;
	const projectedPayload = publicRecord(boundedPublicProjection(activity.payload).value);
	const params = publicRecord(projectedPayload?.params);
	const item = publicRecord(params?.item) ?? params ?? projectedPayload;
	const command = publicText(item?.command ?? item?.cmd, 360);
	const status = completionActivityStatus(activity, item);
	if (command) {
		return {
			category: isVerificationCommand(command)
				? "verify"
				: classifyWorkActivity({ ...activity, payload: projectedPayload ?? {} }) === "observation"
					? "inspect"
					: "change",
			label: `$ ${safeCompletionCommand(command)}`,
			status,
		};
	}
	if (activity.kind === "file-change") {
		return { category: "change", label: completionFileChangeLabel(item), status };
	}
	const tool = publicText(item?.tool ?? item?.toolName ?? item?.name ?? item?.type, 120);
	const activityClass = classifyWorkActivity({ ...activity, payload: projectedPayload ?? {} });
	return {
		category: activityClass === "observation" ? "inspect" : "change",
		label: tool ? `도구 실행 · ${tool}` : "도구 실행",
		status,
	};
}

function evidenceCompletionReport(evidence: ReadonlyMap<string, CompletionEvidence>): CompletionReport {
	const values = [...evidence.values()];
	const sections = COMPLETION_EVIDENCE_SECTIONS.flatMap(({ category, title }) => {
		const matches = values.filter((entry) => entry.category === category);
		if (matches.length === 0) return [];
		const visible = matches.slice(0, 6).map((entry) => `${entry.label} · ${WORK_STEP_STATUS_LABEL[entry.status]}`);
		if (matches.length > visible.length) visible.push(`그 외 ${matches.length - visible.length}개 활동`);
		return [{ title, bullets: visible }];
	});
	return {
		title: "이번 요청에서 한 일",
		sections: sections.length > 0 ? sections : [{ title: "응답 제공", bullets: ["상태 · 완료"] }],
		verification: [`Native Turn · 완료 확인 · 실행 기록 ${values.length}개`],
	};
}

/** Replays completed Native turns into stable recaps that survive later turns and resume. */
function projectCompletionSummaries(snapshot: WorkbenchSnapshot): ReadonlyMap<string, CompletionReport> {
	const reports = new Map<string, CompletionReport>();
	const rootThreadId = snapshot.threadId;
	if (!rootThreadId) return reports;
	const messageByActivity = new Map(snapshot.chat.map((message) => [message.activityId, message]));
	const latestPlanByTurn = new Map<string, readonly { title: string; status: WorkStepStatus }[]>();
	const latestAssistantByTurn = new Map<string, string>();
	const latestEvidenceByTurn = new Map<string, Map<string, CompletionEvidence>>();
	for (const activity of snapshot.activities) {
		const turnId = activity.nativeRefs.turnId;
		if (activity.nativeRefs.threadId !== rootThreadId || !turnId) continue;
		const message = messageByActivity.get(activity.id);
		if (message?.role === "assistant" && message.status === "completed") {
			latestAssistantByTurn.set(turnId, message.activityId);
		}
		const evidence = completionEvidence(activity);
		if (evidence) {
			const byItem = latestEvidenceByTurn.get(turnId) ?? new Map<string, CompletionEvidence>();
			byItem.set(activity.nativeRefs.itemId ?? activity.id, evidence);
			latestEvidenceByTurn.set(turnId, byItem);
		}
		const method = publicText(activity.payload.method)?.toLowerCase();
		if (method === "turn/plan/updated") {
			const candidate = publicRecord(activity.payload.params)?.plan;
			const steps = Array.isArray(candidate) ? candidate.flatMap((value) => {
				const entry = publicRecord(value);
				const title = publicText(entry?.step, 240);
				return title ? [{ title, status: nativePlanStatus(entry?.status) }] : [];
			}) : [];
			latestPlanByTurn.set(turnId, steps);
			continue;
		}
		if (method !== "turn/completed" || activity.phase !== "completed") continue;
		const steps = latestPlanByTurn.get(turnId) ?? [];
		const anchorActivityId = latestAssistantByTurn.get(turnId);
		if (!anchorActivityId || reports.has(anchorActivityId)) continue;
		if (steps.length === 0) {
			reports.set(anchorActivityId, evidenceCompletionReport(latestEvidenceByTurn.get(turnId) ?? new Map()));
			continue;
		}
		const completedCount = steps.filter((step) => step.status === "completed").length;
		reports.set(anchorActivityId, {
			title: "이번 요청에서 한 일",
			sections: steps.map((step) => ({
				title: step.title,
				bullets: [`상태 · ${WORK_STEP_STATUS_LABEL[step.status]}`],
			})),
			verification: [`Native Plan · ${completedCount}/${steps.length} 단계 완료`],
		});
	}
	return reports;
}

/** Chat projection for the native ProjectWorkbench, including existing tool cards. */
export class WorkbenchChatView implements Component {
	private snapshot: WorkbenchSnapshot;
	private readonly welcome = new WorkbenchWelcomeView();
	private activityIndicator: { message: string; hint?: string; frames: readonly string[]; intervalMs: number } | null = null;
	private activityFrame = 0;
	private activityTimer: ReturnType<typeof setInterval> | null = null;
	private activityIntervalMs: number | null = null;
	private readonly markdown = new Map<string, Markdown>();
	private readonly markdownInput = new Map<string, string>();
	private readonly markdownSource = new Map<string, string>();
	private readonly draftMarkdown = new Markdown("", 0, 0, markdownTheme);
	private draftInput = "";
	private draftSource = "";
	private readonly stepRows = new Map<string, string[]>();

	constructor(snapshot: WorkbenchSnapshot) {
		this.snapshot = snapshot;
		this.update(snapshot);
	}

	update(snapshot: WorkbenchSnapshot): void {
		this.snapshot = snapshot;
		if (hasVisibleChatContent(snapshot)) this.welcome.dispose();
		const visibleAssistantIds = new Set<string>();
		for (const message of snapshot.chat) {
			if (message.role !== "assistant") continue;
			visibleAssistantIds.add(message.id);
			const inputKey = `${message.status}\0${message.content}`;
			if (this.markdownInput.get(message.id) === inputKey) continue;
			const content = sanitizeTerminalTextUnbounded(
				message.status === "completed" ? sanitizeCompletedAssistantResponse(message.content) : message.content,
			);
			const existing = this.markdown.get(message.id);
			if (this.markdownSource.get(message.id) !== content) {
				if (existing) existing.setText(content);
				else this.markdown.set(message.id, new Markdown(content, 0, 0, markdownTheme));
			}
			this.markdownInput.set(message.id, inputKey);
			this.markdownSource.set(message.id, content);
		}
		for (const id of this.markdown.keys()) {
			if (visibleAssistantIds.has(id)) continue;
			this.markdown.delete(id);
			this.markdownInput.delete(id);
			this.markdownSource.delete(id);
		}
		if (snapshot.draft !== this.draftInput) {
			this.draftInput = snapshot.draft;
			const draft = boundedWorkbenchMarkdown(snapshot.draft);
			if (draft !== this.draftSource) {
				this.draftSource = draft;
				this.draftMarkdown.setText(draft);
			}
		}
	}

	invalidate(): void {
		for (const markdown of this.markdown.values()) markdown.invalidate();
		this.draftMarkdown.invalidate();
	}

	playWelcomeIntro(requestRender: () => void): void {
		if (!hasVisibleChatContent(this.snapshot)) this.welcome.playIntro(requestRender);
	}

	syncActivity(
		indicator: { message: string; hint?: string; frames: readonly string[]; intervalMs: number } | null,
		requestRender: () => void,
	): void {
		const intervalChanged = this.activityIntervalMs !== indicator?.intervalMs;
		this.activityIndicator = indicator;
		if (!indicator) {
			this.stopActivity();
			return;
		}
		if (this.activityTimer && intervalChanged) {
			clearInterval(this.activityTimer);
			this.activityTimer = null;
			this.activityFrame = 0;
		}
		if (!this.activityTimer) {
			this.activityFrame = 0;
			this.activityIntervalMs = indicator.intervalMs;
			this.activityTimer = setInterval(() => {
				this.activityFrame += 1;
				requestRender();
			}, indicator.intervalMs);
			this.activityTimer.unref?.();
		}
		requestRender();
	}

	dispose(): void {
		this.welcome.dispose();
		this.stopActivity();
	}

	render(width: number): string[] {
		const contentWidth = Math.max(1, width);
		if (!hasVisibleChatContent(this.snapshot)) return this.welcome.render(contentWidth);
		const activities = this.snapshot.activities;
		const completionSummaries = projectCompletionSummaries(this.snapshot);
		const messages = new Map(this.snapshot.chat.map((message) => [message.activityId, message]));
		const projectedSteps = this.snapshot.workFlow.steps;
		const stepByLastActivity = new Map<string, SemanticWorkStep>();
		const stepByActivity = new Map<string, SemanticWorkStep>();
		for (const step of projectedSteps) {
			for (const activityId of step.activityIds) stepByActivity.set(activityId, step);
			const lastVisibleActivityId = [...step.activityIds].reverse().find((id) => activities.some((activity) => activity.id === id));
			if (lastVisibleActivityId) stepByLastActivity.set(lastVisibleActivityId, step);
		}
		const observationByItem = new Map<string, string>();
		const lastVisibleActivityByItem = new Map<string, string>();
		for (const activity of activities) {
			if (isVisibleWorkStep(activity.kind)) {
				lastVisibleActivityByItem.set(activity.nativeRefs.itemId ?? activity.id, activity.id);
			}
			if (classifyWorkActivity(activity) !== "observation") continue;
			observationByItem.set(activity.nativeRefs.itemId ?? activity.id, activity.id);
		}
		const observationActivityIds = new Set(observationByItem.values());
		const delegationByActivity = new Map<string, readonly string[] | null>();
		const selectedPlanItemId = this.snapshot.selectedActivityId
			? activities.find((activity) => activity.id === this.snapshot.selectedActivityId)?.nativeRefs.itemId
			: undefined;
		const selectedStep = selectedPlanItemId
			? projectedSteps.find((step) => step.activityIds.some((activityId) =>
				activities.find((activity) => activity.id === activityId)?.nativeRefs.itemId === selectedPlanItemId,
			))
			: undefined;
		for (const section of projectWorkbenchDelegationSections(
			activities,
			this.snapshot.workFlow.goal,
			this.snapshot.threadId,
			contentWidth,
		)) {
			const linked = selectedStep && section.activityIds.some((id) =>
				selectedStep.activityIds.includes(id),
			);
			const traceRows = linked
				? [
					...wrapTextWithAnsi(colors.secondary(
						`Todo ${selectedStep.number}: ${selectedStep.title} · planItemId ${selectedPlanItemId} · Trace (inferred, collapsed)`,
					), contentWidth),
					...section.rows,
				]
				: [
					...wrapTextWithAnsi(colors.muted("Other observed Trace · unselected/orphan"), contentWidth),
					...section.rows,
				];
			for (const activityId of section.activityIds) delegationByActivity.set(activityId, null);
			delegationByActivity.set(section.anchorActivityId, traceRows);
		}
		const rows: string[] = [];
		const renderedMessageIds = new Set<string>();
		for (const activity of activities) {
			const message = messages.get(activity.id);
			if (message) {
				renderedMessageIds.add(message.id);
				rows.push(...this.renderMessage(message, contentWidth), "");
				const completionSummary = completionSummaries.get(activity.id);
				if (message.role !== "user" && completionSummary) {
					rows.push(...new CompletionSummaryCard(completionSummary).render(contentWidth), "");
				}
				continue;
			}
			if (delegationByActivity.has(activity.id)) {
				const delegationRows = delegationByActivity.get(activity.id);
				if (delegationRows?.length) rows.push(...delegationRows, "");
				continue;
			}
			const timelineRows = publicTimelineActivityRows(activity, contentWidth);
			if (timelineRows) {
				rows.push(...timelineRows, "");
				continue;
			}
			const step = stepByLastActivity.get(activity.id);
			if (step) {
				const currentLive = this.snapshot.liveActivity;
				const live = currentLive && currentLive.nativeRefs.itemId === activity.nativeRefs.itemId
					&& isVisibleWorkStep(currentLive.kind) ? currentLive : undefined;
				rows.push(...this.renderStepCard(step, contentWidth, activity, live), "");
			} else if (observationActivityIds.has(activity.id)) {
				const currentLive = this.snapshot.liveActivity;
				const live = currentLive && currentLive.nativeRefs.itemId === activity.nativeRefs.itemId
					&& isVisibleWorkStep(currentLive.kind) ? currentLive : undefined;
				const projectedActivity = {
					...activity,
					payload: boundedPublicProjection(activity.payload).value as typeof activity.payload,
				};
				rows.push(...new ObservationCard({ activity: projectedActivity, liveActivity: live }).render(contentWidth), "");
			} else if (
				isVisibleWorkStep(activity.kind)
				&& lastVisibleActivityByItem.get(activity.nativeRefs.itemId ?? activity.id) === activity.id
			) {
				const currentLive = this.snapshot.liveActivity;
				const live = currentLive && currentLive.nativeRefs.itemId === activity.nativeRefs.itemId
					&& isVisibleWorkStep(currentLive.kind) ? currentLive : undefined;
				const projectedActivity = {
					...activity,
					payload: boundedPublicProjection(activity.payload).value as typeof activity.payload,
				};
				rows.push(...new ObservationCard({
					activity: projectedActivity,
					liveActivity: live,
					mode: "action",
					parentStepNumber: stepByActivity.get(activity.id)?.number,
				}).render(contentWidth), "");
			}
		}
		// The first outbound message is published before Native thread creation has
		// produced a durable activity. Keep only that optimistic delivery visible until
		// the matching activity takes over; other messages need activity order authority.
		for (const message of this.snapshot.chat) {
			if (renderedMessageIds.has(message.id) || message.role !== "user" || message.status === "completed") continue;
			rows.push(...this.renderMessage(message, contentWidth), "");
		}
		if (this.snapshot.pendingApproval) {
			rows.push(...surfaceRows(
				approvalCardRows(
					this.snapshot.pendingApproval,
					this.snapshot.chatQueue.length,
					projectApprovalBackgroundState(this.snapshot.activities),
					contentWidth,
				),
				contentWidth,
				semantic.noticeSurface,
			), "");
		}
		if (!this.activityIndicator && this.snapshot.reasoningSummaryDraft) {
			rows.push(...this.snapshot.reasoningSummaryDraft.split(/\r?\n/u)
				.flatMap((line) => wrapTextWithAnsi(`판단 · ${line}`, contentWidth).map(semantic.reasoning)), "");
		} else if (!this.activityIndicator && this.snapshot.reasoningDraft) {
			rows.push(semantic.reasoning("분석 · 작업 계획을 정리하는 중"), "");
		}
		if (this.snapshot.draft) {
			rows.push(...transcriptRows([
				`${semantic.assistantLabel("bori")}  ${semantic.toolRunning("응답 중")}`,
				...this.draftMarkdown.render(contentWidth),
			], contentWidth), "");
		}
		for (const [index, queued] of this.snapshot.chatQueue.entries()) {
			rows.push(...surfaceRows([
				`${semantic.userLabel("user")} · ${semantic.toolPending(`대기 ${index + 1}`)}`,
				...wrapTextWithAnsi(boundedWorkbenchMarkdown(queued.content), contentWidth),
			], contentWidth, semantic.userSurface), "");
		}
		if (this.snapshot.error) {
			const projectedError = boundedPublicProjection(this.snapshot.error).value;
			const publicError = typeof projectedError === "string" ? projectedError : "Native 상태를 확인할 수 없습니다.";
			rows.push(...surfaceRows([
				colors.error("확인이 필요한 상태"),
				...wrapTextWithAnsi(boundedWorkbenchMarkdown(publicError), contentWidth),
				// `/cancel` only reconciles an unconfirmed send.  Offering it for any other failure
				// hands the operator a remedy that cannot apply.
				...(this.snapshot.deliveryUncertain
					? [colors.muted("수신 여부가 불명확하면 /cancel로 서버 상태를 확인합니다.")]
					: []),
			], contentWidth, semantic.noticeSurface), "");
		}
		if (this.activityIndicator) {
			const frame = this.activityIndicator.frames[this.activityFrame % Math.max(1, this.activityIndicator.frames.length)] ?? "·";
			if (contentWidth <= 2) {
				rows.push(truncateToWidth(`${colors.accent(frame)} ${this.activityIndicator.message}`, contentWidth));
			} else {
				const activityRows = wrapTextWithAnsi(this.activityIndicator.message, contentWidth - 2);
				for (const [index, line] of activityRows.entries()) {
					rows.push(`${index === 0 ? `${colors.accent(frame)} ` : "  "}${semantic.activity(line)}`);
				}
			}
			if (this.activityIndicator.hint) {
				rows.push(...wrapTextWithAnsi(`  ${this.activityIndicator.hint}`, contentWidth).map((line) => colors.muted(line)));
			}
			rows.push("");
		}
		return rows;
	}

	private renderMessage(message: WorkbenchSnapshot["chat"][number], contentWidth: number): string[] {
		if (message.role === "user") {
			const label = message.status === "failed" ? semantic.toolFailed("전송 실패")
				: message.status === "cancelled" ? semantic.toolCancelled("전송 중단")
					: message.status === "streaming" ? semantic.toolRunning("전송 준비 중") : "";
			return surfaceRows([
				`${semantic.userLabel("user")}${label ? ` · ${label}` : ""}`,
				...wrapTextWithAnsi(boundedWorkbenchMarkdown(message.content), contentWidth),
			], contentWidth, semantic.userSurface);
		}
		const label = message.status === "cancelled" ? semantic.toolCancelled("중단됨")
			: message.status === "failed" ? semantic.toolFailed("실패")
				: message.status === "streaming" ? semantic.toolRunning("응답 중") : "";
		const messageActivity = this.snapshot.activities.find((activity) => activity.id === message.activityId);
		const completion = projectTNoteCompletionIndex(this.snapshot.activities, this.snapshot.tnotes)
			.find((entry) => entry.threadId === messageActivity?.nativeRefs.threadId
				&& entry.turnId === messageActivity?.nativeRefs.turnId);
		const note = completion?.noteId ? this.snapshot.tnotes.find((candidate) => candidate.id === completion.noteId) : undefined;
		const selected = Boolean(completion && this.snapshot.selectedActivityId
			&& this.snapshot.activities.find((activity) => activity.id === this.snapshot.selectedActivityId)?.nativeRefs.turnId === completion.turnId);
		return transcriptRows([
			`${semantic.assistantLabel("bori")}${completion ? `  ${colors.highlight(`#${completion.number}`)}` : ""}${label ? `  ${label}` : ""}`,
			...(this.markdown.get(message.id)?.render(contentWidth) ?? [sanitizeTerminalTextUnbounded(message.content)]),
			...(selected && note ? [
				colors.muted(`T-note · ${note.title}`),
				...boundedTNoteSummary(note.summary).text.split(/\r?\n/u).flatMap((line) => wrapTextWithAnsi(line, contentWidth)),
				colors.muted(`sourceActivityIds · ${note.sourceActivityIds.join(", ") || "없음"}`),
			] : []),
		], contentWidth);
	}

	private stopActivity(): void {
		if (this.activityTimer) clearInterval(this.activityTimer);
		this.activityTimer = null;
		this.activityFrame = 0;
		this.activityIntervalMs = null;
	}

	private renderStepCard(
		step: SemanticWorkStep,
		contentWidth: number,
		activity?: WorkbenchSnapshot["activities"][number],
		liveActivity?: NonNullable<WorkbenchSnapshot["liveActivity"]>,
	): string[] {
		const key = `${contentWidth}:${step.number}:${step.id}:${step.status}:${step.narration.source}:${step.narration.what}:${step.narration.why ?? ""}:${activity?.sourceDigest ?? "none"}`;
		if (!liveActivity) {
			const cached = this.stepRows.get(key);
			if (cached) return cached;
		}
		const projectedActivity = activity ? {
			...activity,
			payload: boundedPublicProjection(activity.payload).value as typeof activity.payload,
		} : undefined;
		const options = {
			stepNumber: step.number,
			activity: projectedActivity,
			liveActivity,
			status: commandStatus(step.status),
			narration: step.narration,
		};
		const traceSource = step.association
			? step.association.sources.flatMap(source => wrapTextWithAnsi(colors.muted(
				`Source: inferred · turn ${source.turnId} · sequence ${source.startSequence}${source.endSequence === null ? "+" : `-${source.endSequence}`} · ${source.activityIds.length + source.observationActivityIds.length} activities (collapsed)`,
			), contentWidth))
			: [];
		const planItemId = activity?.nativeRefs.itemId;
		const compactSource = planItemId
			? wrapTextWithAnsi(colors.muted(`Trace source · planItemId ${planItemId} · /trace ${planItemId}`), contentWidth)
			: [];
		if (liveActivity) return [...new WorkStepCard(options).render(contentWidth), ...traceSource, ...compactSource];
		const rows = [...new WorkStepCard(options).render(contentWidth), ...traceSource, ...compactSource];
		this.stepRows.set(key, rows);
		if (this.stepRows.size > WORKBENCH_STEP_CACHE_LIMIT) this.stepRows.clear();
		return rows;
	}
}

function hasVisibleChatContent(snapshot: WorkbenchSnapshot): boolean {
	return snapshot.chat.length > 0
		|| snapshot.workFlow.steps.length > 0
		|| Boolean(snapshot.pendingApproval || snapshot.reasoningSummaryDraft || snapshot.reasoningDraft || snapshot.draft || snapshot.error)
		|| Boolean(snapshot.liveActivity && isVisibleWorkStep(snapshot.liveActivity.kind));
}

/** Append-only summaries of completed questions only. */
export class TNotesSourceView implements Component {
	constructor(private readonly getSnapshot: () => WorkbenchSnapshot) {}
	invalidate(): void {}
	render(width: number): string[] {
		const snapshot = this.getSnapshot();
		const rows: string[] = [];
		const omittedTNotes = Math.max(0, snapshot.tnotes.length - TNOTE_VISIBLE_LIMIT);
		const visibleTNotes = snapshot.tnotes.slice(-TNOTE_VISIBLE_LIMIT);
		if (omittedTNotes > 0) {
			rows.push(colors.muted(TNOTE_OMISSION.replace("%d", String(omittedTNotes)).replace("%d", String(visibleTNotes.length))));
		}
		for (const [visibleIndex, note] of visibleTNotes.entries()) {
			const index = omittedTNotes + visibleIndex;
			rows.push(colors.highlight(`  ${index + 1}. ${note.title} · ${note.id}`));
			const summary = boundedTNoteSummary(note.summary);
			for (const line of summary.text.split(/\r?\n/u)) {
				rows.push(...wrapTextWithAnsi(`    ${line}`, Math.max(1, width)));
			}
			if (summary.omitted) rows.push(colors.muted(TNOTE_SUMMARY_OMISSION));
			rows.push(colors.muted(`    근거 활동 ${note.sourceActivityIds.length}개`));
		}
		return rows;
	}
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
			: snapshot.workFlow.steps.find((step) => step.number === snapshot.workFlow.currentStepNumber);
		const live = snapshot.liveActivity
			? `${snapshot.liveActivity.kind} · ${sanitizeTerminalTextExcerpt(snapshot.liveActivity.text || snapshot.liveActivity.method, 180, "head-tail")}`
			: "대기 중인 실행 없음";
		const rows = [
			colors.accent("Monitor · 실행 관측"),
			colors.muted("읽기 전용 · Chat과 Todo는 같은 Workbench 상태를 사용합니다."),
			"",
			`${colors.secondary("Session")} · ${snapshot.phase} · thread ${snapshot.threadId ?? "없음"}${snapshot.activeTurnId ? ` · turn ${snapshot.activeTurnId}` : ""}`,
			`${colors.secondary("Activity")} · ${snapshot.activityCount ?? snapshot.activities.length}개 · journal ${snapshot.journalSequence}`,
			`${colors.secondary("Turn")} · ${currentStep ? `${currentStep.number}/${snapshot.workFlow.steps.length} · ${currentStep.title}` : "진행 단계 없음"}`,
			`${colors.secondary("Live")} · ${live}`,
			`${colors.secondary("Queue")} · ${snapshot.chatQueue.length}개${snapshot.pendingApproval ? " · 승인 대기" : ""}`,
			`${colors.secondary("MCP")} · ${snapshot.mcpServers.length === 0 ? "서버 없음" : snapshot.mcpServers.map((server) =>
				`${server.name} ${server.enabled ? "활성" : "비활성"} · ${server.status} · 도구 ${server.tools.length}개`
			).join(" | ")}`,
			`${colors.secondary("Delegation")} · ${projectWorkbenchDelegationSections(
				snapshot.activities,
				snapshot.workFlow.goal,
				snapshot.threadId,
				contentWidth,
			).length}개 실행 그룹`,
		];
		return rows.flatMap((row) => wrapTextWithAnsi(row, contentWidth));
	}
}

function boundedTNoteSummary(summary: string): { text: string; omitted: boolean } {
	const clipped = summary.slice(0, TNOTE_SUMMARY_MAX_CHARS);
	const lines = clipped.split(/\r?\n/u);
	const text = lines.slice(0, TNOTE_SUMMARY_MAX_LINES).join("\n");
	return { text, omitted: clipped.length < summary.length || lines.length > TNOTE_SUMMARY_MAX_LINES };
}

function commandStatus(status: WorkStepStatus): "pending" | "running" | "passed" | "failed" | "cancelled" {
	if (status === "completed") return "passed";
	return status;
}
