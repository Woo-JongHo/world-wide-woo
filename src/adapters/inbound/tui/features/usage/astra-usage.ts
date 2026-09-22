import { readFileSync } from "node:fs";
import { allocateImageId, encodeKitty, getCapabilities, visibleWidth } from "@earendil-works/pi-tui";
import type { UsageLimitSnapshot, UsageSnapshot } from "../../../../../core/ports";
import chalk from "chalk";
import { a, astraPalette, fit } from "../../foundation/theme/astra-theme";

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

function resetIn(timestamp: number | undefined, now: number): string {
	if (!timestamp || !Number.isFinite(timestamp)) return "";
	const totalMinutes = Math.max(0, Math.ceil((timestamp - now) / 60_000));
	const days = Math.floor(totalMinutes / 1_440);
	const hours = Math.floor((totalMinutes % 1_440) / 60);
	const minutes = totalMinutes % 60;
	if (days > 0) return `${days}d ${hours}h`;
	if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
	return `${minutes}m`;
}

function remainingText(limit: UsageLimitSnapshot, now: number): string {
	const remaining = resetIn(limit.resetsAt, now);
	return `${limitText(limit)}${remaining ? a.muted(` · ${remaining}`) : ""}`;
}

const quotaProviders = [["openai-codex", "Codex", "codex"], ["anthropic", "Claude", "claude"], ["google", "Antigravity", "gemini"], ["zai", "Z.AI", "zai"]] as const;

function quotaLimit(snapshot: UsageSnapshot | undefined, window: "overall" | "session"): UsageLimitSnapshot | undefined {
	if (!snapshot || (snapshot.state !== "ready" && !snapshot.stale)) return undefined;
	const finite = snapshot.limits.filter(limit => typeof limit.remainingPercent === "number" && Number.isFinite(limit.remainingPercent));
	const tier = (limit: UsageLimitSnapshot) => /spark|opus|sonnet/iu.test(limit.label);
	if (window === "session") return finite.find(limit => /(?:5\s*(?:hours?|h)\b|5시간)/iu.test(limit.label) && !tier(limit));
	return finite.find(limit => /(?:7\s*(?:days?|d)\b|1\s*week\b|weekly|week|주간|주일)/iu.test(limit.label) && !tier(limit))
		?? finite.find(limit => !tier(limit));
}

function quotaState(snapshot: UsageSnapshot | undefined): string {
	if (!snapshot || snapshot.state === "loading") return "…";
	if (snapshot.state === "auth-required") return "login";
	if (snapshot.state === "unsupported") return snapshot.provider === "google" ? "linked" : "off";
	return snapshot.state === "ready" ? "—" : "!";
}

function quotaBar(limit: UsageLimitSnapshot | undefined, state: string, width: number, color: string, now: number): string {
	const size = Math.max(3, width);
	const percent = typeof limit?.remainingPercent === "number" && Number.isFinite(limit.remainingPercent)
		? Math.round(Math.max(0, Math.min(100, limit.remainingPercent))) : null;
	const reset = limit ? resetIn(limit.resetsAt, now) : "";
	const value = percent === null ? state : `${percent}%${reset ? ` ${reset}` : ""}`;
	const label = value.length > size ? value.slice(0, Math.max(1, size - 1)) + "…" : value;
	const centered = label.padStart(label.length + Math.max(0, Math.floor((size - label.length) / 2))).padEnd(size);
	const filled = percent === null ? 0 : Math.round(percent / 100 * size);
	return Array.from(centered).map((character, index) => index < filled
		? chalk.bgHex(color).hex("#101419").bold(character)
		: chalk.bgHex(astraPalette.rule).hex(astraPalette.text)(character)).join("");
}

