import { truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";
import type { UsageSnapshot } from "../../application/ports";
import { colors } from "./theme";

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

function compactLimitLabel(label: string): string {
	return label
		.replace(/^Claude\s+/iu, "")
		.replace(/^5 hours?/iu, "5h")
		.replace(/^7 days?/iu, "7d")
		.replace(/^5 Hour$/iu, "5h")
		.replace(/^7 Day$/iu, "7d")
		.replace(/\s+\(([^)]+)\)/u, "·$1");
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

	update(snapshots: readonly UsageSnapshot[]): void {
		this.snapshots = snapshots;
	}
	invalidate(): void {}
	render(width: number): string[] {
		return (["openai-codex", "anthropic"] as const).map((provider) => {
			const snapshot = this.snapshots.find((item) => item.provider === provider);
			const providerLabel = provider === "openai-codex" ? colors.highlight("Codex") : colors.warm("Claude");
			const label = snapshot?.stale ? `${providerLabel}${colors.warning("*")}` : providerLabel;
			if (!snapshot || snapshot.state === "loading") return fit(`${label}  ${colors.muted("사용량 확인 중…")}`, width);
			if (snapshot.state === "auth-required") return fit(`${label}  ${colors.warning("로그인 필요")} ${colors.muted(`(/login ${provider})`)}`, width);
			if (snapshot.state === "unsupported") return fit(`${label}  ${colors.muted("OAuth 사용량 미지원")}`, width);
			if (snapshot.state === "error") {
				const issue = usageIssueLabel(snapshot);
				return fit(`${label}  ${colors.error(issue || "조회 실패")} ${colors.muted("· 자동 재시도")}`, width);
			}
			const limits = snapshot.limits.slice(0, 4).map((limit) => {
				const remaining = limit.remainingPercent;
				if (remaining === undefined) return compactLimitLabel(limit.label);
				const color = remaining <= 10 ? colors.error : remaining <= 30 ? colors.warning : colors.success;
				const reset = compactReset(limit.resetsAt);
				return `${colors.muted(`${compactLimitLabel(limit.label)}:`)}${color(`${remaining.toFixed(0)}%남음`)}${reset ? colors.muted(`(${reset})`) : ""}`;
			});
			const issue = usageIssueLabel(snapshot);
			const issueSuffix = issue ? `${colors.muted(" · ")}${colors.warning(issue)}` : "";
			return fit(`${label}  ${limits.join(colors.muted(" · ")) || colors.muted("제한 정보 없음")}${issueSuffix}`, width);
		});
	}
}
