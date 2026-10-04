import      {
              Markdown                           ,
              truncateToWidth                    ,
              visibleWidth                       ,
                                                   } from "@earendil-works/pi-tui"                                                    ;
import type {
              Component                          ,
              ScrollRowSource                    ,
                                                   } from "@earendil-works/pi-tui"                                                    ;
import type { ChatFeatureProjection                } from "@/core/application/orchestration/workbench-feature-reads"                  ;
import type { ProjectActivity                      } from "@/core/domain/execution/project-activity"                                  ;
import type { OutputLanguage                       } from "@/core/domain/execution/output-language"                                   ;
import      {
              parseRequestCheckpointReport       ,
              parseRequestStageReport            ,
                                                   } from "@/core/domain/execution/request-runtime"                                   ;
import type {
              WorkbenchChatMessage               ,
              WorkbenchTNote                     ,
                                                   } from "@/core/domain/work/workbench"                                              ;
import      {
              sanitizeCompletedAssistantResponse ,
              sanitizePartialAssistantResponse   ,
                                                   } from "@/core/domain/review/redaction"                                            ;
import      { boundedPublicProjection              } from "@/adapters/inbound/tui/features/chat/view-model/bounded-public-projection" ;
import      { conversationRecapRows                } from "@/adapters/inbound/tui/features/chat/view/conversation-recap-view"         ;
import      {
              a                                  ,
              wwwMarkdownTheme                   ,
              wwwTitle                           ,
              duration                           ,
              fit                                ,
              mark                               ,
              oneLine                            ,
              pair                               ,
              prose                              ,
              safe                               ,
              section                            ,
                                                   } from "@/adapters/inbound/tui/foundation/theme/www-theme"                         ;
import      {
              parseCanonicalTNoteReport          ,
              parseLegacyCanonicalTNote          ,
                                                   } from "@/core/application/work/t-note-service"                                    ;
import      { WorkbenchWelcomeView                 } from "@/adapters/inbound/tui/features/chat/view/workbench-welcome"               ;
import      { semantic                             } from "@/adapters/inbound/tui/foundation/theme/theme"                             ;
import      { CHAT_TERMINAL_OUTPUT_CHUNK_LINES     } from "@/adapters/inbound/tui/features/chat/view/chat-output-policy"              ;
import      { CHAT_DIFF_PREVIEW_ROWS               } from "@/adapters/inbound/tui/features/chat/view/chat-output-policy"              ;
import      { projectFileChanges                   } from "@/adapters/inbound/tui/features/chat/view-model/file-change"               ;
import      { getActiveTuiTheme                    } from "@/adapters/inbound/tui/foundation/theme/theme"                             ;
import      { renderUnifiedDiff                    } from "@/adapters/inbound/tui/foundation/rendering/unified-diff-view"             ;
import      { WwwTranscriptCache                   } from "@/adapters/inbound/tui/features/chat/view/www-transcript-cache"            ;
import type {
              WwwTranscriptCacheInput            ,
              WwwTranscriptCacheMetrics          ,
              TranscriptBlock                    ,
                                                   } from "@/adapters/inbound/tui/features/chat/view/www-transcript-cache"            ;
import      { asRecord                             } from "@/core/domain/value/record.js"                                             ;

export type { WwwTranscriptCacheMetrics } from "@/adapters/inbound/tui/features/chat/view/www-transcript-cache";

const tnoteMarkdownTheme = {
	...wwwMarkdownTheme,
	heading: a.strong,
};

const TRANSCRIPT_ICON = {
	edit     : "✎",
	terminal : "▣",
} as const;

export function wwwConversationLabels(messages: readonly WorkbenchChatMessage[]): ReadonlyMap<string, string> {
	const labels = new Map<string, string>() ;
	let request  = 0                         ;
	let response = 0                         ;
	for (const message of messages) {
		if (message.role === "user") {
			request += 1;
			response = 0;
			labels.set(message.id, `INPUT ${request}`);
		} else if (message.role === "assistant") {
			response += 1;
			labels.set(message.id, `OUTPUT ${Math.max(1, request)}-${response}`);
		} else labels.set(message.id, "Notice");
	}
	return labels;
}

