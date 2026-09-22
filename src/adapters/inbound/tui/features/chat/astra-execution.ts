import { Markdown, truncateToWidth, visibleWidth, type Component, type ScrollRowSource } from "@earendil-works/pi-tui";
import type { WorkbenchSnapshot } from "../../../../../core/domain/work/workbench";
import type { ProjectActivity } from "../../../../../core/domain/execution/project-activity";
import { sanitizeCompletedAssistantResponse, sanitizePartialAssistantResponse } from "../../../../../core/domain/review/redaction";
import { boundedPublicProjection } from "./bounded-public-projection";
import { conversationRecapRows } from "./conversation-recap-view";
import { a, astraMarkdownTheme, astraTitle, duration, fit, mark, oneLine, pair, prose, safe, section } from "../../foundation/theme/astra-theme";
import { parseCanonicalTNoteReport, parseLegacyCanonicalTNote } from "../../../../../core/application/work/t-note-service";
import { WorkbenchWelcomeView } from "./workbench-welcome";
import { CHAT_TERMINAL_OUTPUT_CHUNK_LINES } from "./chat-output-policy";
import { getActiveTuiTheme } from "../../foundation/theme/theme";

const tnoteMarkdownTheme = {
	...astraMarkdownTheme,
	heading: a.strong,
};

