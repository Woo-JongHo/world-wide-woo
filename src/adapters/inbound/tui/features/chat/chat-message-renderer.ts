import { Markdown, truncateToWidth, visibleWidth, wrapTextWithAnsi }            from "@earendil-works/pi-tui";
import { sanitizeTerminalTextExcerpt, sanitizeTerminalTextUnbounded }           from "@/core/domain/execution/terminal";
import { sanitizeCompletedAssistantResponse, sanitizePartialAssistantResponse } from "@/core/domain/review/redaction";
import type { WorkbenchSnapshot }                                               from "@/core/domain/work/workbench";
import { colors, markdownTheme, semantic }                                      from "@/adapters/inbound/tui/foundation/theme/theme";

const WORKBENCH_MARKDOWN_MAX_CHARS = 16 * 1024            ;
const WORKBENCH_MARKDOWN_MAX_LINES = 120                  ;
const WORKBENCH_MARKDOWN_OMISSION  = "… 응답 일부 생략 …" ;

export function boundedWorkbenchMarkdown(text: string): string {
	let candidate = text;
	if (candidate.length > WORKBENCH_MARKDOWN_MAX_CHARS) {
		const contentBudget = WORKBENCH_MARKDOWN_MAX_CHARS - WORKBENCH_MARKDOWN_OMISSION.length - 2;
		const headBudget = Math.floor(contentBudget / 2);
		candidate = `${candidate.slice(0, headBudget)}\n${WORKBENCH_MARKDOWN_OMISSION}\n${candidate.slice(-(contentBudget - headBudget))}`;
	}
	const lines = candidate.split(/\r?\n/u);
	if (lines.length <= WORKBENCH_MARKDOWN_MAX_LINES) return candidate;
	const headLineCount = Math.floor((WORKBENCH_MARKDOWN_MAX_LINES - 1) / 2)                    ;
	const tailLineCount = WORKBENCH_MARKDOWN_MAX_LINES - headLineCount - 1                      ;
	let head            = lines.slice(0, headLineCount).join("\n")                              ;
	let tail            = lines.slice(-tailLineCount).join("\n")                                ;
	const contentBudget = WORKBENCH_MARKDOWN_MAX_CHARS - WORKBENCH_MARKDOWN_OMISSION.length - 2 ;
	if (head.length + tail.length > contentBudget) {
		const headBudget = Math.floor(contentBudget / 2);
		head = head.slice(0, headBudget);
		tail = tail.slice(-(contentBudget - headBudget));
	}
	return `${head}\n${WORKBENCH_MARKDOWN_OMISSION}\n${tail}`;
}

function fit(text: string, width: number): string {
	if (width <= 0) return "";
	const clipped = truncateToWidth(text, width);
	return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

function publicText(value: unknown, limit = 160): string | null {
	if (typeof value !== "string" || !value.trim()) return null;
	return sanitizeTerminalTextExcerpt(value, limit, "head-tail").trim();
}

/** Projects durable user/assistant messages and streaming assistant drafts to terminal rows. */
export class ChatMessageRenderer {
	private readonly markdown       = new Map<string, Markdown>()           ;
	private readonly markdownInput  = new Map<string, string>()             ;
	private readonly markdownSource = new Map<string, string>()             ;
	private readonly draftMarkdown  = new Markdown("", 0, 0, markdownTheme) ;
	private draftInput              = ""                                    ;
	private draftSource             = ""                                    ;

	update(snapshot: WorkbenchSnapshot): void {
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
		for (const markdown of this.markdown.values()) markdown.invalidate();
		this.draftMarkdown.invalidate();
	}

	render(message: WorkbenchSnapshot["chat"][number], width: number): string[] {
		const contentWidth            = Math.max(1, width)                                                             ;
		const runtimeRole   : unknown = message.role                                                                   ;
		const runtimeStatus : unknown = message.status                                                                 ;
		const content                 = typeof message.content === "string" ? message.content : "[잘못된 메시지 본문]" ;
		if (message.role === "user") {
			const label = message.status === "failed" ? semantic.toolFailed("전송 실패")
				: message.status === "cancelled" ? semantic.toolCancelled("전송 중단")
					: message.status === "streaming" ? semantic.toolRunning("전송 준비 중") : "";
			return [
				`${semantic.userLabel("👤 USER")}${label ? ` · ${label}` : ""}`,
				...wrapTextWithAnsi(boundedWorkbenchMarkdown(content), contentWidth),
			].map(row => semantic.userSurface(fit(row, contentWidth)));
		}
		if (runtimeRole !== "assistant" && runtimeRole !== "system") {
			return [
				colors.error(`알 수 없는 메시지 역할 · ${publicText(runtimeRole) ?? "값 없음"}`),
				...wrapTextWithAnsi(boundedWorkbenchMarkdown(sanitizePartialAssistantResponse(content)), contentWidth),
			].map(row => truncateToWidth(row, contentWidth));
		}
		const knownStatus = runtimeStatus === "streaming" || runtimeStatus === "completed" || runtimeStatus === "incomplete"
			|| runtimeStatus === "failed" || runtimeStatus === "cancelled";
		const label = message.status === "incomplete"
			? semantic.toolCancelled(message.partial ? "부분 응답 · 최종 본문 미수신" : "최종 본문 미수신")
			: message.status === "cancelled" ? semantic.toolCancelled(message.partial ? "중단됨 · 부분 응답" : "중단됨")
				: message.status === "failed" ? semantic.toolFailed(message.partial ? "실패 · 부분 응답" : "실패")
					: message.status === "streaming" ? semantic.toolRunning("응답 중")
						: !knownStatus ? semantic.toolFailed(`알 수 없는 상태 · ${publicText(runtimeStatus) ?? "값 없음"}`) : "";
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
		return [...headerRows, ...bodyRows].map(row => truncateToWidth(row, contentWidth));
	}

	renderDraft(width: number): string[] {
		try { return this.draftMarkdown.render(width); }
		catch { return wrapTextWithAnsi(sanitizeTerminalTextUnbounded(this.draftSource), width); }
	}
}