export function executionHeading(s: ChatFeatureProjection, language: OutputLanguage = "ko"): { state: string; title: string; detail: string; attention: boolean } {
	const label       = (ko: string, en: string): string => language === "en" ? en : ko ;
	const lastRequest = [...s.chat].reverse().find(m => m.role === "user")              ;
	const current     = s.workFlow.steps.find(step => step.status === "running")        ;
	const receipt     = s.executionRun?.receipt                                         ;
	if (s.pendingApproval) return {
		state     : label("승인 대기", "Awaiting approval"),
		title     : label("진행하려면 결정이 필요합니다", "A decision is needed to continue"),
		detail    : oneLine(s.pendingApproval.params.reason || s.pendingApproval.params.command || s.pendingApproval.kind),
		attention : true,
	};
	if (s.deliveryUncertain) return {
		state     : label("수신 미확인", "Delivery uncertain"),
		title     : label("요청 수신 여부를 확인해야 합니다", "Check whether the request was received"),
		detail    : label("/cancel로 서버 상태 확인 · 자동 재전송하지 않음", "Use /cancel to check server state · no automatic retry"),
		attention : true,
	};
	if (s.error || s.phase === "error") return {
		state     : label("오류", "Error"),
		title     : oneLine(s.error || label("실행 오류", "Execution error")),
		detail    : label("기록을 확인하고 다음 요청을 입력하세요", "Review the record before sending another request"),
		attention : true,
	};
	if (s.phase === "loading") return {
		state     : label("연결 중", "Connecting"),
		title     : label("프로젝트 실행 환경을 여는 중", "Opening the project runtime"),
		detail    : label("Native session 연결", "Connecting native session"),
		attention : false,
	};
	const turnId  = s.activeTurnId ?? s.workFlow.source?.turnId                                                                ;
	const request = turnId ? [...(s.requestRuntime ?? [])].reverse().find(r => r.turnId === turnId) : s.requestRuntime?.at(-1) ;
	if (request) {
		const checkpoint = request.checkpoints?.find(item => item.status === "running" || item.status === "failed");
		return {
			state     : checkpoint ? `${checkpoint.id} · ${checkpoint.status}` : request.status,
			title     : oneLine(request.objective),
			detail    : request.protocolVersion >= 3 ? "" : label("요청 상태 관측 중", "Observing request status"),
			attention : ["failed", "blocked"].includes(request.status),
		};
	}
	if (s.phase === "working") {
		const phase   = s.executionRun?.phase                                                  ;
		const waiting = ["waiting", "blocked", "reconciling", "unknown"].includes(phase ?? "") ;
		return {
			state     : waiting ? label("대기", "Waiting") : s.draft ? label("결과 작성", "Writing result") : label("실행 중", "Running"),
			title     : oneLine(current?.title || lastRequest?.content || s.sessionGoal?.text || label("요청을 확인하는 중", "Reviewing the request")),
			detail    : waiting ? label("Native 상태 대기 중", "Waiting for Native state") : label("Native 활동 관측 중", "Observing Native activity"),
			attention : waiting,
		};
	}
	const status      = receipt?.status                                                                                              ;
	const blocking    = receipt?.remaining.filter(item => item.blocking).length ?? 0                                                 ;
	const needsReview = Boolean(blocking || s.performance?.verification === "failed" || s.performance?.verification === "uncertain") ;
	return {
		state: status === "failed" ? label("실패", "Failed") : status === "interrupted" || status === "cancelled" ? label("중단됨", "Interrupted") : status === "completed" ? needsReview ? label("검토 필요", "Review needed") : label("실행 종료", "Completed") : s.chat.length ? label("대기", "Waiting") : label("준비", "Ready"),
		title: oneLine(receipt?.objective || lastRequest?.content || s.sessionGoal?.text || label("어떤 작업을 실행할까요?", "What would you like to do?")),
		detail: status
			? `${label("실행", "Execution")} ${status}  /  ${verificationLabel(s.performance, language)}${blocking ? ` / ${label(`필수 잔여 ${blocking}개`, `${blocking} required remaining`)}` : ""}`
			: s.threadId ? label("세션 연결됨 · 다음 요청을 입력하세요", "Session connected · enter the next request") : label("요청을 입력하면 Native 실행이 시작됩니다", "Enter a request to start native execution"),
		attention: status === "failed" || needsReview,
	};
}
export function wwwExecutionIsLive(s: ChatFeatureProjection): boolean {
	return (s.phase === "loading" || s.phase === "working") && !s.pendingApproval && !s.deliveryUncertain && !s.error
		&& !["waiting", "blocked", "reconciling", "unknown"].includes(s.executionRun?.phase ?? "");
}

export function wwwNowLabel(s: ChatFeatureProjection): string | null {
	if (s.pendingApproval) return "사용자 확인을 기다리는 중";
	if (s.phase !== "working") return null;
	const turnId = s.activeTurnId ?? s.workFlow.source?.turnId                                                                                       ;
	const latest = [...(s.planActivities ?? [])].filter(item => item.turnId === turnId).sort((left, right) => left.sequence - right.sequence).at(-1) ;
	if (latest) return oneLine(latest.summary);
	if (s.draft) return "최종 응답 작성 중";
	return null;
}

export function wwwTNoteMarkdown(item: WorkbenchTNote): string {
	const report = parseCanonicalTNoteReport(item.summary)                                 ;
	const legacy = parseLegacyCanonicalTNote(item.summary)                                 ;
	const title  = oneLine(report?.title || legacy?.question || item.title || "업무 보고") ;
	if (report) return [
		`## ${title}`,
		`## Report\n\n### 요청 목적·접근\n\n${safe(report.purposeAndApproach, 4000)}\n\n### 주요 작업\n\n${safe(report.keyWork, 4000)}\n\n### 장시간·차단 작업\n\n${safe(report.delaysAndBlocks, 4000)}\n\n### 잘된 점\n\n${safe(report.strengths, 4000)}\n\n### 모델·토큰\n\n${safe(report.modelAndTokens, 4000)}${narratorMarkdown(item)}\n\n### 업무 자체평가\n\n${safe(report.selfAssessment, 4000)}\n\n### 다음 유사 요청\n\n${safe(report.nextApproach, 4000)}\n\n### 변경 상태\n\n${safe(report.changeStatus, 4000)}\n\n### Commit·Evidence\n\n${safe(report.commitAndEvidence, 4000)}\n\n### Test\n\n${safe(report.test || "테스트 실행 관측 없음", 4000)}`,
	].join("\n\n");
	if (legacy) return `## ${title}\n\n## 원인\n\n${safe(legacy.why, 4000)}\n\n## 결과\n\n${safe(legacy.result, 4000)}`;
	return `## ${title}\n\n${safe(item.summary, 8000)}`;
}

type DurableTranscriptRevision = Pick<ChatFeatureProjection, "projectId" | "threadId" | "journalSequence" | "activities" | "chat" | "tnotes" | "draft" | "draftAnchorSequence">;

