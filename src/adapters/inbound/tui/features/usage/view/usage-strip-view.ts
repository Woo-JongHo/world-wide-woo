import { truncateToWidth, visibleWidth }                   from "@earendil-works/pi-tui";
import type { Component }                                  from "@earendil-works/pi-tui";
import type { UsageLimitSnapshot, UsageSnapshot }          from "@/core/ports/observability/usage-monitor-port";
import type { WorkbenchContextUsage, WorkbenchModelUsage } from "@/core/domain/work/workbench";
import chalk                                               from "chalk";
import {
	WORKBENCH_HUD_SYSTEM,
	compactTokenCount,
} from "@/adapters/inbound/tui/features/usage/view-model/workbench-hud-system";
import { runtimeModeLabel }                                from "@/adapters/inbound/tui/foundation/labels";
import { colors, palette }                                 from "@/adapters/inbound/tui/foundation/theme/theme";

type ProviderLabel = "Codex" | "Claude" | "Antigravity" | "Z.AI";

export interface UsageStripSession {
	readonly models             : readonly WorkbenchModelUsage[] ;
	readonly activeModel?       : string                         ;
	readonly effort?            : string | null                  ;
	readonly contextUsage?      : WorkbenchContextUsage | null   ;
	readonly collaborationMode? : "manual" | "plan"              ;
	readonly permissionMode?    : "manual" | "all"               ;
	readonly showUsage?         : boolean                        ;
	readonly showContext?       : boolean                        ;
}

