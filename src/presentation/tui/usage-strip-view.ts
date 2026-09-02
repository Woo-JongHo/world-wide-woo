import { truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";
import type { UsageSnapshot } from "../../application/ports";
import type { WorkbenchSessionUsage } from "../../domain/workbench";
import { colors } from "./theme";
import { compactTokenCount, usagePercent } from "./usage-value";

function fit(text: string, width: number): string {
	if (width <= 0) return "";
	const clipped = truncateToWidth(text, width);
	return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

function compactReset(timestamp: number | undefined): string {
	if (!timestamp) return "";
	const remaining = timestamp - Date.now();
	if (remaining <= 0) return "~0m";
	const minutes = Math.max(1, Math.floor(remaining / 60_000));
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);
	if (days > 0) return `${days}d${hours % 24}h`;
	if (hours > 0) return `${hours}h${minutes % 60}m`;
	return `${minutes}m`;
}

interface SelectedLimit {
	readonly label: "7Day" | "5Session";
	readonly value: UsageSnapshot["limits"][number];
}

function selectedLimits(snapshot: UsageSnapshot): readonly SelectedLimit[] {
	const normalized = snapshot.limits.map((value) => ({ value, label: value.label.toLowerCase() }));
	if (snapshot.provider === "openai-codex") {
		const sevenDay = normalized.find(({ label }) => /7\s*days?/u.test(label) && !label.includes("spark"));
		return sevenDay ? [{ label: "7Day", value: sevenDay.value }] : [];
	}
	const fiveSession = normalized.find(({ label }) => /5\s*(?:hours?|session)/u.test(label));
	const sevenDay = normalized.find(({ label }) => /7\s*days?/u.test(label));
	return [
		...(fiveSession ? [{ label: "5Session" as const, value: fiveSession.value }] : []),
		...(sevenDay ? [{ label: "7Day" as const, value: sevenDay.value }] : []),
	];
}

function usageIssueLabel(snapshot: UsageSnapshot): string {
	if (!snapshot.issue) return "";
	const retry = snapshot.issue.retryAt ? compactReset(snapshot.issue.retryAt) : "";
	const suffix = retry ? `(${retry})` : "";
	if (snapshot.issue.kind === "rate-limit") return `요청 제한${suffix}`;
	if (snapshot.issue.kind === "authentication") return "인증 갱신 필요";
	if (snapshot.issue.kind === "network") return `네트워크 오류${suffix}`;
	return `Provider 오류${suffix}`;
}

/** Provider subscription limits; these are distinct from the active thread context window. */
export class UsageStripView implements Component {
	private snapshots: readonly UsageSnapshot[] = [
		{ provider: "openai-codex", state: "loading", fetchedAt: Date.now(), limits: [] },
		{ provider: "anthropic", state: "loading", fetchedAt: Date.now(), limits: [] },
	];

	constructor(private readonly sessionUsage?: () => WorkbenchSessionUsage | undefined) {}

	update(snapshots: readonly UsageSnapshot[]): void {
		this.snapshots = snapshots;
	}
	invalidate(): void {}
	render(width: number): string[] {
		if (!this.sessionUsage) return this.renderQuotaLines(width);
		if (width < 64) return this.renderQuotaLines(width);
		const gap = width >= 64 ? 2 : 1;
		const rightMinimum = 35;
		const leftWidth = Math.max(0, Math.min(Math.max(32, Math.floor(width * 0.54)), width - rightMinimum - gap));
		const rightWidth = Math.max(0, width - leftWidth - gap);
		const quotaLines = this.renderQuotaLines(leftWidth);
		const modelLines = sessionModelLines(this.sessionUsage(), rightWidth);
		return modelLines.map((modelLine, index) => fit(`${quotaLines[index] ?? " ".repeat(leftWidth)}${" ".repeat(gap)}${modelLine}`, width));
	}

	private renderQuotaLines(width: number): string[] {
		return (["openai-codex", "anthropic"] as const).map((provider) => {
			const snapshot = this.snapshots.find((item) => item.provider === provider);
			const providerLabel = provider === "openai-codex" ? colors.highlight("Codex") : colors.warm("Claude");
			const label = fit(snapshot?.stale ? `${providerLabel}${colors.warning("*")}` : providerLabel, 8);
			if (!snapshot || snapshot.state === "loading") return fit(`${label}${colors.muted("사용량 확인 중…")}`, width);
			if (snapshot.state === "auth-required") return fit(`${label}${colors.warning("로그인 필요")} ${colors.muted(`(/login ${provider})`)}`, width);
			if (snapshot.state === "unsupported") return fit(`${label}${colors.muted("OAuth 사용량 미지원")}`, width);
			if (snapshot.state === "error") {
				const issue = usageIssueLabel(snapshot);
				return fit(`${label}${colors.error(issue || "조회 실패")} ${colors.muted("· 자동 재시도")}`, width);
			}
			const compact = width < 60;
			const limits: string[] = [];
			let usedWidth = 8;
			for (const { label: limitLabel, value: limit } of selectedLimits(snapshot)) {
				const remaining = limit.remainingPercent;
				const label = compact ? (limitLabel === "5Session" ? "5S" : "7D") : fit(limitLabel, 9);
				const color = remaining === undefined ? colors.muted
					: remaining <= 10 ? colors.error : remaining <= 30 ? colors.warning : colors.success;
				const reset = compactReset(limit.resetsAt);
				const value = remaining === undefined ? label
					: compact ? `${label} ${usagePercent(remaining)}${reset ? ` ${reset}` : ""}`
						: `${label}${usagePercent(remaining)}${reset ? ` ${reset}` : ""}`;
				const separator = limits.length ? " · " : "";
				if (usedWidth + visibleWidth(separator + value) > width) continue;
				limits.push(`${separator}${color(value)}`);
				usedWidth += visibleWidth(separator + value);
			}
			const issue = usageIssueLabel(snapshot);
			const issueSuffix = issue ? `${colors.muted(" · ")}${colors.warning(issue)}` : "";
			return fit(`${label}${limits.join("") || colors.muted("제한 정보 없음")}${issueSuffix}`, width);
		});
	}
}

const SESSION_MODEL_ROWS = Object.freeze([
	Object.freeze([{ label: "Sol", key: "sol", width: 6 }, { label: "Fable", key: "fable", width: 7 }]),
	Object.freeze([{ label: "Terra", key: "terra", width: 6 }, { label: "Opus", key: "opus", width: 7 }]),
	Object.freeze([{ label: "Luna", key: "luna", width: 6 }, { label: "Sonnet", key: "sonnet", width: 7 }]),
]);

function sessionModelLines(usage: WorkbenchSessionUsage | undefined, width: number): string[] {
	const totals = new Map<string, number>();
	for (const model of usage?.models ?? []) {
		const normalized = model.model.toLowerCase();
		const slot = SESSION_MODEL_ROWS.flat().find(({ key }) => new RegExp(`(?:^|-)${key}(?:-|$)`, "u").test(normalized));
		if (slot) totals.set(slot.key, (totals.get(slot.key) ?? 0) + model.totalTokens);
	}
	return SESSION_MODEL_ROWS.map(([codex, claude]) => {
		const left = sessionModelValue(codex.label, codex.width, totals.get(codex.key));
		const right = sessionModelValue(claude.label, claude.width, totals.get(claude.key));
		return fitRight(`${fit(left, 18)}${right}`, width);
	});
}

function fitRight(text: string, width: number): string {
	if (width <= 0) return "";
	const clipped = truncateToWidth(text, width);
	return " ".repeat(Math.max(0, width - visibleWidth(clipped))) + clipped;
}

function sessionModelValue(label: string, labelWidth: number, tokens: number | undefined): string {
	const value = tokens === undefined ? "–" : compactTokenCount(tokens);
	const alignedValue = value.padStart(5, " ");
	return `${colors.muted(label.padEnd(labelWidth, " "))}: ${tokens === undefined ? colors.muted(alignedValue) : colors.text(alignedValue)}`;
}
