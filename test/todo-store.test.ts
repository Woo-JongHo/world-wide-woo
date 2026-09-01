import { afterEach, describe, expect, test } from "bun:test";
import { access, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FileTodoStore, importLegacyTodo } from "../src/infrastructure/todo-store.js";
import { renderTodoMarkdown, type TodoDocument } from "../src/domain/todos.js";

const directories: string[] = [];

async function fixture(): Promise<{ directory: string; path: string; store: FileTodoStore }> {
	const directory = await mkdtemp(join(tmpdir(), "www-todo-store-"));
	directories.push(directory);
	const path = join(directory, "Todo.md");
	return { directory, path, store: new FileTodoStore(path) };
}

function todo(revision: number, title = "Todo"): TodoDocument {
	return { version: 1, revision, ownerSessionId: "session_1", storyId: null, title, items: [{ id: "item_1", content: "Work", status: "pending", evidenceIds: [], details: [] }], updatedAt: "2026-08-31T07:55:00.000Z" };
}

afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });

describe("FileTodoStore", () => {
	test("writes only an absent document with null revision and enforces private modes", async () => {
		const { directory, path, store } = await fixture();
		expect(await store.read()).toBeNull();
		expect(await store.compareAndSwap(null, todo(0))).toBe("written");
		expect(await store.read()).toEqual(todo(0));
		expect((await lstat(directory)).mode & 0o777).toBe(0o700);
		expect((await lstat(path)).mode & 0o777).toBe(0o600);
		expect(await store.compareAndSwap(null, todo(1))).toBe("conflict");
	});

	test("atomically persists and reads a parent with one detail", async () => {
		const { store } = await fixture();
		const document: TodoDocument = {
			...todo(0),
			items: [{
				id: "item_1",
				content: "Work",
				status: "in_progress",
				evidenceIds: [],
				details: [{ id: "detail_1", content: "Confirm output", status: "completed", evidenceIds: ["evt_1"] }],
			}],
		};
		expect(await store.compareAndSwap(null, document)).toBe("written");
		expect(await store.read()).toEqual(document);
	});

	test("rejects stale revisions and malformed existing files without overwriting", async () => {
		const { path, store } = await fixture();
		await writeFile(path, "not todo markdown");
		expect(await store.compareAndSwap(0, todo(1))).toBe("conflict");
		expect(await readFile(path, "utf8")).toBe("not todo markdown");
		await writeFile(path, renderTodoMarkdown(todo(0)));
		expect(await store.compareAndSwap(0, todo(0, "Repeated revision"))).toBe("conflict");
		expect(await store.compareAndSwap(1, todo(2))).toBe("conflict");
		expect(await store.read()).toEqual(todo(0));
	});

	test("preserves CRLF and unknown Markdown while patching managed Todo lines", async () => {
		const { path, store } = await fixture();
		const source = renderTodoMarkdown(todo(0))
			.replace("\n\n", "\n\n> kept by Obsidian\n\n- [ ] personal note\n")
			.replaceAll("\n", "\r\n");
		await writeFile(path, source);
		expect(await store.compareAndSwap(0, todo(1, "Changed"))).toBe("written");
		const written = await readFile(path, "utf8");
		expect(written).toContain("> kept by Obsidian\r\n\r\n- [ ] personal note\r\n");
		expect(written.replaceAll("\r\n", "")).not.toContain("\n");
	});

	test("debounces external editor writes and suppresses its own atomic rename", async () => {
		const { path, store } = await fixture();
		const snapshots: TodoDocument[] = [];
		const stop = store.watch((document) => { if (document) snapshots.push(document); }, { debounceMs: 20 });
		try {
			await store.compareAndSwap(null, todo(0));
			await Bun.sleep(80);
			expect(snapshots).toEqual([]);
			await writeFile(path, renderTodoMarkdown(todo(1, "External one")));
			await writeFile(path, renderTodoMarkdown(todo(1, "External final")));
			await Bun.sleep(80);
			expect(snapshots.map(snapshot => snapshot.title)).toEqual(["External final"]);
		} finally {
			stop();
		}
	});

	test("delivers the same external source only once across separate filesystem events", async () => {
		const { path, store } = await fixture();
		const sources: Array<string | null> = [];
		const source = renderTodoMarkdown(todo(1, "External final"));
		const stop = store.watch((_document, observedSource) => { sources.push(observedSource); }, { debounceMs: 20 });
		try {
			await writeFile(path, source);
			await Bun.sleep(80);
			await writeFile(path, source);
			await Bun.sleep(80);
			expect(sources).toEqual([source]);
		} finally {
			stop();
		}
	});

	test("rejects symlink and non-regular targets", async () => {
		const { directory, path, store } = await fixture();
		const target = join(directory, "target.md");
		await writeFile(target, renderTodoMarkdown(todo(0)));
		await symlink(target, path);
		expect(await store.compareAndSwap(0, todo(1))).toBe("conflict");
		await rm(path);
		await mkdir(path);
		expect(await store.compareAndSwap(0, todo(1))).toBe("conflict");
	});

	test("allows exactly one concurrent writer for the same revision and cleans artifacts", async () => {
		const { directory, store } = await fixture();
		await store.compareAndSwap(null, todo(0));
		const [left, right] = await Promise.all([store.compareAndSwap(0, todo(1, "Left")), store.compareAndSwap(0, todo(1, "Right"))]);
		expect([left, right].sort()).toEqual(["conflict", "written"]);
		expect((await store.read())?.revision).toBe(1);
		const entries = await readdir(directory);
		expect(entries.filter((entry) => entry.includes(".lock") || entry.endsWith(".tmp"))).toEqual([]);
	});

	test("keeps the canonical vault free of local lock databases", async () => {
		const directory = await mkdtemp(join(tmpdir(), "www-canonical-todo-store-"));
		directories.push(directory);
		const vault = join(directory, "vault");
		const store = new FileTodoStore(join(vault, "Todo.md"));
		expect(await store.compareAndSwap(null, todo(0))).toBe("written");
		await expect(access(join(vault, "runtime", "todo-lock.sqlite"))).rejects.toThrow();
		await expect(access(join(directory, "runtime", "todo-lock.sqlite"))).resolves.toBeNull();
	});

	test("releases the interprocess lock when a writer process is killed", async () => {
		const { directory, store } = await fixture();
		await store.compareAndSwap(null, todo(0));
		const databasePath = join(directory, "runtime", "todo-lock.sqlite");
		const marker = join(directory, "locked");
		const child = Bun.spawn([
			"bun",
			"-e",
			`import { Database } from "bun:sqlite"; import { writeFile } from "node:fs/promises"; const db = new Database(process.env.DB_PATH); db.run("PRAGMA busy_timeout = 5000"); db.run("BEGIN IMMEDIATE"); await writeFile(process.env.MARKER, "locked"); await new Promise(() => {});`,
		], {
			env: { ...process.env, DB_PATH: databasePath, MARKER: marker },
			stdout: "ignore",
			stderr: "pipe",
		});
		for (let attempt = 0; attempt < 100; attempt += 1) {
			try {
				await access(marker);
				break;
			} catch {
				await Bun.sleep(10);
			}
		}
		await access(marker);
		child.kill();
		await child.exited;
		expect(await store.compareAndSwap(0, todo(1))).toBe("written");
	});

	test("copies a legacy Todo into an absent canonical path without deleting the source", async () => {
		const { directory } = await fixture();
		const legacy = join(directory, "Todo.md");
		const canonical = join(directory, "vault", "Todo.md");
		await writeFile(legacy, renderTodoMarkdown(todo(0)));
		expect(await importLegacyTodo(legacy, canonical)).toBe(canonical);
		expect(await readFile(legacy, "utf8")).toBe(renderTodoMarkdown(todo(0)));
		expect(await new FileTodoStore(canonical).read()).toEqual(todo(0));
	});

	test("does not overwrite an existing canonical Todo during explicit import", async () => {
		const { directory } = await fixture();
		const legacy = join(directory, "Todo.md");
		const canonical = join(directory, "vault", "Todo.md");
		await writeFile(legacy, renderTodoMarkdown(todo(0)));
		const canonicalStore = new FileTodoStore(canonical);
		await canonicalStore.compareAndSwap(null, todo(0, "Canonical"));
		expect(await importLegacyTodo(legacy, canonical)).toBeNull();
		expect(await readFile(legacy, "utf8")).toBe(renderTodoMarkdown(todo(0)));
		expect((await canonicalStore.read())?.title).toBe("Canonical");
	});
});
