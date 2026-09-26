import { describe, expect, test }                                   from "bun:test";
import { readFile }                                                 from "node:fs/promises";
import { stat }                                                     from "node:fs/promises";
import { layer, loadSourceGraph, reachableSources, relativeCycles } from "./architecture/import-graph";

describe("source architecture", () => {
	test("resolves @ source aliases before evaluating architecture boundaries", async () => {
		const graph = await loadSourceGraph();
		expect(graph.get("cli.ts")?.imports).toContain("app.ts");
		expect(graph.get("cli.ts")?.imports).toContain("core/domain/execution/native-session.ts");
	});

	test("keeps flattened layers grouped by their canonical responsibility", async () => {
		const graph = await loadSourceGraph();
		const groups: ReadonlyArray<readonly [string, ReadonlySet<string>]> = [
			["core/domain/", new Set(["development", "execution", "observability", "review", "work"])],
			["core/application/", new Set(["development", "orchestration", "review", "routing", "session", "work"])],
			["core/ports/", new Set(["execution", "persistence", "integration", "observability"])],
			["adapters/outbound/", new Set(["authentication", "development", "execution", "git", "observability", "persistence", "review", "workspace"])],
			["adapters/inbound/tui/", new Set(["foundation", "features", "commands", "shell", "legacy"])],
		];
		for (const path of graph.keys()) {
			for (const [prefix, allowed] of groups) {
				if (!path.startsWith(prefix)) continue;
				const group = path.slice(prefix.length).split("/")[0]!;
				if (prefix === "core/ports/" && group === "index.ts") continue;
				expect(group.endsWith(".ts"), `flat source: ${path}`).toBe(false);
				expect(allowed.has(group), `unknown responsibility group: ${path}`).toBe(true);
			}
		}
	});

	test("keeps the core port index as a definition-free compatibility barrel", async () => {
		const source = await readFile("src/core/ports/index.ts", "utf8");
		expect(source).not.toMatch(/export\s+interface\s+/u);
		expect(source).not.toMatch(/export\s+type\s+\w+\s*=/u);
	});

	test("keeps product consumers on responsibility-specific core ports", async () => {
		const graph = await loadSourceGraph();
		for (const source of graph.values()) {
			if (source.path === "core/ports/index.ts") continue;
			expect(source.imports, source.path).not.toContain("core/ports/index.ts");
		}
	});

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

	test("keeps TUI foundation independent from higher-level TUI groups", async () => {
		const graph = await loadSourceGraph();
		for (const source of graph.values()) {
			if (!source.path.startsWith("adapters/inbound/tui/foundation/")) continue;
			for (const dependency of source.imports.filter(path => graph.has(path))) {
				expect(dependency, `${source.path} -> ${dependency}`).not.toMatch(
					/^adapters\/inbound\/tui\/(?:features|commands|shell|legacy)\//u,
				);
			}
		}
	});

	test("keeps TUI feature implementations independent from sibling features", async () => {
		const graph = await loadSourceGraph();
		const prefix = "adapters/inbound/tui/features/";
		for (const source of graph.values()) {
			if (!source.path.startsWith(prefix) || source.path === `${prefix}feature-registry.ts`) continue;
			const feature = featureImplementation(source.path, prefix);
			if (!feature) continue;
			for (const dependency of source.imports.filter(path => graph.has(path))) {
				const importedFeature = featureImplementation(dependency, prefix);
				if (!importedFeature) continue;
				expect(importedFeature, `${source.path} -> ${dependency}`).toBe(feature);
			}
		}
	});

	test("keeps each TUI feature grouped by MVC-like adapter responsibility", async () => {
		const graph            = await loadSourceGraph()                                       ;
		const prefix           = "adapters/inbound/tui/features/"                              ;
		const rootFiles        = new Set(["feature-registry.ts", "feature.types.ts"])          ;
		const responsibilities = new Set(["controller", "registration", "view-model", "view"]) ;
		const allowedDependencies = new Map([
			["registration", new Set(["registration"])],
			["view-model", new Set(["view-model"])],
			["view", new Set(["view-model", "view"])],
			["controller", new Set(["controller", "view-model", "view"])],
		]);
		const viewReadApplicationModules = new Set([
			"core/application/orchestration/workbench-feature-reads.ts",
			"core/application/session/session-monitor.ts",
			"core/application/work/conversation-recap.ts",
			"core/application/work/t-note-service.ts",
		]);
		for (const source of graph.values()) {
			if (!source.path.startsWith(prefix)) continue;
			const relative = source.path.slice(prefix.length);
			if (!relative.includes("/")) {
				expect(rootFiles.has(relative), `unexpected feature root file: ${source.path}`).toBe(true);
				continue;
			}
			const [, responsibility, file, ...nested] = relative.split("/");
			expect(responsibilities.has(responsibility ?? ""), `unknown feature responsibility: ${source.path}`).toBe(true);
			expect(file, `missing feature implementation file: ${source.path}`).toBeDefined();
			expect(nested, `nested feature responsibility: ${source.path}`).toHaveLength(0);
			expect(responsibility, `forbidden TUI layer: ${source.path}`).not.toMatch(/^(?:model|service|repository)$/u);
			if (/\.(?:feature|units)\.ts$/u.test(file ?? "")) {
				expect(responsibility, `registration file outside registration/: ${source.path}`).toBe("registration");
			}
			if (responsibility === "view-model") {
				const text = await readFile(`src/${source.path}`, "utf8");
				expect(source.imports, source.path).not.toContain("@earendil-works/pi-tui");
				expect(source.imports, source.path).not.toContain("chalk");
				expect(source.imports.some(path => path.startsWith("adapters/inbound/tui/foundation/")), source.path).toBe(false);
				expect(text, source.path).not.toMatch(/\\(?:x1[bB]|u001[bB]|033)/u);
				expect(text, source.path).not.toMatch(/\bComponent\b/u);
			}
			if (responsibility === "view") {
				for (const dependency of source.imports.filter(path => path.startsWith("core/application/"))) {
					expect(viewReadApplicationModules.has(dependency), `View imported Core writer: ${source.path} -> ${dependency}`).toBe(true);
				}
			}
			for (const dependency of source.imports.filter(path => path.startsWith(prefix))) {
				const imported = dependency.slice(prefix.length).split("/");
				if (imported.length < 3 || imported[0] !== relative.split("/")[0]) continue;
				expect(
					allowedDependencies.get(responsibility ?? "")?.has(imported[1] ?? ""),
					`inverted feature responsibility: ${source.path} -> ${dependency}`,
				).toBe(true);
			}
		}
	});

	test("keeps Chat, Plan, and Tracer views on their feature read projections", async () => {
		const graph = await loadSourceGraph();
		const contract = await readFile("src/core/application/orchestration/workbench-feature-reads.ts", "utf8");
		expect(contract).not.toContain("Pick<WorkbenchSnapshot");
		for (const path of [
			"adapters/inbound/tui/features/plan/view/www-plan-view.ts",
			"adapters/inbound/tui/features/trace/view/workbench-tracer-view.ts",
		]) {
			const source = graph.get(path);
			expect(source, path).toBeDefined();
			expect(source?.imports, path).toContain("core/application/orchestration/workbench-feature-reads.ts");
			expect(source?.imports, path).not.toContain("core/domain/work/workbench.ts");
		}
		for (const source of graph.values()) {
			if (!source.path.startsWith("adapters/inbound/tui/features/chat/")) continue;
			const text = await readFile(`src/${source.path}`, "utf8");
			expect(text, source.path).not.toContain("WorkbenchSnapshot");
		}
	});

	test("keeps concrete executor adapters independent", async () => {
		const graph = await loadSourceGraph();
		for (const source of graph.values()) {
			const family = executionAdapterFamily(source.path);
			if (!family) continue;
			for (const dependency of source.imports) {
				if (!dependency.startsWith("adapters/outbound/execution/")) continue;
				expect(executionAdapterFamily(dependency), `${source.path} -> ${dependency}`).toBe(family);
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

	test("keeps the native workbench shell independent from the legacy session runtime", async () => {
		const graph = await loadSourceGraph();
		const entry = [...graph.keys()].find(path => path.endsWith("workbench-shell.ts"));
		expect(entry).toBeDefined();
		for (const source of reachableSources(graph, entry!)) {
			expect(source.path).not.toMatch(/legacy|session-runtime/u);
		}
	});
});

function featureImplementation(path: string, prefix: string): string | null {
	if (!path.startsWith(prefix)) return null;
	const relative = path.slice(prefix.length);
	if (!relative.includes("/")) return null;
	return relative.split("/")[0] ?? null;
}

async function exists(path: string): Promise<boolean> {
	try { await stat(path); return true; }
	catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
		throw error;
	}
}

function executionAdapterFamily(path: string): "codex" | "pi" | null {
	if (/^adapters\/outbound\/execution\/codex-app-server(?:-[^/]+)?\.ts$/u.test(path)) return "codex";
	if (path === "adapters/outbound/execution/pi-harness.ts") return "pi";
	return null;
}
