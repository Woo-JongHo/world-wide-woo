import type { Component } from "@earendil-works/pi-tui";
import type { WorkbenchSnapshot } from "../../../../../core/domain/work/workbench";
import type { UsageLimitSnapshot, UsageSnapshot } from "../../../../../core/ports";
import { monitoringCard, monitoringColumns, monitoringMatrix, monitoringMeter, monitoringPanel, monitoringUnavailablePanel, monitoringWidths, type MonitoringCard } from "../../foundation/layout/astra-monitoring-layout";
import { a, fit, number, pair, prose, railSection, safe, section } from "../../foundation/theme/astra-theme";

const PROVIDERS = ["openai-codex", "anthropic", "google", "zai"] as const;
const PROVIDER_LABELS: Readonly<Record<UsageSnapshot["provider"], string>> = {
	"openai-codex": "Codex",
	anthropic: "Claude",
	google: "Antigravity",
	zai: "Z.AI",
};

function observedPercent(limit: UsageLimitSnapshot): number | null {
	if (typeof limit.remainingPercent === "number" && Number.isFinite(limit.remainingPercent)) return Math.max(0, Math.min(100, limit.remainingPercent));
	if (typeof limit.usedPercent === "number" && Number.isFinite(limit.usedPercent)) return 100 - Math.max(0, Math.min(100, limit.usedPercent));
	return null;
}

function resetLabel(timestamp: number | undefined): string {
	if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) return "미관측";
	return new Date(timestamp).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

function contextLabel(snapshot: WorkbenchSnapshot): string {
	const percent = snapshot.contextUsage?.percent;
	if (typeof percent !== "number" || !Number.isFinite(percent)) return "미관측";
	return `${Math.round(Math.max(0, Math.min(100, percent)))}%`;
}

function providerCard(provider: UsageSnapshot["provider"], snapshot: UsageSnapshot | undefined): MonitoringCard {
	if (!snapshot) return { title: PROVIDER_LABELS[provider], value: "미관측", detail: "provider snapshot 없음" };
	const limit = snapshot.limits[0];
	const remaining = limit ? observedPercent(limit) : null;
	const state = `${snapshot.state}${snapshot.stale ? " · stale" : ""}`;
	if (!limit) return { title: PROVIDER_LABELS[provider], value: state, detail: "quota 미관측" };
	return {
		title: PROVIDER_LABELS[provider],
		value: remaining === null ? state : `${Math.round(remaining)}% 남음`,
		detail: `${safe(limit.label, 42)} · ${state}`,
	};
}

function providerCards(providers: readonly UsageSnapshot[], width: number): string[] {
	if (width < 96) return PROVIDERS.flatMap(provider => [
		...monitoringCard(providerCard(provider, providers.find(candidate => candidate.provider === provider)), width),
		"",
	]);
	const widths = monitoringWidths(width, PROVIDERS.length);
	const cards = PROVIDERS.map((provider, index) => monitoringCard(
		providerCard(provider, providers.find(candidate => candidate.provider === provider)),
		widths[index] ?? 1,
	));
	return monitoringColumns(cards, widths);
}

function modelRows(snapshot: WorkbenchSnapshot, width: number): string[] {
	const session = snapshot.sessionUsage;
	const legend = [
		a.muted("MODEL NAME · EFFORT · REQUEST · EXEC TIME"),
		a.muted("INPUT / OUTPUT / CACHED TOKENS · RECENT USE · SUPPORTED EFFORTS"),
	];
	if (!session?.models.length) return [...legend, a.muted("model telemetry 미관측")];
	const rows = session.models.flatMap(model => {
		const interactiveTurns = Math.max(0, Number.isFinite(model.interactiveRootTurns) ? model.interactiveRootTurns : 0);
		const detachedCalls = Math.max(0, Number.isFinite(model.detachedInvocations) ? model.detachedInvocations : 0);
		const totalTokens = Math.max(0, Number.isFinite(model.totalTokens) ? model.totalTokens : 0);
		return [
			pair(`${a.strong(safe(model.model, 38))} · ${a.active(model.effort ? safe(model.effort, 16) : "미관측")}`, `${number(interactiveTurns + detachedCalls)} requests`, width),
			pair(`tokens ${number(totalTokens)} total · I/O/cached 미관측`, "exec · recent · supported 미관측", width),
		];
	});
	return [...legend, ...rows, a.caption("Native는 현재 token 총량만 관측하며 input/output/cached 분해와 시간 축을 제공하지 않습니다.")];
}

