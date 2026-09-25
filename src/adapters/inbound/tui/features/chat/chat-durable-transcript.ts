import { truncateToWidth, visibleWidth, wrapTextWithAnsi }  from "@earendil-works/pi-tui";
import type { WorkbenchSnapshot }                           from "@/core/domain/work/workbench";
import { classifyWorkActivity }                             from "@/core/domain/work";
import type { SemanticWorkStep, WorkStepStatus }            from "@/core/domain/work";
import { boundedPublicProjection }                          from "@/adapters/inbound/tui/features/chat/bounded-public-projection";
import { colors, semantic }                                 from "@/adapters/inbound/tui/foundation/theme/theme";
import { isVisibleWorkStep, ObservationCard, WorkStepCard } from "@/adapters/inbound/tui/features/chat/work-step-card";
import {
	projectWorkbenchDelegationSections,
	renderDelegationSections,
} from "@/adapters/inbound/tui/features/chat/delegation-tree-view";
import { matchingLiveActivity }                             from "@/adapters/inbound/tui/features/chat/chat-live-activity";
import { boundedWorkbenchMarkdown }                         from "@/adapters/inbound/tui/features/chat/chat-message-renderer";
import { publicTimelineActivityRows }                       from "@/adapters/inbound/tui/features/chat/chat-public-lifecycle";

export interface ChatApprovalPresentation {
	readonly render: (snapshot: WorkbenchSnapshot, width: number) => readonly string[];
}

export interface DurableMessagePresentation {
	readonly update      : (snapshot: WorkbenchSnapshot) => void                                   ;
	readonly invalidate  : () => void                                                              ;
	readonly render      : (message: WorkbenchSnapshot["chat"][number], width: number) => string[] ;
	readonly renderDraft : (width: number) => string[]                                             ;
}

const WORKBENCH_STEP_CACHE_LIMIT = 512;

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

function activityOwnerKey(activity: WorkbenchSnapshot["activities"][number]): string {
	const { threadId, turnId, itemId } = activity.nativeRefs;
	return itemId ? `${threadId ?? ""}\0${turnId ?? ""}\0${itemId}` : `activity\0${activity.id}`;
}

function isActivityPayload(value: unknown): value is Readonly<Record<string, unknown>> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundedActivity(activity: WorkbenchSnapshot["activities"][number]): WorkbenchSnapshot["activities"][number] {
	const payload = boundedPublicProjection(activity.payload).value;
	return { ...activity, payload: isActivityPayload(payload) ? payload : {} };
}

/** Assembles durable Chat messages, lifecycle events, execution cards, and notices in journal order. */
export class ChatDurableTranscript {
	private snapshot: WorkbenchSnapshot;
	private readonly stepRows = new Map<string, string[]>();

	constructor(
		snapshot: WorkbenchSnapshot,
		private readonly messages: DurableMessagePresentation,
		private readonly approvalPresentation: ChatApprovalPresentation | null = null,
	) {
		this.snapshot = snapshot;
		this.update(snapshot);
	}

	update(snapshot: WorkbenchSnapshot): void {
		this.snapshot = snapshot;
		this.messages.update(snapshot);
	}

	invalidate(): void {
		this.messages.invalidate();
	}

	render(width: number, activityIndicatorVisible: boolean): string[] {
		const contentWidth       = Math.max(1, width)                                                          ;
		const activities         = this.snapshot.activities                                                    ;
		const activityById       = new Map(activities.map((activity) => [activity.id, activity]))              ;
		const messages           = new Map(this.snapshot.chat.map((message) => [message.activityId, message])) ;
		const projectedSteps     = this.snapshot.workFlow.steps                                                ;
		const stepByLastActivity = new Map<string, SemanticWorkStep>()                                         ;
		const stepByActivity     = new Map<string, SemanticWorkStep>()                                         ;
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
				rows.push(...this.messages.render(message, contentWidth), "");
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
				const live = matchingLiveActivity(this.snapshot.liveActivity, activity);
				rows.push(...this.renderStepCard(step, contentWidth, activity, live), "");
			} else if (observationActivityIds.has(activity.id)) {
				const live = matchingLiveActivity(this.snapshot.liveActivity, activity);
				const projectedActivity = boundedActivity(activity);
				rows.push(
					...new ObservationCard({
						activity: projectedActivity,
						...(live ? { liveActivity: live } : {}),
					}).render(contentWidth),
					...wrapTextWithAnsi(colors.muted(`Source · /source ${activity.id}`), contentWidth),
					"",
				);
			} else if (
				isVisibleWorkStep(activity.kind)
				&& lastVisibleActivityByItem.get(activityOwnerKey(activity)) === activity.id
			) {
				const live              = matchingLiveActivity(this.snapshot.liveActivity, activity) ;
				const projectedActivity = boundedActivity(activity)                                  ;
				const parentStep        = stepByActivity.get(activity.id)                            ;
				rows.push(...new ObservationCard({
					activity: projectedActivity,
					mode: "action",
					...(live ? { liveActivity: live } : {}),
					...(parentStep ? { parentStepNumber: parentStep.number } : {}),
				}).render(contentWidth), ...wrapTextWithAnsi(colors.muted(`Source · /source ${activity.id}`), contentWidth), "");
			}
		}
		// The first outbound message is published before Native thread creation has
		// produced a durable activity. Keep only that optimistic delivery visible until
		// the matching activity takes over; other messages need activity order authority.
		for (const message of this.snapshot.chat) {
			if (renderedMessageIds.has(message.id) || message.role !== "user" || message.status === "completed") continue;
			rows.push(...this.messages.render(message, contentWidth), "");
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
		if (this.snapshot.pendingApproval && this.approvalPresentation) {
			rows.push(...surfaceRows(
				this.approvalPresentation.render(this.snapshot, contentWidth),
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
		const executionRun = this.snapshot.executionRun;
		if (executionRun && ["blocked", "reconciling", "unknown"].includes(executionRun.phase)) {
			const phase = executionRun.phase;
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
		if (!activityIndicatorVisible && this.snapshot.reasoningSummaryDraft) {
			rows.push(...this.snapshot.reasoningSummaryDraft.split(/\r?\n/u)
				.flatMap((line) => wrapTextWithAnsi(`판단 · ${line}`, contentWidth).map(semantic.reasoning)), "");
		} else if (!activityIndicatorVisible && this.snapshot.reasoningDraft) {
			rows.push(semantic.reasoning("분석 · 작업 계획을 정리하는 중"), "");
		}
		if (this.snapshot.draft) {
			rows.push(...transcriptRows([
				`${semantic.assistantLabel("🐙 Wooni")}  ${semantic.toolRunning("응답 중")}`,
				...this.messages.renderDraft(contentWidth),
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
		return rows;
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
		const projectedActivity = activity ? boundedActivity(activity) : undefined;
		const options = {
			stepNumber : step.number,
			status     : commandStatus(step.status),
			narration  : step.narration,
			...(projectedActivity ? { activity: projectedActivity } : {}),
			...(liveActivity ? { liveActivity } : {}),
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

function commandStatus(status: WorkStepStatus): "pending" | "running" | "passed" | "failed" | "cancelled" {
	if (status === "completed") return "passed";
	return status;
}
