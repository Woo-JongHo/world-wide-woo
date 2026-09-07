import { truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";
import type { UsageLimitSnapshot, UsageSnapshot } from "../../application/ports";
import type { WorkbenchModelUsage } from "../../domain/workbench";
import { colors } from "./theme";

type ProviderLabel = "Codex" | "Claude" | "Gemini";

export interface UsageStripSession {
	readonly models: readonly WorkbenchModelUsage[];
	readonly activeModel?: string;
}

function fit(text: string, width: number): string {
	if (width <= 0) return "";
	const clipped = truncateToWidth(text, width, "");
	return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

function remainingPeriod(timestamp: number | undefined): string {
	if (!timestamp) return "";
	const remaining = timestamp - Date.now();
	if (remaining <= 0) return "0m";
	const hours = Math.ceil(remaining / 3_600_000);
	return hours >= 24 ? `${Math.ceil(hours / 24)}d` : `${hours}h`;
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

function limitValue(limit: UsageLimitSnapshot | undefined, prefix = ""): string {
	if (!limit || !Number.isFinite(limit.remainingPercent)) return "";
	const percent = Math.round(Math.max(0, Math.min(100, limit.remainingPercent!)));
	const reset = remainingPeriod(limit.resetsAt);
	return `${prefix}${percent}%${reset ? ` · ${reset}` : ""}`;
}

function unavailable(snapshot: UsageSnapshot | undefined): string {
	if (!snapshot || snapshot.state === "loading") return "확인 중";
	if (snapshot.state === "auth-required") return "로그인 필요";
	if (snapshot.state === "unsupported") return "미지원";
	return "조회 실패";
}

function providerSegment(label: ProviderLabel, snapshot?: UsageSnapshot): string {
	if (!snapshot) return `${label} —`;
	const limit = weeklyLimit(snapshot);
	if (!limit || !Number.isFinite(limit.remainingPercent)) {
		return `${label} ${snapshot.state === "ready" ? "—" : unavailable(snapshot)}`;
	}
	const percent = Math.round(Math.max(0, Math.min(100, limit.remainingPercent!)));
	const reset = remainingPeriod(limit.resetsAt);
	return `${label} ${percent}%${reset ? ` · ${reset}` : ""}`;
}

function claudeSegment(snapshot?: UsageSnapshot): string {
	const weekly = providerSegment("Claude", snapshot);
	const session = limitValue(fiveHourLimit(snapshot), "5h ");
	return session ? `${weekly} · ${session}` : weekly;
}

/** One-row MVP quota summary. Provider details belong outside the workbench HUD. */
export class UsageStripView implements Component {
	private snapshots: readonly UsageSnapshot[] = [
		{ provider: "openai-codex", state: "loading", fetchedAt: Date.now(), limits: [] },
		{ provider: "anthropic", state: "loading", fetchedAt: Date.now(), limits: [] },
	];

	public constructor(_session?: () => UsageStripSession | null | undefined) {}

	public update(snapshots: readonly UsageSnapshot[]): void {
		this.snapshots = snapshots;
	}

	public invalidate(): void {}

	public render(width: number): string[] {
		if (width <= 0) return [];
		const codex = this.snapshots.find((snapshot) => snapshot.provider === "openai-codex");
		const claude = this.snapshots.find((snapshot) => snapshot.provider === "anthropic");
		const line = [
			colors.accent(providerSegment("Codex", codex)),
			colors.warm(claudeSegment(claude)),
			colors.highlight(providerSegment("Gemini")),
		].join(colors.muted(" | "));
		return [fit(line, width)];
	}
}
