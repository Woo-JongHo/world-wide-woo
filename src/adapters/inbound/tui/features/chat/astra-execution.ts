import { Markdown, stripTerminalSequences, visibleWidth, type Component } from "@earendil-works/pi-tui";
import type { WorkbenchSnapshot } from "../../../../../core/domain/work/workbench";
import type { ProjectActivity } from "../../../../../core/domain/execution/project-activity";
import { sanitizeCompletedAssistantResponse, sanitizePartialAssistantResponse } from "../../../../../core/domain/review/redaction";
import { boundedPublicProjection } from "./bounded-public-projection";
import { conversationRecapRows } from "./conversation-recap-view";
import { a, astraMarkdownTheme, astraTitle, duration, fit, mark, oneLine, pair, prose, safe, section } from "../../foundation/theme/astra-theme";
import { parseCanonicalTNoteReport, parseLegacyCanonicalTNote } from "../../../../../core/application/work/t-note-service";

const tnoteMarkdownTheme = {
	...astraMarkdownTheme,
	heading: (text: string): string => {
		const label = stripTerminalSequences(text).trim();
		const ink = label === "Reason" || label === "원인" ? a.info
			: label === "Proposal" ? a.plan
			: label === "Action" ? a.tool
			: label === "Result" || label === "결과" ? a.success : a.note;
		return ink(text);
	},
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
			labels.set(message.id, `Request ${request}`);
		} else if (message.role === "assistant") {
			response += 1;
			labels.set(message.id, `Response ${Math.max(1, request)}-${response}`);
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
	const request = [...(s.requestRuntime ?? [])].reverse().find(r => r.turnId === s.activeTurnId && r.turnId !== null) ?? s.requestRuntime?.at(-1);
	if (request) {
		const stage = request.stages.find(x => ["running", "failed", "blocked"].includes(x.status));
		return { state: stage ? `${stage.id} · ${stage.status}` : request.status, title: oneLine(stage?.tasks.find(t => t.status === "running")?.title ?? request.objective), detail: `${oneLine(stage?.output ?? stage?.goal ?? "요청 종료")} · /todo 단계 · /context 기록`, attention: ["failed", "blocked"].includes(request.status) };
	}
	if (s.phase === "working") {
		const phase = s.executionRun?.phase;
		const waiting = ["waiting", "blocked", "reconciling", "unknown"].includes(phase ?? "");
		return { state: waiting ? "대기" : s.draft ? "결과 작성" : "실행 중", title: oneLine(current?.title || lastRequest?.content || s.sessionGoal?.text || "요청을 확인하는 중"), detail: waiting ? `실행 ${phase} · /monitor에서 관측 확인` : astraNowLabel(s) ?? oneLine(s.reasoningSummaryDraft || "첫 실행 관측을 기다리는 중"), attention: waiting };
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
	if (s.pendingApproval) return `Approval · ${oneLine(s.pendingApproval.params.command || s.pendingApproval.params.reason || "사용자 결정 대기")}`;
	const live = s.executionRun?.activeActivity ?? s.liveActivity;
	if (live) {
		const method = oneLine(live.method).toLowerCase();
		const kind = live.kind === "file-change" ? "Edit" : live.kind === "tool" && /command|bash/u.test(method) ? "Bash" : live.kind === "tool" ? "Tool" : live.kind === "approval" ? "Approval" : "Agent";
		return `${kind} · ${oneLine(live.text || live.method)}`;
	}
	if (s.draft) return "Response · 최종 응답 작성 중";
	return null;
}

export function astraTNoteMarkdown(item: WorkbenchSnapshot["tnotes"][number]): string {
	const report = parseCanonicalTNoteReport(item.summary);
	const legacy = parseLegacyCanonicalTNote(item.summary);
	const title = oneLine(report?.question || legacy?.question || item.title || "질문 요약");
	if (report) return [
		`## ${title}`,
		`## Proposal\n\n### Reason\n\n${safe(report.reason, 4000)}\n\n### Expected outcome\n\n${safe(report.proposal, 4000)}`,
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

function tnoteFieldRows(label: string, ink: (text: string) => string, value: string, width: number): string[] {
	return [astraTitle(label, ink), ...prose(safe(value, 4000), width, 2).map(row => a.text(row)), ""];
}

function tnoteSections(item: WorkbenchSnapshot["tnotes"][number], width: number): string[][] | null {
	const report = parseCanonicalTNoteReport(item.summary);
	if (report) return [
		[
			astraTitle("Proposal", a.rainbowRed),
			a.caption(tnoteTitle(item)),
			"",
			...tnoteFieldRows("Reason", a.rainbowOrange, report.reason, width),
			...tnoteFieldRows("Expected outcome", a.rainbowYellow, report.proposal, width),
		],
		[
			astraTitle("Report", a.rainbowRed),
			...tnoteFieldRows("Reason", a.rainbowOrange, report.reason, width),
			...tnoteFieldRows("Action", a.rainbowYellow, report.action, width),
			...tnoteFieldRows("Test", a.rainbowGreen, report.test || "테스트 실행 관측 없음", width),
			...tnoteFieldRows("Result", a.rainbowBlue, report.result, width),
		],
	];
	const legacy = parseLegacyCanonicalTNote(item.summary);
	if (legacy) return [[
		astraTitle("Report", a.rainbowRed),
		a.caption(tnoteTitle(item)),
		"",
		...tnoteFieldRows("Reason", a.rainbowOrange, legacy.why, width),
		...tnoteFieldRows("Result", a.rainbowBlue, legacy.result, width),
	]];
	return null;
}

/** Public transcript and tool timeline. No product theme, welcome, cards, or raw reasoning. */
export class AstraTranscriptView implements Component {
	private cache: {
		snapshot: WorkbenchSnapshot;
		width: number;
		expanded: boolean;
		activities: WorkbenchSnapshot["activities"];
		chat: WorkbenchSnapshot["chat"];
		tnotes: WorkbenchSnapshot["tnotes"];
		draft: WorkbenchSnapshot["draft"];
		reasoningSummaryDraft: WorkbenchSnapshot["reasoningSummaryDraft"];
		actionResult: WorkbenchSnapshot["actionResult"];
		error: WorkbenchSnapshot["error"];
		developmentRecordingError: WorkbenchSnapshot["developmentRecordingError"];
		linearDashboard: WorkbenchSnapshot["linearDashboard"];
		rows: string[];
	} | null = null;
	private durableCache: {
		width: number;
		expanded: boolean;
		activities: WorkbenchSnapshot["activities"];
		chat: WorkbenchSnapshot["chat"];
		tnotes: WorkbenchSnapshot["tnotes"];
		rows: string[];
		retainedMarkdown: Set<string>;
	} | null = null;
	private markdown = new Map<string, { text: string; view: Markdown; width: number | null; rows: string[] | null }>();
	public expanded = false;
	constructor(private snapshot: WorkbenchSnapshot) {}
	update(snapshot: WorkbenchSnapshot): void { this.snapshot = snapshot; }
	invalidate(): void { this.cache = null; this.durableCache = null; }
	// The common shell owns lifecycle ticks. Astra's pinned execution heading owns activity.
	syncActivity(_indicator: unknown, _requestRender: () => void): void {}
	playWelcomeIntro(_requestRender: () => void): void { this.invalidate(); }
	dispose(): void { this.markdown.clear(); this.cache = null; this.durableCache = null; }
	private md(key: string, text: string, width: number): string[] {
		let entry = this.markdown.get(key);
		if (!entry) { entry = { text, view: new Markdown(text, 0, 0, key.startsWith("tnote:") ? tnoteMarkdownTheme : astraMarkdownTheme), width: null, rows: null }; this.markdown.set(key, entry); }
		else if (entry.text !== text) { entry.text = text; entry.view.setText(text); entry.width = null; entry.rows = null; }
		if (entry.width === width && entry.rows) return entry.rows;
		entry.width = width;
		entry.rows = entry.view.render(width).map(row => a.text(row));
		return entry.rows;
	}
	render(width: number): string[] {
		if (width <= 0) return [];
		const s = this.snapshot;
		if (this.cache?.width === width
			&& this.cache.expanded === this.expanded
			&& (this.expanded ? this.cache.snapshot === s : this.cache.activities === s.activities
				&& this.cache.chat === s.chat
				&& this.cache.tnotes === s.tnotes
				&& this.cache.draft === s.draft
				&& this.cache.reasoningSummaryDraft === s.reasoningSummaryDraft
				&& this.cache.actionResult === s.actionResult
				&& this.cache.error === s.error
				&& this.cache.developmentRecordingError === s.developmentRecordingError
				&& this.cache.linearDashboard === s.linearDashboard)) return this.cache.rows;
		const durableHit = this.durableCache?.width === width
			&& this.durableCache.expanded === this.expanded
			&& this.durableCache.activities === s.activities
			&& this.durableCache.chat === s.chat
			&& this.durableCache.tnotes === s.tnotes;
		let rows: string[];
		let retained: Set<string>;
		if (durableHit) {
			rows = [...this.durableCache!.rows];
			retained = new Set(this.durableCache!.retainedMarkdown);
		} else {
			rows = [];
			retained = new Set<string>();
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
				const contentWidth = Math.max(1, width - 4);
				const source = item.sourceActivityIds.at(-1);
				const sections = tnoteSections(item, contentWidth);
				const bodies = sections ?? [[...this.md(`tnote:${item.id}`, astraTNoteMarkdown(item), contentWidth)]];
				if (!sections) retained.add(`tnote:${item.id}`);
				const sourceRows = prose(`근거 ${item.sourceActivityIds.length}개${source ? `  ·  /source ${safe(source)}` : ""}  ·  /promote tnote ${safe(item.id)}`, contentWidth).map(row => a.caption(row));
				bodies.at(-1)?.push("", ...sourceRows);
				for (const body of bodies) {
					rows.push("");
					if (width >= 4) {
						rows.push(a.info(`╭${"─".repeat(width - 2)}╮`));
						rows.push(...body.map(row => `${a.info("│")} ${fit(row, width - 4)} ${a.info("│")}`));
						rows.push(a.info(`╰${"─".repeat(width - 2)}╯`));
					} else rows.push(...body.map(row => fit(row, width)));
					rows.push("");
				}
			};
			const message = (m: WorkbenchSnapshot["chat"][number]) => {
				rendered.add(m.id); retained.add(m.id);
				const ink = m.role === "user" ? a.request : m.role === "assistant" ? a.response : a.info;
				const label = astraTitle(labels.get(m.id) ?? "Notice", ink);
				rows.push("", pair(label, a.muted(m.status === "completed" ? "" : m.status), width));
				const content = m.role === "assistant" ? (m.status === "completed" && !m.partial ? sanitizeCompletedAssistantResponse(m.content) : sanitizePartialAssistantResponse(m.content)) : m.content;
				rows.push(...this.md(m.id, safe(content, 24000), Math.max(1, width - 2)).map(row => "  " + row), "");
			};
			for (const activity of s.activities) {
				const m = messageByActivity.get(activity.id);
				if (m) message(m);
				else if (tools.get(identity(activity)) === activity) rows.push(...astraToolRows(activity, width, this.expanded));
				for (const item of notesByAnchor.get(activity.id) ?? []) note(item);
			}
			for (const item of unanchoredNotes) note(item);
			// Durable activity order is authoritative. Only a not-yet-recorded outbound
			// request may appear optimistically before Native thread creation finishes.
			for (const m of s.chat) if (!rendered.has(m.id) && m.role === "user" && m.status !== "completed") message(m);
			rows = rows.map(row => fit(row, width));
			this.durableCache = { width, expanded: this.expanded, activities: s.activities, chat: s.chat, tnotes: s.tnotes, rows, retainedMarkdown: new Set(retained) };
		}
		const durableRowCount = rows.length;
		if (s.draft) {
			const labels = astraConversationLabels(s.chat);
			const latestRequest = [...s.chat].reverse().find(message => message.role === "user");
			const requestLabel = latestRequest ? labels.get(latestRequest.id)?.replace("Request ", "") : "1";
			const responseCount = latestRequest ? s.chat.slice(s.chat.lastIndexOf(latestRequest) + 1).filter(message => message.role === "assistant").length + 1 : 1;
			retained.add("draft"); rows.push("", astraTitle(`Response ${requestLabel}-${responseCount} 작성 중`, a.response));
			rows.push(...this.md("draft", safe(sanitizePartialAssistantResponse(s.draft), 24000), Math.max(1, width - 2)).map(row => "  " + row));
		}
		if (s.reasoningSummaryDraft && !s.draft) rows.push("", ...prose(a.muted(safe(s.reasoningSummaryDraft, 1200)), width, 2));
		if (s.actionResult) {
			const ink = s.actionResult.kind === "tnote" ? a.note : s.actionResult.kind === "todo" ? a.plan : a.response;
			rows.push(...section(safe(s.actionResult.title), width, s.actionResult.kind, ink), ...prose(safe(s.actionResult.body, 16000), width));
			if (s.actionResult.digest) rows.push(...prose(a.muted(`digest ${safe(s.actionResult.digest)}`), width));
		}
		if (s.error) rows.push("", ...prose(a.failure(`! ${safe(s.error)}`), width));
		if (s.developmentRecordingError) rows.push("", ...prose(a.attention(`기록 오류: ${safe(s.developmentRecordingError)}`), width));
		if (this.expanded) rows.push("", ...conversationRecapRows(s, width));
		if (rows.length === 0) {
			rows.push("", a.strong("실행을 맡기고, 필요한 순간 개입하세요."), "", a.muted("요청 · 도구 실행 · 결과가 이곳에 시간순으로 기록됩니다."), "", a.active("/goal") + a.muted("  작업 목표 설정"), a.active("/model") + a.muted(" 모델과 추론 강도 선택"), a.active("Ctrl+P") + a.muted(" 명령 찾기"));
			const d = s.linearDashboard;
			if (d?.state === "ready" || d?.state === "stale") {
				rows.push("", a.muted(`${oneLine(d.projectName)} / Linear ${d.state === "stale" ? "마지막 성공 값" : "연결됨"}`), a.muted("/context  프로젝트 갱신 · 이슈 · 마일스톤"));
			} else if (d) rows.push("", a.muted(d.state === "loading" ? "Linear 정보를 불러오는 중" : "Linear 정보를 불러오지 못했습니다"));
		}
		for (const key of this.markdown.keys()) if (!retained.has(key)) this.markdown.delete(key);
		this.cache = {
			snapshot: s, width, expanded: this.expanded,
			activities: s.activities, chat: s.chat, tnotes: s.tnotes,
			draft: s.draft, reasoningSummaryDraft: s.reasoningSummaryDraft,
			actionResult: s.actionResult, error: s.error,
			developmentRecordingError: s.developmentRecordingError,
			linearDashboard: s.linearDashboard,
			rows: [...rows.slice(0, durableRowCount), ...rows.slice(durableRowCount).map(row => fit(row, width))],
		};
		return this.cache.rows;
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
		const shown = expanded || failed ? outputRows : outputRows.slice(-6);
		const meta = [typeof item.exitCode === "number" ? `exit ${item.exitCode}` : state, typeof item.durationMs === "number" && Number.isFinite(item.durationMs) ? duration(item.durationMs) : ""].filter(Boolean).join("  ");
		const label = ` Bash  ${state} `;
		return ["", ink(`┌${label}${"─".repeat(Math.max(0, width - visibleWidth(label) - 2))}┐`),
			...command.map(row => body(a.text(row))), body(a.rule("─".repeat(inside))),
			...(shown.length < outputRows.length ? [body(a.muted(`… 앞 ${outputRows.length - shown.length}줄 · Ctrl+E 전체`))] : []),
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