export function record(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function astraConversationLabels(messages: readonly WorkbenchSnapshot["chat"][number][]): ReadonlyMap<string, string> {
	const labels = new Map<string, string>();
	let request = 0;
	let response = 0;
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
function verificationLabel(value: WorkbenchSnapshot["performance"]): string {
	return ({ "not-verified": "검증 미실행", passed: "검증 통과", failed: "검증 실패", uncertain: "검증 결과 미확정" })[value?.verification ?? "not-verified"];
}
export function executionHeading(s: WorkbenchSnapshot): { state: string; title: string; detail: string; attention: boolean } {
	const lastRequest = [...s.chat].reverse().find(m => m.role === "user");
	const current = s.workFlow.steps.find(step => step.status === "running");
	const receipt = s.executionRun?.receipt;
	if (s.pendingApproval) return { state: "승인 대기", title: "진행하려면 결정이 필요합니다", detail: oneLine(s.pendingApproval.params.reason || s.pendingApproval.params.command || s.pendingApproval.kind), attention: true };
	if (s.deliveryUncertain) return { state: "수신 미확인", title: "요청 수신 여부를 확인해야 합니다", detail: "/cancel로 서버 상태 확인 · 자동 재전송하지 않음", attention: true };
	if (s.error || s.phase === "error") return { state: "오류", title: oneLine(s.error || "실행 오류"), detail: "기록을 확인하고 다음 요청을 입력하세요", attention: true };
	if (s.phase === "loading") return { state: "연결 중", title: "프로젝트 실행 환경을 여는 중", detail: "Native session 연결", attention: false };
	const turnId = s.activeTurnId ?? s.workFlow.source?.turnId;
	const request = turnId ? [...(s.requestRuntime ?? [])].reverse().find(r => r.turnId === turnId) : s.requestRuntime?.at(-1);
	if (request) {
		const stage = request.stages.find(x => ["running", "failed", "blocked"].includes(x.status));
		return { state: stage ? `${stage.id} · ${stage.status}` : request.status, title: oneLine(stage?.tasks.find(t => t.status === "running")?.title ?? request.objective), detail: astraNowLabel(s) ?? "정리된 작업 내용을 기다리는 중", attention: ["failed", "blocked"].includes(request.status) };
	}
	if (s.phase === "working") {
		const phase = s.executionRun?.phase;
		const waiting = ["waiting", "blocked", "reconciling", "unknown"].includes(phase ?? "");
		return { state: waiting ? "대기" : s.draft ? "결과 작성" : "실행 중", title: oneLine(current?.title || lastRequest?.content || s.sessionGoal?.text || "요청을 확인하는 중"), detail: waiting ? "작업 진행 상태를 확인하는 중" : astraNowLabel(s) ?? "정리된 작업 내용을 기다리는 중", attention: waiting };
	}
	const status = receipt?.status;
	const blocking = receipt?.remaining.filter(item => item.blocking).length ?? 0;
	const needsReview = Boolean(blocking || s.performance?.verification === "failed" || s.performance?.verification === "uncertain");
	return { state: status === "failed" ? "실패" : status === "interrupted" || status === "cancelled" ? "중단됨" : status === "completed" ? needsReview ? "검토 필요" : "실행 종료" : s.chat.length ? "대기" : "준비", title: oneLine(receipt?.objective || lastRequest?.content || s.sessionGoal?.text || "어떤 작업을 실행할까요?"), detail: status ? `실행 ${status}  /  ${verificationLabel(s.performance)}${blocking ? ` / 필수 잔여 ${blocking}개` : ""}` : s.threadId ? "세션 연결됨 · 다음 요청을 입력하세요" : "요청을 입력하면 Native 실행이 시작됩니다", attention: status === "failed" || needsReview };
}
export function astraExecutionIsLive(s: WorkbenchSnapshot): boolean {
	return (s.phase === "loading" || s.phase === "working") && !s.pendingApproval && !s.deliveryUncertain && !s.error
		&& !["waiting", "blocked", "reconciling", "unknown"].includes(s.executionRun?.phase ?? "");
}

export function astraNowLabel(s: WorkbenchSnapshot): string | null {
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

export function astraTNoteMarkdown(item: WorkbenchSnapshot["tnotes"][number]): string {
	const report = parseCanonicalTNoteReport(item.summary);
	const legacy = parseLegacyCanonicalTNote(item.summary);
	const title = oneLine(report?.question || legacy?.question || item.title || "질문 요약");
	if (report) return [
		`## ${title}`,
		`## Report\n\n### Reason\n\n${safe(report.reason, 4000)}\n\n### Action\n\n${safe(report.action, 4000)}\n\n### Test\n\n${safe(report.test || "테스트 실행 관측 없음", 4000)}\n\n### Result\n\n${safe(report.result, 4000)}`,
	].join("\n\n");
	if (legacy) return `## ${title}\n\n## 원인\n\n${safe(legacy.why, 4000)}\n\n## 결과\n\n${safe(legacy.result, 4000)}`;
	return `## ${title}\n\n${safe(item.summary, 8000)}`;
}

function tnoteTitle(item: WorkbenchSnapshot["tnotes"][number]): string {
	const report = parseCanonicalTNoteReport(item.summary);
	const legacy = parseLegacyCanonicalTNote(item.summary);
	return oneLine(report?.question || legacy?.question || item.title || "질문 요약");
}

function responseFrameRows(label: string, status: string, bodyRows: readonly string[], width: number): string[] {
	const title = astraTitle(label, a.response);
	if (width < 5) return ["", pair(title, a.muted(status), width), ...bodyRows, ""].map(row => fit(row, width));
	const inside = width - 2;
	const heading = truncateToWidth(` ${title}${status ? `  ${a.muted(status)}` : ""} `, width - 2, "…");
	const body = bodyRows.map(row => `${a.rule("│")} ${fit(row, inside)}`);
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
function tnotePanels(item: WorkbenchSnapshot["tnotes"][number], width: number): TNotePanel[] | null {
	const report = parseCanonicalTNoteReport(item.summary);
	if (report) return [reportPanel([
		a.caption(tnoteTitle(item)), "",
			...tnoteFieldRows("Result", report.result, width),
			...tnoteFieldRows("Reason", report.reason, width),
			...tnoteFieldRows("Action", report.action, width),
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

type DurableTranscriptRevision = Pick<WorkbenchSnapshot, "projectId" | "threadId" | "journalSequence" | "activities" | "chat" | "tnotes">;

interface TranscriptBlock {
	readonly key: string;
	readonly markdownKeys: readonly string[];
	readonly reuse: TranscriptBlockReuse;
	render(width: number): string[];
}

type TranscriptBlockReuse =
	| { readonly kind: "message"; readonly immutable: boolean; readonly inputs: readonly unknown[] }
	| { readonly kind: "tnote"; readonly immutable: boolean; readonly inputs: readonly unknown[] }
	| { readonly kind: "activity"; readonly immutable: boolean; readonly source: ProjectActivity; readonly expanded: boolean }
	| { readonly kind: "never" };

interface TranscriptWidthIndex {
	readonly width: number;
	readonly counts: readonly number[];
	readonly prefix: readonly number[];
	readonly rowCount: number;
	readonly logicalBytes: number;
}

interface TranscriptGeneration {
	readonly id: number;
	readonly kind: "durable" | "volatile";
	readonly blocks: readonly TranscriptBlock[];
	readonly widths: Map<number, TranscriptWidthIndex>;
}

interface DurableTranscriptGeneration extends TranscriptGeneration {
	readonly kind: "durable";
	readonly expanded: boolean;
	snapshotVersion: number;
	trustedImmutableRevision: boolean;
	revision: DurableTranscriptRevision;
}

interface VolatileTranscriptRevision {
	readonly durableEmpty: boolean;
	readonly draftLabel: string | null;
	readonly snapshot: WorkbenchSnapshot | null;
	readonly draft: WorkbenchSnapshot["draft"];
	readonly reasoningSummaryDraft: WorkbenchSnapshot["reasoningSummaryDraft"];
	readonly actionResult: WorkbenchSnapshot["actionResult"];
	readonly error: WorkbenchSnapshot["error"];
	readonly developmentRecordingError: WorkbenchSnapshot["developmentRecordingError"];
	readonly linearDashboard: WorkbenchSnapshot["linearDashboard"];
}

interface VolatileTranscriptGeneration extends TranscriptGeneration {
	readonly kind: "volatile";
	readonly revision: VolatileTranscriptRevision;
}

interface TranscriptRowCacheEntry {
	readonly rows: readonly string[];
	readonly logicalBytes: number;
}

export interface AstraTranscriptCacheMetrics {
	readonly durableBlockCount: number;
	readonly volatileBlockCount: number;
	readonly markdownEntries: number;
	readonly rowEntries: number;
	readonly rowLogicalBytes: number;
	readonly widthStates: number;
	readonly widthMetadataLogicalBytes: number;
	readonly exactCountBuilds: number;
	readonly exactCountBuildMs: number;
	readonly requestedRows: number;
	readonly requestedMaterializationMs: number;
	readonly renderedBlocks: number;
	readonly durableGraphBuilds: number;
	readonly durableGraphBuildMs: number;
	readonly durableGenerationNoopReuses: number;
	readonly durableCountReusedBlocks: number;
	readonly durableCountRenderedBlocks: number;
}

const ASTRA_TRANSCRIPT_CACHE_MAX_LOGICAL_BYTES = 8 * 1024 * 1024;
const ASTRA_TRANSCRIPT_CACHE_ENTRY_OVERHEAD = 64;
const ASTRA_TRANSCRIPT_WIDTH_STATE_MAX_ENTRIES = 4;
const ASTRA_TRANSCRIPT_WIDTH_METADATA_MAX_LOGICAL_BYTES = 2 * 1024 * 1024;
const ASTRA_TRANSCRIPT_WIDTH_METADATA_ENTRY_OVERHEAD = 64;

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
	if (value === null || value === undefined || typeof value === "string" || typeof value === "boolean" || typeof value === "number") return true;
	if (typeof value !== "object") return false;
	if (deeplyImmutablePlainData.has(value)) return true;
	if (visiting.has(value)) return false;
	try {
		const prototype = Object.getPrototypeOf(value);
		if (prototype !== Object.prototype && prototype !== null && prototype !== Array.prototype) return false;
		if (!Object.isFrozen(value)) return false;
		const keys = Reflect.ownKeys(value);
		if (keys.some(key => typeof key === "symbol")) return false;
		if (Array.isArray(value) && keys.some(key => key !== "length" && !isArrayIndex(key as string, value.length))) return false;
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

function durableTranscriptRevision(snapshot: WorkbenchSnapshot): DurableTranscriptRevision {
	return {
		projectId: snapshot.projectId,
		threadId: snapshot.threadId,
		journalSequence: snapshot.journalSequence,
		activities: snapshot.activities,
		chat: snapshot.chat,
		tnotes: snapshot.tnotes,
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

function sameReuseInputs(left: readonly unknown[], right: readonly unknown[]): boolean {
	if (left.length !== right.length) return false;
	for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) return false;
	return true;
}

function canReuseDurableBlock(left: TranscriptBlock, right: TranscriptBlock): boolean {
	if (left.key !== right.key || left.reuse.kind !== right.reuse.kind) return false;
	if (left.reuse.kind === "never" || right.reuse.kind === "never") return false;
	if (!left.reuse.immutable || !right.reuse.immutable) return false;
	if (left.reuse.kind === "activity" && right.reuse.kind === "activity") {
		return left.reuse.source === right.reuse.source && left.reuse.expanded === right.reuse.expanded;
	}
	if (left.reuse.kind === "message" && right.reuse.kind === "message") return sameReuseInputs(left.reuse.inputs, right.reuse.inputs);
	if (left.reuse.kind === "tnote" && right.reuse.kind === "tnote") return sameReuseInputs(left.reuse.inputs, right.reuse.inputs);
	return false;
}

function volatileTranscriptRevision(snapshot: WorkbenchSnapshot, expanded: boolean, durableEmpty: boolean): VolatileTranscriptRevision {
	let request = 0, response = 0;
	if (snapshot.draft) for (const message of snapshot.chat) {
		if (message.role === "user") { request += 1; response = 0; }
		else if (message.role === "assistant" && request > 0) response += 1;
	}
	return {
		durableEmpty,
		draftLabel: snapshot.draft ? `${Math.max(1, request)}:${response + 1}` : null,
		snapshot: expanded ? snapshot : null,
		draft: snapshot.draft,
		reasoningSummaryDraft: snapshot.reasoningSummaryDraft,
		actionResult: snapshot.actionResult,
		error: snapshot.error,
		developmentRecordingError: snapshot.developmentRecordingError,
		linearDashboard: snapshot.linearDashboard,
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

export function hasVisibleAstraContent(snapshot: WorkbenchSnapshot): boolean {
	return snapshot.actionResult?.kind === "workflow" || snapshot.chat.length > 0
		|| snapshot.workFlow.steps.length > 0
		|| Boolean(snapshot.pendingApproval || snapshot.executionRun?.receipt || snapshot.executionRun?.phase === "waiting"
			|| snapshot.reasoningSummaryDraft || snapshot.reasoningDraft || snapshot.draft || snapshot.error);
}

/** Public transcript and tool timeline. Product welcome and raw reasoning stay outside the durable timeline. */
export class AstraTranscriptView implements Component {
	private readonly welcome = new WorkbenchWelcomeView();
	private welcomeVisible = false;
	private nextGenerationId = 1;
	private durableGeneration: DurableTranscriptGeneration | null = null;
	private volatileGeneration: VolatileTranscriptGeneration | null = null;
	private rowCache = new Map<string, TranscriptRowCacheEntry>();
	private rowCacheLogicalBytes = 0;
	private markdown = new Map<string, { text: string; view: Markdown }>();
	private snapshotVersion = 0;
	private renderedTheme = getActiveTuiTheme();
	private counters = {
		exactCountBuilds: 0, exactCountBuildMs: 0, requestedRows: 0, requestedMaterializationMs: 0, renderedBlocks: 0,
		durableGraphBuilds: 0, durableGraphBuildMs: 0, durableGenerationNoopReuses: 0,
		durableCountReusedBlocks: 0, durableCountRenderedBlocks: 0,
	};
	public expanded = false;
	constructor(private snapshot: WorkbenchSnapshot) {}
	update(snapshot: WorkbenchSnapshot): void {
		if (hasVisibleAstraContent(snapshot)) {
			this.welcome.dispose();
			this.welcomeVisible = false;
		}
		this.snapshot = snapshot;
		this.snapshotVersion += 1;
	}
	invalidate(): void {
		this.durableGeneration = null;
		this.volatileGeneration = null;
		this.rowCache.clear();
		this.rowCacheLogicalBytes = 0;
		for (const entry of this.markdown.values()) entry.view.invalidate();
	}
	// The common shell owns lifecycle ticks. Astra's pinned execution heading owns activity.
	syncActivity(_indicator: unknown, _requestRender: () => void): void {}
	playWelcomeIntro(requestRender: () => void): void {
		if (hasVisibleAstraContent(this.snapshot)) return;
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
	cacheMetrics(): AstraTranscriptCacheMetrics {
		const generations: TranscriptGeneration[] = [];
		if (this.durableGeneration) generations.push(this.durableGeneration);
		if (this.volatileGeneration) generations.push(this.volatileGeneration);
		return {
			durableBlockCount: this.durableGeneration?.blocks.length ?? 0,
			volatileBlockCount: this.volatileGeneration?.blocks.length ?? 0,
			markdownEntries: this.markdown.size,
			rowEntries: this.rowCache.size,
			rowLogicalBytes: this.rowCacheLogicalBytes,
			widthStates: generations.reduce((sum, generation) => sum + generation.widths.size, 0),
			widthMetadataLogicalBytes: generations.reduce((sum, generation) => sum + [...generation.widths.values()].reduce((subtotal, state) => subtotal + state.logicalBytes, 0), 0),
			exactCountBuilds: this.counters.exactCountBuilds,
			exactCountBuildMs: this.counters.exactCountBuildMs,
			requestedRows: this.counters.requestedRows,
			requestedMaterializationMs: this.counters.requestedMaterializationMs,
			renderedBlocks: this.counters.renderedBlocks,
			durableGraphBuilds: this.counters.durableGraphBuilds,
			durableGraphBuildMs: this.counters.durableGraphBuildMs,
			durableGenerationNoopReuses: this.counters.durableGenerationNoopReuses,
			durableCountReusedBlocks: this.counters.durableCountReusedBlocks,
			durableCountRenderedBlocks: this.counters.durableCountRenderedBlocks,
		};
	}
	private md(key: string, text: string, width: number, ink = a.text): string[] {
		let entry = this.markdown.get(key);
		if (!entry) { entry = { text, view: new Markdown(text, 0, 0, key.startsWith("tnote:") ? tnoteMarkdownTheme : astraMarkdownTheme) }; this.markdown.set(key, entry); }
		else if (entry.text !== text) { entry.text = text; entry.view.setText(text); }
		const rows = entry.view.render(width).map(row => ink(row));
		// The bounded block LRU below is the sole rendered-row owner. Markdown's
		// own last-width cache would otherwise retain one full row set per message.
		entry.view.invalidate();
		return rows;
	}
	private durableBlocks(s: WorkbenchSnapshot): TranscriptBlock[] {
		const blocks: TranscriptBlock[] = [];
		const expanded = this.expanded;
		const labels = astraConversationLabels(s.chat);
			const messageByActivity = new Map(s.chat.map(m => [m.activityId, m]));
			const rendered = new Set<string>();
			const tools = new Map<string, ProjectActivity>();
			const activitiesById = new Map(s.activities.map(activity => [activity.id, activity]));
			const notesByAnchor = new Map<string, typeof s.tnotes>();
			const unanchoredNotes: typeof s.tnotes[number][] = [];
			for (const note of s.tnotes) {
				const anchor = note.sourceActivityIds.map(id => activitiesById.get(id)).filter((activity): activity is ProjectActivity => Boolean(activity)).sort((left, right) => right.sequence - left.sequence)[0];
				if (!anchor) unanchoredNotes.push(note);
				else notesByAnchor.set(anchor.id, [...(notesByAnchor.get(anchor.id) ?? []), note]);
			}
			const identity = (item: ProjectActivity) => [item.nativeRefs.threadId, item.nativeRefs.turnId, item.nativeRefs.itemId ?? item.id].join("\0");
			for (const activity of s.activities) if (["tool", "file-change"].includes(activity.kind)) tools.set(identity(activity), activity);
			const note = (item: typeof s.tnotes[number]) => {
				const markdownKey = `tnote:${item.id}`;
				const renderItem = { ...item, sourceActivityIds: [...item.sourceActivityIds] };
				blocks.push({
					key: markdownKey,
					markdownKeys: [markdownKey],
					reuse: { kind: "tnote", immutable: isDeeplyImmutablePlainData(item), inputs: [item.id, item.title, item.summary, ...item.sourceActivityIds] },
					render: width => {
				const rows: string[] = [];
				const contentWidth = Math.max(1, width - 4);
				const source = renderItem.sourceActivityIds.at(-1);
				const panels = tnotePanels(renderItem, contentWidth);
				if (!panels) {
					rows.push("", ...this.md(markdownKey, astraTNoteMarkdown(renderItem), contentWidth).map(row => fit(`  ${row}`, width)), "");
					return rows.map(row => fit(row, width));
				}
				const evidence = `${a.secondary(`Evidence ${renderItem.sourceActivityIds.length}`)}${source ? `  ·  ${a.active(`/source ${safe(source)}`)}` : ""}  ·  ${a.secondary(`/promote tnote ${safe(renderItem.id)}`)}`;
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
					},
				});
			};
			const message = (m: WorkbenchSnapshot["chat"][number]) => {
				rendered.add(m.id);
				const { id, role, content: sourceContent, status, partial } = m;
				const labelText = labels.get(id) ?? "Notice";
				blocks.push({
					key: `message:${id}`,
					markdownKeys: [id],
					reuse: { kind: "message", immutable: isDeeplyImmutablePlainData(m), inputs: [id, role, sourceContent, status, partial, labelText] },
					render: width => {
						const ink = role === "user" ? a.request : role === "assistant" ? a.response : a.info;
						const label = astraTitle(labelText, ink);
						const content = role === "assistant" ? (status === "completed" && !partial ? sanitizeCompletedAssistantResponse(sourceContent) : sanitizePartialAssistantResponse(sourceContent)) : sourceContent;
						if (role === "assistant") {
							const contentWidth = Math.max(1, width >= 5 ? width - 4 : width);
							return responseFrameRows(labelText, status === "completed" ? "" : status, this.md(id, safe(content, 24000), contentWidth, a.answer), width);
						}
						return ["", pair(label, a.muted(status === "completed" ? "" : status), width),
							...this.md(id, safe(content, 24000), Math.max(1, width - 2), a.text).map(row => "  " + row), ""].map(row => fit(row, width));
					},
				});
			};
			for (const activity of s.activities) {
				const m = messageByActivity.get(activity.id);
				if (m) message(m);
				else if (tools.get(identity(activity)) === activity) blocks.push({
					key: `activity:${activity.id}`,
					markdownKeys: [],
					reuse: { kind: "activity", immutable: isDeeplyImmutablePlainData(activity), source: activity, expanded },
					render: width => astraToolRows(activity, width, expanded).map(row => fit(row, width)),
				});
				for (const item of notesByAnchor.get(activity.id) ?? []) note(item);
			}
			for (const item of unanchoredNotes) note(item);
			// Durable activity order is authoritative. Only a not-yet-recorded outbound
			// request may appear optimistically before Native thread creation finishes.
			for (const m of s.chat) if (!rendered.has(m.id) && m.role === "user" && m.status !== "completed") message(m);
		return blocks;
	}
	private volatileBlocks(s: WorkbenchSnapshot): TranscriptBlock[] {
		const blocks: TranscriptBlock[] = [];
		if (s.draft) {
			const labels = astraConversationLabels(s.chat);
			const latestRequest = [...s.chat].reverse().find(message => message.role === "user");
			const requestNumber = latestRequest ? labels.get(latestRequest.id)?.replace("REQ ", "") : "1";
			const responseCount = latestRequest ? s.chat.slice(s.chat.lastIndexOf(latestRequest) + 1).filter(message => message.role === "assistant").length + 1 : 1;
			blocks.push({ key: "volatile:draft", markdownKeys: ["draft"], reuse: { kind: "never" }, render: width => {
				const contentWidth = Math.max(1, width >= 5 ? width - 4 : width);
				return responseFrameRows(`RES ${requestNumber}-${responseCount} 작성 중`, "streaming", this.md("draft", safe(sanitizePartialAssistantResponse(s.draft), 24000), contentWidth, a.answer), width);
			} });
		}
		if (s.reasoningSummaryDraft && !s.draft) blocks.push({ key: "volatile:reasoning-summary", markdownKeys: [], reuse: { kind: "never" }, render: width => ["", ...prose(a.muted(safe(s.reasoningSummaryDraft, 1200)), width, 2)].map(row => fit(row, width)) });
		if (s.actionResult) {
			blocks.push({ key: "volatile:action-result", markdownKeys: [], reuse: { kind: "never" }, render: width => {
				const ink = s.actionResult!.kind === "tnote" ? a.secondary : s.actionResult!.kind === "todo" ? a.plan : a.response;
				const rows = [...section(safe(s.actionResult!.title), width, s.actionResult!.kind, ink), ...prose(safe(s.actionResult!.body, 16000), width)];
				if (s.actionResult!.digest) rows.push(...prose(a.muted(`digest ${safe(s.actionResult!.digest)}`), width));
				return rows.map(row => fit(row, width));
			} });
		}
		if (s.error) blocks.push({ key: "volatile:error", markdownKeys: [], reuse: { kind: "never" }, render: width => ["", ...prose(a.failure(`! ${safe(s.error)}`), width)].map(row => fit(row, width)) });
		if (s.developmentRecordingError) blocks.push({ key: "volatile:recording-error", markdownKeys: [], reuse: { kind: "never" }, render: width => ["", ...prose(a.attention(`기록 오류: ${safe(s.developmentRecordingError)}`), width)].map(row => fit(row, width)) });
		if (this.expanded) blocks.push({ key: "volatile:recap", markdownKeys: [], reuse: { kind: "never" }, render: width => ["", ...conversationRecapRows(s, width)].map(row => fit(row, width)) });
		return blocks;
	}
	private emptyBlock(s: WorkbenchSnapshot): TranscriptBlock {
		return { key: "volatile:empty", markdownKeys: [], reuse: { kind: "never" }, render: width => {
			if (this.welcomeVisible && !hasVisibleAstraContent(s)) return this.welcome.render(width).map(row => fit(row, width));
			const rows = ["", a.strong("실행을 맡기고, 필요한 순간 개입하세요."), "", a.muted("요청 · 도구 실행 · 결과가 이곳에 시간순으로 기록됩니다."), "", a.active("/goal") + a.muted("  작업 목표 설정"), a.active("/model") + a.muted(" 모델과 추론 강도 선택"), a.active("Ctrl+P") + a.muted(" 명령 찾기")];
			const d = s.linearDashboard;
			if (d?.state === "ready" || d?.state === "stale") rows.push("", a.muted(`${oneLine(d.projectName)} / Linear ${d.state === "stale" ? "마지막 성공 값" : "연결됨"}`), a.muted("/context  프로젝트 갱신 · 이슈 · 마일스톤"));
			else if (d) rows.push("", a.muted(d.state === "loading" ? "Linear 정보를 불러오는 중" : "Linear 정보를 불러오지 못했습니다"));
			return rows.map(row => fit(row, width));
		} };
	}
	private pruneGenerationRows(generationId: number): void {
		const prefix = `${generationId}:`;
		for (const [key, entry] of this.rowCache) if (key.startsWith(prefix)) {
			this.rowCache.delete(key);
			this.rowCacheLogicalBytes -= entry.logicalBytes;
		}
	}
	private retainWidthIndex(widths: Map<number, TranscriptWidthIndex>, state: TranscriptWidthIndex): void {
		let retainedBytes = [...widths.values()].reduce((sum, value) => sum + value.logicalBytes, 0);
		while (widths.size > 0 && (widths.size >= ASTRA_TRANSCRIPT_WIDTH_STATE_MAX_ENTRIES
			|| retainedBytes + state.logicalBytes > ASTRA_TRANSCRIPT_WIDTH_METADATA_MAX_LOGICAL_BYTES)) {
			const oldestWidth = widths.keys().next().value as number;
			retainedBytes -= widths.get(oldestWidth)!.logicalBytes;
			widths.delete(oldestWidth);
		}
		if (state.logicalBytes <= ASTRA_TRANSCRIPT_WIDTH_METADATA_MAX_LOGICAL_BYTES) widths.set(state.width, state);
	}
	private durableCount(block: TranscriptBlock, width: number): number {
		this.counters.renderedBlocks += 1;
		this.counters.durableCountRenderedBlocks += 1;
		return block.render(width).length;
	}
	private repairDurableWidths(previous: DurableTranscriptGeneration, blocks: readonly TranscriptBlock[]): Map<number, TranscriptWidthIndex> {
		const widths = new Map<number, TranscriptWidthIndex>();
		if (previous.widths.size === 0) return widths;
		const startedAt = performance.now();
		const previousIndex = new Map(previous.blocks.map((block, index) => [block, index] as const));
		for (const [width, prior] of previous.widths) {
			const counts = blocks.map(block => {
				const index = previousIndex.get(block);
				if (index === undefined) return this.durableCount(block, width);
				this.counters.durableCountReusedBlocks += 1;
				return prior.counts[index]!;
			});
			const prefix = [0];
			for (const count of counts) prefix.push(prefix[prefix.length - 1]! + count);
			this.retainWidthIndex(widths, {
				width, counts, prefix, rowCount: prefix[prefix.length - 1]!,
				logicalBytes: ASTRA_TRANSCRIPT_WIDTH_METADATA_ENTRY_OVERHEAD + (counts.length + prefix.length) * 8,
			});
		}
		this.counters.exactCountBuildMs += performance.now() - startedAt;
		return widths;
	}
	private reconcileDurableBlocks(previous: readonly TranscriptBlock[], candidate: readonly TranscriptBlock[], allowReuse: boolean): readonly TranscriptBlock[] {
		if (!allowReuse || previous.length === 0 || candidate.length === 0) return candidate;
		const buckets = new Map<string, { blocks: TranscriptBlock[]; cursor: number }>();
		for (const block of previous) {
			const bucket = buckets.get(block.key) ?? { blocks: [], cursor: 0 };
			bucket.blocks.push(block);
			buckets.set(block.key, bucket);
		}
		return candidate.map(block => {
			const bucket = buckets.get(block.key);
			const prior = bucket ? bucket.blocks[bucket.cursor++] : undefined;
			return prior && canReuseDurableBlock(prior, block) ? prior : block;
		});
	}
	private prepareGenerations(): { durable: DurableTranscriptGeneration; volatile: VolatileTranscriptGeneration } {
		const s = this.snapshot;
		const durableRevision = durableTranscriptRevision(s);
		if (!this.durableGeneration) {
			this.counters.durableGraphBuilds += 1;
			const startedAt = performance.now();
			const blocks = this.durableBlocks(s);
			const trustedImmutableRevision = trustedDurableRevision(durableRevision);
			this.counters.durableGraphBuildMs += performance.now() - startedAt;
			this.durableGeneration = { id: this.nextGenerationId++, kind: "durable", expanded: this.expanded, snapshotVersion: this.snapshotVersion, revision: durableRevision, trustedImmutableRevision, blocks, widths: new Map() };
		} else if (this.durableGeneration.expanded === this.expanded && (this.durableGeneration.snapshotVersion === this.snapshotVersion
			|| this.durableGeneration.trustedImmutableRevision && sameTrustedDurableReferences(this.durableGeneration.revision, durableRevision))) {
			if (this.durableGeneration.revision.journalSequence !== durableRevision.journalSequence) this.counters.durableGenerationNoopReuses += 1;
			this.durableGeneration.snapshotVersion = this.snapshotVersion;
			this.durableGeneration.revision = durableRevision;
		} else {
			const previous = this.durableGeneration;
			this.counters.durableGraphBuilds += 1;
			const startedAt = performance.now();
			const candidate = this.durableBlocks(s);
			const sameLifetime = previous.revision.projectId === durableRevision.projectId && previous.revision.threadId === durableRevision.threadId;
			const blocks = this.reconcileDurableBlocks(previous.blocks, candidate, sameLifetime);
			const trustedImmutableRevision = trustedDurableRevision(durableRevision);
			const sameGraph = sameLifetime && previous.expanded === this.expanded && blocks.length === previous.blocks.length
				&& blocks.every((block, index) => block === previous.blocks[index]);
			this.counters.durableGraphBuildMs += performance.now() - startedAt;
			if (sameGraph) {
				previous.snapshotVersion = this.snapshotVersion;
				previous.revision = durableRevision;
				previous.trustedImmutableRevision = trustedImmutableRevision;
				this.counters.durableGenerationNoopReuses += 1;
			} else {
				const widths = this.repairDurableWidths(previous, blocks);
				this.pruneGenerationRows(previous.id);
				this.durableGeneration = { id: this.nextGenerationId++, kind: "durable", expanded: this.expanded, snapshotVersion: this.snapshotVersion, revision: durableRevision, trustedImmutableRevision, blocks, widths };
			}
		}
		const volatileRevision = volatileTranscriptRevision(s, this.expanded, this.durableGeneration.blocks.length === 0);
		if (!this.volatileGeneration || !sameVolatileTranscriptRevision(this.volatileGeneration.revision, volatileRevision)) {
			if (this.volatileGeneration) this.pruneGenerationRows(this.volatileGeneration.id);
			let blocks = this.volatileBlocks(s);
			if (this.durableGeneration.blocks.length === 0 && blocks.length === 0) blocks = [this.emptyBlock(s)];
			this.volatileGeneration = { id: this.nextGenerationId++, kind: "volatile", revision: volatileRevision, blocks, widths: new Map() };
		}
		const retained = new Set([...this.durableGeneration.blocks, ...this.volatileGeneration.blocks].flatMap(block => block.markdownKeys));
		for (const key of this.markdown.keys()) if (!retained.has(key)) this.markdown.delete(key);
		return { durable: this.durableGeneration, volatile: this.volatileGeneration };
	}
	private renderBlock(generation: TranscriptGeneration, blockIndex: number, width: number, retain: boolean, countBuild = false): readonly string[] {
		const key = `${generation.id}:${width}:${blockIndex}`;
		const cached = this.rowCache.get(key);
		if (cached) {
			this.rowCache.delete(key);
			this.rowCache.set(key, cached);
			return cached.rows;
		}
		this.counters.renderedBlocks += 1;
		if (countBuild && generation.kind === "durable") this.counters.durableCountRenderedBlocks += 1;
		const rows = generation.blocks[blockIndex]!.render(width);
		if (!retain) return rows;
		const logicalBytes = rows.reduce((sum, row) => sum + row.length * 2, ASTRA_TRANSCRIPT_CACHE_ENTRY_OVERHEAD);
		while (this.rowCache.size > 0 && this.rowCacheLogicalBytes + logicalBytes > ASTRA_TRANSCRIPT_CACHE_MAX_LOGICAL_BYTES) {
			const oldestKey = this.rowCache.keys().next().value as string;
			const oldest = this.rowCache.get(oldestKey)!;
			this.rowCache.delete(oldestKey);
			this.rowCacheLogicalBytes -= oldest.logicalBytes;
		}
		if (logicalBytes <= ASTRA_TRANSCRIPT_CACHE_MAX_LOGICAL_BYTES) {
			const entry = { rows: [...rows], logicalBytes };
			this.rowCache.set(key, entry);
			this.rowCacheLogicalBytes += logicalBytes;
			return entry.rows;
		}
		return rows;
	}
	private widthIndex(generation: TranscriptGeneration, width: number, retainRows = false): TranscriptWidthIndex {
		const cached = generation.widths.get(width);
		if (cached) {
			generation.widths.delete(width);
			generation.widths.set(width, cached);
			return cached;
		}
		this.counters.exactCountBuilds += 1;
		const startedAt = performance.now();
		const counts = generation.blocks.map((_, index) => this.renderBlock(generation, index, width, retainRows, true).length);
		const prefix = [0];
		for (const count of counts) prefix.push(prefix[prefix.length - 1]! + count);
		const logicalBytes = ASTRA_TRANSCRIPT_WIDTH_METADATA_ENTRY_OVERHEAD + (counts.length + prefix.length) * 8;
		const state = { width, counts, prefix, rowCount: prefix[prefix.length - 1]!, logicalBytes };
		this.retainWidthIndex(generation.widths, state);
		this.counters.exactCountBuildMs += performance.now() - startedAt;
		return state;
	}
	private rowsFrom(generation: TranscriptGeneration, index: TranscriptWidthIndex, start: number, count: number): string[] {
		if (count === 0 || start >= index.rowCount) return [];
		const end = Math.min(index.rowCount, start + count);
		let low = 0, high = generation.blocks.length;
		while (low < high) {
			const middle = Math.floor((low + high) / 2);
			if (index.prefix[middle + 1]! <= start) low = middle + 1;
			else high = middle;
		}
		const rows: string[] = [];
		for (let blockIndex = low; blockIndex < generation.blocks.length && index.prefix[blockIndex]! < end; blockIndex += 1) {
			const blockRows = this.renderBlock(generation, blockIndex, index.width, true);
			if (blockRows.length !== index.counts[blockIndex]) throw new Error(`Astra transcript block ${generation.blocks[blockIndex]!.key} changed row count at width ${index.width}`);
			const localStart = Math.max(0, start - index.prefix[blockIndex]!);
			const localEnd = Math.min(blockRows.length, end - index.prefix[blockIndex]!);
			rows.push(...blockRows.slice(localStart, localEnd));
		}
		if (rows.length !== end - start) throw new Error(`Astra transcript row source returned ${rows.length} rows; expected ${end - start}`);
		return rows;
	}
	scrollRows(width: number): ScrollRowSource {
		const activeTheme = getActiveTuiTheme();
		if (activeTheme !== this.renderedTheme) {
			this.renderedTheme = activeTheme;
			this.invalidate();
		}
		const safeWidth = Math.max(1, Math.floor(width));
		const { durable, volatile } = this.prepareGenerations();
		const durableIndex = this.widthIndex(durable, safeWidth);
		const volatileIndex = this.widthIndex(volatile, safeWidth, true);
		const rowCount = durableIndex.rowCount + volatileIndex.rowCount;
		return {
			rowCount,
			rows: (start, count) => {
				if (!Number.isSafeInteger(start) || !Number.isSafeInteger(count) || start < 0 || count < 0 || start + count > rowCount) throw new RangeError(`Invalid Astra transcript row range ${start}:${count}/${rowCount}`);
				this.counters.requestedRows += count;
				if (count === 0) return [];
				const startedAt = performance.now();
				const rows: string[] = [];
				const durableCount = Math.max(0, Math.min(count, durableIndex.rowCount - start));
				if (durableCount > 0) rows.push(...this.rowsFrom(durable, durableIndex, start, durableCount));
				const volatileStart = Math.max(0, start - durableIndex.rowCount);
				const remaining = count - rows.length;
				if (remaining > 0) rows.push(...this.rowsFrom(volatile, volatileIndex, volatileStart, remaining));
				if (rows.length !== count) throw new Error(`Astra transcript row source returned ${rows.length} rows; expected ${count}`);
				this.counters.requestedMaterializationMs += performance.now() - startedAt;
				return rows;
			},
		};
	}
	render(width: number): string[] {
		if (width <= 0) return [];
		const source = this.scrollRows(width);
		return [...source.rows(0, source.rowCount)];
	}
}

export function astraToolRows(activity: ProjectActivity, width: number, expanded: boolean): string[] {
	const payload = record(boundedPublicProjection(activity.payload).value);
	const item = record(record(payload.params).item);
	const kind = oneLine(item.type || activity.kind);
	const title = oneLine(item.command || item.tool || item.name || item.path || kind, 600);
	const output = safe(item.aggregatedOutput || item.output || payload.output || record(item.error).message || "", 8000);
	const result = item.result ? safe(typeof item.result === "string" ? item.result : JSON.stringify(item.result, null, 2)) : "";
	const failed = activity.phase === "failed" || item.status === "failed" || typeof item.exitCode === "number" && item.exitCode !== 0;
	const running = !failed && ["started", "updated"].includes(activity.phase) && !["completed", "cancelled", "interrupted"].includes(String(item.status));
	const changes = Array.isArray(item.changes) ? item.changes.map(record) : [];
	if (typeof item.command === "string" && (running || failed || expanded) && width >= 20) {
		const ink = failed ? a.failure : running ? a.tool : a.rule;
		const inside = width - 4;
		const state = failed ? "실패" : running ? "실행 중" : activity.phase;
		const body = (row: string) => `${ink("│")} ${fit(row, inside)} ${ink("│")}`;
		const command = prose(`${failed ? "!" : "$"} ${safe(item.command)}`, inside);
		const outputRows = prose(output || result || (running ? "출력 대기 중" : "출력 없음"), inside);
		const shown = expanded ? outputRows : outputRows.slice(-CHAT_TERMINAL_OUTPUT_CHUNK_LINES);
		const meta = [typeof item.exitCode === "number" ? `exit ${item.exitCode}` : state, typeof item.durationMs === "number" && Number.isFinite(item.durationMs) ? duration(item.durationMs) : ""].filter(Boolean).join("  ");
		const label = ` Bash  ${state} `;
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
