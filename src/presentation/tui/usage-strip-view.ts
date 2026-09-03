import { truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";
import type { UsageLimitSnapshot, UsageSnapshot } from "../../application/ports";
import type { WorkbenchModelUsage } from "../../domain/workbench";
import { colors } from "./theme";

const HUD_ROWS = 4;
const LABEL_WIDTH = 6;
const WINDOW_WIDTH = 2;
const BAR_WIDTH = 10;
const RESET_WIDTH = 6;
const CHIP_GAP = 2;
/** `Codex  7d ██████████ 6d22h` — the fixed quota prefix every row starts with. */
const QUOTA_WIDTH = LABEL_WIDTH + 1 + WINDOW_WIDTH + 1 + BAR_WIDTH + 1 + RESET_WIDTH;
const QUOTA_MIN_WIDTH = QUOTA_WIDTH;
const COMPACT_MIN_WIDTH = 18;

type Color = (text: string) => string;
type ProviderLabel = "Codex" | "Claude" | "Gemini";
type Window = "5H" | "7D";

interface QuotaRow {
	readonly label: ProviderLabel | "";
	readonly color: Color;
	readonly window: Window;
	readonly snapshot?: UsageSnapshot;
	readonly limit?: UsageLimitSnapshot;
	/** Provider that owns this row's model chips; a second row of the same provider repeats it. */
	readonly owner: ProviderLabel;
}

export interface UsageStripSession {
	readonly models: readonly WorkbenchModelUsage[];
	readonly activeModel?: string;
}

function fit(text: string, width: number): string {
	if (width <= 0) return "";
	const clipped = truncateToWidth(text, width, "");
	return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

function compactReset(timestamp: number | undefined): string {
	if (!timestamp) return "";
	const remaining = timestamp - Date.now();
	if (remaining <= 0) return "~0m";
	const minutes = Math.max(1, Math.floor(remaining / 60_000));
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);
	if (days > 0) return `${days}d${String(hours % 24).padStart(2, "0")}h`;
	if (hours > 0) return `${hours}h${String(minutes % 60).padStart(2, "0")}m`;
	return `${minutes}m`;
}

function hasWindow(label: string, unit: "hour" | "day"): boolean {
	return unit === "hour" ? /5\s*(?:hours?|h)\b/iu.test(label) : /7\s*(?:days?|d)\b/iu.test(label);
}

function isTier(label: string, tier: "spark" | "opus" | "sonnet"): boolean {
	return label.toLowerCase().includes(tier);
}

function codexWindow(snapshot: UsageSnapshot | undefined, window: Window): UsageLimitSnapshot | undefined {
	const limits = snapshot?.state === "ready" ? snapshot.limits : [];
	const regular = limits.filter((limit) => !isTier(limit.label, "spark"));
	return regular.find((limit) => hasWindow(limit.label, window === "5H" ? "hour" : "day"));
}

function claudeWindow(snapshot: UsageSnapshot | undefined, window: Window): UsageLimitSnapshot | undefined {
	const limits = snapshot?.state === "ready" ? snapshot.limits : [];
	const regular = limits.filter((limit) => !isTier(limit.label, "opus") && !isTier(limit.label, "sonnet"));
	return regular.find((limit) => hasWindow(limit.label, window === "5H" ? "hour" : "day"));
}

function usageColor(remaining: number): Color {
	return remaining <= 10 ? colors.error : remaining <= 30 ? colors.warning : colors.success;
}

function issueBadge(snapshot: UsageSnapshot | undefined): string {
	if (!snapshot?.stale) return "";
	if (snapshot.issue?.kind === "rate-limit") return "*429";
	if (snapshot.issue?.kind === "authentication") return "*AUTH";
	if (snapshot.issue?.kind === "network") return "*NET";
	return "*ERR";
}

function providerState(snapshot: UsageSnapshot | undefined): string {
	if (!snapshot || snapshot.state === "loading") return "확인 중";
	if (snapshot.state === "auth-required") return "/login";
	if (snapshot.state === "unsupported") return "미지원";
	if (snapshot.issue?.kind === "rate-limit") return "429";
	if (snapshot.issue?.kind === "authentication") return "인증 오류";
	if (snapshot.issue?.kind === "network") return "네트워크";
	return "조회 실패";
}

function bar(remaining: number): string {
	const filled = Math.max(0, Math.min(BAR_WIDTH, Math.round((remaining / 100) * BAR_WIDTH)));
	return `${"█".repeat(filled)}${"░".repeat(BAR_WIDTH - filled)}`;
}

/**
 * Model ids are `<family>-<version>-<variant>`; the operator recognises the variant.
 * The first alphabetic segment after the family is that variant. An id that does not
 * follow the shape keeps its full text rather than being guessed at.
 */
export function modelChipLabel(model: string): string {
	const segments = model.split("-");
	const variant = segments.slice(1).find((segment) => /^[a-z]+$/iu.test(segment));
	if (!variant) return model;
	return `${variant[0]?.toUpperCase() ?? ""}${variant.slice(1)}`;
}

/** Explicit id-to-provider table. An unrecognised id is counted, never attributed to a guess. */
const MODEL_OWNERS: readonly (readonly [RegExp, ProviderLabel])[] = [
	[/^(?:gpt|codex|o\d)/iu, "Codex"],
	[/^claude/iu, "Claude"],
	[/^gemini/iu, "Gemini"],
];

function modelOwner(model: string): ProviderLabel | undefined {
	return MODEL_OWNERS.find(([pattern]) => pattern.test(model))?.[1];
}

function quotaSegment(row: QuotaRow): string {
	const label = fit(row.label ? row.color(row.label) : "", LABEL_WIDTH);
	const window = colors.secondary(row.window === "5H" ? "5h" : "7d");
	if (row.snapshot && row.snapshot.state !== "ready") {
		return `${label} ${window} ${fit(colors.warning(providerState(row.snapshot)), BAR_WIDTH + 1 + RESET_WIDTH)}`;
	}
	const remaining = row.limit?.remainingPercent;
	if (remaining === undefined || !Number.isFinite(remaining)) {
		return `${label} ${window} ${fit(colors.muted("—"), BAR_WIDTH + 1 + RESET_WIDTH)}`;
	}
	const clamped = Math.max(0, Math.min(100, remaining));
	const badge = issueBadge(row.snapshot);
	const reset = `${compactReset(row.limit?.resetsAt)}${badge}`;
	return `${label} ${window} ${usageColor(clamped)(bar(clamped))} ${fit(colors.muted(reset), RESET_WIDTH)}`;
}

export class UsageStripView implements Component {
	private snapshots: readonly UsageSnapshot[] = [
		{ provider: "openai-codex", state: "loading", fetchedAt: Date.now(), limits: [] },
		{ provider: "anthropic", state: "loading", fetchedAt: Date.now(), limits: [] },
	];

	public constructor(private readonly session?: () => UsageStripSession | null | undefined) {}

	public update(snapshots: readonly UsageSnapshot[]): void {
		this.snapshots = snapshots;
	}

	public invalidate(): void {}

	public render(width: number): string[] {
		if (width <= 0) return [];
		const rows = this.quotaRows();
		if (width < COMPACT_MIN_WIDTH) {
			return [fit(colors.warning("↔ 폭 부족"), width), ...blankRows(width, HUD_ROWS - 1)];
		}
		const chipWidth = width - QUOTA_WIDTH - CHIP_GAP;
		const chipRows = width >= QUOTA_MIN_WIDTH + CHIP_GAP + 8
			? this.chipRows(rows, chipWidth)
			: rows.map(() => "");
		return rows.map((row, index) => fit(
			chipRows[index]
				? `${quotaSegment(row)}${" ".repeat(CHIP_GAP)}${fit(chipRows[index] ?? "", chipWidth)}`
				: quotaSegment(row),
			width,
		));
	}

	private quotaRows(): readonly QuotaRow[] {
		const codex = this.snapshots.find((snapshot) => snapshot.provider === "openai-codex");
		const claude = this.snapshots.find((snapshot) => snapshot.provider === "anthropic");
		return [
			{ label: "Codex", color: colors.accent, window: "7D", snapshot: codex, limit: codexWindow(codex, "7D"), owner: "Codex" },
			{ label: "Claude", color: colors.warm, window: "7D", snapshot: claude, limit: claudeWindow(claude, "7D"), owner: "Claude" },
			{ label: "", color: colors.warm, window: "5H", snapshot: claude, limit: claudeWindow(claude, "5H"), owner: "Claude" },
			// Gemini exposes per-model quota buckets, not canonical 5H/7D windows. Do not guess a mapping.
			{ label: "Gemini", color: colors.highlight, window: "7D", owner: "Gemini" },
		];
	}

	/** Chips flow down the rows their provider owns; what does not fit becomes an explicit `+N`. */
	private chipRows(rows: readonly QuotaRow[], chipWidth: number): string[] {
		const session = this.session?.();
		const models = session?.models ?? [];
		if (models.length === 0 || chipWidth <= 0) return rows.map(() => "");
		const byOwner = new Map<ProviderLabel | "", WorkbenchModelUsage[]>();
		let unowned = 0;
		for (const usage of models) {
			const owner = modelOwner(usage.model);
			if (!owner) { unowned += 1; continue; }
			byOwner.set(owner, [...(byOwner.get(owner) ?? []), usage]);
		}
		const remainingByOwner = new Map(byOwner);
		return rows.map((row, index) => {
			const pool = remainingByOwner.get(row.owner) ?? [];
			const taken: string[] = [];
			let used = 0;
			while (pool.length > 0) {
				const usage = pool[0];
				if (!usage) break;
				const work = [
					usage.interactiveRootTurns > 0 ? `i${usage.interactiveRootTurns}` : "",
					usage.detachedInvocations > 0 ? `d${usage.detachedInvocations}` : "",
				].filter(Boolean).join("/");
				const chip = `${usage.model === session?.activeModel ? "● " : ""}${modelChipLabel(usage.model)} ${work || "0"}`;
				const cost = (taken.length === 0 ? 0 : 2) + visibleWidth(chip);
				if (used + cost > chipWidth) break;
				used += cost;
				taken.push(usage.model === session?.activeModel ? colors.success(chip) : colors.muted(chip));
				pool.shift();
			}
			remainingByOwner.set(row.owner, pool);
			const isLastRowForOwner = !rows.slice(index + 1).some((later) => later.owner === row.owner);
			const overflow = isLastRowForOwner ? pool.length + (index === rows.length - 1 ? unowned : 0) : 0;
			const cells = overflow > 0 ? [...taken, colors.muted(`+${overflow}`)] : taken;
			return cells.join("  ");
		});
	}
}

function blankRows(width: number, count: number): string[] {
	return Array.from({ length: Math.max(0, count) }, () => " ".repeat(width));
}