function providerAvailabilityRows(providers: readonly UsageSnapshot[], width: number): string[] {
	const contentWidth = Math.max(1, width - 2);
	const labelWidth = Math.min(12, Math.max(7, Math.floor(contentWidth * 0.22)));
	const valueWidth = 5;
	const meterWidth = Math.max(4, contentWidth - labelWidth - valueWidth - 3);
	return PROVIDERS.flatMap(provider => {
		const snapshot = providers.find(candidate => candidate.provider === provider);
		if (!snapshot?.limits.length) return [pair(PROVIDER_LABELS[provider], "미관측", contentWidth)];
		return snapshot.limits.slice(0, 2).map((limit, index) => {
			const percent = observedPercent(limit);
			const label = index === 0 ? PROVIDER_LABELS[provider].padEnd(labelWidth) : " ".repeat(labelWidth);
			if (percent === null) return fit(`${label}  ${a.muted("미관측")}`, contentWidth);
			const ink = index === 0 ? a.success : a.info;
			return fit(`${label}  ${monitoringMeter(percent, 100, meterWidth, ink)} ${a.muted(`${Math.round(percent)}%`.padStart(valueWidth))}`, contentWidth);
		});
	});
}

function effortDistributionRows(snapshot: WorkbenchSnapshot, width: number): string[] {
	const models = snapshot.sessionUsage?.models ?? [];
	if (!models.length) return [a.muted("미관측 · model effort telemetry 없음")];
	const totals = new Map<string, number>();
	for (const model of models) {
		const effort = model.effort || "미관측";
		totals.set(effort, (totals.get(effort) ?? 0) + Math.max(0, Number.isFinite(model.totalTokens) ? model.totalTokens : 0));
	}
	const totalTokens = [...totals.values()].reduce((total, tokens) => total + tokens, 0);
	if (totalTokens <= 0) return [a.muted("미관측 · effort token telemetry가 0입니다.")];
	const contentWidth = Math.max(1, width - 2);
	const segmentInks = [a.failure, a.active, a.attention, a.info] as const;
	const ordered = [...totals].sort((left, right) => right[1] - left[1]);
	const meterWidth = Math.max(4, contentWidth);
	let remainingCells = meterWidth;
	const segments = ordered.map(([effort, tokens], index) => {
		const cells = index === ordered.length - 1 ? remainingCells : Math.min(remainingCells, Math.round(meterWidth * tokens / totalTokens));
		remainingCells -= cells;
		return (segmentInks[index % segmentInks.length] ?? a.info)("█".repeat(Math.max(0, cells)));
	});
	const legend = ordered.map(([effort, tokens], index) => {
		const percent = Math.round(tokens / totalTokens * 100);
		const marker = (segmentInks[index % segmentInks.length] ?? a.info)("■");
		return `${marker} ${safe(effort, 16)} ${percent}% · ${number(tokens)}`;
	});
	return [segments.join(""), ...legend];
}

function tokenMatrixRows(snapshot: WorkbenchSnapshot, width: number): string[] | null {
	const session = snapshot.sessionUsage;
	if (!session || session.observedTotalTokens == null) return null;
	const interactiveTokens = session.models.reduce((total, model) => total + Math.max(0, Number.isFinite(model.interactiveTokens) ? model.interactiveTokens : 0), 0);
	const detachedTokens = session.models.reduce((total, model) => total + Math.max(0, Number.isFinite(model.detachedTokens) ? model.detachedTokens : 0), 0);
	return monitoringMatrix({
		columns: ["SCOPE", "TOKENS", "SOURCE"],
		rows: [
			["Session", number(Math.max(0, session.observedTotalTokens)), "observed"],
			["Interactive", number(interactiveTokens), "observed"],
			["Detached", number(detachedTokens), "observed"],
			["Unattributed", number(Math.max(0, session.unattributedTokens)), "remainder"],
		],
	}, Math.max(1, width - 2), 6);
}

function leftAnalysis(providers: readonly UsageSnapshot[], width: number): string[] {
	return [
		...monitoringPanel({ title: "Provider Availability Window", meta: `${providers.length}/4 observed`, ink: a.note }, providerAvailabilityRows(providers, width), width),
		...monitoringPanel({ title: "Time Until Renewal", meta: "provider supplied", ink: a.active }, [
			...PROVIDERS.map(provider => {
				const limit = providers.find(candidate => candidate.provider === provider)?.limits[0];
				return pair(PROVIDER_LABELS[provider], limit ? resetLabel(limit.resetsAt) : "미관측", Math.max(1, width - 2));
			}),
			a.caption("정확한 remaining duration은 Native에서 미관측"),
		], width),
	];
}

function middleAnalysis(snapshot: WorkbenchSnapshot, width: number): string[] {
	const sessionTokens = snapshot.sessionUsage?.observedTotalTokens;
	return [
		...monitoringPanel({ title: "Model Effort Distribution", meta: snapshot.sessionUsage ? "observed" : "미관측", ink: a.active }, effortDistributionRows(snapshot, width), width),
		...monitoringUnavailablePanel("Token Trend", "time bucket token telemetry가 없습니다.", width),
		...monitoringPanel({ title: "Today vs Session", meta: "mixed coverage", ink: a.note }, [
			pair("Today", "미관측", Math.max(1, width - 2)),
			pair("Session", sessionTokens == null ? "미관측" : `${number(sessionTokens)} tokens`, Math.max(1, width - 2)),
		], width),
	];
}

