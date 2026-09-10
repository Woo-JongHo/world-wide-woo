/** @linear WOO-679 WOO-683 WOO-686 WOO-687 WOO-688 WOO-689 */
import {
	Markdown,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
	type Component,
} from "@earendil-works/pi-tui";
import type { NativeApprovalRequest } from "../../../../core/domain/execution/native-session";
import type { ProjectActivity } from "../../../../core/domain/execution/project-activity";
import { projectBackgroundWorkState, type BackgroundWorkState } from "../../../../core/domain/execution/native-session";
import { sanitizeCompletedAssistantResponse, sanitizePartialAssistantResponse } from "../../../../core/domain/review/redaction";
import { sanitizeTerminalTextExcerpt, sanitizeTerminalTextUnbounded } from "../../../../core/domain/execution/terminal";
import { workbenchApprovalDecisions, type WorkbenchSnapshot } from "../../../../core/domain/work/workbench";
import { classifyWorkActivity, type SemanticWorkStep, type WorkStepStatus } from "../../../../core/domain/work";
import { boundedPublicProjection, PUBLIC_SOURCE_OMISSION } from "./bounded-public-projection";
import { activityGradientFrame, colors, markdownTheme, semantic } from "../shell/theme";
import { WorkbenchWelcomeView } from "../shell/workbench-welcome";
import { isVisibleWorkStep, ObservationCard, WorkStepCard } from "./work-step-card";
import { projectWorkbenchDelegationSections, renderDelegationSections } from "../dashboard/delegation-tree-view";
import { EntryDashboardView } from "../dashboard/entry-dashboard-view";

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

/** @linear WOO-689 */
function activityOwnerKey(activity: WorkbenchSnapshot["activities"][number]): string {
	const { threadId, turnId, itemId } = activity.nativeRefs;
	return itemId ? `${threadId ?? ""}\0${turnId ?? ""}\0${itemId}` : `activity\0${activity.id}`;
}

function nativeOwnerKey(nativeRefs: WorkbenchSnapshot["activities"][number]["nativeRefs"], fallbackId: string): string {
	const { threadId, turnId, itemId } = nativeRefs;
	return itemId ? `${threadId ?? ""}\0${turnId ?? ""}\0${itemId}` : `activity\0${fallbackId}`;
}

function sameActivityOwner(
	left: { readonly nativeRefs: WorkbenchSnapshot["activities"][number]["nativeRefs"] },
	right: WorkbenchSnapshot["activities"][number],
): boolean {
	return nativeOwnerKey(left.nativeRefs, "live") === activityOwnerKey(right);
}

