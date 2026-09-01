import {
	Markdown,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
	type Component,
} from "@earendil-works/pi-tui";
import type { NativeApprovalRequest } from "../../domain/native-session";
import { sanitizeTerminalTextExcerpt } from "../../domain/terminal";
import { workbenchApprovalDecisions, type WorkbenchActionResult, type WorkbenchSnapshot } from "../../domain/workbench";
import { classifyWorkActivity, type SemanticWorkStep, type WorkStepStatus } from "../../domain/work-steps";
import { boundedPublicProjection, PUBLIC_SOURCE_OMISSION } from "./bounded-public-projection";
import { colors, markdownTheme, semantic, syntaxHighlightPlugin } from "./theme";
import { WorkbenchWelcomeView } from "./workbench-welcome";
import { isVisibleWorkStep, ObservationCard, WorkStepCard } from "./work-step-card";

const WORKBENCH_MARKDOWN_MAX_CHARS = 16 * 1024;
const WORKBENCH_MARKDOWN_MAX_LINES = 120;
const WORKBENCH_MARKDOWN_OMISSION = "… 응답 일부 생략 …";
const WORKBENCH_ACTIVITY_WINDOW = 80;
const WORKBENCH_ACTION_MAX_CHARS = 12 * 1024;
const WORKBENCH_ACTION_MAX_LINES = 80;
const WORKBENCH_ACTION_OMISSION = "… ACTION 일부 생략 …";
const WORKBENCH_APPROVAL_DETAIL_MAX_CHARS = 200;

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

function boundedActionResultBody(text: string): string[] {
	const sanitized = sanitizeTerminalTextExcerpt(text, WORKBENCH_ACTION_MAX_CHARS, "head-tail");
	const lines = sanitized.split(/\r?\n/u);
	if (lines.length <= WORKBENCH_ACTION_MAX_LINES) return lines;
	const headCount = Math.floor((WORKBENCH_ACTION_MAX_LINES - 1) / 2);
	const tailCount = WORKBENCH_ACTION_MAX_LINES - headCount - 1;
	return [
		...lines.slice(0, headCount),
		WORKBENCH_ACTION_OMISSION,
		...lines.slice(-tailCount),
	];
}

function boundedActionResultRows(lines: readonly string[], width: number): string[] {
	const wrapped = lines.flatMap((line) => wrapTextWithAnsi(line || " ", Math.max(1, width)));
	if (wrapped.length <= WORKBENCH_ACTION_MAX_LINES) return wrapped;
	const headCount = Math.floor((WORKBENCH_ACTION_MAX_LINES - 1) / 2);
	const tailCount = WORKBENCH_ACTION_MAX_LINES - headCount - 1;
	return [
		...wrapped.slice(0, headCount),
		colors.muted(WORKBENCH_ACTION_OMISSION),
		...wrapped.slice(-tailCount),
	];
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

function approvalCardRows(request: NativeApprovalRequest, queueDepth: number, width: number): string[] {
	const command = approvalParamText(request, "command");
	const reason = approvalParamText(request, "reason");
	const cwd = approvalParamText(request, "cwd");
	const logicalRows = [
		colors.warning(`승인 필요 · ${approvalKindLabel(request.kind)}`),
		`${colors.accent(approvalDetailLabel(request))} · ${command ?? approvalFallback(request)}`,
		`${colors.accent("이유")} · ${reason ?? approvalFallback(request)}`,
		...(cwd ? [`${colors.accent("경로")} · ${cwd}`] : []),
		colors.muted(approvalInstruction(request)),
		...(queueDepth > 0 ? [colors.muted(`대기 메시지 ${queueDepth}개`)] : []),
	];
	return logicalRows.flatMap(row => wrapTextWithAnsi(row, Math.max(1, width)));
}

/** Chat projection for the native ProjectWorkbench, including existing tool cards. */
export class WorkbenchChatView implements Component {
	private snapshot: WorkbenchSnapshot;
	private readonly welcome = new WorkbenchWelcomeView();
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
		for (const message of snapshot.chat.slice(-WORKBENCH_ACTIVITY_WINDOW)) {
			if (message.role !== "assistant") continue;
			visibleAssistantIds.add(message.id);
			if (this.markdownInput.get(message.id) === message.content) continue;
			const content = boundedWorkbenchMarkdown(message.content);
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

	dispose(): void {
		this.welcome.dispose();
	}

	render(width: number): string[] {
		const contentWidth = Math.max(1, width);
		if (!hasVisibleChatContent(this.snapshot)) return this.welcome.render(contentWidth);
		const activities = this.snapshot.activities.slice(-WORKBENCH_ACTIVITY_WINDOW);
		const omittedActivityCount = Math.max(0, (this.snapshot.activityCount ?? this.snapshot.activities.length) - activities.length);
		const messages = new Map(this.snapshot.chat.slice(-WORKBENCH_ACTIVITY_WINDOW).map((message) => [message.activityId, message]));
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
		const rows: string[] = [];
		if (omittedActivityCount > 0) rows.push(colors.muted(`… 이전 활동 ${omittedActivityCount}개 생략 · 최근 ${activities.length}개 표시 …`), "");
		for (const activity of activities) {
			const message = messages.get(activity.id);
			if (message) {
				if (message.role === "user") {
					const label = message.status === "failed" ? semantic.toolFailed("전송 실패")
						: message.status === "cancelled" ? semantic.toolCancelled("전송 중단")
							: message.status === "streaming" ? semantic.toolRunning("전송 중") : "";
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
						...(this.markdown.get(message.id)?.render(contentWidth) ?? [boundedWorkbenchMarkdown(message.content)]),
					], contentWidth, semantic.assistantSurface), "");
				}
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
				approvalCardRows(this.snapshot.pendingApproval, this.snapshot.chatQueue.length, contentWidth),
				contentWidth,
				semantic.assistantSurface,
			), "");
		}
		if (this.snapshot.reasoningDraft) {
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
		return rows;
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
		if (this.stepRows.size > WORKBENCH_ACTIVITY_WINDOW * 2) this.stepRows.clear();
		return rows;
	}
}