function rightAnalysis(snapshot: WorkbenchSnapshot, width: number): string[] {
	const matrix = tokenMatrixRows(snapshot, width);
	return [
		...monitoringUnavailablePanel("Provider Load Ratio", "model usage에 provider attribution이 없습니다.", width),
		...(matrix
			? monitoringPanel({ title: "Token Consumption Matrix", meta: "observed total", ink: a.active }, matrix, width)
			: monitoringUnavailablePanel("Token Consumption Matrix", "session token baseline이 없습니다.", width)),
		...monitoringUnavailablePanel("Input / Output Ratio", "input/output token 분해가 없습니다.", width),
		...monitoringUnavailablePanel("Performance Trend", "request duration과 time bucket telemetry가 없습니다.", width),
	];
}

function analysisWorkspace(snapshot: WorkbenchSnapshot, providers: readonly UsageSnapshot[], width: number): string[] {
	// The standard desktop shell leaves roughly 100 columns after the metrics rail.
	// Keep the Figma three-column analysis hierarchy at that width, and stack only
	// when each panel would become too narrow to communicate its state.
	if (width < 96) return [
		...leftAnalysis(providers, width),
		...middleAnalysis(snapshot, width),
		...rightAnalysis(snapshot, width),
	];
	const widths = monitoringWidths(width, 3);
	return monitoringColumns([
		leftAnalysis(providers, widths[0] ?? 1),
		middleAnalysis(snapshot, widths[1] ?? 1),
		rightAnalysis(snapshot, widths[2] ?? 1),
	], widths);
}

export class AstraUsageView implements Component {
	constructor(
		private readonly get: () => WorkbenchSnapshot,
		private readonly usage: () => readonly UsageSnapshot[],
	) {}
	invalidate(): void {}
	render(width: number): string[] {
		const snapshot = this.get();
		const providers = this.usage();
		const rows = [
			...section("Active Providers Telemetry", width, `${providers.length}/4 observed`, a.active),
			...providerCards(providers, width),
			...monitoringPanel({ title: "Model Telemetry", meta: snapshot.sessionUsage ? `${snapshot.sessionUsage.models.length} models observed` : "미관측", ink: a.active }, modelRows(snapshot, Math.max(1, width - 2)), width),
			...section("Usage Analysis", width, "Native telemetry", a.note),
			...analysisWorkspace(snapshot, providers, width),
		];
		if (!providers.length) rows.push(a.muted("/usage로 provider quota를 조회합니다."));
		return rows.flatMap(row => prose(fit(row, width), width));
	}
}

export class AstraUsageRail implements Component {
	constructor(
		private readonly get: () => WorkbenchSnapshot,
		private readonly usage: () => readonly UsageSnapshot[],
	) {}
	invalidate(): void {}
	render(width: number): string[] {
		const snapshot = this.get();
		const session = snapshot.sessionUsage;
		const providers = this.usage();
		const rows = [
			...railSection("Workbench Metrics", width, session?.observedTotalTokens == null ? "미관측" : "session observed", a.active),
			pair("Today requests", "미관측", width),
			pair("Session uptime", "미관측", width),
			pair("Avg response", "미관측", width),
			pair("Session tokens", session?.observedTotalTokens == null ? "미관측" : number(session.observedTotalTokens), width),
			pair("Context", contextLabel(snapshot), width),
			...railSection("Time Window Performance", width, "미관측", a.note),
			a.muted("1h   미관측  ░░░░░░░░"),
			a.muted("24h  미관측  ░░░░░░░░"),
			a.muted("7d   미관측  ░░░░░░░░"),
			...railSection("Provider pulse", width, `${providers.length}/4 observed`, a.active),
			...PROVIDERS.map(provider => {
				const current = providers.find(candidate => candidate.provider === provider);
				const percent = current?.limits[0] ? observedPercent(current.limits[0]) : null;
				const ink = provider === "openai-codex" ? a.codex : provider === "anthropic" ? a.claude : provider === "google" ? a.gemini : a.zai;
				return pair(ink(PROVIDER_LABELS[provider]), percent === null ? a.muted(current?.state ?? "미관측") : ink(`${Math.round(percent)}%`), width);
			}),
			...railSection("System Hints", width, "read-only", a.note),
			a.muted("/usage  provider quota 새로고침"),
			a.muted("I/O token·duration은 Native 미관측"),
			a.muted("stale provider는 마지막 관측값"),
		];
		return rows.flatMap(row => prose(fit(row, width), width));
	}
}