function turnOwnerKey(threadId: string | undefined, turnId: string | undefined): string | null {
	return threadId && turnId ? `${threadId}\0${turnId}` : null;
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
	return decisions.length > 0
		? "승인 선택 화면 · ↑↓ 또는 숫자로 선택 · Enter 결정"
		: "이 요청은 결정 선택지를 제공하지 않습니다. /cancel 로 중단하세요.";
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
		colors.warning("승인할까요? 현재 턴은 Input 답변을 기다립니다."),
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

/** Chat projection for the native ProjectWorkbench, including existing tool cards.
 * @linear WOO-679 WOO-683
 */
/** @Unit Code-001 */
/** @codeId 0001 */
export class WorkbenchChatView implements Component {
	private snapshot: WorkbenchSnapshot;
	private readonly welcome = new WorkbenchWelcomeView();
	private readonly entryDashboard = new EntryDashboardView(() => this.snapshot.linearDashboard);
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
	private cachedSnapshot: WorkbenchSnapshot | null = null;
	private cachedWidth = -1;
	private cachedRows: string[] | null = null;
	/** `cachedRows`에서 activity indicator가 시작하는 행. 본문은 spinner tick에 다시 투영하지 않는다. */
	private cachedActivityRowsStart = -1;

	constructor(snapshot: WorkbenchSnapshot) {
		this.snapshot = snapshot;
		this.update(snapshot);
	}

	/** @linear WOO-686 WOO-688 */
	update(snapshot: WorkbenchSnapshot): void {
		if (this.snapshot !== snapshot) this.cachedRows = null;
		this.snapshot = snapshot;
		if (hasVisibleChatContent(snapshot)) this.welcome.dispose();
		const visibleAssistantIds = new Set<string>();
		for (const message of snapshot.chat) {
			if (message.role !== "assistant") continue;
			visibleAssistantIds.add(message.id);
			const runtimeContent = typeof message.content === "string" ? message.content : "[잘못된 메시지 본문]";
			const inputKey = `${message.status}\0${message.partial === true ? "partial" : "whole"}\0${runtimeContent}`;
			if (this.markdownInput.get(message.id) === inputKey) continue;
			let content: string;
			try {
				content = sanitizeTerminalTextUnbounded(
				message.partial || message.status !== "completed"
					? sanitizePartialAssistantResponse(runtimeContent)
					: sanitizeCompletedAssistantResponse(runtimeContent),
				);
			} catch {
				content = "메시지의 공개 본문을 확인할 수 없습니다.";
			}
			const existing = this.markdown.get(message.id);
			if (this.markdownSource.get(message.id) !== content) {
				try {
					if (existing) existing.setText(content);
					else this.markdown.set(message.id, new Markdown(content, 0, 0, markdownTheme));
				} catch {
					this.markdown.delete(message.id);
				}
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
			const draft = boundedWorkbenchMarkdown(sanitizePartialAssistantResponse(snapshot.draft));
			if (draft !== this.draftSource) {
				this.draftSource = draft;
				this.draftMarkdown.setText(draft);
			}
		}
	}

	invalidate(): void {
		this.cachedRows = null;
		this.cachedActivityRowsStart = -1;
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
		const motionAllowed = !this.snapshot.executionRun
			|| ["executing", "verifying", "completing"].includes(this.snapshot.executionRun.phase);
		if (!motionAllowed) indicator = null;
		const previous = this.activityIndicator;
		const changed = this.activityIndicator?.message !== indicator?.message
			|| this.activityIndicator?.hint !== indicator?.hint
			|| this.activityIndicator?.intervalMs !== indicator?.intervalMs
			|| this.activityIndicator?.frames.join("\0") !== indicator?.frames.join("\0");
		this.activityIndicator = indicator;
		if (!indicator) {
			this.stopActivity();
		} else if (indicator.frames.length <= 1) {
			this.stopActivity();
		} else if (!this.activityTimer
			|| previous?.intervalMs !== indicator.intervalMs
			|| previous.frames.join("\0") !== indicator.frames.join("\0")) {
			this.stopActivity();
			this.activityIntervalMs = indicator.intervalMs;
			this.activityTimer = setInterval(() => {
				this.activityFrame = (this.activityFrame + 1) % Math.max(1, indicator.frames.length * 64);
				this.refreshCachedActivityRows();
				requestRender();
			}, indicator.intervalMs);
			this.activityTimer.unref?.();
		}
		if (changed) {
			this.cachedRows = null;
			this.cachedActivityRowsStart = -1;
			requestRender();
		}
	}

	dispose(): void {
		this.welcome.dispose();
		this.stopActivity();
	}

	render(width: number): string[] {
		const contentWidth = Math.max(1, width);
		const showEntryDashboard = !hasVisibleChatContent(this.snapshot);
		if (showEntryDashboard && this.snapshot.linearDashboard) {
			return this.entryDashboard.render(contentWidth);
		}
		if (!hasVisibleChatContent(this.snapshot)) return this.welcome.render(contentWidth);
		if (
			this.cachedRows
			&& this.cachedSnapshot === this.snapshot
			&& this.cachedWidth === contentWidth
		) return this.cachedRows;
		const activities = this.snapshot.activities;
		const activityById = new Map(activities.map((activity) => [activity.id, activity]));
		const messages = new Map(this.snapshot.chat.map((message) => [message.activityId, message]));
		const projectedSteps = this.snapshot.workFlow.steps;
		const stepByLastActivity = new Map<string, SemanticWorkStep>();
		const stepByActivity = new Map<string, SemanticWorkStep>();
		for (const step of projectedSteps) {
			for (const activityId of step.activityIds) stepByActivity.set(activityId, step);
			const lastVisibleActivityId = [...step.activityIds].reverse().find((id) => activityById.has(id));
			if (lastVisibleActivityId) stepByLastActivity.set(lastVisibleActivityId, step);
		}
		const observationByItem = new Map<string, string>();
		const lastVisibleActivityByItem = new Map<string, string>();
		for (const activity of activities) {
			if (isVisibleWorkStep(activity.kind)) {
				lastVisibleActivityByItem.set(activityOwnerKey(activity), activity.id);
			}
			if (classifyWorkActivity(activity) !== "observation") continue;
			observationByItem.set(activityOwnerKey(activity), activity.id);
		}
		const observationActivityIds = new Set(observationByItem.values());
		const delegationByActivity = new Map<string, readonly string[] | null>();
		const selectedPlanItemId = this.snapshot.selectedActivityId
			? activityById.get(this.snapshot.selectedActivityId)?.nativeRefs.itemId
			: undefined;
		const selectedStep = selectedPlanItemId
			? projectedSteps.find((step) => step.activityIds.some((activityId) =>
				activityById.get(activityId)?.nativeRefs.itemId === selectedPlanItemId,
			))
			: undefined;
		const delegationSections = this.snapshot.delegation
			? renderDelegationSections(this.snapshot.delegation, this.snapshot.workFlow.goal, contentWidth)
			: projectWorkbenchDelegationSections(activities, this.snapshot.workFlow.goal, this.snapshot.threadId, contentWidth);
		for (const section of delegationSections) {
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
				rows.push(...this.renderMessage(message, contentWidth, activityById), "");
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
				const live = currentLive && sameActivityOwner(currentLive, activity)
					&& isVisibleWorkStep(currentLive.kind) ? currentLive : undefined;
				rows.push(...this.renderStepCard(step, contentWidth, activity, live), "");
			} else if (observationActivityIds.has(activity.id)) {
				const currentLive = this.snapshot.liveActivity;
				const live = currentLive && sameActivityOwner(currentLive, activity)
					&& isVisibleWorkStep(currentLive.kind) ? currentLive : undefined;
				const projectedActivity = {
					...activity,
					payload: boundedPublicProjection(activity.payload).value as typeof activity.payload,
				};
				rows.push(
					...new ObservationCard({ activity: projectedActivity, liveActivity: live }).render(contentWidth),
					...wrapTextWithAnsi(colors.muted(`Source · /source ${activity.id}`), contentWidth),
					"",
				);
			} else if (
				isVisibleWorkStep(activity.kind)
				&& lastVisibleActivityByItem.get(activityOwnerKey(activity)) === activity.id
			) {
				const currentLive = this.snapshot.liveActivity;
				const live = currentLive && sameActivityOwner(currentLive, activity)
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
				}).render(contentWidth), ...wrapTextWithAnsi(colors.muted(`Source · /source ${activity.id}`), contentWidth), "");
			}
		}
		// The first outbound message is published before Native thread creation has
		// produced a durable activity. Keep only that optimistic delivery visible until
		// the matching activity takes over; other messages need activity order authority.
		for (const message of this.snapshot.chat) {
			if (renderedMessageIds.has(message.id) || message.role !== "user" || message.status === "completed") continue;
			rows.push(...this.renderMessage(message, contentWidth, activityById), "");
		}
		if (this.snapshot.actionResult?.kind === "workflow") {
			rows.push(colors.warning(this.snapshot.actionResult.title),
				...wrapTextWithAnsi(boundedWorkbenchMarkdown(this.snapshot.actionResult.body), contentWidth), "");
		}
		const terminalReceipt = this.snapshot.executionRun?.receipt;
		if (terminalReceipt && terminalReceipt.status !== "completed") {
			const label = terminalReceipt.status === "interrupted" ? "실행이 중단되었습니다."
				: terminalReceipt.status === "failed" ? "실행이 실패했습니다."
					: "실행이 차단되었습니다.";
			rows.push(...surfaceRows([
				colors.warning("실행 종료"),
				label,
				colors.muted("세부 실행 근거는 Tracer에서 확인합니다."),
			], contentWidth, semantic.noticeSurface), "");
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
		if (this.snapshot.executionRun?.phase === "waiting" && !this.snapshot.pendingApproval) {
			const reason = this.snapshot.executionRun.waitReason;
			const detail = reason === "gap"
				? "관측 순서가 비어 있어 기록을 대조하는 중입니다."
				: reason === "ambiguous_task"
					? "다음 작업을 특정할 수 없습니다."
					: reason === "approval"
						? "실행 승인을 기다리고 있습니다."
						: "실행 재개 조건을 기다리고 있습니다.";
			const action = reason === "approval"
				? "승인 요청을 확인한 뒤 허용 또는 거절합니다."
				: "새 실행을 시작하지 말고 원본 관측을 확인합니다.";
			rows.push(...surfaceRows([
				colors.warning("실행 대기"),
				...wrapTextWithAnsi(detail, contentWidth),
				colors.muted(`조치 · ${action}`),
			], contentWidth, semantic.noticeSurface), "");
		}
		if (["blocked", "reconciling", "unknown"].includes(this.snapshot.executionRun?.phase ?? "")) {
			const phase = this.snapshot.executionRun!.phase;
			const detail = phase === "blocked"
				? "도구 또는 작업이 실패했습니다. 복구 관측 또는 권한 있는 종료 관측을 기다립니다."
				: phase === "reconciling"
					? "관측 순서를 대조하고 있습니다. 종료 결과를 추정하지 않습니다."
					: "실행 상태를 판별할 수 없습니다. 원본 관측을 확인합니다.";
			rows.push(...surfaceRows([
				colors.warning(phase === "blocked" ? "실행 차단" : phase === "reconciling" ? "실행 대조 중" : "실행 상태 알 수 없음"),
				...wrapTextWithAnsi(detail, contentWidth),
			], contentWidth, semantic.noticeSurface), "");
		}
		if (!this.activityIndicator && this.snapshot.reasoningSummaryDraft) {
			rows.push(...this.snapshot.reasoningSummaryDraft.split(/\r?\n/u)
				.flatMap((line) => wrapTextWithAnsi(`판단 · ${line}`, contentWidth).map(semantic.reasoning)), "");
		} else if (!this.activityIndicator && this.snapshot.reasoningDraft) {
			rows.push(semantic.reasoning("분석 · 작업 계획을 정리하는 중"), "");
		}
		if (this.snapshot.draft) {
			rows.push(...transcriptRows([
				`${semantic.assistantLabel("🐙 Wooni")}  ${semantic.toolRunning("응답 중")}`,
				...this.renderDraft(contentWidth),
			], contentWidth), "");
		}
		for (const queued of this.snapshot.chatQueue) {
			rows.push(...surfaceRows([
				semantic.userLabel("👤 USER"),
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
		if (this.snapshot.actionResult?.kind === "tnote") {
			rows.push(...surfaceRows([
				colors.warning(this.snapshot.actionResult.title),
				...wrapTextWithAnsi(boundedWorkbenchMarkdown(this.snapshot.actionResult.body), contentWidth),
			], contentWidth, semantic.noticeSurface), "");
		}
		this.cachedActivityRowsStart = rows.length;
		rows.push(...this.activityRows(contentWidth));
		this.cachedSnapshot = this.snapshot;
		this.cachedWidth = contentWidth;
		this.cachedRows = rows;
		return rows;
	}

	/** @linear WOO-689 */
	private activityRows(contentWidth: number): string[] {
		if (!this.activityIndicator) return [];
		const rows: string[] = [];
		const frame = this.activityIndicator.frames[this.activityFrame % Math.max(1, this.activityIndicator.frames.length)] ?? "·";
		if (contentWidth <= 2) {
			rows.push(truncateToWidth(`${colors.accent(frame)} ${this.activityIndicator.message}`, contentWidth));
		} else {
			const activityRows = wrapTextWithAnsi(this.activityIndicator.message, contentWidth - 2);
			for (const [index, line] of activityRows.entries()) {
				rows.push(`${index === 0 ? `${colors.accent(frame)} ` : "  "}${semantic.activity(activityGradientFrame(line, this.activityFrame))}`);
			}
		}
		if (this.activityIndicator.hint) {
			rows.push(...wrapTextWithAnsi(`  ${this.activityIndicator.hint}`, contentWidth).map((line) => colors.muted(line)));
		}
		rows.push("");
		return rows;
	}

	/** @linear WOO-689 */
	private refreshCachedActivityRows(): void {
		if (!this.cachedRows || this.cachedSnapshot !== this.snapshot || this.cachedWidth < 1 || this.cachedActivityRowsStart < 0) return;
		this.cachedRows = [
			...this.cachedRows.slice(0, this.cachedActivityRowsStart),
			...this.activityRows(this.cachedWidth),
		];
	}

	/** @linear WOO-687 */
	private renderMessage(
		message: WorkbenchSnapshot["chat"][number],
		contentWidth: number,
		activityById: ReadonlyMap<string, WorkbenchSnapshot["activities"][number]>,
	): string[] {
		const runtimeRole: unknown = message.role;
		const runtimeStatus: unknown = message.status;
		const content = typeof message.content === "string" ? message.content : "[잘못된 메시지 본문]";
		if (message.role === "user") {
			const label = message.status === "failed" ? semantic.toolFailed("전송 실패")
				: message.status === "cancelled" ? semantic.toolCancelled("전송 중단")
					: message.status === "streaming" ? semantic.toolRunning("전송 준비 중") : "";
			return surfaceRows([
				`${semantic.userLabel("👤 USER")}${label ? ` · ${label}` : ""}`,
				...wrapTextWithAnsi(boundedWorkbenchMarkdown(content), contentWidth),
			], contentWidth, semantic.userSurface);
		}
		if (runtimeRole !== "assistant" && runtimeRole !== "system") {
			return transcriptRows([
				colors.error(`알 수 없는 메시지 역할 · ${publicText(runtimeRole) ?? "값 없음"}`),
				...wrapTextWithAnsi(boundedWorkbenchMarkdown(sanitizePartialAssistantResponse(content)), contentWidth),
			], contentWidth);
		}
		const knownStatus = runtimeStatus === "streaming" || runtimeStatus === "completed" || runtimeStatus === "incomplete"
			|| runtimeStatus === "failed" || runtimeStatus === "cancelled";
		const label = message.status === "incomplete"
			? semantic.toolCancelled(message.partial ? "부분 응답 · 최종 본문 미수신" : "최종 본문 미수신")
			: message.status === "cancelled" ? semantic.toolCancelled(message.partial ? "중단됨 · 부분 응답" : "중단됨")
			: message.status === "failed" ? semantic.toolFailed(message.partial ? "실패 · 부분 응답" : "실패")
				: message.status === "streaming" ? semantic.toolRunning("응답 중")
					: !knownStatus ? semantic.toolFailed(`알 수 없는 상태 · ${publicText(runtimeStatus) ?? "값 없음"}`) : "";
		const messageActivity = activityById.get(message.activityId);
		const safeContent = this.markdownSource.get(message.id)
			?? (runtimeRole === "system" ? sanitizeTerminalTextUnbounded(content) : "메시지의 공개 본문을 확인할 수 없습니다.");
		let bodyRows: string[];
		try {
			bodyRows = this.markdown.get(message.id)?.render(contentWidth) ?? wrapTextWithAnsi(safeContent, contentWidth);
		} catch {
			bodyRows = wrapTextWithAnsi(safeContent, contentWidth);
		}
		const roleHeader = runtimeRole === "system" ? colors.warning("system") : semantic.assistantLabel("🐙 Wooni");
		const header = `${roleHeader}${label ? `  ${label}` : ""}`;
		const headerRows = label && visibleWidth(header) > contentWidth
			? [roleHeader, ...wrapTextWithAnsi(label, contentWidth)]
			: [header];
		return transcriptRows([
			...headerRows,
			...bodyRows,
		], contentWidth);
	}

	private renderDraft(width: number): string[] {
		try { return this.draftMarkdown.render(width); }
		catch { return wrapTextWithAnsi(sanitizeTerminalTextUnbounded(this.draftSource), width); }
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
		const key = `${contentWidth}:${step.number}:${step.id}:${step.status}:${step.narration.source}:${step.narration.what}:${step.narration.why ?? ""}:${activity?.id ?? "none"}:${activity?.sourceDigest ?? "none"}`;
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
		const compactSource = activity ? [
			...wrapTextWithAnsi(colors.muted(`Trace source · activityId ${activity.id} · /trace ${activity.id}`), contentWidth),
			...wrapTextWithAnsi(colors.muted(`Source · /source ${activity.id}`), contentWidth),
		] : [];
		if (liveActivity) return [...new WorkStepCard(options).render(contentWidth), ...traceSource, ...compactSource];
		const rows = [...new WorkStepCard(options).render(contentWidth), ...traceSource, ...compactSource];
		this.stepRows.set(key, rows);
		if (this.stepRows.size > WORKBENCH_STEP_CACHE_LIMIT) this.stepRows.clear();
		return rows;
	}
}

function hasVisibleChatContent(snapshot: WorkbenchSnapshot): boolean {
	return snapshot.actionResult?.kind === "workflow" || snapshot.chat.length > 0
		|| snapshot.workFlow.steps.length > 0
		|| Boolean(snapshot.pendingApproval || snapshot.executionRun?.receipt || snapshot.executionRun?.phase === "waiting"
			|| snapshot.reasoningSummaryDraft || snapshot.reasoningDraft || snapshot.draft || snapshot.error)
		|| Boolean(snapshot.liveActivity && isVisibleWorkStep(snapshot.liveActivity.kind));
}

/**
 * Right-top Dashboard pane: append-only records of completed questions only.
 * Trace and Source stay with the selected execution in Monitor.
 */
/** @linear WOO-693 */
export class TNotesSourceView implements Component {
	constructor(private readonly getSnapshot: () => WorkbenchSnapshot) {}
	invalidate(): void {}
	render(width: number): string[] {
		const snapshot = this.getSnapshot();
		const rows: string[] = [];
		const visibleLimit = snapshot.tnoteVisibleLimit ?? TNOTE_VISIBLE_LIMIT;
		const omittedTNotes = Math.max(0, snapshot.tnotes.length - visibleLimit);
		const visibleTNotes = snapshot.tnotes.slice(-visibleLimit);
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

function traceStatusLabel(status: WorkStepStatus): string {
	if (status === "completed") return "완료";
	if (status === "running") return "진행";
	if (status === "failed") return "실패";
	if (status === "cancelled") return "중단";
	return "대기";
}

function traceActivityIds(step: SemanticWorkStep): readonly string[] {
	if (!step.association) return [];
	return [...new Set(step.association.sources.flatMap((source) => [
		...source.activityIds,
		...source.observationActivityIds,
	]))];
}

/** @linear WOO-704 27c3aae2-f0ff-4717-aacd-0e255ec08ada */
function monitorTraceRows(snapshot: WorkbenchSnapshot, width: number): string[] {
	if (!snapshot.workFlow.source) {
		return [
			colors.secondary("Tracer · Native Plan과 관측 실행"),
			colors.muted("현재 요청에서 공개 Plan Source가 관측되지 않았습니다."),
		];
	}

	const activities = new Map(snapshot.activities.map((activity) => [activity.id, activity]));
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
	return rows.flatMap((row) => wrapTextWithAnsi(row, width));
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

/** @linear WOO-706 1f933204-1980-4640-b49b-b030aff9a122 */
function selectedSourceRows(snapshot: WorkbenchSnapshot, width: number): string[] {
	if (!snapshot.selectedActivityId) {
		return [
			colors.secondary("Trace·Source · 선택한 실행 없음"),
			colors.muted("Plan·Trace 목록의 /trace <activity-id>로 공개 Source를 엽니다."),
		];
	}
	const selected = snapshot.activities.find((activity) => activity.id === snapshot.selectedActivityId);
	if (!selected) {
		return [
			colors.warning("Trace·Source · 선택한 Activity의 원본 부재"),
			colors.muted(`activityId ${snapshot.selectedActivityId} · 다른 실행으로 대신하지 않았습니다.`),
		];
	}

	const projection = boundedPublicProjection(selected.payload);
	const serialized = JSON.stringify(projection.value, null, 2);
	const publicRows = serialized
		? serialized.split(/\r?\n/u).flatMap((line) => wrapTextWithAnsi(line, width))
		: [colors.muted("보존된 공개 내용 없음")];
	const refs = [
		selected.nativeRefs.threadId ? `thread ${selected.nativeRefs.threadId}` : "thread 없음",
		selected.nativeRefs.turnId ? `turn ${selected.nativeRefs.turnId}` : "turn 없음",
		selected.nativeRefs.itemId ? `item ${selected.nativeRefs.itemId}` : "item 없음",
	].join(" · ");
	return [
		colors.secondary(`Trace·Source · ${selected.id} · ${selected.kind} · ${selected.phase}`),
		colors.text("공개 내용 · 보존된 관측 projection"),
		...publicRows,
		...(projection.omitted ? [colors.warning(PUBLIC_SOURCE_OMISSION)] : []),
		colors.muted(`관측 ID · activity ${selected.id}`),
		colors.muted(`Native 참조 · ${refs}`),
		colors.muted("이 화면은 provider 원본 전체가 아니라 보존된 공개 관측만 보여줍니다."),
	].flatMap((row) => wrapTextWithAnsi(row, width));
}

/** Read-only execution projection; it deliberately does not own a session or transcript. */
/** @linear WOO-681 */
export class WorkbenchMonitorView implements Component {
	constructor(private readonly getSnapshot: () => WorkbenchSnapshot) {}
	invalidate(): void {}
	render(width: number): string[] {
		const snapshot = this.getSnapshot();
		const contentWidth = Math.max(1, width);
		const currentStep = snapshot.workFlow.currentStepNumber === null
			? null
			: snapshot.workFlow.steps.find((step) => step.number === snapshot.workFlow.currentStepNumber);
		const run = snapshot.executionRun;
		const live = run?.activeActivity
			? `${run.activeActivity.kind} · ${sanitizeTerminalTextExcerpt(run.activeActivity.text || run.activeActivity.method, 180, "head-tail")}`
			: snapshot.liveActivity
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
			...(run ? [`${colors.secondary("Run")} · ${run.runId} · ${run.phase}${run.receipt ? ` · receipt ${run.receipt.receiptDigest}` : ` · checkpoint ${run.checkpoint.digest}`}`] : []),
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
			"",
			...monitorTraceRows(snapshot, contentWidth),
			"",
			...selectedSourceRows(snapshot, contentWidth),
			...(snapshot.resumeCoverage?.mode === "partial-local-journal"
				? [colors.warning("관측 범위 · 재개 뒤 이 프로세스가 수집한 Activity만 표시합니다.")]
				: []),
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