function hasVisibleChatContent(snapshot: WorkbenchSnapshot): boolean {
	return snapshot.chat.length > 0
		|| snapshot.workFlow.steps.length > 0
		|| Boolean(snapshot.pendingApproval || snapshot.reasoningDraft || snapshot.draft || snapshot.error)
		|| Boolean(snapshot.liveActivity && isVisibleWorkStep(snapshot.liveActivity.kind));
}

/** Completed session summaries and the selected activity's highlighted source payload. */
export class TNotesSourceView implements Component {
	private sourceCache: { key: string; rows: readonly string[] } | null = null;

	constructor(private readonly getSnapshot: () => WorkbenchSnapshot) {}
	invalidate(): void { this.sourceCache = null; }
	render(width: number): string[] {
		const snapshot = this.getSnapshot();
		const actionResult = workbenchActionResult(snapshot);
		const rows: string[] = [];
		if (snapshot.tnotes.length > 0) rows.push(colors.secondary(`SESSION SUMMARY ${snapshot.tnotes.length}`));
		if (snapshot.tnotes.length === 0) rows.push(colors.muted("  충분한 작업이 완료되면 세션 요약을 자동으로 정리합니다."));
		for (const note of snapshot.tnotes.slice(-6)) {
			rows.push(colors.highlight(`  ${note.title} · ${note.id}`));
			rows.push(...wrapTextWithAnsi(`    ${note.summary}`, Math.max(1, width)));
			rows.push(colors.muted(`    세션 활동 ${note.sourceActivityIds.length}개`));
		}
		if (actionResult) {
			rows.push("", colors.warm(`ACTION · ${actionResult.kind} · ${actionResult.title}`));
			if (actionResult.digest) rows.push(colors.muted(`  digest ${actionResult.digest}`));
			rows.push(...boundedActionResultRows(boundedActionResultBody(actionResult.body), width));
		}
		const selected = snapshot.activities.find((activity) => activity.id === snapshot.selectedActivityId);
		if (!selected) return rows;
		rows.push("", colors.warm(`SOURCE · #${selected.sequence} ${selected.kind}/${selected.phase}`));
		const sourceKey = `${selected.id}:${selected.sourceDigest}:${width}`;
		if (this.sourceCache?.key === sourceKey) {
			rows.push(...this.sourceCache.rows);
			return rows;
		}
		const projection = boundedPublicProjection(selected.payload);
		const source = JSON.stringify({
			activityId: selected.id,
			sequence: selected.sequence,
			kind: selected.kind,
			phase: selected.phase,
			provider: selected.provider,
			payload: projection.value,
		}, null, 2);
		const highlighted = syntaxHighlightPlugin.highlight(source, "json");
		const sourceRows: string[] = [];
		for (const line of highlighted.slice(0, 80)) {
			sourceRows.push(...wrapTextWithAnsi(line, Math.max(1, width)));
		}
		if (projection.omitted || highlighted.length > 80) sourceRows.push(colors.muted(PUBLIC_SOURCE_OMISSION));
		this.sourceCache = { key: sourceKey, rows: Object.freeze(sourceRows) };
		rows.push(...sourceRows);
		return rows;
	}
}

function workbenchActionResult(snapshot: WorkbenchSnapshot): WorkbenchActionResult | null {
	return snapshot.actionResult;
}

function commandStatus(status: WorkStepStatus): "pending" | "running" | "passed" | "failed" | "cancelled" {
	if (status === "completed") return "passed";
	return status;
}
