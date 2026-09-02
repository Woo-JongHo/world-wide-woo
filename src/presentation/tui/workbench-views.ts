import {
	Markdown,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
	type Component,
} from "@earendil-works/pi-tui";
import type { NativeApprovalRequest } from "../../domain/native-session";
import { projectBackgroundWorkState, type BackgroundWorkState } from "../../domain/native-session";
import { sanitizeTerminalTextExcerpt, sanitizeTerminalTextUnbounded } from "../../domain/terminal";
import { workbenchApprovalDecisions, type WorkbenchSnapshot } from "../../domain/workbench";
import { classifyWorkActivity, type SemanticWorkStep, type WorkStepStatus } from "../../domain/work-steps";
import { boundedPublicProjection } from "./bounded-public-projection";
import { colors, markdownTheme, semantic } from "./theme";
import { WorkbenchWelcomeView } from "./workbench-welcome";
import { isVisibleWorkStep, ObservationCard, WorkStepCard } from "./work-step-card";
import { projectWorkbenchDelegationSections } from "./delegation-tree-view";

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

function approvalKindLabel(kind: NativeApprovalRequest["kind"]): string {
	if (kind === "command") return "명령";
	if (kind === "file-change") return "파일 변경";
	return "권한";
}

function approvalParamText(request: NativeApprovalRequest, key: string): string | null {
	const value = request.params[key];
	if (typeof value !== "string" || !value.trim()) return null;
	return sanitizeTerminalTextExcerpt(value, WORKBENCH_APPROVAL_DETAIL_MAX_CHARS, "head-tail")
		.replace(/\t/gu, "    ")
		.trim();
}

function approvalFallback(request: NativeApprovalRequest): string {
	if (request.kind === "command") return "명령 실행에 승인이 필요합니다.";
	if (request.kind === "file-change") return "파일 변경에 승인이 필요합니다.";
	return "추가 권한이 필요합니다.";
}

function approvalDetailLabel(request: NativeApprovalRequest): string {
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
		return summary ? summary.split(/\r?\n/u).flatMap((line) => wrapTextWithAnsi(colors.muted(line), Math.max(1, width))) : null;
	}
	// MCP startup/retry telemetry belongs in Source, not the user conversation.
	if (method === "mcpserver/startupstatus/updated") return null;
	return null;
}