interface VolatileTranscriptRevision {
	readonly durableEmpty              : boolean                                            ;
	readonly draftLabel                : string | null                                      ;
	readonly snapshot                  : ChatFeatureProjection | null                       ;
	readonly draft                     : ChatFeatureProjection["draft"]                     ;
	readonly reasoningSummaryDraft     : ChatFeatureProjection["reasoningSummaryDraft"]     ;
	readonly actionResult              : ChatFeatureProjection["actionResult"]              ;
	readonly error                     : ChatFeatureProjection["error"]                     ;
	readonly developmentRecordingError : ChatFeatureProjection["developmentRecordingError"] ;
	readonly linearDashboard           : ChatFeatureProjection["linearDashboard"]           ;
	readonly requestRuntime            : ChatFeatureProjection["requestRuntime"]            ;
	readonly activeTurnId              : ChatFeatureProjection["activeTurnId"]              ;
}

type ChatMessage = WorkbenchChatMessage;
type TNote = WorkbenchTNote;

interface DurableTimelineIndex {
	readonly messageByActivity : ReadonlyMap<string, ChatMessage>      ;
	readonly notesByAnchor     : ReadonlyMap<string, readonly TNote[]> ;
	readonly toolByIdentity    : ReadonlyMap<string, ProjectActivity>  ;
	readonly unanchoredNotes   : readonly TNote[]                      ;
}

/** Weak proof cache only: it cannot retain a historical payload or authorize a mutable value. */
const deeplyImmutablePlainData = new WeakSet<object>();

export function hasVisibleWwwContent(snapshot: ChatFeatureProjection): boolean {
	return snapshot.actionResult?.kind === "workflow" || snapshot.chat.length > 0
		|| snapshot.workFlow.steps.length > 0
		|| Boolean(snapshot.pendingApproval || snapshot.executionRun?.receipt || snapshot.executionRun?.phase === "waiting"
			|| snapshot.reasoningSummaryDraft || snapshot.reasoningDraft || snapshot.draft || snapshot.error);
}

