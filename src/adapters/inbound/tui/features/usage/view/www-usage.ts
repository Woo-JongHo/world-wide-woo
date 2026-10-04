import      { readFileSync                      } from "node:fs"                                           ;
import      {
              allocateImageId                 ,
              encodeKitty                     ,
              getCapabilities                 ,
              visibleWidth                    ,
                                                } from "@earendil-works/pi-tui"                            ;
import type { UsageLimitSnapshot, UsageSnapshot } from "@/core/ports/observability/usage-monitor-port"     ;
import chalk                                                           from "chalk";
import      { a, wwwPalette, fit                } from "@/adapters/inbound/tui/foundation/theme/www-theme" ;

const logoAssets    = ["openai", "claude", "gemini", "zai"] as const        ;
const logoTokens    = ["\uE001 ", "\uE002 ", "\uE003 ", "\uE004 "] as const ;
const logoSequences = new Map<number, string | null>()                      ;

const quotaProviders = [["openai-codex", "Codex", "codex"], ["anthropic", "Claude", "claude"], ["google", "Antigravity", "gemini"], ["zai", "Z.AI", "zai"]] as const;

/** 공급자별 잔여 막대와 관측된 잔여율·리셋까지 남은 시간을 함께 표시한다. */
export function wwwQuotaHudRows(snapshots: readonly UsageSnapshot[], width: number, _now = Date.now(), showLogos = false): string[] {
	if (width <= 0) return [];
	const logoEnabled  = showLogos && getCapabilities().images === "kitty"                             ;
	const logos        = quotaProviders.map((_, index) => logoEnabled ? logoSequence(index, 0) : null) ;
	const segmentWidth = Math.min(20, Math.max(3, Math.floor((width - 6) / quotaProviders.length)))    ;
	const segments = quotaProviders.map(([id, name, ink], index) => {
			const snapshot  = snapshots.find(candidate => candidate.provider === id)                                              ;
			const limit     = quotaLimit(snapshot, "overall")                                                                     ;
			const image     = Boolean(logos[index])                                                                               ;
			const label     = image ? logoTokens[index]! : segmentWidth >= 20 ? name : name === "Antigravity" ? "Gemini" : name   ;
			const bar       = quotaBar(limit, quotaState(snapshot), segmentWidth, wwwPalette[ink], label, image)                  ;
			const remaining = limit ? resetIn(limit.resetsAt, _now) : ""                                                          ;
			const detail    = limit ? `${Math.round(limit.remainingPercent!)}% · ${remaining || "기간 —"}` : quotaState(snapshot) ;
			return { bar: `${bar}${snapshot?.stale ? a.attention("*") : ""}`, detail: fit(detail, segmentWidth) };
		});
	let output = fit(segments.map(segment => segment.bar).join("  "), width);
	for (const [index, token] of logoTokens.entries()) {
			const logo = logos[index];
			if (logo) output = output.replaceAll(token, `${logo}  `).replaceAll(token.trim(), " ");
	}
	return [output, fit(segments.map(segment => segment.detail).join("  "), width)];
}

