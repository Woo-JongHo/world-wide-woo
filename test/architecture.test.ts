import { describe, expect, test } from "bun:test";
import { readFile, stat } from "node:fs/promises";
import { layer, loadSourceGraph, reachableSources, relativeCycles } from "./architecture/import-graph";

describe("source architecture", () => {
	test("keeps the core independent from adapters", async () => {
		const graph = await loadSourceGraph();
		for (const source of graph.values()) {
			if (layer(source.path) !== "core") continue;
			for (const dependency of source.imports.filter(path => graph.has(path)))
				expect(layer(dependency), `${source.path} -> ${dependency}`).not.toBe("adapters");
		}
	});

	test("keeps core domain independent from orchestration and effects", async () => {
		const graph = await loadSourceGraph();
		for (const source of graph.values()) {
			if (!source.path.startsWith("core/domain/")) continue;
			for (const dependency of source.imports.filter(path => graph.has(path))) {
				expect(dependency, `${source.path} -> ${dependency}`).not.toMatch(/^core\/(?:application|ports|runtime|commit)\//u);
			}
		}
	});

	test("does not recreate the retired top-level source layers", async () => {
		for (const path of ["src/domain", "src/application", "src/infrastructure", "src/presentation"])
			expect(await exists(path), path).toBe(false);
	});

	test("keeps inbound adapters from importing outbound adapters", async () => {
		const graph = await loadSourceGraph();
		for (const source of graph.values()) {
			if (!source.path.startsWith("adapters/inbound/")) continue;
			for (const dependency of source.imports.filter(path => graph.has(path))) {
				expect(dependency, `${source.path} -> ${dependency}`).not.toMatch(/^adapters\/outbound\//u);
			}
		}
	});

	test("keeps process execution behind application-owned ports", async () => {
		const graph = await loadSourceGraph();
		for (const source of graph.values()) {
			if (!source.path.startsWith("adapters/inbound/")) continue;
			expect(source.imports, source.path).not.toContain("node:child_process");
		}
	});

	test("keeps concrete executor adapters independent", async () => {
		const graph = await loadSourceGraph();
		for (const source of graph.values()) {
			if (!source.path.startsWith("adapters/outbound/executors/") || source.path.endsWith("/factory.ts")) continue;
			for (const dependency of source.imports) {
				if (!dependency.startsWith("adapters/outbound/executors/")) continue;
				expect(dependency, `${source.path} -> ${dependency}`).toBe(source.path);
			}
		}
	});

	test("has no relative source dependency cycles", async () => {
		expect(relativeCycles(await loadSourceGraph())).toEqual([]);
	});

	test("keeps the Work capability entry independent from TUI and Runtime implementations", async () => {
		const graph = await loadSourceGraph();
		const entry = "core/domain/work/index.ts";
		expect(graph.has(entry)).toBe(true);
		expect(graph.has("core/domain/work-steps.ts")).toBe(false);
		for (const source of graph.values()) {
			expect(source.imports, source.path).not.toContain("core/domain/work-steps.ts");
		}
		for (const source of reachableSources(graph, entry)) {
			expect(source.path, `${entry} -> ${source.path}`).not.toMatch(
				/^adapters\//u,
			);
		}
	});

	test("keeps the composition root small", async () => {
		const lines = (await readFile("src/app.ts", "utf8")).split("\n");
		expect(lines.length).toBeLessThanOrEqual(60);
	});

	test("keeps the native workbench shell independent from the legacy session runtime", async () => {
		const graph = await loadSourceGraph();
		const entry = [...graph.keys()].find(path => path.endsWith("workbench-shell.ts"));
		expect(entry).toBeDefined();
		for (const source of reachableSources(graph, entry!)) {
			expect(source.path).not.toMatch(/legacy|session-runtime/u);
		}
	});
});

async function exists(path: string): Promise<boolean> {
	try { await stat(path); return true; }
	catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
		throw error;
	}
}
