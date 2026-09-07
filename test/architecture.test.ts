import { describe, expect, test } from "bun:test";
import { layer, loadSourceGraph, reachableSources, relativeCycles } from "./architecture/import-graph";

const OLD_ROOTS = ["domain", "application", "infrastructure", "presentation"];

describe("capability source architecture", () => {
	test("uses tui, system, and workflows as the only source directory axes", async () => {
		const graph = await loadSourceGraph();
		for (const source of graph.values()) expect(OLD_ROOTS, source.path).not.toContain(layer(source.path));
		for (const expected of ["tui", "system", "workflows"]) {
			expect([...graph.keys()].some(path => path.startsWith(`${expected}/`)), expected).toBe(true);
		}
	});

	test("keeps System contracts pure and adapter-free", async () => {
		const graph = await loadSourceGraph();
		for (const source of graph.values()) {
			if (!source.path.startsWith("system/contracts/")) continue;
			const typeOnlyImports = new Set([...source.text.matchAll(/import\s+type[\s\S]*?from\s+["']([^"']+)["']/gu)].map(match => match[1]));
			for (const dependency of source.imports) {
				if (graph.has(dependency)) expect(dependency, `${source.path} -> ${dependency}`).toMatch(/^system\/contracts\//u);
				else if (dependency.startsWith("@")) {
					expect(source.path, `${source.path} -> ${dependency}`).toMatch(/^system\/contracts\/ports\//u);
					expect(typeOnlyImports, `${source.path} -> ${dependency} must be type-only`).toContain(dependency);
				} else expect(dependency, `${source.path} -> ${dependency}`).not.toMatch(/^(?:node:|bun:)/u);
			}
		}
	});

	test("keeps System services behind contracts and independent from adapters, TUI, and Workflows", async () => {
		const graph = await loadSourceGraph();
		for (const source of graph.values()) {
			if (!source.path.startsWith("system/services/")) continue;
			for (const dependency of source.imports.filter(path => graph.has(path))) {
				expect(dependency, `${source.path} -> ${dependency}`).not.toMatch(/^(?:system\/adapters|tui|workflows)\//u);
			}
		}
	});

	test("prevents all System code from importing TUI or Workflows", async () => {
		const graph = await loadSourceGraph();
		for (const source of graph.values()) {
			if (layer(source.path) !== "system") continue;
			for (const dependency of source.imports.filter(path => graph.has(path))) {
				expect(dependency, `${source.path} -> ${dependency}`).not.toMatch(/^(?:tui|workflows)\//u);
			}
		}
	});

	test("keeps the TUI development Workflow on the System public contract", async () => {
		const graph = await loadSourceGraph();
		const entry = "workflows/tui-development/index.ts";
		expect(graph.has(entry)).toBe(true);
		for (const source of graph.values()) {
			if (layer(source.path) !== "workflows") continue;
			for (const dependency of source.imports.filter(path => graph.has(path))) {
				if (layer(dependency) === "system") expect(dependency, `${source.path} -> ${dependency}`).toBe("system/public.ts");
				expect(dependency, `${source.path} -> ${dependency}`).not.toMatch(/^tui\//u);
			}
		}
		for (const source of reachableSources(graph, entry)) expect(source.path, `${entry} -> ${source.path}`).not.toMatch(/\/(?:adapters|executors|stores?)\//u);
	});

	test("keeps modern TUI imports on public System and Workflow entries", async () => {
		const graph = await loadSourceGraph();
		for (const source of graph.values()) {
			if (layer(source.path) !== "tui" || source.path.startsWith("tui/legacy/")) continue;
			for (const dependency of source.imports.filter(path => graph.has(path))) {
				if (layer(dependency) === "system") expect(dependency, `${source.path} -> ${dependency}`).toBe("system/public.ts");
				if (layer(dependency) === "workflows") expect(dependency, `${source.path} -> ${dependency}`).toBe("workflows/tui-development/index.ts");
			}
			expect(source.imports, source.path).not.toContain("node:child_process");
		}
	});

	test("keeps concrete adapter selection outside services, Workflows, and modern TUI", async () => {
		const graph = await loadSourceGraph();
		for (const source of graph.values()) {
			if (source.path.startsWith("system/adapters/") || source.path === "app.ts") continue;
			for (const dependency of source.imports.filter(path => graph.has(path))) {
				expect(dependency, `${source.path} -> ${dependency}`).not.toMatch(/^system\/adapters\//u);
			}
		}
	});

	test("keeps concrete executor adapters independent", async () => {
		const graph = await loadSourceGraph();
		for (const source of graph.values()) {
			if (!source.path.startsWith("system/adapters/executors/") || source.path.endsWith("/factory.ts")) continue;
			for (const dependency of source.imports) {
				if (!dependency.startsWith("system/adapters/executors/")) continue;
				expect(dependency, `${source.path} -> ${dependency}`).toBe(source.path);
			}
		}
	});

	test("keeps Native Plan projection a pure System contract, not a generic Workflow engine", async () => {
		const graph = await loadSourceGraph();
		const entry = "system/contracts/work/index.ts";
		expect(graph.has(entry)).toBe(true);
		expect(graph.has("system/contracts/work-steps.ts")).toBe(false);
		for (const source of reachableSources(graph, entry)) expect(source.path, `${entry} -> ${source.path}`).toMatch(/^system\/contracts\//u);
	});

	test("isolates legacy code from modern source", async () => {
		const graph = await loadSourceGraph();
		for (const source of graph.values()) {
			if (source.path.startsWith("tui/legacy/") || source.path === "cli.ts" || source.path === "app.ts") continue;
			for (const dependency of source.imports.filter(path => graph.has(path))) {
				expect(dependency, `${source.path} -> ${dependency}`).not.toMatch(/^tui\/legacy\//u);
			}
		}
	});

	test("has no relative source dependency cycles", async () => {
		expect(relativeCycles(await loadSourceGraph())).toEqual([]);
	});
});
