import { readFileSync } from "node:fs";
import { allocateImageId, encodeKitty, getCapabilities, visibleWidth } from "@earendil-works/pi-tui";
import type { UsageLimitSnapshot, UsageSnapshot } from "../../../../../core/ports";
import { a, fit } from "../../foundation/theme/astra-theme";

const logoAssets = ["openai", "claude", "gemini", "zai"] as const;
const logoTokens = ["\uE001 ", "\uE002 ", "\uE003 ", "\uE004 "] as const;
const logoSequences = new Map<number, string | null>();

/** A fixed two-cell, one-row placement; files and encoding are cached locally.
 * Raw Kitty commands intentionally bypass pi-tui's single-image-per-line cache.
 * The host clears placements on redraw and all image data at shutdown.
 */
function logoSequence(index: number): string | null {
	if (logoSequences.has(index)) return logoSequences.get(index)!;
	try {
		const data = readFileSync(new URL(`./assets/${logoAssets[index]}.png`, import.meta.url));
		const sequence = encodeKitty(data.toString("base64"), { columns: 2, rows: 1, imageId: allocateImageId(), moveCursor: false });
		logoSequences.set(index, sequence);
		return sequence;
	} catch {
		logoSequences.set(index, null);
		return null;
	}
}

function limitText(limit: UsageLimitSnapshot): string {
	const percent = limit.remainingPercent;
	const value = typeof percent === "number" && Number.isFinite(percent) ? Math.round(Math.max(0, Math.min(100, percent))) : null;
	if (value === null) return a.muted("—");
	return (value >= 50 ? a.success : value >= 20 ? a.attention : a.failure)(`${value}%`);
}

/** Account quota, never a dollar estimate. Full limits and reset times remain in /context. */
export function astraUsageLine(snapshots: readonly UsageSnapshot[], width: number, model = "", _now = Date.now(), showLogos = false, preservePrefix = false): string {
	const providers = [["openai-codex", "Codex"], ["anthropic", "Claude"], ["google", "Antigravity"], ["zai", "Z.AI"]] as const;
	const logos = showLogos && getCapabilities().images === "kitty";
	const availableLogos = providers.map((_, index) => logos ? logoSequence(index) : null);
	const finish = (line: string): string => {
		let output = fit(line, width);
		for (const [index, token] of logoTokens.entries()) {
			output = output.replaceAll(token, `${availableLogos[index] ?? ""}  `);
			// A width cut may retain only the first cell of an internal token.
			output = output.replaceAll(token.trim(), " ");
		}
		return output;
	};
	const providerInk = { "openai-codex": a.codex, anthropic: a.claude, google: a.gemini, zai: a.zai } as const;
	const active = /^claude/u.test(model) ? "anthropic" : /^gemini/u.test(model) ? "google" : /^glm-/u.test(model) ? "zai" : "openai-codex";
	const segment = ([id, name]: typeof providers[number], compact = false): string => {
		const s = snapshots.find(s => s.provider === id);
		const state = !s || s.state === "loading" ? "확인 중" : s.state === "auth-required" ? "로그인 필요" : s.state === "unsupported" ? id === "google" ? "연결됨" : "미지원" : s.state === "ready" ? "—" : "조회 실패";
		const limits = s?.limits.filter(l => typeof l.remainingPercent === "number" && Number.isFinite(l.remainingPercent)) ?? [];
		const isWeekly = (limit: UsageLimitSnapshot) => /(?:7\s*(?:days?|d)\b|1\s*week\b|weekly|week|주간|주일)/iu.test(limit.label);
		const isFiveHour = (limit: UsageLimitSnapshot) => /(?:5\s*(?:hours?|h)\b|5시간)/iu.test(limit.label);
		const isTier = (limit: UsageLimitSnapshot) => /spark|opus|sonnet/iu.test(limit.label);
		const weekly = limits.find(limit => isWeekly(limit) && !isTier(limit));
		const fiveHour = limits.find(limit => isFiveHour(limit) && !isTier(limit));
		const preferred = weekly ?? limits[0];
		const compactState = !s || s.state === "loading" ? "…" : s.state === "auth-required" ? "login" : s.state === "unsupported" ? "off" : s.state === "ready" ? "—" : "!";
		const hasBothWindows = (id === "anthropic" || id === "zai") && weekly && fiveHour;
		const values = hasBothWindows && (s?.state === "ready" || s?.stale)
			? `7d ${limitText(weekly)}  5h ${limitText(fiveHour)}`
			: preferred && (s?.state === "ready" || s?.stale)
				? limitText(preferred)
			: a.muted(compact ? compactState : state);
		const index = providers.findIndex(([providerId]) => providerId === id);
		const label = availableLogos[index] ? logoTokens[index]! : name;
		const provider = providerInk[id](id === active ? `▸${label}` : label);
		return `${provider} ${values}${s?.stale ? a.attention("*") : ""}`;
	};
	const prefix = a.muted("구독 잔여  ");
	const line = prefix + providers.map(p => segment(p)).join("  ");
	if (visibleWidth(line) <= width) return finish(line);
	const compact = (preservePrefix ? prefix : "") + providers.map(p => segment(p, true)).join("  ");
	if (visibleWidth(compact) <= width) return finish(compact);
	const activeProvider = providers.find(([id]) => id === active)!;
	return finish(`${preservePrefix ? prefix : ""}${segment(activeProvider, true)}  +${providers.length - 1}`);
}