/** A provider header plus two quota rows form a compact matrix. */
export function astraQuotaHudRows(snapshots: readonly UsageSnapshot[], width: number, now = Date.now(), showLogos = false, sessionWidth = width): string[] {
	if (width <= 0) return [];
	const labels = ["7d overall", "5h session"] as const;
	const windows = ["overall", "session"] as const;
	const logoEnabled = showLogos && getCapabilities().images === "kitty";
	const prefixWidth = Math.max(...labels.map(label => visibleWidth(label))) + 2;
	const segmentWidth = Math.floor((width - prefixWidth - 6) / quotaProviders.length);
	const nameWidth = Math.max(3, Math.min(10, segmentWidth));
	const header = `${" ".repeat(prefixWidth)}${quotaProviders.map(([, name, ink], index) => {
		const token = logoEnabled ? logoTokens[index]! : name;
		return a[ink](fit(token, nameWidth));
	}).join("  ")}`;
	const rows = windows.map((window, rowIndex) => {
		const rowWidth = rowIndex === 0 ? width : Math.max(1, Math.min(width, sessionWidth));
		const prefix = `${labels[rowIndex]}  `;
		const segments = quotaProviders.map(([id, , ink]) => {
			const snapshot = snapshots.find(candidate => candidate.provider === id);
			return `${quotaBar(quotaLimit(snapshot, window), quotaState(snapshot), nameWidth, astraPalette[ink], now)}${snapshot?.stale ? a.attention("*") : ""}`;
		}).join("  ");
		return fit(prefix + segments, rowWidth);
	});
	let outputHeader = fit(header, width);
	for (const [index, token] of logoTokens.entries()) {
		const sequence = logoEnabled ? logoSequence(index) : null;
		outputHeader = outputHeader.replaceAll(token, `${sequence ?? ""}  `).replaceAll(token.trim(), " ");
	}
	return [outputHeader, ...rows].map((output, rowIndex) => {
		for (const [index, token] of logoTokens.entries()) {
			const sequence = rowIndex === 0 && logoEnabled ? logoSequence(index) : null;
			output = output.replaceAll(token, `${sequence ?? ""}  `).replaceAll(token.trim(), " ");
		}
		return output;
	});
}

/** Account quota, never a dollar estimate. Detailed limits remain in /context; observed reset countdowns stay compact here. */
export function astraUsageLines(snapshots: readonly UsageSnapshot[], width: number, model = "", now = Date.now(), showLogos = false, preservePrefix = false): string[] {
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
			? `7d · ${remainingText(weekly, now)}  5h · ${remainingText(fiveHour, now)}`
			: preferred && (s?.state === "ready" || s?.stale)
				? remainingText(preferred, now)
			: a.muted(compact ? compactState : state);
		const index = providers.findIndex(([providerId]) => providerId === id);
		const label = availableLogos[index] ? logoTokens[index]! : name;
		const provider = providerInk[id](id === active ? `▸${label}` : label);
		return `${provider} ${values}${s?.stale ? a.attention("*") : ""}`;
	};
	const minimalSegment = ([id, name]: typeof providers[number]): string => {
		const s = snapshots.find(snapshot => snapshot.provider === id);
		const limit = s?.limits.find(item => typeof item.remainingPercent === "number" && Number.isFinite(item.remainingPercent));
		const state = !s || s.state === "loading" ? "…" : s.state === "auth-required" ? "login" : s.state === "unsupported" ? id === "google" ? "연결됨" : "off" : s.state === "ready" ? "—" : "!";
		const value = limit ? limitText(limit) : a.muted(state);
		const index = providers.findIndex(([providerId]) => providerId === id);
		const label = availableLogos[index] ? logoTokens[index]! : name;
		const provider = providerInk[id](id === active ? `▸${label}` : label);
		return `${provider} ${value}${s?.stale ? a.attention("*") : ""}`;
	};
	const prefix = "";
	const line = providers.map(p => segment(p)).join("  ");
	if (visibleWidth(line) <= width) return [finish(line)];
	const compact = (preservePrefix ? prefix : "") + providers.map(p => segment(p, true)).join("  ");
	if (visibleWidth(compact) <= width) return [finish(compact)];
	const minimal = (preservePrefix ? prefix : "") + providers.map(minimalSegment).join("  ");
	if (visibleWidth(minimal) <= width) return [finish(minimal)];
	const rows: string[] = [];
	let current = preservePrefix ? prefix : "";
	for (const item of providers.map(minimalSegment)) {
		const candidate = current ? `${current}${current.endsWith("  ") ? "" : "  "}${item}` : item;
		if (current && visibleWidth(candidate) > width) {
			rows.push(finish(current.trimEnd()));
			current = item;
		} else {
			current = candidate;
		}
	}
	if (current) rows.push(finish(current.trimEnd()));
	return rows;
}

/** Backwards-compatible single-row projection for callers that own their own layout. */
export function astraUsageLine(snapshots: readonly UsageSnapshot[], width: number, model = "", now = Date.now(), showLogos = false, preservePrefix = false): string {
	return astraUsageLines(snapshots, width, model, now, showLogos, preservePrefix)[0] ?? "";
}