function fit(text: string, width: number): string {
	if (width <= 0) return "";
	const clipped = truncateToWidth(text, width, "");
	return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

function resetIn(timestamp: number | undefined, now = Date.now()): string {
	if (!timestamp || !Number.isFinite(timestamp)) return "";
	const totalMinutes = Math.max(0, Math.ceil((timestamp - now) / 60_000)) ;
	const days         = Math.floor(totalMinutes / 1_440)                   ;
	const hours        = Math.floor((totalMinutes % 1_440) / 60)            ;
	const minutes      = totalMinutes % 60                                  ;
	if (days > 0) return `${days}d ${hours}h`;
	if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
	return `${minutes}m`;
}

function isWeekly(limit: UsageLimitSnapshot): boolean {
	return /(?:7\s*(?:days?|d)\b|1\s*week\b|weekly|week|주간|주일)/iu.test(limit.label);
}

function isTier(limit: UsageLimitSnapshot): boolean {
	return /spark|opus|sonnet/iu.test(limit.label);
}

function weeklyLimit(snapshot: UsageSnapshot | undefined): UsageLimitSnapshot | undefined {
	return snapshot?.state === "ready"
		? snapshot.limits.find((limit) => isWeekly(limit) && !isTier(limit))
		: undefined;
}

function fiveHourLimit(snapshot: UsageSnapshot | undefined): UsageLimitSnapshot | undefined {
	return snapshot?.state === "ready"
		? snapshot.limits.find((limit) => /(?:5\s*(?:hours?|h)\b|5시간)/iu.test(limit.label) && !isTier(limit))
		: undefined;
}

const METER_EMPTY = "#1d2a30";

function meter(percent: number, color: string): string {
	const filled = Math.round(Math.max(0, Math.min(100, percent)) / 100 * WORKBENCH_HUD_SYSTEM.strip.meterCells);
	return chalk.bgHex(color)(" ".repeat(filled)) + chalk.bgHex(METER_EMPTY)(" ".repeat(WORKBENCH_HUD_SYSTEM.strip.meterCells - filled));
}

function providerColor(label: ProviderLabel): string {
	if (label === "Codex") return palette.orange;
	if (label === "Claude") return palette.red;
	if (label === "Antigravity") return palette.teal;
	return "#d3869b";
}

function providerText(label: ProviderLabel, value: string): string {
	if (label === "Codex") return colors.accent(value);
	if (label === "Claude") return colors.warm(value);
	if (label === "Antigravity") return colors.highlight(value);
	return chalk.hex("#d3869b")(value);
}

function unavailable(snapshot: UsageSnapshot | undefined): string {
	if (!snapshot || snapshot.state === "loading") return "확인 중";
	if (snapshot.state === "auth-required") return "로그인 필요";
	if (snapshot.state === "unsupported") return "미지원";
	return "조회 실패";
}

function remaining(limit: UsageLimitSnapshot | undefined, now?: number): string {
	if (!limit || !Number.isFinite(limit.remainingPercent)) return "";
	const percent = Math.round(Math.max(0, Math.min(100, limit.remainingPercent!)));
	const reset = resetIn(limit.resetsAt, now);
	return `${percent}%${reset ? ` · ${reset}` : ""} ${meter(percent, palette.orange)}`;
}

function providerSegment(label: ProviderLabel, snapshot: UsageSnapshot | undefined, now: number): string {
	if (!snapshot) return colors.muted(`${label} —`);
	const limit = weeklyLimit(snapshot) ?? (
		label === "Antigravity" || label === "Z.AI"
			? snapshot.limits.find((item) => Number.isFinite(item.remainingPercent))
			: undefined
	);
	if (!limit || !Number.isFinite(limit.remainingPercent)) {
		return snapshot.state === "ready"
			? colors.muted(`${label} —`)
			: snapshot.state === "unsupported" && label === "Antigravity"
				? providerText(label, `${label} 연결됨`)
			: providerText(label, `${label} ${unavailable(snapshot)}`);
	}
	const percent = Math.round(Math.max(0, Math.min(100, limit.remainingPercent!)));
	const reset = resetIn(limit.resetsAt, now);
	return `${providerText(label, `${label} ${percent}%${reset ? ` · ${reset}` : ""}`)} ${meter(percent, providerColor(label))}`;
}

function claudeSegment(snapshot: UsageSnapshot | undefined, now: number): string {
	const weekly = providerSegment("Claude", snapshot, now);
	const session = remaining(fiveHourLimit(snapshot), now);
	return session ? `${weekly}${WORKBENCH_HUD_SYSTEM.strip.separator}${colors.error(`5h ${session}`)}` : weekly;
}

function zaiSegment(snapshot: UsageSnapshot | undefined, now: number): string {
	const weekly = providerSegment("Z.AI", snapshot, now);
	const session = remaining(fiveHourLimit(snapshot), now);
	return session ? `${weekly}${WORKBENCH_HUD_SYSTEM.strip.separator}${providerText("Z.AI", `5h ${session}`)}` : weekly;
}

function contextSegment(context: WorkbenchContextUsage | null | undefined): string {
	if (!context || !Number.isFinite(context.usedTokens) || !Number.isFinite(context.contextWindow)) return colors.muted("Context —");
	const percent = Math.round(Math.max(0, Math.min(100, context.percent)));
	return colors.secondary(`Context ${compactTokenCount(context.usedTokens)} / ${compactTokenCount(context.contextWindow)} ${percent}%`);
}

function runtimeMode(session: UsageStripSession | null | undefined): string {
	return colors.success(`${WORKBENCH_HUD_SYSTEM.strip.modeMarker} ${runtimeModeLabel(session?.permissionMode, session?.collaborationMode)}`);
}

/** A single measured-telemetry row below the composer. */
export class UsageStripView implements Component {
	private snapshots: readonly UsageSnapshot[] = [
		{ provider : "openai-codex" , state : "loading" , fetchedAt : Date.now() , limits : [] },
		{ provider : "anthropic"    , state : "loading" , fetchedAt : Date.now() , limits : [] },
		{ provider : "google"       , state : "loading" , fetchedAt : Date.now() , limits : [] },
	];

	public constructor(private readonly session?: () => UsageStripSession | null | undefined) {}

	public update(snapshots: readonly UsageSnapshot[]): void { this.snapshots = snapshots; }
	public invalidate(): void {}

	public render(width: number): string[] {
		if (width <= 0) return [];
		const session = this.session?.()                                                                                   ;
		const now     = Date.now()                                                                                         ;
		const codex   = this.snapshots.find((snapshot) => snapshot.provider === "openai-codex")                            ;
		const claude  = this.snapshots.find((snapshot) => snapshot.provider === "anthropic")                               ;
		const gemini  = this.snapshots.find((snapshot) => snapshot.provider === "google")                                  ;
		const zai     = this.snapshots.find((snapshot) => snapshot.provider === "zai")                                     ;
		const showZai = (zai !== undefined && zai.state !== "auth-required") || /^glm-/iu.test(session?.activeModel ?? "") ;
		const line = [
			runtimeMode(session),
			...(session?.showUsage === false ? [] : [
				providerSegment("Codex", codex, now),
				claudeSegment(claude, now),
				providerSegment("Antigravity", gemini, now),
				...(showZai ? [zaiSegment(zai, now)] : []),
			]),
			...(session?.showContext === false ? [] : [contextSegment(session?.contextUsage)]),
		].join(WORKBENCH_HUD_SYSTEM.strip.separator);
		return [fit(line, width)];
	}
}
