import { expect, test } from "bun:test";
import { mkdtemp, realpath, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadRequestCapabilityConfig } from "../src/adapters/outbound/workspace/request-capability-config";
import type { ExecutorPort } from "../src/core/ports/execution/executor-port";

test("Runtime config snapshots explicit files once, exposes their argument contract and defaults to no write grant", async () => {
	const root = await realpath(await mkdtemp(join(tmpdir(), "www-runtime-config-")));
	try {
		await writeFile(join(root, "file.txt"), "fixture");
		const path = join(root, "runtime.json");
		await writeFile(path, JSON.stringify({ schemaVersion: 1, files: ["file.txt"] }));
		const factory = await loadRequestCapabilityConfig(path);
		await writeFile(path, JSON.stringify({ schemaVersion: 1, files: ["other.txt"] }));
		const caps = factory({} as ExecutorPort, () => null);
		expect(caps.map(c => c.id)).toEqual(["files.read-pinned", "files.replace-approved"]);
		expect(caps[0]!.inputSchema).toMatchObject({
			properties: { path: { enum: [join(root, "file.txt")] } },
		});
		const intent = { requestId: "r", operationId: "read", stage: "GROUND" as const, capability: caps[0]!.id, expectedRevision: 1, arguments: { path: join(root, "file.txt") } };
		expect((await caps[0]!.execute(intent, new AbortController().signal)).source.text).toBe("fixture");
		expect(await caps[1]!.authorize(intent)).toBe(false);
		expect(await caps[0]!.authorize({ ...intent, arguments: { path: join(root, "other.txt") } })).toBe(false);
		for (const bad of [{ schemaVersion: 2 }, { schemaVersion: 1, shell: true }, { schemaVersion: 1, files: [null] }, { schemaVersion: 1, linear: { server: "x" } }]) {
			await writeFile(path, JSON.stringify(bad));
			await expect(loadRequestCapabilityConfig(path)).rejects.toThrow();
		}
	} finally { await rm(root, { recursive: true, force: true }); }
});