/** HUD 한 줄에는 Codex·Claude 주간 잔여량과 현재 Context만 둔다. */
export function wwwQuotaHudLine(snapshots: readonly UsageSnapshot[], context: string, compactContext: string, width: number, now = Date.now(), showLogos = false): string {
	if (width <= 0) return "";
	const logos     = [0, 1].map(index => showLogos && getCapabilities().images === "kitty" ? logoSequence(index) : null) ;
	const providers = quotaProviders.slice(0, 2)                                                                          ;
	const segment = ([id, name, ink]: typeof quotaProviders[number], index: number, showReset: boolean, compact: boolean): string => {
		const snapshot  = snapshots.find(candidate => candidate.provider === id)                                                                                                                    ;
		const selected  = quotaLimit(snapshot, "overall")                                                                                                                                           ;
		const limit     = selected && isWeeklyLimit(selected) && (selected.resetsAt === undefined || selected.resetsAt > now) ? selected : undefined                                                ;
		const label     = logos[index] ? logoTokens[index]! : compact ? index === 0 ? "Cx" : "Cl" : name                                                                                            ;
		const value     = limit ? limitText(limit) : a.muted(quotaState(snapshot))                                                                                                                  ;
		const reset     = showReset && limit ? resetIn(limit.resetsAt, now) : ""                                                                                                                    ;
		const resetText = compact ? reset.replaceAll(" ", "") : reset                                                                                                                               ;
		const content   = `${a[ink](label)}${logos[index] || compact ? "" : " "}${value}${resetText ? a.muted(`${compact ? "" : " "}${resetText}`) : ""}${snapshot?.stale ? a.attention("*") : ""}` ;
		return compact ? content : `${a.rule("[ ")}${content}${a.rule(" ]")}`;
	};
	const build      = (showReset: boolean, compact = false) => [...providers.map((provider, index) => segment(provider, index, showReset, compact)), compact ? compactContext : context].filter(Boolean).join("  ") ;
	const candidates = [build(true), build(true, true), build(false), build(false, true), context, compactContext]                                                                                                   ;
	let output       = fit(candidates.find(candidate => visibleWidth(candidate) <= width) ?? context, width)                                                                                                         ;
	for (const [index, token] of logoTokens.entries()) {
		const logo = logos[index];
		if (logo) output = output.replaceAll(token, `${logo}  `).replaceAll(token.trim(), " ");
	}
	return output;
}

