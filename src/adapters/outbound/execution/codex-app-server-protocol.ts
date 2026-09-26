import type {
	NativeApprovalDecision,
	NativeApprovalKind,
	NativeApprovalRequest,
	NativeApprovalResponse,
	NativeApprovalResolution,
	NativeRefs,
	NativeRequestId,
	NativeThreadSnapshot,
	NativeThreadStatus,
	NativeThreadSummary,
	NativeTurnSnapshot,
} from "@/core/domain/execution/native-session.js";
import { sanitizeTerminalText }    from "@/core/domain/execution/terminal.js";
import type { UsageLimitSnapshot } from "@/core/ports/observability/usage-monitor-port";

export interface JsonRecord {
	[key: string]: unknown;
}

export interface NativeMcpServer {
	readonly name    : string            ;
	readonly enabled : boolean           ;
	readonly status  : string            ;
	readonly tools   : readonly string[] ;
}

/** Read-only result returned by an explicitly addressed App Server MCP tool. */
export interface NativeMcpToolResult {
	readonly content            : readonly unknown[] ;
	readonly structuredContent? : unknown            ;
	readonly isError?           : boolean | null     ;
}

export function codexThreadConfig(effort: string | undefined): JsonRecord {
	return compact({
		model_reasoning_effort: effort,
		tools: { update_plan: { enabled: true } },
	});
}

export function codexRateLimits(value: unknown): UsageLimitSnapshot[] {
	if (!isRecord(value)) throw new Error("Codex App Server returned an invalid account/rateLimits/read result");
	const byId = isRecord(value.rateLimitsByLimitId) ? value.rateLimitsByLimitId : undefined;
	const selected = byId && isRecord(byId.codex)
		? byId.codex
		: isRecord(value.rateLimits)
			? value.rateLimits
			: byId
				? Object.values(byId).find(isRecord)
				: undefined;
	if (!selected) throw new Error("Codex App Server omitted account rate limits");
	const name = typeof selected.limitName === "string" && selected.limitName.trim()
		? selected.limitName.trim()
		: "Codex";
	return [
		codexRateWindow(selected.primary, name),
		codexRateWindow(selected.secondary, name),
	].filter((limit): limit is UsageLimitSnapshot => limit !== undefined);
}

export function threadSnapshot(result: unknown, method: string): NativeThreadSnapshot {
	if (!isRecord(result) || !isRecord(result.thread) || typeof result.thread.id !== "string") {
		throw new Error(`Codex App Server returned an invalid ${method} result`);
	}
	return {
		id: result.thread.id,
		value: result.thread,
		...(typeof result.model === "string" ? { model: result.model } : {}),
		...(typeof result.reasoningEffort === "string" || result.reasoningEffort === null
			? { effort: result.reasoningEffort }
			: {}),
	};
}

export function turnSnapshot(result: unknown, threadId: string): NativeTurnSnapshot {
	if (!isRecord(result) || !isRecord(result.turn) || typeof result.turn.id !== "string") {
		throw new Error("Codex App Server returned an invalid turn/start result");
	}
	return { id: result.turn.id, threadId, value: result.turn };
}

export function threadSummary(value: unknown, index: number): NativeThreadSummary {
	if (!isRecord(value) ||
		typeof value.id !== "string" ||
		typeof value.updatedAt !== "number" ||
		typeof value.cwd !== "string" ||
		typeof value.preview !== "string" ||
		!isRecord(value.status) ||
		!isNativeThreadStatus(value.status.type)) {
		throw new Error(`Codex App Server returned an invalid thread/list item at index ${index}`);
	}
	return {
		id        : value.id,
		updatedAt : value.updatedAt,
		cwd       : value.cwd,
		preview   : sanitizeTerminalText(value.preview, 240),
		status    : value.status.type,
	};
}

export function mcpServer(value: unknown, index: number): NativeMcpServer {
	if (!isRecord(value) || typeof value.name !== "string" || !isRecord(value.tools)) {
		throw new Error(`Codex App Server returned an invalid mcpServerStatus/list item at index ${index}`);
	}
	const status = typeof value.runtimeStatus === "string" ? value.runtimeStatus : "unknown";
	return { name: value.name, enabled: status !== "disabled", status, tools: Object.keys(value.tools) };
}