/** Public transcript and tool timeline. Product welcome and raw reasoning stay outside the durable timeline. */
export class WwwTranscriptView implements Component {
	private readonly welcome: WorkbenchWelcomeView                                                            ;
	private readonly cache  = new WwwTranscriptCache<DurableTranscriptRevision, VolatileTranscriptRevision>() ;
	private welcomeVisible  = false                                                                           ;
	private markdown        = new Map<string, { text: string; view: Markdown }>()                             ;
	private snapshotVersion = 0                                                                               ;
	private renderedTheme   = getActiveTuiTheme()                                                             ;
	public expanded         = false                                                                           ;
	constructor(private snapshot: ChatFeatureProjection, private readonly language: () => OutputLanguage = () => "ko") {
		this.welcome = new WorkbenchWelcomeView(language);
	}
	update(snapshot: ChatFeatureProjection): void {
		if (hasVisibleWwwContent(snapshot)) {
			this.welcome.dispose();
			this.welcomeVisible = false;
		}
		this.snapshot = snapshot;
		this.snapshotVersion += 1;
	}
	invalidate(): void {
		this.cache.invalidate();
		for (const entry of this.markdown.values()) entry.view.invalidate();
	}
	// The common shell owns lifecycle ticks. Www's pinned execution heading owns activity.
	syncActivity(_indicator: unknown, _requestRender: () => void): void {}
	playWelcomeIntro(requestRender: () => void): void {
		if (hasVisibleWwwContent(this.snapshot)) return;
		this.welcomeVisible = true;
		this.welcome.playIntro(() => {
			// The empty welcome block is the only live row source here. Drop its
			// cached frame on each animation tick without changing durable cache rules.
			this.invalidate();
			requestRender();
		});
		this.invalidate();
	}
	dispose(): void { this.welcome.dispose(); this.welcomeVisible = false; this.invalidate(); this.markdown.clear(); }
	cacheMetrics(): WwwTranscriptCacheMetrics {
		return { ...this.cache.metrics(), markdownEntries: this.markdown.size };
	}
	private md(key: string, text: string, width: number, ink = a.text): string[] {
		let entry = this.markdown.get(key);
		if (!entry) { entry = { text, view: new Markdown(text, 0, 0, key.startsWith("tnote:") ? tnoteMarkdownTheme : wwwMarkdownTheme) }; this.markdown.set(key, entry); }
		else if (entry.text !== text) { entry.text = text; entry.view.setText(text); }
		const rows = entry.view.render(width).map(row => ink(row));
		// The bounded block LRU below is the sole rendered-row owner. Markdown's
		// own last-width cache would otherwise retain one full row set per message.
		entry.view.invalidate();
		return rows;
	}
	private durableBlocks(s: ChatFeatureProjection): TranscriptBlock[] {
		const blocks      : TranscriptBlock[] = []                            ;
		const labels                          = wwwConversationLabels(s.chat) ;
		const timeline                        = durableTimelineIndex(s)       ;
		const rendered                        = new Set<string>()             ;
		let toolGroup     : ProjectActivity[] = []                            ;
		let toolPurpose   : string | null     = null                          ;
		let purposeTurnId : string | undefined                                ;
		let draftInserted                     = false                         ;
		const appendDraft = () => {
			if (draftInserted || !s.draft) return;
			flushTools();
			this.appendDraftBlock(blocks, s, labels);
			draftInserted = true;
		};
		const flushTools = () => {
			if (toolGroup.length === 0) return;
			if (toolGroup.length < 2 && !toolPurpose) {
				this.appendToolGroupBlock(blocks, toolGroup, null);
			}
			else {
				this.appendToolGroupBlock(blocks, toolGroup, toolPurpose);
			}
			if (this.expanded) for (const tool of toolGroup) this.appendActivityBlock(blocks, tool);
			toolGroup = [];
		};
		for (const activity of s.activities) {
			if (s.draftAnchorSequence !== undefined && s.draftAnchorSequence !== null && activity.sequence > s.draftAnchorSequence) appendDraft();
			const message       = timeline.messageByActivity.get(activity.id)                          ;
			const runtimeReport = this.runtimeSummary(s, activity)                                     ;
			const visibleTool   = timeline.toolByIdentity.get(activityIdentity(activity)) === activity ;
			if (visibleTool && activity.kind === "tool") {
				if (purposeTurnId !== activity.nativeRefs.turnId) toolPurpose = null;
				if (toolGroup.length > 0 && toolGroup[0]!.nativeRefs.turnId !== activity.nativeRefs.turnId) {
					flushTools();
					toolPurpose = null;
				}
				toolGroup.push(activity);
			}
			else {
				if (runtimeReport) toolPurpose = runtimeReport.summary;
				if (runtimeReport || message || visibleTool) flushTools();
				if (message && !runtimeReport) {
					this.appendMessageBlock(blocks, rendered, labels, message);
					toolPurpose = null;
					purposeTurnId = activity.nativeRefs.turnId;
				} else if (visibleTool) this.appendActivityBlock(blocks, activity);
			}

		}
		flushTools();
		appendDraft();
		// Durable activity order is authoritative. Only a not-yet-recorded outbound
		// request may appear optimistically before Native thread creation finishes.
		for (const message of s.chat) {
			if (!rendered.has(message.id) && message.role === "user" && message.status !== "completed") {
				this.appendMessageBlock(blocks, rendered, labels, message);
			}
		}
		return blocks;
	}
	private appendDraftBlock(blocks: TranscriptBlock[], s: ChatFeatureProjection, labels: ReadonlyMap<string, string>): void {
		const latestRequest = [...s.chat].reverse().find(message => message.role === "user")                                                                     ;
		const requestNumber = latestRequest ? labels.get(latestRequest.id)?.replace("INPUT ", "") : "1"                                                          ;
		const responseCount = latestRequest ? s.chat.slice(s.chat.lastIndexOf(latestRequest) + 1).filter(message => message.role === "assistant").length + 1 : 1 ;
		blocks.push({ key: "draft", markdownKeys: ["draft"], reuse: { kind: "message", immutable: true, inputs: [s.draft, requestNumber, responseCount] }, render: width => {
			const contentWidth = Math.max(1, width >= 5 ? width - 4 : width);
			return responseFrameRows(`OUTPUT ${requestNumber}-${responseCount} 작성 중`, "streaming", this.md("draft", safe(sanitizePartialAssistantResponse(s.draft), 24000), contentWidth, a.answer), width);
		} });
	}
	private runtimeSummary(s: ChatFeatureProjection, activity: ProjectActivity): { summary: string } | null {
		if (activity.phase !== "completed") return null;
		const source = activity.payload.method === "runtime/stage-report" && activity.payload.authority === "runtime"
			? `[www-runtime]${JSON.stringify(activity.payload.report)}`
			: activity.kind === "message" && typeof activity.payload.text === "string" ? activity.payload.text : null;
		if (!source) return null;
		const checkpoint = parseRequestCheckpointReport(source)                ;
		const stage      = checkpoint ? null : parseRequestStageReport(source) ;
		const report     = checkpoint ?? stage                                 ;
		if (!report) return null;
		const accepted = (s.requestRuntime ?? []).some(request => request.requestId === report.requestId
			&& request.turnId === activity.nativeRefs.turnId && request.threadId === activity.nativeRefs.threadId
			&& request.events.some(event => event.activityId === activity.id && event.type !== "protocol.rejected"));
		if (!accepted || stage?.status === "skipped" || checkpoint?.checkpoint === "RESULT") return null;
		return { summary: report.summary };
	}
	private appendMessageBlock(
		blocks: TranscriptBlock[],
		rendered: Set<string>,
		labels: ReadonlyMap<string, string>,
		message: ChatMessage,
	): void {
		rendered.add(message.id);
		const { id, role, content: sourceContent, status, partial } = message;
		const labelText = labels.get(id) ?? "Notice";
		blocks.push({
			key          : `message:${id}`,
			markdownKeys : [id],
			reuse        : { kind: "message", immutable: isDeeplyImmutablePlainData(message), inputs: [id, role, sourceContent, status, partial, labelText] },
			render       : width => this.renderMessage(id, role, sourceContent, status, partial, labelText, width),
		});
	}
	private renderMessage(
		id: string,
		role: ChatMessage["role"],
		sourceContent: string,
		status: ChatMessage["status"],
		partial: boolean | undefined,
		labelText: string,
		width: number,
	): string[] {
		const content = role === "assistant"
			? status === "completed" && !partial ? sanitizeCompletedAssistantResponse(sourceContent) : sanitizePartialAssistantResponse(sourceContent)
			: sourceContent;
		if (role === "assistant") {
			const contentWidth = Math.max(1, width >= 5 ? width - 4 : width);
			return responseFrameRows(labelText, status === "completed" ? "" : status, this.md(id, safe(content, 24000), contentWidth, a.answer), width);
		}
		const ink   = role === "user" ? a.request : a.info                                                         ;
		const label = role === "user" ? `${a.request("❯")} ${wwwTitle(labelText, ink)}` : wwwTitle(labelText, ink) ;
		const rows = [
			"",
			pair(label, a.muted(status === "completed" ? "" : status), width),
			...this.md(id, safe(content, 24000), Math.max(1, width - 2), a.text).map(row => `  ${row}`),
			"",
		].map(row => fit(row, width));
		return role === "user" ? rows.map(row => semantic.userSurface(row)) : rows;
	}
	private appendActivityBlock(blocks: TranscriptBlock[], activity: ProjectActivity): void {
		const expanded = this.expanded;
		blocks.push({
			key          : `activity:${activity.id}`,
			markdownKeys : [],
			reuse        : { kind: "activity", immutable: isDeeplyImmutablePlainData(activity), source: activity, expanded },
			render       : width => wwwToolRows(activity, width, expanded, this.language()).map(row => fit(row, width)),
		});
	}
	private appendToolGroupBlock(blocks: TranscriptBlock[], activities: readonly ProjectActivity[], purpose: string | null): void {
		const group = [...activities];
		const failed = group.filter(activity => {
			const item = asRecord(asRecord(activity.payload.params)?.item) ?? {};
			return activity.phase === "failed" || item.status === "failed" || typeof item.exitCode === "number" && item.exitCode !== 0;
		});
		const title = purpose || (this.language() === "en" ? "Tool actions" : "도구 작업")                                                                                                               ;
		const state = this.language() === "en" ? `${group.length} actions${failed.length ? ` · ${failed.length} failed` : ""}` : `${group.length}건${failed.length ? ` · 실패 ${failed.length}건` : ""}` ;
		if (purpose || failed.length) blocks.push({
			key          : `tool-group:${group[0]!.id}`,
			markdownKeys : [],
			reuse        : { kind: "message", immutable: group.every(activity => isDeeplyImmutablePlainData(activity)), inputs: [...group, title, state] },
			render       : width => [...prose(a.tool(title), width), (failed.length ? a.failure : a.muted)(state)].map(row => fit(row, width)),
		});
		for (const activity of group) {
			const isFailed = failed.includes(activity);
			blocks.push({
				key          : `tool-group-action:${activity.id}`,
				markdownKeys : [],
				reuse        : { kind: "message", immutable: isDeeplyImmutablePlainData(activity), inputs: [activity, this.expanded] },
				render: width => {
					const card = isFailed ? wwwToolRows(activity, width, this.expanded, this.language()) : wwwToolInputRows(activity, width, this.language());
					return card.map(row => fit(row, width));
				},
			});
		}
	}
	private volatileBlocks(s: ChatFeatureProjection): TranscriptBlock[] {
		const blocks: TranscriptBlock[] = []             ;
		const actionResult              = s.actionResult ;
		if (actionResult) {
			blocks.push({ key: "volatile:action-result", markdownKeys: [], reuse: { kind: "never" }, render: width => {
				const ink  = actionResult.kind === "tnote" ? a.secondary : actionResult.kind === "todo" ? a.plan : a.response                       ;
				const rows = [...section(safe(actionResult.title), width, actionResult.kind, ink), ...prose(safe(actionResult.body, 16000), width)] ;
				if (actionResult.digest) rows.push(...prose(a.muted(`digest ${safe(actionResult.digest)}`), width));
				return rows.map(row => fit(row, width));
			} });
		}
		if (s.error) blocks.push({ key: "volatile:error", markdownKeys: [], reuse: { kind: "never" }, render: width => ["", ...prose(a.failure(`! ${safe(s.error)}`), width)].map(row => fit(row, width)) });
		if (s.developmentRecordingError) blocks.push({ key: "volatile:recording-error", markdownKeys: [], reuse: { kind: "never" }, render: width => ["", ...prose(a.attention(`기록 오류: ${safe(s.developmentRecordingError)}`), width)].map(row => fit(row, width)) });
		if (this.expanded) blocks.push({ key: "volatile:recap", markdownKeys: [], reuse: { kind: "never" }, render: width => ["", ...conversationRecapRows(s, width)].map(row => fit(row, width)) });
		return blocks;
	}
	private emptyBlock(s: ChatFeatureProjection): TranscriptBlock {
		return { key: "volatile:empty", markdownKeys: [], reuse: { kind: "never" }, render: width => {
			if (this.welcomeVisible && !hasVisibleWwwContent(s)) return this.welcome.render(width).map(row => fit(row, width));
			const rows = this.language() === "en"
				? ["", a.strong("Delegate execution and step in when needed."), "", a.muted("Requests, tool actions, and results appear here in order."), "", a.active("/goal") + a.muted("  Set a goal"), a.active("/model") + a.muted(" Choose model and reasoning"), a.active("Ctrl+P") + a.muted(" Find commands")]
				: ["", a.strong("실행을 맡기고, 필요한 순간 개입하세요."), "", a.muted("요청 · 도구 실행 · 결과가 이곳에 시간순으로 기록됩니다."), "", a.active("/goal") + a.muted("  작업 목표 설정"), a.active("/model") + a.muted(" 모델과 추론 강도 선택"), a.active("Ctrl+P") + a.muted(" 명령 찾기")];
			const d = s.linearDashboard;
			if (d?.state === "ready" || d?.state === "stale") rows.push("", a.muted(`${oneLine(d.projectName)} / Linear ${d.state === "stale" ? "마지막 성공 값" : "연결됨"}`), a.muted("/context  프로젝트 갱신 · 이슈 · 마일스톤"));
			else if (d) rows.push("", a.muted(d.state === "loading" ? "Linear 정보를 불러오는 중" : "Linear 정보를 불러오지 못했습니다"));
			return rows.map(row => fit(row, width));
		} };
	}
	private cacheInput(): WwwTranscriptCacheInput<DurableTranscriptRevision, VolatileTranscriptRevision> {
		const snapshot        = this.snapshot                       ;
		const durableRevision = durableTranscriptRevision(snapshot) ;
		return {
			snapshotVersion: this.snapshotVersion,
			expanded: this.expanded,
			durableRevision,
			durableRevisionTrusted     : trustedDurableRevision(durableRevision),
			sameTrustedDurableRevision : sameTrustedDurableReferences,
			sameDurableLifetime        : (left, right) => left.projectId === right.projectId && left.threadId === right.threadId,
			durableRevisionChanged     : (left, right) => left.journalSequence !== right.journalSequence || left.draft !== right.draft || left.draftAnchorSequence !== right.draftAnchorSequence,
			buildDurableBlocks         : () => this.durableBlocks(snapshot),
			volatileRevision           : durableEmpty => volatileTranscriptRevision(snapshot, this.expanded, durableEmpty),
			sameVolatileRevision       : sameVolatileTranscriptRevision,
			buildVolatileBlocks: durableEmpty => {
				const blocks = this.volatileBlocks(snapshot);
				return durableEmpty && blocks.length === 0 ? [this.emptyBlock(snapshot)] : blocks;
			},
			retainMarkdownKeys: keys => {
				for (const key of this.markdown.keys()) if (!keys.has(key)) this.markdown.delete(key);
			},
		};
	}
	scrollRows(width: number): ScrollRowSource {
		const activeTheme = getActiveTuiTheme();
		if (activeTheme !== this.renderedTheme) {
			this.renderedTheme = activeTheme;
			this.invalidate();
		}
		return this.cache.scrollRows(width, this.cacheInput());
	}
	render(width: number): string[] {
		if (width <= 0) return [];
		const source = this.scrollRows(width);
		return [...source.rows(0, source.rowCount)];
	}
}

