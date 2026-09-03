import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { layer, loadSourceGraph, reachableSources, relativeCycles } from "./architecture/import-graph";

describe("source architecture", () => {
	test("keeps domain pure", async () => {
		const graph = await loadSourceGraph();
		for (const source of graph.values()) {
			if (layer(source.path) !== "domain") continue;
			for (const dependency of source.imports) {
				if (graph.has(dependency)) expect(layer(dependency), `${source.path} -> ${dependency}`).toBe("domain");
				else expect(dependency, `${source.path} -> ${dependency}`).not.toMatch(/^(?:node:|@earendil|@gajae)/u);
			}
		}
	});

	test("prevents application from importing infrastructure or presentation", async () => {
		const graph = await loadSourceGraph();
		for (const source of graph.values()) {
			if (layer(source.path) !== "application") continue;
			for (const dependency of source.imports.filter(path => graph.has(path))) {
				expect(["infrastructure", "presentation"], `${source.path} -> ${dependency}`).not.toContain(layer(dependency));
			}
		}
	});

	test("keeps presentation behind application and domain public contracts", async () => {
		const graph = await loadSourceGraph();
		for (const source of graph.values()) {
			if (layer(source.path) !== "presentation") continue;
			for (const dependency of source.imports.filter(path => graph.has(path))) {
				expect(layer(dependency), `${source.path} -> ${dependency}`).not.toBe("infrastructure");
			}
		}
	});

	test("has no relative source dependency cycles", async () => {
		expect(relativeCycles(await loadSourceGraph())).toEqual([]);
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