/** Chat projection for the native ProjectWorkbench, including existing tool cards. */
export class WorkbenchChatView implements Component {
	private snapshot: WorkbenchSnapshot;
	private readonly welcome = new WorkbenchWelcomeView();
	private activityIndicator: { message: string; frames: readonly string[]; intervalMs: number } | null = null;
	private activityFrame = 0;
	private activityTimer: ReturnType<typeof setInterval> | null = null;
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
			if (this.markdownInput.get(message.id) === message.content) continue;
			const content = sanitizeTerminalTextUnbounded(message.content);
			const existing = this.markdown.get(message.id);
			if (this.markdownSource.get(message.id) !== content) {
				if (existing) existing.setText(content);
				else this.markdown.set(message.id, new Markdown(content, 0, 0, markdownTheme));
			}
			this.markdownInput.set(message.id, message.content);
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
		indicator: { message: string; frames: readonly string[]; intervalMs: number } | null,
		requestRender: () => void,
	): void {
		this.activityIndicator = indicator;
		if (!indicator) {
			this.stopActivity();
			return;
		}
		if (!this.activityTimer) {
			this.activityFrame = 0;
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
		const messages = new Map(this.snapshot.chat.map((message) => [message.activityId, message]));
		const projectedSteps = this.snapshot.workFlow.steps;
		const stepByLastActivity = new Map<string, SemanticWorkStep>();
		for (const step of projectedSteps) {
			const lastVisibleActivityId = [...step.activityIds].reverse().find((id) => activities.some((activity) => activity.id === id));
			if (lastVisibleActivityId) stepByLastActivity.set(lastVisibleActivityId, step);
		}
		const observationByItem = new Map<string, string>();
		for (const activity of activities) {
			if (classifyWorkActivity(activity) !== "observation") continue;
			observationByItem.set(activity.nativeRefs.itemId ?? activity.id, activity.id);
		}
		const observationActivityIds = new Set(observationByItem.values());
		const delegationByActivity = new Map<string, readonly string[] | null>();
		for (const section of projectWorkbenchDelegationSections(
			activities,
			this.snapshot.workFlow.goal,
			this.snapshot.threadId,
			contentWidth,
		)) {
			for (const activityId of section.activityIds) delegationByActivity.set(activityId, null);
			delegationByActivity.set(section.anchorActivityId, section.rows);
		}
		const rows: string[] = [];
		for (const activity of activities) {
			const message = messages.get(activity.id);
			if (message) {
				if (message.role === "user") {
					const label = message.status === "failed" ? semantic.toolFailed("전송 실패")
						: message.status === "cancelled" ? semantic.toolCancelled("전송 중단")
							: message.status === "streaming" ? semantic.toolRunning("전송 준비 중") : "";
					rows.push(...surfaceRows([
						`${semantic.userLabel("user")}${label ? ` · ${label}` : ""}`,
						...wrapTextWithAnsi(boundedWorkbenchMarkdown(message.content), contentWidth),
					], contentWidth, semantic.userSurface), "");
				} else {
					const label = message.status === "cancelled" ? semantic.toolCancelled("중단됨")
						: message.status === "failed" ? semantic.toolFailed("실패")
							: message.status === "streaming" ? semantic.toolRunning("응답 중") : "";
					rows.push(...surfaceRows([
						`${semantic.assistantLabel("bori")}${label ? `  ${label}` : ""}`,
						...(this.markdown.get(message.id)?.render(contentWidth) ?? [sanitizeTerminalTextUnbounded(message.content)]),
					], contentWidth, semantic.assistantSurface), "");
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
			}
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
				semantic.assistantSurface,
			), "");
		}
		if (!this.activityIndicator && this.snapshot.reasoningSummaryDraft) {
			rows.push(...this.snapshot.reasoningSummaryDraft.split(/\r?\n/u)
				.flatMap((line) => wrapTextWithAnsi(colors.muted(line), contentWidth)), "");
		} else if (!this.activityIndicator && this.snapshot.reasoningDraft) {
			rows.push(colors.muted("작업 계획을 정리하는 중"), "");
		}
		if (this.snapshot.draft) {
			rows.push(...surfaceRows([
				`${semantic.assistantLabel("bori")}  ${semantic.toolRunning("응답 중")}`,
				...this.draftMarkdown.render(contentWidth),
			], contentWidth, semantic.assistantSurface), "");
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
				colors.muted("수신 여부가 불명확하면 /cancel로 서버 상태를 확인합니다."),
			], contentWidth, semantic.assistantSurface), "");
		}
		if (this.activityIndicator) {
			const frame = this.activityIndicator.frames[this.activityFrame % Math.max(1, this.activityIndicator.frames.length)] ?? "·";
			rows.push(`${colors.accent(frame)} ${colors.secondary(this.activityIndicator.message)}`, "");
		}
		return rows;
	}

	private stopActivity(): void {
		if (this.activityTimer) clearInterval(this.activityTimer);
		this.activityTimer = null;
		this.activityFrame = 0;
	}

	private renderStepCard(
		step: SemanticWorkStep,
		contentWidth: number,
		activity?: WorkbenchSnapshot["activities"][number],
		liveActivity?: NonNullable<WorkbenchSnapshot["liveActivity"]>,
	): string[] {
		const key = `${contentWidth}:${step.number}:${step.id}:${step.status}:${step.narration.source}:${step.narration.what}:${activity?.sourceDigest ?? "none"}`;
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
		if (liveActivity) return new WorkStepCard(options).render(contentWidth);
		const rows = new WorkStepCard(options).render(contentWidth);
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
		if (snapshot.tnotes.length === 0) rows.push(colors.muted("  질문 하나가 끝나면 질문·과정의 이유·결과를 자동으로 정리합니다."));
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
