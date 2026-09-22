/** Interactive, offline Astra UI showcase. No provider, credential, or project writes. */
import type { ProjectWorkbench } from "../src/core/application/orchestration/project-workbench";
import type { WorkbenchSnapshot } from "../src/core/domain/work/workbench";
import type { UsageSnapshot } from "../src/core/ports";
import { runProjectWorkbenchShell } from "../src/adapters/inbound/tui/shell/workbench-shell";
import { astraFixture } from "../test/fixtures/astra-snapshot";

const now = Date.now();
const usageSnapshots: readonly UsageSnapshot[] = [
	{ provider: "openai-codex", state: "ready", fetchedAt: now, limits: [{ label: "5 hours", remainingPercent: 74, resetsAt: now + 7_200_000, status: "ok" }, { label: "7 days", remainingPercent: 61, resetsAt: now + 345_600_000, status: "ok" }] },
	{ provider: "anthropic", state: "ready", fetchedAt: now, limits: [{ label: "5 hours", remainingPercent: 48, resetsAt: now + 9_000_000, status: "warning" }, { label: "7 days", remainingPercent: 72, resetsAt: now + 432_000_000, status: "ok" }] },
	{ provider: "google", state: "ready", fetchedAt: now, limits: [{ label: "Gemini daily", remainingPercent: 83, resetsAt: now + 43_200_000, status: "ok" }] },
	{ provider: "zai", state: "ready", fetchedAt: now, limits: [{ label: "Coding Plan 5 hours", remainingPercent: 57, resetsAt: now + 10_800_000, status: "ok" }, { label: "Coding Plan weekly", remainingPercent: 68, resetsAt: now + 518_400_000, status: "ok" }] },
];

const base = astraFixture("ready");
export const previewCwd = "/preview/DEMO DATA";
export const snapshot: WorkbenchSnapshot = {
	...base,
	sessionGoal: { text: "DEMO DATA · synthetic fixtures · not live telemetry", sourceActivityId: "offline-preview", updatedAt: new Date(now).toISOString() },
	revision: 42,
	activeModel: "gpt-5.6-sol",
	contextUsage: { usedTokens: 128_400, contextWindow: 200_000, percent: 64.2 },
	sessionUsage: {
		totalTokens: 186_300,
		observedTotalTokens: 186_300,
		unattributedTokens: 3_200,
		models: [
			{ model: "gpt-5.6-sol", effort: "high", interactiveRootTurns: 8, interactiveTokens: 126_000, detachedInvocations: 2, detachedTokens: 18_200, totalTokens: 144_200 },
			{ model: "gpt-5.6-luna", effort: "medium", interactiveRootTurns: 0, interactiveTokens: 0, detachedInvocations: 7, detachedTokens: 24_500, totalTokens: 24_500 },
			{ model: "claude-sonnet-4-6", effort: null, interactiveRootTurns: 0, interactiveTokens: 0, detachedInvocations: 3, detachedTokens: 14_400, totalTokens: 14_400 },
		],
		observationCoverage: { interactive: true, detached: true },
	},
	skillInventory: { count: 6, names: ["woo-entry", "woo-code-readability", "development-map", "rpa-build", "rpa-safety", "woo-commit"], sourceRevision: "preview", digest: "f".repeat(64) },
	mcpServers: [
		{ name: "figma", enabled: true, status: "connected", tools: ["get_design_context", "get_screenshot"] },
		{ name: "linear", enabled: true, status: "connected", tools: ["issues", "projects", "comments"] },
		{ name: "github", enabled: true, status: "connected", tools: ["issues", "pull_requests"] },
	],
	cacheObservations: [
		{ id: "context-projection", state: "ready", entries: 12, logicalBytes: 84_320, hits: 96, misses: 8, evictions: 1, latencyMs: 0.7, lastAccessedAt: new Date(now - 2_000).toISOString() },
		{ id: "model-catalog", state: "ready", entries: 14, logicalBytes: 18_200, hits: 11, misses: 2, evictions: 0, latencyMs: 42, lastAccessedAt: new Date(now - 12_000).toISOString() },
		{ id: "dashboard-data", state: "ready", entries: 1, logicalBytes: 9_600, hits: 18, misses: 1, evictions: 0, latencyMs: 88, lastAccessedAt: new Date(now - 5_000).toISOString() },
		{ id: "session-read", state: "ready", entries: base.activities.length, logicalBytes: 32_400, hits: 34, misses: 2, evictions: 0, latencyMs: 1.2, lastAccessedAt: new Date(now - 1_000).toISOString() },
	],
	linearDashboard: {
		state: "ready", projectName: "World Wide Woo", fetchedAt: new Date(now).toISOString(), error: null,
		issues: [
			{ id: "WOO-901", title: "Astra monitoring surfaces", status: "In Progress", dueDate: null },
			{ id: "WOO-902", title: "Cache telemetry contract", status: "Done", dueDate: null },
		],
		update: { body: "다섯 모니터링 화면 통합 검증", createdAt: new Date(now - 3_600_000).toISOString() },
		comments: [], milestones: [],
	},
};

const workbench = {
	snapshot,
	subscribe(listener: (value: WorkbenchSnapshot) => void) { listener(snapshot); return () => undefined; },
	async dispatch() { return { state: "rejected", commandId: "preview", reason: "오프라인 UI 프리뷰입니다." }; },
	async close() {},
} as unknown as ProjectWorkbench;

if (import.meta.main) runProjectWorkbenchShell({
	design: "astra",
	initialAstraPage: "dashboard",
	cwd: previewCwd,
	workbench,
	usage: {
		async refresh() { return usageSnapshots; },
		startPolling(listener) { listener(usageSnapshots); return () => undefined; },
		cacheMetrics: () => ({ entries: usageSnapshots.length, hits: 18, misses: 4, evictions: 1, lastAccessedAt: new Date(now).toISOString() }),
	},
	auth: {
		methods: () => [],
		status: async provider => ({ state: "configured", provider, type: "oauth", source: "offline preview" }),
		login: async () => { throw new Error("오프라인 프리뷰에서는 로그인을 실행하지 않습니다."); },
		logout: async () => undefined,
	},
	composerDraft: { initialText: "", save: async () => undefined, clear: async () => undefined },
	releaseSessionLease: async () => undefined,
});
