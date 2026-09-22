import { describe, expect, test } from "bun:test";
import { composeCacheTelemetry } from "../src/core/domain/observability/cache-telemetry";
import { projectWorkbenchCacheTelemetry } from "../src/adapters/inbound/tui/features/cache/cache-telemetry-projection";

describe("Cache telemetry", () => {
	test("always exposes the seven workbench cache layers without inventing missing measurements", () => {
		const snapshot = composeCacheTelemetry({
			collectedAt: "2026-09-22T00:00:00.000Z",
			observations: [{
				id: "render",
				entries: 24,
				logicalBytes: 1_024,
				hits: 9,
				misses: 1,
				evictions: 2,
				latencyMs: 1.5,
				lastAccessedAt: "2026-09-21T23:59:59.000Z",
			}],
		});

		expect(snapshot.layers.map(layer => layer.id)).toEqual([
			"transcript",
			"render",
			"context-projection",
			"usage-snapshot",
			"model-catalog",
			"dashboard-data",
			"session-read",
		]);
		expect(snapshot.layers.find(layer => layer.id === "render")).toMatchObject({ state: "ready", entries: 24, logicalBytes: 1_024 });
		expect(snapshot.layers.find(layer => layer.id === "transcript")).toMatchObject({ state: "unobserved", entries: null, logicalBytes: null });
		expect(snapshot.totals).toEqual({ entries: 24, logicalBytes: 1_024, hits: 9, misses: 1, evictions: 2 });
	});

	test("projects only instrumented cache owners and leaves the other five layers unobserved", () => {
		const snapshot = projectWorkbenchCacheTelemetry({
			collectedAt: "2026-09-22T00:00:00.000Z",
			transcript: {
				durableBlockCount: 4, volatileBlockCount: 1, markdownEntries: 2, rowEntries: 8, rowLogicalBytes: 1_000,
				widthStates: 3, widthMetadataLogicalBytes: 200, exactCountBuilds: 1, exactCountBuildMs: 2,
				requestedRows: 10, requestedMaterializationMs: 5, renderedBlocks: 6, durableGraphBuilds: 2,
				durableGraphBuildMs: 4, durableGenerationNoopReuses: 3, durableCountReusedBlocks: 7,
				durableCountRenderedBlocks: 2, rowCacheHits: 11, rowCacheMisses: 5, rowCacheEvictions: 1,
				widthCacheHits: 4, widthCacheMisses: 2,
			},
		});

		expect(snapshot.layers.find(layer => layer.id === "transcript")).toMatchObject({ entries: 5, hits: 10, misses: 2, latencyMs: 2 });
		expect(snapshot.layers.find(layer => layer.id === "render")).toMatchObject({ entries: 13, logicalBytes: 1_200, hits: 15, misses: 7, evictions: 1 });
		for (const id of ["context-projection", "usage-snapshot", "model-catalog", "dashboard-data", "session-read"] as const) {
			expect(snapshot.layers.find(layer => layer.id === id)).toMatchObject({ state: "unobserved", entries: null });
		}
	});

	test("keeps an untouched Usage cache unobserved", () => {
		const snapshot = projectWorkbenchCacheTelemetry({
			collectedAt: "2026-09-22T00:00:00.000Z",
			transcript: {
				durableBlockCount: 0, volatileBlockCount: 0, markdownEntries: 0, rowEntries: 0, rowLogicalBytes: 0,
				widthStates: 0, widthMetadataLogicalBytes: 0, exactCountBuilds: 0, exactCountBuildMs: 0,
				requestedRows: 0, requestedMaterializationMs: 0, renderedBlocks: 0, durableGraphBuilds: 0,
				durableGraphBuildMs: 0, durableGenerationNoopReuses: 0, durableCountReusedBlocks: 0,
				durableCountRenderedBlocks: 0, rowCacheHits: 0, rowCacheMisses: 0, rowCacheEvictions: 0,
				widthCacheHits: 0, widthCacheMisses: 0,
			},
			usage: { entries: 0, hits: 0, misses: 0, evictions: 0, lastAccessedAt: null },
		});
		expect(snapshot.layers.find(layer => layer.id === "usage-snapshot")).toMatchObject({ state: "unobserved", entries: null });
	});

	test("keeps every aggregate unknown when no cache owner is observed", () => {
		const snapshot = composeCacheTelemetry({ collectedAt: "2026-09-22T00:00:00.000Z", observations: [] });
		expect(snapshot.totals).toEqual({ entries: null, logicalBytes: null, hits: null, misses: null, evictions: null });
	});

	test("rejects duplicate owners instead of silently replacing cache facts", () => {
		const observation = { id: "render" as const, entries: 1, logicalBytes: null, hits: 0, misses: 0, evictions: 0, latencyMs: null, lastAccessedAt: null };
		expect(() => composeCacheTelemetry({ collectedAt: "2026-09-22T00:00:00.000Z", observations: [observation, observation] }))
			.toThrow("Duplicate cache layer observation: render");
	});

	test("merges Workbench and Usage owners into the fixed seven-layer projection", () => {
		const snapshot = projectWorkbenchCacheTelemetry({
			collectedAt: "2026-09-22T00:00:00.000Z",
			transcript: {
				durableBlockCount: 1, volatileBlockCount: 0, markdownEntries: 0, rowEntries: 1, rowLogicalBytes: 20,
				widthStates: 1, widthMetadataLogicalBytes: 10, exactCountBuilds: 0, exactCountBuildMs: 0,
				requestedRows: 1, requestedMaterializationMs: 1, renderedBlocks: 1, durableGraphBuilds: 1,
				durableGraphBuildMs: 1, durableGenerationNoopReuses: 0, durableCountReusedBlocks: 0,
				durableCountRenderedBlocks: 1, rowCacheHits: 0, rowCacheMisses: 1, rowCacheEvictions: 0,
				widthCacheHits: 0, widthCacheMisses: 1,
			},
			observations: ["context-projection", "model-catalog", "dashboard-data", "session-read"].map((id, index) => ({
				id: id as "context-projection" | "model-catalog" | "dashboard-data" | "session-read",
				entries: index + 1, logicalBytes: null, hits: index, misses: 1, evictions: 0, latencyMs: null, lastAccessedAt: null,
			})),
			usage: { entries: 5, hits: 3, misses: 2, evictions: 1, lastAccessedAt: "2026-09-22T00:00:00.000Z" },
		});

		expect(snapshot.layers).toHaveLength(7);
		expect(snapshot.layers.every(layer => layer.state === "ready")).toBe(true);
		expect(snapshot.layers.find(layer => layer.id === "usage-snapshot")).toMatchObject({ entries: 5, hits: 3, misses: 2, evictions: 1 });
	});
});