export function wwwToolRows(activity: ProjectActivity, width: number, expanded: boolean, language: OutputLanguage = "ko"): string[] {
	const observedChanges = projectFileChanges(activity);
	if (observedChanges.length > 0) {
		const failed     = activity.phase === "failed"                                                                  ;
		const symbol     = failed ? a.failure("✕") : activity.phase === "completed" ? a.success("✓") : a.attention("•") ;
		const state      = failed ? "failed" : activity.phase === "completed" ? "done" : activity.phase                 ;
		const nameWidth  = Math.max(...observedChanges.map(change => change.name.length))                               ;
		const expandHint = language === "en" ? "Ctrl+E to expand" : "Ctrl+E 펼치기"                                     ;
		return observedChanges.flatMap(change => {
			const stats = change.added === null || change.removed === null
				? "changed"
				: `${a.success(`+${change.added}`)}  ${a.failure(`-${change.removed}`)}`;
			const header = fit(`${symbol} ${a.tool(`${TRANSCRIPT_ICON.edit} Edit`)}  ${a.text(change.name.padEnd(nameWidth))}  ${stats}  ${state}`, width)                  ;
			const diff   = renderUnifiedDiff(change.diff ?? "", width, { fileKind: change.fileKind, expandHint, ...(expanded ? {} : { maxRows: CHAT_DIFF_PREVIEW_ROWS }) }) ;
			return [header, ...diff];
		});
	}
	const payload = asRecord(boundedPublicProjection(activity.payload).value) ?? {}                                                                        ;
	const item    = asRecord(asRecord(payload.params)?.item) ?? {}                                                                                         ;
	const kind    = oneLine(item.type || activity.kind)                                                                                                    ;
	const title   = oneLine(item.command || item.tool || item.name || item.path || kind, 600)                                                              ;
	const output  = safe(item.aggregatedOutput || item.output || payload.output || asRecord(item.error)?.message || "", 8000)                              ;
	const result  = item.result ? safe(typeof item.result === "string" ? item.result : JSON.stringify(item.result, null, 2)) : ""                          ;
	const failed  = activity.phase === "failed" || item.status === "failed" || typeof item.exitCode === "number" && item.exitCode !== 0                    ;
	const running = !failed && ["started", "updated"].includes(activity.phase) && !["completed", "cancelled", "interrupted"].includes(String(item.status)) ;
	const changes = Array.isArray(item.changes) ? item.changes.map((change) => asRecord(change) ?? {}) : []                                                ;
	if (typeof item.command === "string" && (running || failed || expanded) && width >= 20) {
		const ink        = failed ? a.failure : a.tool                                                                                                                                                                                ;
		const inside     = width - 4                                                                                                                                                                                                  ;
		const state      = failed ? language === "en" ? "failed" : "실패" : running ? language === "en" ? "running" : "실행 중" : activity.phase                                                                                      ;
		const body       = (row: string) => `${ink("│")} ${fit(row, inside)} ${ink("│")}`                                                                                                                                             ;
		const command    = prose(`${failed ? "!" : "$"} ${safe(item.command)}`, inside)                                                                                                                                               ;
		const outputRows = prose(output || result || (running ? language === "en" ? "Waiting for output" : "출력 대기 중" : language === "en" ? "No output" : "출력 없음"), inside)                                                   ;
		const shown      = expanded ? outputRows : outputRows.slice(-CHAT_TERMINAL_OUTPUT_CHUNK_LINES)                                                                                                                                ;
		const meta       = [typeof item.exitCode === "number" ? `exit ${item.exitCode}` : state, typeof item.durationMs === "number" && Number.isFinite(item.durationMs) ? duration(item.durationMs) : ""].filter(Boolean).join("  ") ;
		const label      = ` ${TRANSCRIPT_ICON.terminal} Git Bash  ${state} `                                                                                                                                                         ;
		const header     = ink(`┌───${label}${"─".repeat(Math.max(0, width - visibleWidth(label) - 5))}┐`)                                                                                                                            ;
		const divider    = ink(`├─── Output ${"─".repeat(Math.max(0, width - visibleWidth("├─── Output ┤")))}┤`)                                                                                                                      ;
		return ["", header,
			...command.map(row => body(a.text(row))), divider,
			...(shown.length < outputRows.length ? [body(a.muted(language === "en" ? `… ${outputRows.length - shown.length} earlier lines · latest ${CHAT_TERMINAL_OUTPUT_CHUNK_LINES} lines · Ctrl+E all` : `… 앞 ${outputRows.length - shown.length}줄 · 최신 ${CHAT_TERMINAL_OUTPUT_CHUNK_LINES}줄 · Ctrl+E 전체`))] : []),
			...shown.map(row => body((failed ? a.failure : a.muted)(row))),
			body(a.muted(meta)), ink(`└${"─".repeat(width - 2)}┘`), ""];
	}
	const activityIcon = typeof item.command === "string" ? `${a.tool(TRANSCRIPT_ICON.terminal)} ` : ""                                                                                                                             ;
	const rows         = [pair(`${mark(failed ? "failed" : activity.phase)} ${activityIcon}${a.tool(title)}`, (failed ? a.failure : a.muted)(typeof item.exitCode === "number" ? `exit ${item.exitCode}` : activity.phase), width)] ;
	for (const change of changes) {
		rows.push(...prose(a.text(`  ${oneLine(asRecord(change.kind)?.type || change.kind || "edit")}  ${safe(change.path)}`), width));
		if (expanded && typeof change.diff === "string") rows.push(...prose(safe(change.diff), width, 4));
	}
	if ((expanded || failed) && (output || result)) rows.push(...prose(failed ? a.failure(output || result) : a.muted(output || result), width, 2));
	if ((expanded || failed) && typeof item.command !== "string") rows.push(...prose(a.muted(`/source ${safe(activity.id)}`), width, 2));
	return rows;
}

