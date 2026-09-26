import { stripTerminalSequences, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { Component }                                        from "@earendil-works/pi-tui";

import { sanitizeTerminalTextUnbounded }          from "@/core/domain/execution/terminal";
import type { ObservabilityDashboard }            from "@/core/domain/observability/observability-dashboard";
import type { RuntimeMonitorProjection }          from "@/core/domain/observability/runtime-monitor";
import type { WorkbenchSnapshot }                 from "@/core/domain/work/workbench";
import { runtimeModeLabel, workbenchEffortLabel } from "@/adapters/inbound/tui/foundation/labels";
import { colors }                                 from "@/adapters/inbound/tui/foundation/theme/theme";
import type { WorkspaceTodoLiveContext }          from "@/adapters/inbound/tui/features/dashboard/view/shared-dashboard-views";
import { workbenchModelLabel }                    from "@/adapters/inbound/tui/features/monitoring/view/workbench-telemetry";
import { WORKBENCH_HUD_SYSTEM }                   from "@/adapters/inbound/tui/features/usage/view-model/workbench-hud-system";
import type { UsageStripSession }                 from "@/adapters/inbound/tui/features/usage/view/usage-strip-view";

const WORKBENCH_ACTIVITY_FRAMES            = Object.freeze(["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]) ;
const WORKBENCH_ACTIVITY_INTERVAL_MS       = 240                                                               ;
const WORKBENCH_ACTIVITY_MESSAGE_MAX_CHARS = 72                                                                ;
const WORKBENCH_TOOL_STALL_MS              = 3 * 60 * 1_000                                                    ;

interface WorkbenchActivityIndicatorSource {
	readonly phase                  : string                                                                                          ;
	readonly activeTurnId?          : string | null                                                                                   ;
	readonly pendingApproval        : unknown                                                                                         ;
	readonly activities?            : readonly Pick<WorkbenchSnapshot["activities"][number], "recordedAt" | "phase" | "nativeRefs">[] ;
	readonly chatQueue?             : readonly unknown[]                                                                              ;
	readonly draft                  : string                                                                                          ;
	readonly reasoningDraft         : string                                                                                          ;
	readonly reasoningSummaryDraft? : string                                                                                          ;
	readonly liveActivity?: {
		readonly method      : string                                                                             ;
		readonly kind        : "tool" | "progress" | "file-change" | "approval"                                   ;
		readonly text?       : string                                                                             ;
		readonly nativeRefs? : { readonly threadId?: string; readonly turnId?: string; readonly itemId?: string } ;
	} | null;
	readonly chat: readonly { readonly role: string; readonly content: string; readonly status?: string }[];
	readonly workFlow: {
		readonly currentStepNumber: number | null;
		readonly steps: readonly {
			readonly number: number;
			readonly title: string;
		}[];
	};
}

export interface WorkbenchActivityIndicator {
	readonly message    : string            ;
	readonly hint       : string            ;
	readonly frames     : readonly string[] ;
	readonly intervalMs : number            ;
}

export function projectUsageStripSession(snapshot: WorkbenchSnapshot): UsageStripSession {
	const activeModel = snapshot.activeModel ?? snapshot.model;
	return {
		models: snapshot.sessionUsage?.models ?? [],
		...(activeModel ? { activeModel } : {}),
		...(snapshot.effort === undefined ? {} : { effort: snapshot.effort }),
		...(snapshot.contextUsage === undefined ? {} : { contextUsage: snapshot.contextUsage }),
		...(snapshot.collaborationMode === undefined ? {} : { collaborationMode: snapshot.collaborationMode }),
		...(snapshot.permissionMode === undefined ? {} : { permissionMode: snapshot.permissionMode }),
		...(snapshot.hud?.showUsage === undefined ? {} : { showUsage: snapshot.hud.showUsage }),
		...(snapshot.hud?.showContext === undefined ? {} : { showContext: snapshot.hud.showContext }),
	};
}

export function projectTodoLiveContext(snapshot: WorkbenchSnapshot): WorkspaceTodoLiveContext {
	return {
		activeTurnId    : snapshot.activeTurnId,
		activities      : snapshot.activities,
		workFlow        : snapshot.workFlow,
		hasConversation : snapshot.chat.length > 0 || snapshot.activities.length > 0 || snapshot.actionResult !== null,
		goal            : snapshot.sessionGoal?.text ?? null,
		...(snapshot.todoSync === undefined ? {} : { sync: snapshot.todoSync }),
	};
}

/** The active Native model belongs to the composer it drives, not the quota HUD. */
export function composerModelHeader(source: Pick<WorkbenchSnapshot, "model" | "activeModel" | "effort">, width: number): string {
	const label     = `${workbenchModelLabel(source.activeModel ?? source.model)}${source.effort ? ` · ${workbenchEffortLabel(source.effort)}` : ""}`        ;
	const prefix    = `${WORKBENCH_HUD_SYSTEM.composer.leftCap} `                                                                                            ;
	const suffix    = " "                                                                                                                                    ;
	const available = Math.max(0, width - visibleWidth(prefix) - visibleWidth(suffix))                                                                       ;
	const content   = truncateToWidth(label, available, "")                                                                                                  ;
	const rule      = WORKBENCH_HUD_SYSTEM.composer.divider.repeat(Math.max(0, width - visibleWidth(prefix) - visibleWidth(content) - visibleWidth(suffix))) ;
	return truncateToWidth(`${colors.accent(prefix + content)}${colors.border(suffix + rule)}`, Math.max(0, width), "");
}

/** Adds the model label to the input edge while preserving the child focus owner. */
export class ComposerModelFrame implements Component {
	constructor(
		private readonly child: Component,
		private readonly snapshot: () => Pick<WorkbenchSnapshot, "model" | "activeModel" | "effort">,
	) {}

	invalidate(): void { this.child.invalidate(); }

	render(width: number): string[] {
		if (width <= 0) return [];
		const rows = this.child.render(width);
		if (rows[0] && /^─+$/u.test(stripTerminalSequences(rows[0]))) {
			rows[0] = colors.muted(composerModelHeader(this.snapshot(), width));
		}
		return rows;
	}
}

export function emptyObservabilityDashboard(): ObservabilityDashboard {
	return Object.freeze({
		coverage       : Object.freeze({
			state          : "unknown",
			observedFrom   : null,
			observedUntil  : null,
			streamsRead    : 0,
			skippedStreams : 0,
		}),
		sessions       : Object.freeze({
			active    : null,
			completed : null,
			failures  : null,
		}),
		usage          : Object.freeze({
			totalTokens : null,
			models      : Object.freeze([]),
		}),
		health         : Object.freeze({
			completionPercent : null,
			retries           : null,
			failures          : null,
		}),
		trend          : Object.freeze({
			available : false,
			buckets   : Object.freeze([]),
		}),
		attention      : Object.freeze([]),
		recentSessions : Object.freeze([]),
	});
}

export function unavailableHistoricalMonitor(): RuntimeMonitorProjection {
	return Object.freeze({
		state             : "idle",
		activeRequest     : null,
		model             : null,
		agent             : null,
		currentTool       : null,
		approval          : null,
		retryCount        : 0,
		failureCount      : 0,
		sourceActivityIds : Object.freeze([]),
		recentEvents      : Object.freeze([]),
		skillRun          : null,
	});
}

export function workbenchFrameTitle(source: Pick<WorkbenchSnapshot,
	"projectId" | "model" | "activeModel" | "effort" | "phase" | "collaborationMode" | "permissionMode" | "chatQueue" | "pendingApproval"
>): string {
	return `🐙 WWW · ${source.projectId} · ${workbenchModelLabel(source.activeModel ?? source.model)} · ${workbenchEffortLabel(source.effort)} · ${source.phase} · ${runtimeModeLabel(source.permissionMode, source.collaborationMode)}${source.pendingApproval ? " · 승인 대기" : ""}`;
}

/** Gajae-style live rail driven only by public Native workbench state. */
export function workbenchActivityIndicator(source: WorkbenchActivityIndicatorSource, now = Date.now()): WorkbenchActivityIndicator | null {
	const outboundPending = [...source.chat].reverse().find((message) => message.role === "user")?.status === "streaming";
	if (source.phase !== "working" && !outboundPending) return null;
	const queueDepth = source.chatQueue?.length ?? 0;
	const reasoningSummary = boundedActivityText(source.reasoningSummaryDraft);
	const currentStep = source.workFlow.currentStepNumber === null
		? undefined
		: source.workFlow.steps.find((step) => step.number === source.workFlow.currentStepNumber);
	const currentStepTitle = boundedActivityText(currentStep?.title) ;
	const liveActivity     = liveActivityLabel(source.liveActivity)  ;
	const liveRefs         = source.liveActivity?.nativeRefs         ;
	let liveStartedAt: string | undefined                            ;
	if (source.liveActivity?.kind === "tool" && liveRefs && liveRefs.turnId === source.activeTurnId) {
		liveStartedAt = [...(source.activities ?? [])].reverse().find((activity) =>
			activity.phase === "started"
			&& activity.nativeRefs.threadId === liveRefs.threadId
			&& activity.nativeRefs.turnId === liveRefs.turnId
			&& activity.nativeRefs.itemId === liveRefs.itemId)?.recordedAt;
	}
	const toolObservationStalled = Boolean(liveStartedAt
		&& Number.isFinite(Date.parse(liveStartedAt))
		&& now - Date.parse(liveStartedAt) >= WORKBENCH_TOOL_STALL_MS);
	const stepLabel = currentStep && currentStepTitle
		? `단계 ${source.workFlow.currentStepNumber}/${source.workFlow.steps.length} · ${currentStepTitle}`
		: null;
	let label: string;
	if (source.pendingApproval) {
		label = queueDepth > 0
			? `승인 대기 · 현재 턴 일시중지 · 대기 메시지 ${queueDepth}개는 승인 후 전송`
			: "승인 대기 · 현재 턴 일시중지";
	} else if (toolObservationStalled) {
		label = "관측 단절 가능 · Tool 결과를 3분 이상 받지 못했습니다";
	} else if (outboundPending) {
		label = "전송 · 요청을 Native Thread에 전달하는 중";
	} else if (source.draft) {
		label = "응답 · 결과를 작성하는 중";
	} else if (stepLabel && liveActivity) {
		label = `${stepLabel} · ${liveActivity}`;
	} else if (liveActivity) {
		label = `실행 · ${liveActivity}${reasoningSummary ? ` · 판단 · ${reasoningSummary}` : ""}`;
	} else if (stepLabel) {
		label = `${stepLabel}${reasoningSummary ? ` · 판단 · ${reasoningSummary}` : ""}`;
	} else if (reasoningSummary) {
		label = `분석 · ${reasoningSummary}`;
	} else if (source.workFlow.steps.length > 0) {
		label = `마무리 · ${source.workFlow.steps.length}개 단계 결과를 정리하는 중`;
	} else {
		label = "분석 · 실행 순서를 정리하는 중";
	}
	return Object.freeze({
		message    : label,
		hint       : "",
		frames     : source.pendingApproval ? Object.freeze(["⏸"]) : WORKBENCH_ACTIVITY_FRAMES,
		intervalMs : source.pendingApproval ? 1_000 : WORKBENCH_ACTIVITY_INTERVAL_MS,
	});
}

function liveActivityLabel(activity: WorkbenchActivityIndicatorSource["liveActivity"]): string | null {
	if (!activity) return null;
	const method = activity.method.replace(/[-_]/gu, "").toLowerCase();
	const detail = boundedActivityText(activity.text);
	if (activity.kind === "file-change" || method.includes("filechange")) return detail ? `Edit · ${detail}` : "Edit 변경을 반영하는 중";
	if (activity.kind === "approval" || method.includes("approval")) return detail ? `승인 · ${detail}` : "승인 결과를 기다리는 중";
	if (activity.kind === "tool" && /command|bash|shell/u.test(method)) return detail ? `Bash · ${detail}` : "Bash 명령 결과를 확인하는 중";
	if (activity.kind === "tool") return detail ? `Tool · ${detail}` : "Tool 실행 결과를 확인하는 중";
	return detail ?? "현재 작업 상태를 확인하는 중";
}

function boundedActivityText(value: string | undefined): string | null {
	const text = sanitizeTerminalTextUnbounded(value ?? "")
		.replace(/\s*⟦\s*esc\s*⟧\s*/giu, " ")
		.replace(/\s+/gu, " ")
		.trim();
	if (!text) return null;
	const characters = Array.from(text);
	return characters.length <= WORKBENCH_ACTIVITY_MESSAGE_MAX_CHARS
		? text
		: `${characters.slice(0, WORKBENCH_ACTIVITY_MESSAGE_MAX_CHARS - 1).join("")}…`;
}