export function escapeConfigKeySegment(value: string): string {
	return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

export function refsFrom(params: JsonRecord, approvalRequestId?: NativeRequestId, approvalCallbackId?: string | null): NativeRefs {
	const thread = isRecord(params.thread) ? params.thread : undefined;
	const turn   = isRecord(params.turn)   ? params.turn   : undefined;
	const item = isRecord(params.item)
		? params.item
		: params.type === "collabAgentToolCall" || params.type === "subAgentActivity"
			? params
			: undefined;
	const threadId = typeof params.threadId === "string" ? params.threadId : typeof thread?.id === "string" ? thread.id : undefined ;
	const turnId   = typeof params.turnId   === "string" ? params.turnId   : typeof turn?.id   === "string" ? turn.id   : undefined ;
	const itemId   = typeof params.itemId   === "string" ? params.itemId   : typeof item?.id   === "string" ? item.id   : undefined ;
	return {
		...(threadId          === undefined ? {} : { threadId }),
		...(turnId            === undefined ? {} : { turnId }),
		...(itemId            === undefined ? {} : { itemId }),
		...(approvalRequestId === undefined ? {} : { approvalRequestId, approvalId: approvalRequestId }),
		...(approvalCallbackId === undefined ? {} : { approvalCallbackId }),
	};
}

export function approvalKind(method: string): NativeApprovalKind | undefined {
	if (method === "item/commandExecution/requestApproval") return "command";
	if (method === "item/fileChange/requestApproval")       return "file-change";
	if (method === "item/permissions/requestApproval")      return "permissions";
	if (method === "mcpServer/elicitation/request")         return "mcp-tool";
	return undefined;
}

export function nativeApprovalResponse(request: NativeApprovalRequest, response: NativeApprovalResponse): unknown {
	if (request.kind !== "mcp-tool" || !("decision" in response)) return response;
	const action = response.decision === "acceptForSession" ? "accept" : response.decision;
	return { action, content: action === "accept" ? {} : null, _meta: null };
}

export function approvalResolutionRequestId(input: NativeApprovalResolution): NativeRequestId {
	if (input.requestId  !== undefined) return input.requestId;
	if (input.approvalId !== undefined) return input.approvalId;
	throw new Error("Native approval response requires a request id");
}

export function approvalDecisions(kind: NativeApprovalKind, advertised: unknown): NativeApprovalDecision[] {
	if (kind === "mcp-tool") return ["accept", "decline", "cancel"];
	const decisions = nativeApprovalDecisions(advertised);
	if (decisions.length > 0) return decisions;
	if (kind === "command" || kind === "file-change") {
		return ["accept", "acceptForSession", "decline", "cancel"];
	}
	return [];
}

export function errorText(error: unknown): string {
	if (isRecord(error) && typeof error.message === "string") return error.message;
	return typeof error === "string" ? error : JSON.stringify(error);
}

export function compact<T extends JsonRecord>(value: T): T {
	return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

export function isRequestId(value: unknown): value is NativeRequestId {
	return typeof value === "string" || typeof value === "number";
}

export function isRecord(value: unknown): value is JsonRecord {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function codexRateWindow(value: unknown, label: string): UsageLimitSnapshot | undefined {
	if (!isRecord(value) || typeof value.usedPercent !== "number" || !Number.isFinite(value.usedPercent)) return undefined;
	const usedPercent = Math.max(0, Math.min(100, value.usedPercent));
	const duration = typeof value.windowDurationMins === "number" && Number.isFinite(value.windowDurationMins)
		? value.windowDurationMins
		: undefined;
	const window           = duration === 300 ? "5 Hours" : duration === 10_080 ? "7 Days" : duration ? `${duration} Minutes` : label;
	const remainingPercent = Math.max(0, 100 - usedPercent);
	return {
		label: `${label} ${window}`,
		usedPercent,
		remainingPercent,
		...(typeof value.resetsAt === "number" && Number.isFinite(value.resetsAt) ? { resetsAt: value.resetsAt * 1_000 } : {}),
		status: remainingPercent <= 0 ? "exhausted" : remainingPercent < 20 ? "warning" : "ok",
	};
}

function isNativeThreadStatus(value: unknown): value is NativeThreadStatus {
	return (
		value === "notLoaded"
		|| value === "idle"
		|| value === "systemError"
		|| value === "active"
	);
}

function nativeApprovalDecisions(value: unknown): NativeApprovalDecision[] {
	if (!Array.isArray(value)) return [];
	return value.filter((decision): decision is NativeApprovalDecision =>
		decision === "accept" ||
		decision === "acceptForSession" ||
		decision === "decline" ||
		decision === "cancel" ||
		isRecord(decision));
}
