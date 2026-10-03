// Observability dashboards of varied shape, built with the production projection.
import { projectObservabilityDashboard } from "../../../src/core/domain/observability/observability-dashboard";

const usage = (tokens: number, model: string, effort: string | null) => ({ totalTokens: tokens, observedTotalTokens: tokens, unattributedTokens: 0, models: [{ model, effort, interactiveRootTurns: 1, interactiveTokens: tokens, detachedInvocations: 0, detachedTokens: 0, totalTokens: tokens }], observationCoverage: { interactive: true, detached: false } });
const session = (id: string, result: string, day: number | null, extra: object = {}) => ({ sessionId: id, projectId: "project", boundary: "observed", startedAt: day === null ? null : `2026-09-0${day}T00:00:00.000Z`, endedAt: day === null ? null : `2026-09-0${day}T01:00:00.000Z`, result, failures: result === "failed" ? 1 : 0, retries: 0, usage: null, ...extra });
const coverage = (state: string, streamsRead: number, skippedStreams = 0) => ({ state, observedFrom: "2026-09-01T00:00:00.000Z", observedUntil: "2026-09-05T00:00:00.000Z", streamsRead, skippedStreams });

export const dashboards: any[] = [
	projectObservabilityDashboard([], coverage("unknown", 0) as any),
	projectObservabilityDashboard([session("s1", "completed", 1, { usage: usage(1200, "gpt-6", "high") }), session("s2", "failed", 2), session("s3", "active", 3, { retries: 2 })] as any, coverage("observed", 3) as any),
	projectObservabilityDashboard(Array.from({ length: 14 }, (_, i) => session(`s${i}`, i % 4 === 0 ? "failed" : "completed", (i % 4) + 1, i % 3 === 0 ? { usage: usage(1000 + i, i % 2 ? "model-a" : "model-b", null) } : {})) as any, coverage("partial-local-journal", 14, 2) as any),
	projectObservabilityDashboard([{ ...session("u", "unknown", null), boundary: "unknown", failures: null, retries: null }] as any, coverage("observed", 1) as any),
];
