import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";

async function sources(directory: string): Promise<Array<{ path: string; text: string }>> {
	const files: Array<{ path: string; text: string }> = [];
	for await (const path of new Bun.Glob("**/*.ts").scan({ cwd: directory })) {
		files.push({ path, text: await readFile(`${directory}/${path}`, "utf8") });
	}
	return files;
}

function reachableRelativeSources(
	allSources: readonly { path: string; text: string }[],
	entry: string,
): Array<{ path: string; text: string }> {
	const byPath = new Map(allSources.map(source => [source.path, source]));
	const reachable = new Map<string, { path: string; text: string }>();
	const pending = [entry];
	while (pending.length > 0) {
		const path = pending.pop()!;
		if (reachable.has(path)) continue;
		const source = byPath.get(path);
		if (!source) throw new Error(`Missing presentation source: ${path}`);
		reachable.set(path, source);
		for (const match of source.text.matchAll(/(?:from\s+|import\()\s*["'](\.[^"']+)["']/gu)) {
			let dependency = normalize(join(dirname(path), match[1]!)).replace(/\\/gu, "/");
			dependency = dependency.replace(/\.(?:js|mjs)$/u, ".ts");
			if (!dependency.endsWith(".ts")) dependency += ".ts";
			if (byPath.has(dependency)) pending.push(dependency);
		}
	}
	return [...reachable.values()];
}

describe("source architecture", () => {
	test("keeps domain pure", async () => {
		for (const source of await sources("src/domain")) {
			expect(source.text, source.path).not.toMatch(/from ["'](?:node:|\.\.\/|@earendil|@gajae)/u);
		}
	});

	test("prevents application from depending on infrastructure or presentation", async () => {
		for (const source of await sources("src/application")) {
			expect(source.text, source.path).not.toMatch(/(?:infrastructure|presentation)/u);
		}
	});

	test("keeps presentation behind application-owned ports", async () => {
		for (const source of await sources("src/presentation")) {
			expect(source.text, source.path).not.toMatch(/\.\.\/\.\.\/infrastructure/u);
		}
	});

	test("keeps the composition root small", async () => {
		const lines = (await readFile("src/app.ts", "utf8")).split("\n");
		expect(lines.length).toBeLessThanOrEqual(60);
	});

	test("keeps the native workbench shell independent from the legacy session runtime", async () => {
		const presentation = await sources("src/presentation/tui");
		for (const source of reachableRelativeSources(presentation, "workbench-shell.ts")) {
			expect(source.text, source.path).not.toMatch(/session-runtime|runTuiShell/u);
		}
	});
});
