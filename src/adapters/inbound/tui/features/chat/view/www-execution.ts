import { Markdown, truncateToWidth, visibleWidth }                              from "@earendil-works/pi-tui";
import type { Component, ScrollRowSource }                                      from "@earendil-works/pi-tui";
import type { ChatFeatureProjection }                                           from "@/core/application/orchestration/workbench-feature-reads";
import type { ProjectActivity }                                                 from "@/core/domain/execution/project-activity";
import type { WorkbenchChatMessage, WorkbenchTNote }                            from "@/core/domain/work/workbench";
import { sanitizeCompletedAssistantResponse, sanitizePartialAssistantResponse } from "@/core/domain/review/redaction";
import { boundedPublicProjection }                                              from "@/adapters/inbound/tui/features/chat/view-model/bounded-public-projection";
import { conversationRecapRows }                                                from "@/adapters/inbound/tui/features/chat/view/conversation-recap-view";
import {
	a,
	wwwMarkdownTheme,
	wwwTitle,
	duration,
	fit,
	mark,
	oneLine,
	pair,
	prose,
	safe,
	section,
} from "@/adapters/inbound/tui/foundation/theme/www-theme";
import { parseCanonicalTNoteReport, parseLegacyCanonicalTNote }                 from "@/core/application/work/t-note-service";
import { WorkbenchWelcomeView }                                                 from "@/adapters/inbound/tui/features/chat/view/workbench-welcome";
import { CHAT_TERMINAL_OUTPUT_CHUNK_LINES }                                     from "@/adapters/inbound/tui/features/chat/view/chat-output-policy";
import { getActiveTuiTheme }                                                    from "@/adapters/inbound/tui/foundation/theme/theme";
import { WwwTranscriptCache }                                                   from "@/adapters/inbound/tui/features/chat/view/www-transcript-cache";
import type {
	WwwTranscriptCacheInput,
	WwwTranscriptCacheMetrics,
	TranscriptBlock,
} from "@/adapters/inbound/tui/features/chat/view/www-transcript-cache";

export type { WwwTranscriptCacheMetrics } from "@/adapters/inbound/tui/features/chat/view/www-transcript-cache";

const tnoteMarkdownTheme = {
	...wwwMarkdownTheme,
	heading: a.strong,
};

