import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

async function sources(directory: string): Promise<Array<{ path: string; text: string }>> {
	const files: Array<{ path: string; text: string }> = [];
	for await (const path of new Bun.Glob("**/*.ts").scan({ cwd: directory })) {
		files.push({ path, text: await readFile(`${directory}/${path}`, "utf8") });
	}
	return files;
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
});
