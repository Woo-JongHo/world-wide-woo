import { visibleWidth } from "@earendil-works/pi-tui";
import type { UsageLimitSnapshot, UsageSnapshot } from "../../../../../core/ports";
import { a, fit, oneLine } from "../../foundation/theme/astra-theme";

function resetIn(timestamp: number | undefined, now: number): string {
	if (!timestamp || !Number.isFinite(timestamp)) return "";
	const minutes = Math.max(0, Math.ceil((timestamp - now) / 60_000));
	return minutes >= 1440 ? `${Math.floor(minutes / 1440)}d` : minutes >= 60 ? `${Math.floor(minutes / 60)}h${minutes % 60 ? `${minutes % 60}m` : ""}` : `${minutes}m`;
}
function limitText(limit: UsageLimitSnapshot, detailed: boolean, now: number): string {
	const label = /7\s*(?:days?|d)\b/iu.test(limit.label) ? "7d" : /5\s*(?:hours?|h)\b/iu.test(limit.label) ? "5h" : oneLine(limit.label, 12);
	const percent = limit.remainingPercent;
	const value = typeof percent === "number" && Number.isFinite(percent) ? Math.round(Math.max(0, Math.min(100, percent))) : null;
	const reset = detailed ? resetIn(limit.resetsAt, now) : "";
	return (value !== null && value <= 10 ? a.attention : a.muted)(`${label} ${value === null ? "—" : `${value}%`}${reset ? ` ↻${reset}` : ""}`);
}

/** Account quota, never a dollar estimate. Full limits and reset times remain in /context. */
export function astraUsageLine(snapshots: readonly UsageSnapshot[], width: number, model = "", now = Date.now()): string {
	const providers = [["openai-codex", "Codex"], ["anthropic", "Claude"], ["google", "Gemini"], ["zai", "Z.AI"]] as const;
	const providerInk = { "openai-codex": a.codex, anthropic: a.claude, google: a.gemini, zai: a.zai } as const;
	const active = /^claude/u.test(model) ? "anthropic" : /^gemini/u.test(model) ? "google" : /^glm-/u.test(model) ? "zai" : "openai-codex";
	const segment = ([id, name]: typeof providers[number], detailed: boolean, compact = false): string => {
		const s = snapshots.find(s => s.provider === id);
		const state = !s || s.state === "loading" ? "확인 중" : s.state === "auth-required" ? "로그인 필요" : s.state === "unsupported" ? "미지원" : s.state === "ready" ? "—" : "조회 실패";
		const limits = s?.limits.filter(l => typeof l.remainingPercent === "number" && Number.isFinite(l.remainingPercent)) ?? [];
		const preferred = limits.find(l => /7\s*(?:days?|d)\b/iu.test(l.label) && !/spark|opus|sonnet/iu.test(l.label)) ?? limits[0];
		const shown = detailed ? limits.slice(0, 2) : preferred ? [preferred] : [];
		const compactState = !s || s.state === "loading" ? "…" : s.state === "auth-required" ? "login" : s.state === "unsupported" ? "off" : s.state === "ready" ? "—" : "!";
		const compactPercent = preferred && (s?.state === "ready" || s?.stale) && Number.isFinite(preferred.remainingPercent) ? Math.round(Math.max(0, Math.min(100, preferred.remainingPercent!))) : null;
		const compactValue = compactPercent === null ? compactState : `${compactPercent}%`;
		const values = compact ? (compactPercent !== null && compactPercent <= 10 ? a.attention : a.muted)(compactValue) : shown.length && (s?.state === "ready" || s?.stale) ? shown.map(l => limitText(l, detailed, now)).join(" / ") : a.muted(state);
		const provider = providerInk[id](id === active ? `▸${name}` : name);
		return `${provider} ${values}${s?.stale ? a.attention("*") : ""}`;
	};
	const prefix = a.muted("구독 잔여  ");
	for (const detailed of [true, false]) {
		const line = prefix + providers.map(p => segment(p, detailed)).join("  ");
		if (visibleWidth(line) <= width) return fit(line, width);
	}
	const compact = providers.map(p => segment(p, false, true)).join("  ");
	if (visibleWidth(compact) <= width) return fit(compact, width);
	const names = providers.map(([id, name]) => providerInk[id](id === active ? `▸${name}` : name)).join("  ");
	return fit(names, width);
}
