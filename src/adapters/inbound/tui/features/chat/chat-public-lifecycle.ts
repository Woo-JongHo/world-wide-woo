import { wrapTextWithAnsi }            from "@earendil-works/pi-tui";
import { sanitizeTerminalTextExcerpt } from "@/core/domain/execution/terminal";
import type { WorkbenchSnapshot }      from "@/core/domain/work/workbench";
import { colors, semantic }            from "@/adapters/inbound/tui/foundation/theme/theme";

function publicRecord(value: unknown): Readonly<Record<string, unknown>> | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? value as Readonly<Record<string, unknown>>
		: null;
}

function publicText(value: unknown, limit = 160): string | null {
	if (typeof value !== "string" || !value.trim()) return null;
	return sanitizeTerminalTextExcerpt(value, limit, "head-tail").trim();
}

/** Projects durable Native lifecycle events into compact public transcript rows. */
export function publicTimelineActivityRows(
	activity: WorkbenchSnapshot["activities"][number],
	width: number,
): string[] | null {
	const method   = publicText(activity.payload.method)?.toLowerCase() ?? "" ;
	const params   = publicRecord(activity.payload.params)                    ;
	const item     = publicRecord(params?.item)                               ;
	const itemType = publicText(item?.type)?.toLowerCase() ?? ""              ;
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
		const prompt       = publicText(item?.prompt, 120)?.split(/\r?\n/u)[0]                                      ;
		const tool         = publicText(item?.tool, 80)                                                             ;
		const label        = prompt || tool || "서브에이전트"                                                       ;
		const nativeStatus = publicText(item?.status)?.toLowerCase() ?? ""                                          ;
		const failed       = activity.phase === "failed" || nativeStatus === "failed" || nativeStatus === "errored" ;
		const interrupted  = activity.phase === "cancelled" || nativeStatus === "interrupted"                       ;
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
