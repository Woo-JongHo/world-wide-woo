import { expect, test } from "bun:test";

test("loads the native adapter synchronously only across the supports/highlight seam", async () => {
	const checkUrl = new URL("./fixtures/syntax-lazy-seam-check.ts", import.meta.url);
	const child = Bun.spawn([process.execPath, checkUrl.pathname], { stdout: "pipe", stderr: "pipe" });
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	expect(exitCode, stderr).toBe(0);
	expect(JSON.parse(stdout)).toEqual({
		moduleLoads: 1,
		supportsCalls: 4,
		highlightCalls: 3,
		highlightLanguages: ["typescript", null, "typescript"],
	});
});
