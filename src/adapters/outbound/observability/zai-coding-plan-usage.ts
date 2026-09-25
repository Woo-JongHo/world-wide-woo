import type { UsageCredential, UsageLimit, UsageWindow } from "@gajae-code/ai/core";

const HOUR_MS = 60 * 60 * 1_000 ;
const DAY_MS  = 24 * HOUR_MS    ;
const WEEK_MS = 7 * DAY_MS      ;
// upstream OpenCode status plugin의 UA 문자열을 그대로 쓰지 않고 WWW 자체 식별자로 조회한다.
const ZAI_USAGE_USER_AGENT = "world-wide-woo-usage/1.0";

type UsageFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface QuotaLimit {
	type?          : unknown ;
	usage?         : unknown ;
	currentValue?  : unknown ;
	percentage?    : unknown ;
	remaining?     : unknown ;
	nextResetTime? : unknown ;
	unit?          : unknown ;
	number?        : unknown ;
}

function number(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function resetAt(value: unknown): number | undefined {
	const timestamp = number(value);
	return timestamp === undefined ? undefined : timestamp > 1_000_000_000_000 ? timestamp : timestamp * 1_000;
}

function fraction(percentage: number | undefined, used: number | undefined, limit: number | undefined): number | undefined {
	if (percentage !== undefined) return Math.max(0, Math.min(1, percentage / 100));
	if (used !== undefined && limit !== undefined && limit > 0) return Math.max(0, Math.min(1, used / limit));
	return undefined;
}

function status(used: number | undefined): "ok" | "warning" | "exhausted" | undefined {
	if (used === undefined) return undefined;
	return used >= 1 ? "exhausted" : used >= 0.9 ? "warning" : "ok";
}

function quotaWindow(item: QuotaLimit): UsageWindow {
	const quantity = number(item.number);
	const count = quantity !== undefined && quantity > 0 ? quantity : 1;
	if (item.unit === 3) return { id: `${count}h`, label: `${count} Hour${count === 1 ? "" : "s"}`, durationMs: count * HOUR_MS };
	if (item.unit === 4) return { id: `${count}d`, label: `${count} Day${count === 1 ? "" : "s"}`, durationMs: count * DAY_MS };
	if (item.unit === 6) return { id: "1w", label: "Weekly", durationMs: WEEK_MS };
	if (item.type === "TOKENS_LIMIT") return { id: "1w", label: "Weekly", durationMs: WEEK_MS };
	return { id: "quota", label: "Quota" };
}

function parseLimit(value: unknown, index: number): UsageLimit | undefined {
	if (!isRecord(value)) return undefined;
	const item: QuotaLimit = value;
	if (typeof item.type !== "string" || !["TOKENS_LIMIT", "TIME_LIMIT", "CREDIT_LIMIT"].includes(item.type)) return undefined;
	const used              = number(item.currentValue)                                                                     ;
	const limit             = number(item.usage)                                                                            ;
	const usedFraction      = fraction(number(item.percentage), used, limit)                                                ;
	const unit              = item.type === "TOKENS_LIMIT" ? "tokens" : item.type === "TIME_LIMIT" ? "requests" : "unknown" ;
	const window            = quotaWindow(item)                                                                             ;
	const kind              = item.type === "TOKENS_LIMIT" ? "Token" : item.type === "TIME_LIMIT" ? "Request" : "Credit"    ;
	const label             = `Z.AI ${window.label} ${kind} Quota`                                                          ;
	const id                = `${item.type.toLowerCase()}:${window.id}:${index}`                                            ;
	const next              = resetAt(item.nextResetTime)                                                                   ;
	const remaining         = number(item.remaining)                                                                        ;
	const remainingFraction = usedFraction === undefined ? undefined : 1 - usedFraction                                     ;
	const usageStatus       = status(usedFraction)                                                                          ;
	return {
		id: `zai:${id}`,
		label,
		scope: { provider: "zai", windowId: window.id, shared: true },
		window: next === undefined ? window : { ...window, resetsAt: next },
		amount: {
			...(used === undefined ? {} : { used }),
			...(limit === undefined ? {} : { limit }),
			...(remaining === undefined ? {} : { remaining }),
			...(usedFraction === undefined ? {} : { usedFraction }),
			...(remainingFraction === undefined ? {} : { remainingFraction }),
			unit,
		},
		...(usageStatus === undefined ? {} : { status: usageStatus }),
	};
}

/** Parses the documented Coding Plan quota shape, including CREDIT_LIMIT tiers. */
export async function fetchZaiCodingPlanUsage(credential: UsageCredential, fetchImpl: UsageFetch): Promise<UsageLimit[] | null> {
	if (credential.type !== "api_key" || !credential.apiKey) return null;
	const response = await fetchImpl("https://api.z.ai/api/monitor/usage/quota/limit", {
		headers: { Authorization: credential.apiKey, "Content-Type": "application/json", "User-Agent": ZAI_USAGE_USER_AGENT },
	});
	if (!response.ok) return null;
	const payload: unknown = await response.json();
	if (
		!isRecord(payload)
		|| payload.success !== true
		|| !isRecord(payload.data)
		|| !Array.isArray(payload.data.limits)
	) return null;
	const limits = payload.data.limits.map(parseLimit).filter((limit): limit is UsageLimit => limit !== undefined);
	return limits.length > 0 ? limits : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object";
}
