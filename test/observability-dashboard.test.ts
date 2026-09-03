import { describe, expect, test } from "bun:test";
import { OBSERVABILITY_RECENT_SESSION_LIMIT, projectObservabilityDashboard, summarizeObservabilityStreams, type ObservabilityCoverage, type ObservabilitySessionSummary } from "../src/domain/observability-dashboard";

const coverage: ObservabilityCoverage = { state: "observed", observedFrom: "2026-09-01T00:00:00.000Z", observedUntil: "2026-09-03T00:00:00.000Z", streamsRead: 1, skippedStreams: 0 };
const session = (id: string, result: ObservabilitySessionSummary["result"], endedAt: string | null, usage: ObservabilitySessionSummary["usage"] = null): ObservabilitySessionSummary => ({ sessionId: id, projectId: "project", boundary: "observed", startedAt: endedAt, endedAt, result, failures: result === "failed" ? 1 : 0, retries: 0, usage });

describe("observability dashboard", () => {
	test("is deterministic, aggregates only attributed usage, and bounds recent sessions", () => {
		const sessions = Array.from({ length: OBSERVABILITY_RECENT_SESSION_LIMIT + 2 }, (_, index) => session(`s${index}`, "completed", `2026-09-${String(index % 3 + 1).padStart(2, "0")}T00:00:00.000Z`, index === 0 ? { totalTokens: 12, unattributedTokens: 99, models: [{ model: "model-a", effort: null, interactiveRootTurns: 1, interactiveTokens: 12, detachedInvocations: 0, detachedTokens: 0, totalTokens: 12 }] } : null));
		const first = projectObservabilityDashboard(sessions, coverage);
		expect(first).toEqual(projectObservabilityDashboard(sessions, coverage));
		expect(first.usage).toEqual({ totalTokens: 12, models: [{ model: "model-a", effort: null, totalTokens: 12, interactiveRootTurns: 1, detachedInvocations: 0 }] });
		expect(first.recentSessions).toHaveLength(OBSERVABILITY_RECENT_SESSION_LIMIT);
	});

	test("keeps incomplete boundaries and insufficient trend unavailable", () => {
		const dashboard = projectObservabilityDashboard([{ ...session("unknown", "unknown", null), boundary: "unknown", failures: null, retries: null }], coverage);
		expect(dashboard.sessions.active).toBeNull();
		expect(dashboard.usage.totalTokens).toBeNull();
		expect(dashboard.trend).toEqual({ available: false, buckets: [] });
		expect(dashboard.attention).toContain("Session boundary normalization required");
	});

	test("does not manufacture session boundaries from partial activity", () => {
		const summaries = summarizeObservabilityStreams([{ streamId: "stream", activities: [{ schemaVersion: 1, id: "a", projectId: "stream", sequence: 1, recordedAt: "2026-09-01T00:00:00.000Z", kind: "progress", phase: "updated", provider: "test", nativeRefs: {}, sourceDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", payload: {} }] }]);
		expect(summaries[0]).toMatchObject({ boundary: "unknown", startedAt: null, endedAt: null, usage: null });
	});
});