function wwwToolInputRows(activity: ProjectActivity, width: number, language: OutputLanguage): string[] {
	const payload = asRecord(boundedPublicProjection(activity.payload).value) ?? {}         ;
	const item    = asRecord(asRecord(payload.params)?.item) ?? {}                          ;
	const args    = asRecord(item.arguments) ?? {}                                          ;
	const command = safe(item.command || args.command || item.name || item.tool || "", 600) ;
	if (!command) return wwwToolRows(activity, width, false, language);
	const explicitPath = typeof item.path === "string" ? item.path : typeof args.path === "string" ? args.path : ""                                ;
	const observedPath = explicitPath || /(?:^|[\s'"(])((?:\.{1,2}\/)?(?:src|test|docs|scripts|\.agents)\/[^\s'"|;&)]+)/u.exec(command)?.[1] || "" ;
	if (width < 20) return [...prose(a.tool(`${language === "en" ? "Input" : "입력"}: ${command}`), width), ...(observedPath ? prose(a.muted(`${language === "en" ? "Path" : "경로"}: ${safe(observedPath)}`), width) : [])];
	const ink    = a.tool                                                         ;
	const inside = width - 4                                                      ;
	const label  = ` ${TRANSCRIPT_ICON.terminal} Git Bash `                       ;
	const body   = (row: string) => `${ink("│")} ${fit(row, inside)} ${ink("│")}` ;
	const rows = ["", ink(`┌───${label}${"─".repeat(Math.max(0, width - visibleWidth(label) - 5))}┐`),
		...prose(`$ ${command}`, inside).map(row => body(a.text(row))),
		...(observedPath ? [body(a.muted(`${language === "en" ? "Path" : "경로"} · ${safe(observedPath)}`))] : [])];
	const output = safe(item.aggregatedOutput || item.output || payload.output || "", 8000);
	if (output) {
		const outputRows = prose(output, inside);
		rows.push(ink(`├─── Output ${"─".repeat(Math.max(0, width - visibleWidth("├─── Output ┤")))}┤`),
			...outputRows.slice(-CHAT_TERMINAL_OUTPUT_CHUNK_LINES).map(row => body(a.text(row))));
	}
	rows.push(ink(`└${"─".repeat(width - 2)}┘`), "");
	return rows;
}

function verificationLabel(value: ChatFeatureProjection["performance"], language: OutputLanguage): string {
	const labels = language === "en" ? {
		"not-verified": "not verified", passed: "verified", failed: "verification failed", uncertain: "verification uncertain",
	} : {
		"not-verified" : "검증 미실행",
		passed         : "검증 통과",
		failed         : "검증 실패",
		uncertain      : "검증 결과 미확정",
	};
	return labels[value?.verification ?? "not-verified"];
}

function narratorMarkdown(item: WorkbenchTNote): string {
	const provenance = item.provenance;
	return provenance ? `\n\nDetached narrator: ${safe(`${provenance.provider} / ${provenance.model} / ${provenance.version}`, 4000)}` : "";
}

function responseFrameRows(label: string, status: string, bodyRows: readonly string[], width: number): string[] {
	// The mirrored glyph pairs with the `❯` request marker so roles stay distinct without color.
	const title = `${a.response("❮")} ${wwwTitle(label, a.response)}`;
	if (width < 5) return ["", pair(title, a.muted(status), width), ...bodyRows, ""].map(row => fit(row, width));
	const inside  = width - 2                                                                            ;
	const heading = truncateToWidth(` ${title}${status ? `  ${a.muted(status)}` : ""} `, width - 2, "…") ;
	const body    = bodyRows.map(row => `${a.rule("│")} ${fit(row, inside)}`)                            ;
	return ["", fit(heading, width), ...body, ""].map(row => fit(row, width));
}

function isArrayIndex(key: string, length: number): boolean {
	if (!/^(?:0|[1-9]\d*)$/u.test(key)) return false;
	const index = Number(key);
	return Number.isSafeInteger(index) && index >= 0 && index < length;
}

/** Proves the complete reachable value is frozen plain data without invoking accessors.
 * Shallow-frozen wrappers, getters, symbols, cycles, Date/Map/Set/typed arrays and class
 * instances conservatively miss. The proof never freezes or clones a producer value. */
function isDeeplyImmutablePlainData(value: unknown, visiting = new Set<object>()): boolean {
	if (value === null
		|| value === undefined
		|| typeof value === "string"
		|| typeof value === "boolean"
		|| typeof value === "number") return true;
	if (typeof value !== "object") return false;
	if (deeplyImmutablePlainData.has(value)) return true;
	if (visiting.has(value)) return false;
	try {
		const prototype = Object.getPrototypeOf(value);
		if (prototype !== Object.prototype && prototype !== null && prototype !== Array.prototype) return false;
		if (!Object.isFrozen(value)) return false;
		const keys       = Reflect.ownKeys(value)                                       ;
		const stringKeys = keys.filter((key): key is string => typeof key === "string") ;
		if (stringKeys.length !== keys.length) return false;
		if (Array.isArray(value) && stringKeys.some(key => key !== "length" && !isArrayIndex(key, value.length))) return false;
		visiting.add(value);
		for (const key of keys) {
			const descriptor = Object.getOwnPropertyDescriptor(value, key);
			if (!descriptor || !("value" in descriptor) || !isDeeplyImmutablePlainData(descriptor.value, visiting)) return false;
		}
		deeplyImmutablePlainData.add(value);
		return true;
	} catch {
		return false;
	} finally {
		visiting.delete(value);
	}
}

function activityIdentity(activity: ProjectActivity): string {
	return [
		activity.nativeRefs.threadId,
		activity.nativeRefs.turnId,
		activity.nativeRefs.itemId ?? activity.id,
	].join("\0");
}

function latestSourceActivity(note: TNote, activitiesById: ReadonlyMap<string, ProjectActivity>): ProjectActivity | undefined {
	let latest: ProjectActivity | undefined;
	for (const activityId of note.sourceActivityIds) {
		const activity = activitiesById.get(activityId);
		if (activity && (!latest || activity.sequence > latest.sequence)) latest = activity;
	}
	return latest;
}

function durableTimelineIndex(snapshot: ChatFeatureProjection): DurableTimelineIndex {
	const activitiesById            = new Map(snapshot.activities.map(activity => [activity.id, activity])) ;
	const notesByAnchor             = new Map<string, TNote[]>()                                            ;
	const unanchoredNotes : TNote[] = []                                                                    ;
	for (const note of snapshot.tnotes) {
		const anchor = latestSourceActivity(note, activitiesById);
		if (!anchor) {
			unanchoredNotes.push(note);
			continue;
		}
		const anchoredNotes = notesByAnchor.get(anchor.id) ?? [];
		anchoredNotes.push(note);
		notesByAnchor.set(anchor.id, anchoredNotes);
	}
	const toolByIdentity = new Map<string, ProjectActivity>();
	for (const activity of snapshot.activities) {
		if (["tool", "file-change"].includes(activity.kind)) toolByIdentity.set(activityIdentity(activity), activity);
	}
	return {
		messageByActivity: new Map(snapshot.chat.map(message => [message.activityId, message])),
		notesByAnchor,
		toolByIdentity,
		unanchoredNotes,
	};
}

function durableTranscriptRevision(snapshot: ChatFeatureProjection): DurableTranscriptRevision {
	return {
		projectId           : snapshot.projectId,
		threadId            : snapshot.threadId,
		journalSequence     : snapshot.journalSequence,
		draft               : snapshot.draft,
		draftAnchorSequence : snapshot.draftAnchorSequence ?? null,
		activities          : snapshot.activities,
		chat                : snapshot.chat,
		tnotes              : snapshot.tnotes,
	};
}

function trustedDurableRevision(revision: DurableTranscriptRevision): boolean {
	return isDeeplyImmutablePlainData(revision.activities)
		&& isDeeplyImmutablePlainData(revision.chat)
		&& isDeeplyImmutablePlainData(revision.tnotes);
}

function sameTrustedDurableReferences(left: DurableTranscriptRevision, right: DurableTranscriptRevision): boolean {
	return left.projectId === right.projectId && left.threadId === right.threadId
		&& left.activities === right.activities && left.chat === right.chat && left.tnotes === right.tnotes
		&& left.draft === right.draft && left.draftAnchorSequence === right.draftAnchorSequence;
}

function volatileTranscriptRevision(snapshot: ChatFeatureProjection, expanded: boolean, durableEmpty: boolean): VolatileTranscriptRevision {
	let request = 0, response = 0;
	if (snapshot.draft) for (const message of snapshot.chat) {
		if (message.role === "user") { request += 1; response = 0; }
		else if (message.role === "assistant" && request > 0) response += 1;
	}
	return {
		durableEmpty,
		draftLabel                : snapshot.draft ? `${Math.max(1, request)}:${response + 1}` : null,
		snapshot                  : expanded ? snapshot : null,
		draft                     : snapshot.draft,
		reasoningSummaryDraft     : snapshot.reasoningSummaryDraft,
		actionResult              : snapshot.actionResult,
		error                     : snapshot.error,
		developmentRecordingError : snapshot.developmentRecordingError,
		linearDashboard           : snapshot.linearDashboard,
		requestRuntime            : snapshot.requestRuntime,
		activeTurnId              : snapshot.activeTurnId,
	};
}

function sameVolatileTranscriptRevision(left: VolatileTranscriptRevision, right: VolatileTranscriptRevision): boolean {
	return left.durableEmpty === right.durableEmpty
		&& left.draftLabel === right.draftLabel
		&& left.snapshot === right.snapshot
		&& left.draft === right.draft
		&& left.reasoningSummaryDraft === right.reasoningSummaryDraft
		&& left.actionResult === right.actionResult
		&& left.error === right.error
		&& left.developmentRecordingError === right.developmentRecordingError
		&& left.linearDashboard === right.linearDashboard
		&& left.requestRuntime === right.requestRuntime
		&& left.activeTurnId === right.activeTurnId;
}