export function record(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function wwwConversationLabels(messages: readonly WorkbenchChatMessage[]): ReadonlyMap<string, string> {
	const labels = new Map<string, string>() ;
	let request  = 0                         ;
	let response = 0                         ;
	for (const message of messages) {
		if (message.role === "user") {
			request += 1;
			response = 0;
			labels.set(message.id, `REQ ${request}`);
		} else if (message.role === "assistant") {
			response += 1;
			labels.set(message.id, `RES ${Math.max(1, request)}-${response}`);
		} else labels.set(message.id, "Notice");
	}
	return labels;
}

function verificationLabel(value: ChatFeatureProjection["performance"]): string {
	const labels = {
		"not-verified" : "검증 미실행",
		passed         : "검증 통과",
		failed         : "검증 실패",
		uncertain      : "검증 결과 미확정",
	};
	return labels[value?.verification ?? "not-verified"];
}

export function executionHeading(s: ChatFeatureProjection): { state: string; title: string; detail: string; attention: boolean } {
	const lastRequest = [...s.chat].reverse().find(m => m.role === "user")       ;
	const current     = s.workFlow.steps.find(step => step.status === "running") ;
	const receipt     = s.executionRun?.receipt                                  ;
	if (s.pendingApproval) return {
		state     : "승인 대기",
		title     : "진행하려면 결정이 필요합니다",
		detail    : oneLine(s.pendingApproval.params.reason || s.pendingApproval.params.command || s.pendingApproval.kind),
		attention : true,
	};
	if (s.deliveryUncertain) return {
		state     : "수신 미확인",
		title     : "요청 수신 여부를 확인해야 합니다",
		detail    : "/cancel로 서버 상태 확인 · 자동 재전송하지 않음",
		attention : true,
	};
	if (s.error || s.phase === "error") return {
		state     : "오류",
		title     : oneLine(s.error || "실행 오류"),
		detail    : "기록을 확인하고 다음 요청을 입력하세요",
		attention : true,
	};
	if (s.phase === "loading") return {
		state     : "연결 중",
		title     : "프로젝트 실행 환경을 여는 중",
		detail    : "Native session 연결",
		attention : false,
	};
	const turnId = s.activeTurnId ?? s.workFlow.source?.turnId;
	const request = turnId ? [...(s.requestRuntime ?? [])].reverse().find(r => r.turnId === turnId) : s.requestRuntime?.at(-1);
	if (request) {
		const stage = request.stages.find(x => ["running", "failed", "blocked"].includes(x.status));
		return {
			state     : stage ? `${stage.id} · ${stage.status}` : request.status,
			title     : oneLine(stage?.tasks.find(task => task.status === "running")?.title ?? request.objective),
			detail    : wwwNowLabel(s) ?? "정리된 작업 내용을 기다리는 중",
			attention : ["failed", "blocked"].includes(request.status),
		};
	}
	if (s.phase === "working") {
		const phase = s.executionRun?.phase;
		const waiting = ["waiting", "blocked", "reconciling", "unknown"].includes(phase ?? "");
		return {
			state     : waiting ? "대기" : s.draft ? "결과 작성" : "실행 중",
			title     : oneLine(current?.title || lastRequest?.content || s.sessionGoal?.text || "요청을 확인하는 중"),
			detail    : waiting ? "작업 진행 상태를 확인하는 중" : wwwNowLabel(s) ?? "정리된 작업 내용을 기다리는 중",
			attention : waiting,
		};
	}
	const status      = receipt?.status                                                                                              ;
	const blocking    = receipt?.remaining.filter(item => item.blocking).length ?? 0                                                 ;
	const needsReview = Boolean(blocking || s.performance?.verification === "failed" || s.performance?.verification === "uncertain") ;
	return {
		state: status === "failed" ? "실패" : status === "interrupted" || status === "cancelled" ? "중단됨" : status === "completed" ? needsReview ? "검토 필요" : "실행 종료" : s.chat.length ? "대기" : "준비",
		title: oneLine(receipt?.objective || lastRequest?.content || s.sessionGoal?.text || "어떤 작업을 실행할까요?"),
		detail: status
			? `실행 ${status}  /  ${verificationLabel(s.performance)}${blocking ? ` / 필수 잔여 ${blocking}개` : ""}`
			: s.threadId ? "세션 연결됨 · 다음 요청을 입력하세요" : "요청을 입력하면 Native 실행이 시작됩니다",
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
	const turnId = s.activeTurnId ?? s.workFlow.source?.turnId;
	const latest = [...(s.planActivities ?? [])].filter(item => item.turnId === turnId).sort((left, right) => left.sequence - right.sequence).at(-1);
	if (latest) return oneLine(latest.summary);
	if (s.draft) return "최종 응답 작성 중";
	return s.planActivityStatus === "unavailable" ? "작업 내용을 아직 정리하지 못했습니다."
		: s.planActivityStatus === "disabled" ? "작업 내용 요약이 꺼져 있습니다."
		: "현재 단계의 작업 내용을 정리하는 중";
}

export function wwwTNoteMarkdown(item: WorkbenchTNote): string {
	const report = parseCanonicalTNoteReport(item.summary)                                    ;
	const legacy = parseLegacyCanonicalTNote(item.summary)                                    ;
	const title  = oneLine(report?.question || legacy?.question || item.title || "질문 요약") ;
	if (report) return [
		`## ${title}`,
		`## Report\n\n### 질문\n\n${safe(report.question, 4000)}\n\n### Plan\n\n${safe(report.plan, 4000)}\n\n### 과정\n\n${safe(report.process, 4000)}\n\n### 결론\n\n${safe(report.conclusion, 4000)}\n\n### Test\n\n${safe(report.test || "테스트 실행 관측 없음", 4000)}`,
	].join("\n\n");
	if (legacy) return `## ${title}\n\n## 원인\n\n${safe(legacy.why, 4000)}\n\n## 결과\n\n${safe(legacy.result, 4000)}`;
	return `## ${title}\n\n${safe(item.summary, 8000)}`;
}

function tnoteTitle(item: WorkbenchTNote): string {
	const report = parseCanonicalTNoteReport(item.summary);
	const legacy = parseLegacyCanonicalTNote(item.summary);
	return oneLine(report?.question || legacy?.question || item.title || "질문 요약");
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

type TNotePanel = { readonly rows: string[] };

function reportBadge(test: string | undefined): string {
	if (!test) return a.muted("RECORDED");
	const total = /(?:^|\n)Total\s+(\d+)\/(\d+)/u.exec(test);
	if (!total || Number(total[2]) === 0) return a.muted("NO TEST");
	const passed = Number(total[1]), count = Number(total[2]);
	const failures = (test.match(/·\s*failed\b/giu) ?? []).length;
	if (failures >= count) return a.failure(`FAILED · TEST ${passed}/${count}`);
	if (failures > 0) return a.attention(`PARTIAL · TEST ${passed}/${count}`);
	if (passed >= count) return a.success(`DONE · TEST ${passed}/${count}`);
	return a.muted(`OBSERVED · TEST ${passed}/${count}`);
}
function tnoteFieldRows(label: string, value: string, width: number): string[] {
	return [a.secondary(label), ...prose(a.text(safe(value, 4000)), width), ""];
}

function reportPanel(rows: string[], badge: string, width: number): TNotePanel {
	return { rows: [pair(a.response("REPORT"), badge, width), "", ...rows] };
}

function reportFrameRows(panel: TNotePanel, evidence: string, width: number): string[] {
	if (width < 8) return [...panel.rows, evidence].map(row => fit(row, width));
	const inside = width - 2;
	const [heading, ...body] = panel.rows;
	const header = fit(` ${heading ?? ""} `, width);
	const frame = (row: string) => `${a.rule("│")} ${fit(row, inside)}`;
	return ["", header, ...[...body, evidence].map(frame), ""]
		.map(row => fit(row, width));
}
function tnotePanels(item: WorkbenchTNote, width: number): TNotePanel[] | null {
	const report = parseCanonicalTNoteReport(item.summary);
	if (report) return [reportPanel([
		a.caption(tnoteTitle(item)), "",
		...tnoteFieldRows("질문", report.question, width),
		...tnoteFieldRows("Plan", report.plan, width),
		...tnoteFieldRows("과정", report.process, width),
		...tnoteFieldRows("결론", report.conclusion, width),
		...tnoteFieldRows("Test", report.test || "테스트 실행 관측 없음", width),
	], reportBadge(report.test), width)];
	const legacy = parseLegacyCanonicalTNote(item.summary);
	if (legacy) return [reportPanel([
		a.caption(tnoteTitle(item)), "",
		...tnoteFieldRows("Result", legacy.result, width),
		...tnoteFieldRows("Reason", legacy.why, width),
	], a.muted("LEGACY"), width)];
	return null;
}

type DurableTranscriptRevision = Pick<ChatFeatureProjection, "projectId" | "threadId" | "journalSequence" | "activities" | "chat" | "tnotes">;

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
		const keys = Reflect.ownKeys(value);
		const stringKeys = keys.filter((key): key is string => typeof key === "string");
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
		projectId       : snapshot.projectId,
		threadId        : snapshot.threadId,
		journalSequence : snapshot.journalSequence,
		activities      : snapshot.activities,
		chat            : snapshot.chat,
		tnotes          : snapshot.tnotes,
	};
}

function trustedDurableRevision(revision: DurableTranscriptRevision): boolean {
	return isDeeplyImmutablePlainData(revision.activities)
		&& isDeeplyImmutablePlainData(revision.chat)
		&& isDeeplyImmutablePlainData(revision.tnotes);
}

function sameTrustedDurableReferences(left: DurableTranscriptRevision, right: DurableTranscriptRevision): boolean {
	return left.projectId === right.projectId && left.threadId === right.threadId
		&& left.activities === right.activities && left.chat === right.chat && left.tnotes === right.tnotes;
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
		&& left.linearDashboard === right.linearDashboard;
}

export function hasVisibleWwwContent(snapshot: ChatFeatureProjection): boolean {
	return snapshot.actionResult?.kind === "workflow" || snapshot.chat.length > 0
		|| snapshot.workFlow.steps.length > 0
		|| Boolean(snapshot.pendingApproval || snapshot.executionRun?.receipt || snapshot.executionRun?.phase === "waiting"
			|| snapshot.reasoningSummaryDraft || snapshot.reasoningDraft || snapshot.draft || snapshot.error);
}

/** Public transcript and tool timeline. Product welcome and raw reasoning stay outside the durable timeline. */
export class WwwTranscriptView implements Component {
	private readonly welcome = new WorkbenchWelcomeView()                                                      ;
	private readonly cache   = new WwwTranscriptCache<DurableTranscriptRevision, VolatileTranscriptRevision>() ;
	private welcomeVisible   = false                                                                           ;
	private markdown         = new Map<string, { text: string; view: Markdown }>()                             ;
	private snapshotVersion  = 0                                                                               ;
	private renderedTheme    = getActiveTuiTheme()                                                             ;
	public expanded          = false                                                                           ;
	constructor(private snapshot: ChatFeatureProjection) {}
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
		const blocks : TranscriptBlock[] = []                            ;
		const labels                     = wwwConversationLabels(s.chat) ;
		const timeline                   = durableTimelineIndex(s)       ;
		const rendered                   = new Set<string>()             ;
		for (const activity of s.activities) {
			const message = timeline.messageByActivity.get(activity.id);
			if (message) this.appendMessageBlock(blocks, rendered, labels, message);
			else if (timeline.toolByIdentity.get(activityIdentity(activity)) === activity) this.appendActivityBlock(blocks, activity);
			for (const note of timeline.notesByAnchor.get(activity.id) ?? []) this.appendTNoteBlock(blocks, note);
		}
		for (const note of timeline.unanchoredNotes) this.appendTNoteBlock(blocks, note);
		// Durable activity order is authoritative. Only a not-yet-recorded outbound
		// request may appear optimistically before Native thread creation finishes.
		for (const message of s.chat) {
			if (!rendered.has(message.id) && message.role === "user" && message.status !== "completed") {
				this.appendMessageBlock(blocks, rendered, labels, message);
			}
		}
		return blocks;
	}
	private appendTNoteBlock(blocks: TranscriptBlock[], item: TNote): void {
		const markdownKey = `tnote:${item.id}`;
		const renderItem = { ...item, sourceActivityIds: [...item.sourceActivityIds] };
		blocks.push({
			key          : markdownKey,
			markdownKeys : [markdownKey],
			reuse        : { kind: "tnote", immutable: isDeeplyImmutablePlainData(item), inputs: [item.id, item.title, item.summary, ...item.sourceActivityIds] },
			render       : width => this.renderTNote(renderItem, markdownKey, width),
		});
	}
	private renderTNote(item: TNote, markdownKey: string, width: number): string[] {
		const rows : string[] = []                              ;
		const contentWidth    = Math.max(1, width - 4)          ;
		const source          = item.sourceActivityIds.at(-1)   ;
		const panels          = tnotePanels(item, contentWidth) ;
		if (!panels) {
			rows.push("", ...this.md(markdownKey, wwwTNoteMarkdown(item), contentWidth).map(row => fit(`  ${row}`, width)), "");
			return rows.map(row => fit(row, width));
		}
		const evidence = `${a.secondary(`Evidence ${item.sourceActivityIds.length}`)}${source ? `  ·  ${a.active(`/source ${safe(source)}`)}` : ""}  ·  ${a.secondary(`/promote tnote ${safe(item.id)}`)}`;
		if (width < 6) {
			const panelRows = panels.flatMap((panel, index) => [...(index > 0 ? [""] : []), ...panel.rows]);
			rows.push("", ...panelRows.map(row => fit(row, width)), fit(evidence, width), "");
			return rows.map(row => fit(row, width));
		}
		for (const [index, panel] of panels.entries()) {
			if (index > 0) rows.push("");
			rows.push(...reportFrameRows(panel, evidence, width));
		}
		return rows.map(row => fit(row, width));
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
		const ink = role === "user" ? a.request : a.info;
		const label = role === "user" ? `${a.request("❯")} ${wwwTitle(labelText, ink)}` : wwwTitle(labelText, ink);
		return [
			"",
			pair(label, a.muted(status === "completed" ? "" : status), width),
			...this.md(id, safe(content, 24000), Math.max(1, width - 2), a.text).map(row => `  ${row}`),
			"",
		].map(row => fit(row, width));
	}
	private appendActivityBlock(blocks: TranscriptBlock[], activity: ProjectActivity): void {
		const expanded = this.expanded;
		blocks.push({
			key          : `activity:${activity.id}`,
			markdownKeys : [],
			reuse        : { kind: "activity", immutable: isDeeplyImmutablePlainData(activity), source: activity, expanded },
			render       : width => wwwToolRows(activity, width, expanded).map(row => fit(row, width)),
		});
	}
	private volatileBlocks(s: ChatFeatureProjection): TranscriptBlock[] {
		const blocks: TranscriptBlock[] = [];
		if (s.draft) {
			const labels        = wwwConversationLabels(s.chat)                                                                                                      ;
			const latestRequest = [...s.chat].reverse().find(message => message.role === "user")                                                                     ;
			const requestNumber = latestRequest ? labels.get(latestRequest.id)?.replace("REQ ", "") : "1"                                                            ;
			const responseCount = latestRequest ? s.chat.slice(s.chat.lastIndexOf(latestRequest) + 1).filter(message => message.role === "assistant").length + 1 : 1 ;
			blocks.push({ key: "volatile:draft", markdownKeys: ["draft"], reuse: { kind: "never" }, render: width => {
				const contentWidth = Math.max(1, width >= 5 ? width - 4 : width);
				return responseFrameRows(`RES ${requestNumber}-${responseCount} 작성 중`, "streaming", this.md("draft", safe(sanitizePartialAssistantResponse(s.draft), 24000), contentWidth, a.answer), width);
			} });
		}
		if (s.reasoningSummaryDraft && !s.draft) blocks.push({ key: "volatile:reasoning-summary", markdownKeys: [], reuse: { kind: "never" }, render: width => ["", ...prose(a.muted(safe(s.reasoningSummaryDraft, 1200)), width, 2)].map(row => fit(row, width)) });
		const actionResult = s.actionResult;
		if (actionResult) {
			blocks.push({ key: "volatile:action-result", markdownKeys: [], reuse: { kind: "never" }, render: width => {
				const ink = actionResult.kind === "tnote" ? a.secondary : actionResult.kind === "todo" ? a.plan : a.response;
				const rows = [...section(safe(actionResult.title), width, actionResult.kind, ink), ...prose(safe(actionResult.body, 16000), width)];
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
			const rows = ["", a.strong("실행을 맡기고, 필요한 순간 개입하세요."), "", a.muted("요청 · 도구 실행 · 결과가 이곳에 시간순으로 기록됩니다."), "", a.active("/goal") + a.muted("  작업 목표 설정"), a.active("/model") + a.muted(" 모델과 추론 강도 선택"), a.active("Ctrl+P") + a.muted(" 명령 찾기")];
			const d = s.linearDashboard;
			if (d?.state === "ready" || d?.state === "stale") rows.push("", a.muted(`${oneLine(d.projectName)} / Linear ${d.state === "stale" ? "마지막 성공 값" : "연결됨"}`), a.muted("/context  프로젝트 갱신 · 이슈 · 마일스톤"));
			else if (d) rows.push("", a.muted(d.state === "loading" ? "Linear 정보를 불러오는 중" : "Linear 정보를 불러오지 못했습니다"));
			return rows.map(row => fit(row, width));
		} };
	}
	private cacheInput(): WwwTranscriptCacheInput<DurableTranscriptRevision, VolatileTranscriptRevision> {
		const snapshot = this.snapshot;
		const durableRevision = durableTranscriptRevision(snapshot);
		return {
			snapshotVersion: this.snapshotVersion,
			expanded: this.expanded,
			durableRevision,
			durableRevisionTrusted     : trustedDurableRevision(durableRevision),
			sameTrustedDurableRevision : sameTrustedDurableReferences,
			sameDurableLifetime        : (left, right) => left.projectId === right.projectId && left.threadId === right.threadId,
			durableRevisionChanged     : (left, right) => left.journalSequence !== right.journalSequence,
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

export function wwwToolRows(activity: ProjectActivity, width: number, expanded: boolean): string[] {
	const payload = record(boundedPublicProjection(activity.payload).value)                                                                                ;
	const item    = record(record(payload.params).item)                                                                                                    ;
	const kind    = oneLine(item.type || activity.kind)                                                                                                    ;
	const title   = oneLine(item.command || item.tool || item.name || item.path || kind, 600)                                                              ;
	const output  = safe(item.aggregatedOutput || item.output || payload.output || record(item.error).message || "", 8000)                                 ;
	const result  = item.result ? safe(typeof item.result === "string" ? item.result : JSON.stringify(item.result, null, 2)) : ""                          ;
	const failed  = activity.phase === "failed" || item.status === "failed" || typeof item.exitCode === "number" && item.exitCode !== 0                    ;
	const running = !failed && ["started", "updated"].includes(activity.phase) && !["completed", "cancelled", "interrupted"].includes(String(item.status)) ;
	const changes = Array.isArray(item.changes) ? item.changes.map(record) : []                                                                            ;
	if (typeof item.command === "string" && (running || failed || expanded) && width >= 20) {
		const ink        = failed ? a.failure : running ? a.tool : a.rule                                                                                                                                                             ;
		const inside     = width - 4                                                                                                                                                                                                  ;
		const state      = failed ? "실패" : running ? "실행 중" : activity.phase                                                                                                                                                     ;
		const body       = (row: string) => `${ink("│")} ${fit(row, inside)} ${ink("│")}`                                                                                                                                             ;
		const command    = prose(`${failed ? "!" : "$"} ${safe(item.command)}`, inside)                                                                                                                                               ;
		const outputRows = prose(output || result || (running ? "출력 대기 중" : "출력 없음"), inside)                                                                                                                                ;
		const shown      = expanded ? outputRows : outputRows.slice(-CHAT_TERMINAL_OUTPUT_CHUNK_LINES)                                                                                                                                ;
		const meta       = [typeof item.exitCode === "number" ? `exit ${item.exitCode}` : state, typeof item.durationMs === "number" && Number.isFinite(item.durationMs) ? duration(item.durationMs) : ""].filter(Boolean).join("  ") ;
		const label      = ` Bash  ${state} `                                                                                                                                                                                         ;
		return ["", ink(`┌${label}${"─".repeat(Math.max(0, width - visibleWidth(label) - 2))}┐`),
			...command.map(row => body(a.text(row))), body(a.rule("─".repeat(inside))),
			...(shown.length < outputRows.length ? [body(a.muted(`… 앞 ${outputRows.length - shown.length}줄 · 최신 ${CHAT_TERMINAL_OUTPUT_CHUNK_LINES}줄 · Ctrl+E 전체`))] : []),
			...shown.map(row => body((failed ? a.failure : a.muted)(row))),
			body(a.muted(meta)), body(a.muted(`/source ${safe(activity.id)}`)), ink(`└${"─".repeat(width - 2)}┘`), ""];
	}
	const rows = [pair(`${mark(failed ? "failed" : activity.phase)} ${a.tool(title)}`, (failed ? a.failure : a.muted)(typeof item.exitCode === "number" ? `exit ${item.exitCode}` : activity.phase), width)];
	for (const change of changes) {
		rows.push(...prose(a.text(`  ${oneLine(record(change.kind).type || change.kind || "edit")}  ${safe(change.path)}`), width));
		if (expanded && typeof change.diff === "string") rows.push(...prose(safe(change.diff), width, 4));
	}
	if ((expanded || failed) && (output || result)) rows.push(...prose(failed ? a.failure(output || result) : a.muted(output || result), width, 2));
	if (expanded || failed) rows.push(...prose(a.muted(`/source ${safe(activity.id)}`), width, 2));
	return rows;
}
