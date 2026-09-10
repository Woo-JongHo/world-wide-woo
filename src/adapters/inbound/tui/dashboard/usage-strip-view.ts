import { truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";
import type { UsageLimitSnapshot, UsageSnapshot } from "../../../../core/ports";
import type { WorkbenchContextUsage, WorkbenchModelUsage } from "../../../../core/domain/work/workbench";
import chalk from "chalk";
import { WORKBENCH_HUD_SYSTEM, compactTokenCount } from "./workbench-hud-system";
import { colors } from "../shell/theme";

type ProviderLabel = "Codex" | "Claude" | "Gemini" | "Z.AI";

export interface UsageStripSession {
	readonly models: readonly WorkbenchModelUsage[];
	readonly activeModel?: string;
	readonly effort?: string | null;
	readonly contextUsage?: WorkbenchContextUsage | null;
	readonly collaborationMode?: "manual" | "plan";
	readonly permissionMode?: "manual" | "all";
	readonly showUsage?: boolean;
	readonly showContext?: boolean;
}

function fit(text: string, width: number): string {
	if (width <= 0) return "";
	const clipped = truncateToWidth(text, width, "");
	return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

function resetIn(timestamp: number | undefined, now = Date.now()): string {
	if (!timestamp || !Number.isFinite(timestamp)) return "";
	const totalMinutes = Math.max(0, Math.ceil((timestamp - now) / 60_000));
	const days = Math.floor(totalMinutes / 1_440);
	const hours = Math.floor((totalMinutes % 1_440) / 60);
	const minutes = totalMinutes % 60;
	if (days > 0) return `${days}d ${hours}h`;
	if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
	return `${minutes}m`;
}

function isWeekly(limit: UsageLimitSnapshot): boolean {
	return /7\s*(?:days?|d)\b/iu.test(limit.label);
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
		? snapshot.limits.find((limit) => /5\s*(?:hours?|h)\b/iu.test(limit.label) && !isTier(limit))
		: undefined;
}

const METER_EMPTY = "#1d2a30";

function meter(percent: number, color: string): string {
	const filled = Math.round(Math.max(0, Math.min(100, percent)) / 100 * WORKBENCH_HUD_SYSTEM.strip.meterCells);
	return chalk.bgHex(color)(" ".repeat(filled)) + chalk.bgHex(METER_EMPTY)(" ".repeat(WORKBENCH_HUD_SYSTEM.strip.meterCells - filled));
}

function providerColor(label: ProviderLabel): string {
	if (label === "Codex") return "#15d7e9";
	if (label === "Claude") return "#ff8b18";
	if (label === "Gemini") return "#638dff";
	return "#b794f6";
}

function providerText(label: ProviderLabel, value: string): string {
	if (label === "Codex") return colors.accent(value);
	if (label === "Claude") return colors.warm(value);
	if (label === "Gemini") return colors.highlight(value);
	return chalk.hex("#b794f6")(value);
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
	return `${reset ? `${reset} ` : ""}${percent}% ${meter(percent, "#ff4f1a")}`;
}

function providerSegment(label: ProviderLabel, snapshot: UsageSnapshot | undefined, now: number): string {
	if (!snapshot) return colors.muted(`${label} —`);
	const limit = weeklyLimit(snapshot) ?? (
		label === "Gemini" || label === "Z.AI"
			? snapshot.limits.find((item) => Number.isFinite(item.remainingPercent))
			: undefined
	);
	if (!limit || !Number.isFinite(limit.remainingPercent)) {
		return snapshot.state === "ready"
			? colors.muted(`${label} —`)
			: providerText(label, `${label} ${unavailable(snapshot)}`);
	}
	const percent = Math.round(Math.max(0, Math.min(100, limit.remainingPercent!)));
	const reset = resetIn(limit.resetsAt, now);
	return `${providerText(label, `${label} ${reset ? `${reset} ` : ""}${percent}%`)} ${meter(percent, providerColor(label))}`;
}

function claudeSegment(snapshot: UsageSnapshot | undefined, now: number): string {
	const weekly = providerSegment("Claude", snapshot, now);
	const session = remaining(fiveHourLimit(snapshot), now);
	return session ? `${weekly}${WORKBENCH_HUD_SYSTEM.strip.separator}${colors.error(`5h ${session}`)}` : weekly;
}

function contextSegment(context: WorkbenchContextUsage | null | undefined): string {
	if (!context || !Number.isFinite(context.usedTokens) || !Number.isFinite(context.contextWindow)) return colors.muted("Context —");
	const percent = Math.round(Math.max(0, Math.min(100, context.percent)));
	return colors.secondary(`Context ${compactTokenCount(context.usedTokens)} / ${compactTokenCount(context.contextWindow)} ${percent}%`);
}

function runtimeMode(session: UsageStripSession | null | undefined): string {
	const mode = session?.permissionMode === "all" ? "Bypass" : session?.collaborationMode === "plan" ? "Plan" : "Manual";
	return colors.success(`${WORKBENCH_HUD_SYSTEM.strip.modeMarker} ${mode}`);
}

/** A single measured-telemetry row below the composer. */
export class UsageStripView implements Component {
	private snapshots: readonly UsageSnapshot[] = [
		{ provider: "openai-codex", state: "loading", fetchedAt: Date.now(), limits: [] },
		{ provider: "anthropic", state: "loading", fetchedAt: Date.now(), limits: [] },
		{ provider: "google", state: "loading", fetchedAt: Date.now(), limits: [] },
	];

	public constructor(private readonly session?: () => UsageStripSession | null | undefined) {}

	public update(snapshots: readonly UsageSnapshot[]): void { this.snapshots = snapshots; }
	public invalidate(): void {}

	public render(width: number): string[] {
		if (width <= 0) return [];
		const session = this.session?.();
		const now = Date.now();
		const codex = this.snapshots.find((snapshot) => snapshot.provider === "openai-codex");
		const claude = this.snapshots.find((snapshot) => snapshot.provider === "anthropic");
		const gemini = this.snapshots.find((snapshot) => snapshot.provider === "google");
		const zai = this.snapshots.find((snapshot) => snapshot.provider === "zai");
		const showZai = (zai !== undefined && zai.state !== "auth-required") || /^glm-/iu.test(session?.activeModel ?? "");
		const line = [
			runtimeMode(session),
			...(session?.showUsage === false ? [] : [
				providerSegment("Codex", codex, now),
				claudeSegment(claude, now),
				providerSegment("Gemini", gemini, now),
				...(showZai ? [providerSegment("Z.AI", zai, now)] : []),
			]),
			...(session?.showContext === false ? [] : [contextSegment(session?.contextUsage)]),
		].join(WORKBENCH_HUD_SYSTEM.strip.separator);
		return [fit(line, width)];
	}
}
