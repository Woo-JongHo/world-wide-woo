import { readFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";

export interface SourceNode { readonly path: string; readonly text: string; readonly imports: readonly string[] }

export async function loadSourceGraph(root = "src"): Promise<ReadonlyMap<string, SourceNode>> {
	const raw: Array<{ path: string; text: string }> = [];
	for await (const path of new Bun.Glob("**/*.ts").scan({ cwd: root })) raw.push({ path, text: await readFile(`${root}/${path}`, "utf8") });
	const paths = new Set(raw.map(source => source.path));
	return new Map(raw.map(source => {
		const imports = [...source.text.matchAll(/(?:from\s+|import\()\s*["']([^"']+)["']/gu)].map(match => resolveImport(source.path, match[1]!, paths));
		return [source.path, Object.freeze({ ...source, imports: Object.freeze(imports) })];
	}));
}

export function reachableSources(graph: ReadonlyMap<string, SourceNode>, entry: string): SourceNode[] {
	const reachable = new Map<string, SourceNode>();
	const pending = [entry];
	while (pending.length) {
		const path = pending.pop()!;
		if (reachable.has(path)) continue;
		const source = graph.get(path);
		if (!source) throw new Error(`Missing source: ${path}`);
		reachable.set(path, source);
		for (const dependency of source.imports) if (graph.has(dependency)) pending.push(dependency);
	}
	return [...reachable.values()];
}

export function layer(path: string): string { return path.split("/")[0] ?? path; }

export function relativeCycles(graph: ReadonlyMap<string, SourceNode>): string[][] {
	const cycles: string[][] = [];
	const visited = new Set<string>();
	const active = new Set<string>();
	const stack: string[] = [];
	const visit = (path: string): void => {
		if (active.has(path)) { const start = stack.indexOf(path); cycles.push([...stack.slice(start), path]); return; }
		if (visited.has(path)) return;
		visited.add(path); active.add(path); stack.push(path);
		for (const dependency of graph.get(path)?.imports ?? []) if (graph.has(dependency)) visit(dependency);
		stack.pop(); active.delete(path);
	};
	for (const path of graph.keys()) visit(path);
	return cycles;
}

function resolveImport(from: string, specifier: string, paths: ReadonlySet<string>): string {
	if (!specifier.startsWith(".")) return specifier;
	let path = normalize(join(dirname(from), specifier)).replace(/\\/gu, "/").replace(/\.(?:js|mjs)$/u, ".ts");
	for (const candidate of [path, `${path}.ts`, `${path}/index.ts`]) if (paths.has(candidate)) return candidate;
	return path;
}
