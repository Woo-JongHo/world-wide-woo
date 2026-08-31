import { describe, expect, test } from "bun:test";
import { lstat, mkdtemp, mkdir, readFile, realpath, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileProjectWorkspace } from "../src/infrastructure/project-workspace";

async function temporaryDirectory(): Promise<string> {
	return mkdtemp(join(tmpdir(), "www-workspace-"));
}

async function initializeGit(directory: string): Promise<void> {
	const process = Bun.spawn(["git", "init", "--quiet", directory]);
	expect(await process.exited).toBe(0);
}

describe("FileProjectWorkspace", () => {
	test("uses the Git root when opened from a subdirectory", async () => {
		const root = await temporaryDirectory();
		const nested = join(root, "packages", "app");
		await initializeGit(root);
		await mkdir(nested, { recursive: true });

		const workspace = await FileProjectWorkspace.open(nested);

		const canonicalRoot = await realpath(root);
		expect(workspace.root).toBe(canonicalRoot);
		expect(workspace.directory).toBe(join(canonicalRoot, ".www"));
		expect(workspace.sessionsDirectory).toBe(join(canonicalRoot, ".www", "sessions"));
		expect(workspace.draftsDirectory).toBe(join(canonicalRoot, ".www", "drafts"));
	});

	test("uses the real cwd as root outside Git", async () => {
		const root = await temporaryDirectory();
		const workspace = await FileProjectWorkspace.open(root);

		expect(workspace.root).toBe(await realpath(root));
		expect(JSON.parse(await readFile(workspace.manifestPath, "utf8"))).toMatchObject({
			schemaVersion: 1,
			name: root.split("/").at(-1),
		});
	});

	test("is idempotent and preserves a valid manifest", async () => {
		const root = await temporaryDirectory();
		const first = await FileProjectWorkspace.open(root);
		const manifest = '{\n  "schemaVersion": 1,\n  "name": "renamed",\n  "createdAt": "2026-08-31T00:00:00.000Z"\n}\n';
		await writeFile(first.manifestPath, manifest);

		const second = await FileProjectWorkspace.open(root);

		expect(second).toEqual({ ...first, name: "renamed" });
		expect(await readFile(second.manifestPath, "utf8")).toBe(manifest);
	});

	test("fails closed for malformed or unsupported manifests", async () => {
		const malformedRoot = await temporaryDirectory();
		const malformed = await FileProjectWorkspace.open(malformedRoot);
		await writeFile(malformed.manifestPath, "{");
		await expect(FileProjectWorkspace.open(malformedRoot)).rejects.toThrow("not valid JSON");

		const schemaRoot = await temporaryDirectory();
		const unsupported = await FileProjectWorkspace.open(schemaRoot);
		await writeFile(unsupported.manifestPath, '{"schemaVersion":2,"name":"x","createdAt":"now"}');
		await expect(FileProjectWorkspace.open(schemaRoot)).rejects.toThrow("unsupported schema");
	});

	test("creates private local directories and only ignores local workspace state", async () => {
		const root = await temporaryDirectory();
		const workspace = await FileProjectWorkspace.open(root);

		expect(await readFile(join(workspace.directory, ".gitignore"), "utf8")).toBe(
			"sessions/\ndrafts/\ncache/\nruntime/\n",
		);
		for (const directory of [workspace.directory, workspace.sessionsDirectory, workspace.draftsDirectory, workspace.runtimeDirectory]) {
			expect((await stat(directory)).mode & 0o777).toBe(0o700);
		}
		for (const file of [workspace.manifestPath, join(workspace.directory, ".gitignore")]) {
			expect((await stat(file)).mode & 0o777).toBe(0o600);
		}
	});

	test("rejects workspace symlinks instead of escaping the project root", async () => {
		const root = await temporaryDirectory();
		const outside = await temporaryDirectory();
		await symlink(outside, join(root, ".www"));

		await expect(FileProjectWorkspace.open(root)).rejects.toThrow("must be a directory");
		expect((await lstat(join(root, ".www"))).isSymbolicLink()).toBe(true);
		await rm(outside, { recursive: true, force: true });
	});

	test("holds one session writer lease and releases it deterministically", async () => {
		const workspace = await FileProjectWorkspace.open(await temporaryDirectory());
		const first = await FileProjectWorkspace.acquireSessionLease(workspace, "session-one");
		await expect(FileProjectWorkspace.acquireSessionLease(workspace, "session-one")).rejects.toThrow("already active");
		await first.release();
		const second = await FileProjectWorkspace.acquireSessionLease(workspace, "session-one");
		await second.release();
	});

	test("fails closed for a lease owned by a dead process", async () => {
		const workspace = await FileProjectWorkspace.open(await temporaryDirectory());
		await writeFile(
			join(workspace.runtimeDirectory, "stale.lock"),
			`${JSON.stringify({ pid: 2_147_483_647, token: "stale", createdAt: new Date().toISOString() })}\n`,
		);
		await expect(FileProjectWorkspace.acquireSessionLease(workspace, "stale")).rejects.toThrow("lease is stale");
	});
});