/** Account quota, never a dollar estimate. Detailed limits remain in /context; observed reset countdowns stay compact here. */
export function wwwUsageLines(snapshots: readonly UsageSnapshot[], width: number, model = "", now = Date.now(), showLogos = false, preservePrefix = false): string[] {
	const providers      = [["openai-codex", "Codex"], ["anthropic", "Claude"], ["google", "Antigravity"], ["zai", "Z.AI"]] as const ;
	const logos          = showLogos && getCapabilities().images === "kitty"                                                         ;
	const availableLogos = providers.map((_, index) => logos ? logoSequence(index) : null)                                           ;
	const finish = (line: string): string => {
		let output = fit(line, width);
		for (const [index, token] of logoTokens.entries()) {
			output = output.replaceAll(token, `${availableLogos[index] ?? ""}  `);
			// A width cut may retain only the first cell of an internal token.
			output = output.replaceAll(token.trim(), " ");
		}
		return output;
	};
	const providerInk = { "openai-codex": a.codex, anthropic: a.claude, google: a.gemini, zai: a.zai } as const                                  ;
	const active      = /^claude/u.test(model) ? "anthropic" : /^gemini/u.test(model) ? "google" : /^glm-/u.test(model) ? "zai" : "openai-codex" ;
	const segment = ([id, name]: typeof providers[number], compact = false): string => {
		const s              = snapshots.find(s => s.provider === id)                                                                                                                                                              ;
		const state          = !s || s.state === "loading" ? "확인 중" : s.state === "auth-required" ? "로그인 필요" : s.state === "unsupported" ? id === "google" ? "연결됨" : "미지원" : s.state === "ready" ? "—" : "조회 실패" ;
		const limits         = s?.limits.filter(l => typeof l.remainingPercent === "number" && Number.isFinite(l.remainingPercent)) ?? []                                                                                          ;
		const isWeekly       = (limit: UsageLimitSnapshot) => /(?:7\s*(?:days?|d)\b|1\s*week\b|weekly|week|주간|주일)/iu.test(limit.label)                                                                                         ;
		const isFiveHour     = (limit: UsageLimitSnapshot) => /(?:5\s*(?:hours?|h)\b|5시간)/iu.test(limit.label)                                                                                                                   ;
		const isTier         = (limit: UsageLimitSnapshot) => /spark|opus|sonnet/iu.test(limit.label)                                                                                                                              ;
		const weekly         = limits.find(limit => isWeekly(limit) && !isTier(limit))                                                                                                                                             ;
		const fiveHour       = limits.find(limit => isFiveHour(limit) && !isTier(limit))                                                                                                                                           ;
		const preferred      = weekly ?? limits[0]                                                                                                                                                                                 ;
		const compactState   = !s || s.state === "loading" ? "…" : s.state === "auth-required" ? "login" : s.state === "unsupported" ? "off" : s.state === "ready" ? "—" : "!"                                                     ;
		const hasBothWindows = (id === "anthropic" || id === "zai") && weekly && fiveHour                                                                                                                                          ;
		const values = hasBothWindows && (s?.state === "ready" || s?.stale)
			? `7d · ${remainingText(weekly, now)}  5h · ${remainingText(fiveHour, now)}`
			: preferred && (s?.state === "ready" || s?.stale)
				? remainingText(preferred, now)
			: a.muted(compact ? compactState : state);
		const index    = providers.findIndex(([providerId]) => providerId === id) ;
		const label    = availableLogos[index] ? logoTokens[index] : name         ;
		const provider = providerInk[id](id === active ? `▸${label}` : label)     ;
		return `${provider} ${values}${s?.stale ? a.attention("*") : ""}`;
	};
	const minimalSegment = ([id, name]: typeof providers[number]): string => {
		const s        = snapshots.find(snapshot => snapshot.provider === id)                                                                                                                         ;
		const limit    = s?.limits.find(item => typeof item.remainingPercent === "number" && Number.isFinite(item.remainingPercent))                                                                  ;
		const state    = !s || s.state === "loading" ? "…" : s.state === "auth-required" ? "login" : s.state === "unsupported" ? id === "google" ? "연결됨" : "off" : s.state === "ready" ? "—" : "!" ;
		const value    = limit ? limitText(limit) : a.muted(state)                                                                                                                                    ;
		const index    = providers.findIndex(([providerId]) => providerId === id)                                                                                                                     ;
		const label    = availableLogos[index] ? logoTokens[index] : name                                                                                                                             ;
		const provider = providerInk[id](id === active ? `▸${label}` : label)                                                                                                                         ;
		return `${provider} ${value}${s?.stale ? a.attention("*") : ""}`;
	};
	const prefix = ""                                        ;
	const line   = providers.map(p => segment(p)).join("  ") ;
	if (visibleWidth(line) <= width) return [finish(line)];
	const compact = (preservePrefix ? prefix : "") + providers.map(p => segment(p, true)).join("  ");
	if (visibleWidth(compact) <= width) return [finish(compact)];
	const minimal = (preservePrefix ? prefix : "") + providers.map(minimalSegment).join("  ");
	if (visibleWidth(minimal) <= width) return [finish(minimal)];
	const rows: string[] = []                           ;
	let current          = preservePrefix ? prefix : "" ;
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
export function wwwUsageLine(snapshots: readonly UsageSnapshot[], width: number, model = "", now = Date.now(), showLogos = false, preservePrefix = false): string {
	return wwwUsageLines(snapshots, width, model, now, showLogos, preservePrefix)[0] ?? "";
}

/** A fixed two-cell, one-row placement; files and encoding are cached locally.
 * Raw Kitty commands intentionally bypass pi-tui's single-image-per-line cache.
 * The host clears placements on redraw and all image data at shutdown.
 */
function logoSequence(index: number, row = 0): string | null {
	const key    = row * logoAssets.length + index ;
	const cached = logoSequences.get(key)          ;
	if (cached !== undefined) return cached;
	try {
		const data     = readFileSync(new URL(`../assets/${logoAssets[index]}.png`, import.meta.url))                                 ;
		const sequence = encodeKitty(data.toString("base64"), { columns: 2, rows: 1, imageId: allocateImageId(), moveCursor: false }) ;
		logoSequences.set(key, sequence);
		return sequence;
	} catch {
		logoSequences.set(key, null);
		return null;
	}
}

function limitText(limit: UsageLimitSnapshot): string {
	const percent = limit.remainingPercent                                                                                           ;
	const value   = typeof percent === "number" && Number.isFinite(percent) ? Math.round(Math.max(0, Math.min(100, percent))) : null ;
	if (value === null) return a.muted("—");
	return (value >= 50 ? a.success : value >= 20 ? a.attention : a.failure)(`${value}%`);
}

function resetIn(timestamp: number | undefined, now: number): string {
	if (!timestamp || !Number.isFinite(timestamp)) return "";
	const totalMinutes = Math.max(0, Math.ceil((timestamp - now) / 60_000)) ;
	const days         = Math.floor(totalMinutes / 1_440)                   ;
	const hours        = Math.floor((totalMinutes % 1_440) / 60)            ;
	const minutes      = totalMinutes % 60                                  ;
	if (days > 0) return `${days}d ${hours}h`;
	if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
	return `${minutes}m`;
}

function remainingText(limit: UsageLimitSnapshot, now: number): string {
	const remaining = resetIn(limit.resetsAt, now);
	return `${limitText(limit)}${remaining ? a.muted(` · ${remaining}`) : ""}`;
}

function isWeeklyLimit(limit: UsageLimitSnapshot): boolean {
	return /(?:7\s*(?:days?|d)\b|1\s*week\b|weekly|week|주간|주일)/iu.test(limit.label);
}

function quotaLimit(snapshot: UsageSnapshot | undefined, window: "overall" | "session"): UsageLimitSnapshot | undefined {
	if (!snapshot || (snapshot.state !== "ready" && !snapshot.stale)) return undefined;
	const finite = snapshot.limits.filter(limit => typeof limit.remainingPercent === "number" && Number.isFinite(limit.remainingPercent)) ;
	const tier   = (limit: UsageLimitSnapshot) => /spark|opus|sonnet/iu.test(limit.label)                                                 ;
	if (window === "session") return finite.find(limit => /(?:5\s*(?:hours?|h)\b|5시간)/iu.test(limit.label) && !tier(limit));
	return finite.find(limit => isWeeklyLimit(limit) && !tier(limit)) ?? finite.find(limit => !tier(limit));
}

function quotaState(snapshot: UsageSnapshot | undefined): string {
	if (!snapshot || snapshot.state === "loading") return "…";
	if (snapshot.state === "auth-required") return "login";
	if (snapshot.state === "unsupported") return snapshot.provider === "google" ? "linked" : "off";
	return snapshot.state === "ready" ? "—" : "!";
}

function quotaBar(limit: UsageLimitSnapshot | undefined, state: string, width: number, color: string, label: string, image: boolean): string {
	const percent = typeof limit?.remainingPercent === "number" && Number.isFinite(limit.remainingPercent)
		? Math.round(Math.max(0, Math.min(100, limit.remainingPercent))) : null;
	const value     = percent === null ? state : ""                                        ;
	const iconWidth = image ? 2 : Math.min(label.length, Math.max(1, width - 2))           ;
	const cells     = fit(value.padEnd(width - iconWidth), width - iconWidth)              ;
	const filled    = percent === null ? 0 : Math.round(cells.length * percent / 100)      ;
	const active    = chalk.bgHex(color).hex("#101419").bold                               ;
	const empty     = chalk.bgHex(wwwPalette.rule).hex(wwwPalette.text)                    ;
	const iconColor = image || percent === null || percent === 0 ? wwwPalette.rule : color ;
	const icon      = chalk.bgHex(iconColor).hex("#101419").bold(fit(label, iconWidth))    ;
	return `${icon}${active(cells.slice(0, filled))}${empty(cells.slice(filled))}`;
}
