import { chmod, lstat, mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname, basename, join } from "node:path";
import { randomUUID } from "node:crypto";
import { Database } from "bun:sqlite";
import { parseTodoMarkdown, renderTodoMarkdown, type TodoDocument } from "../domain/todos.js";

const queues = new Map<string, Promise<unknown>>();

/** Filesystem-backed store for one project-local `.www/Todo.md` document. */
export class FileTodoStore {
	public constructor(private readonly path: string) {}

	public async read(): Promise<TodoDocument | null> {
		const content = await this.readExisting();
		return content === null ? null : parseTodoMarkdown(content);
	}

	public async compareAndSwap(expectedRevision: number | null, next: TodoDocument): Promise<"written" | "conflict"> {
		return serialize(this.path, async () => {
			const markdown = renderTodoMarkdown(next);
			if (next.revision !== (expectedRevision ?? -1) + 1) return "conflict";
			const directory = dirname(this.path);
			await mkdir(directory, { recursive: true, mode: 0o700 });
			await chmod(directory, 0o700);
			try {
				return await this.withDatabaseLock(directory, async () => {
					const current = await this.readExisting();
					if (current === null ? expectedRevision !== null : !this.hasExpectedRevision(current, expectedRevision)) return "conflict";
					await this.writeAtomically(directory, markdown);
					return "written";
				});
			} catch (error) {
				if (isMalformedTodo(error) || isUnsafeFile(error)) return "conflict";
				throw error;
			}
		});
	}

	private async readExisting(): Promise<string | null> {
		let info;
		try { info = await lstat(this.path); } catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
			throw error;
		}
		if (!info.isFile() || info.isSymbolicLink()) throw unsafeFileError(this.path);
		return readFile(this.path, "utf8");
	}

	private async withDatabaseLock<T>(directory: string, operation: () => Promise<T>): Promise<T> {
		const runtimeDirectory = join(directory, "runtime");
		await mkdir(runtimeDirectory, { recursive: true, mode: 0o700 });
		const runtimeInfo = await lstat(runtimeDirectory);
		if (!runtimeInfo.isDirectory() || runtimeInfo.isSymbolicLink()) throw unsafeFileError(runtimeDirectory);
		await chmod(runtimeDirectory, 0o700);
		const databasePath = join(runtimeDirectory, "todo-lock.sqlite");
		try {
			const info = await lstat(databasePath);
			if (!info.isFile() || info.isSymbolicLink()) throw unsafeFileError(databasePath);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
		const database = new Database(databasePath, { create: true, strict: true });
		try {
			await chmod(databasePath, 0o600);
			database.run("PRAGMA busy_timeout = 5000");
			database.run("CREATE TABLE IF NOT EXISTS todo_mutex (id INTEGER PRIMARY KEY, touched_at INTEGER NOT NULL)");
			database.run("BEGIN IMMEDIATE");
			database.run(
				"INSERT INTO todo_mutex (id, touched_at) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET touched_at = excluded.touched_at",
				[Date.now()],
			);
			try {
				const result = await operation();
				database.run("COMMIT");
				return result;
			} catch (error) {
				database.run("ROLLBACK");
				throw error;
			}
		} finally {
			database.close();
		}
	}

	private async writeAtomically(directory: string, markdown: string): Promise<void> {
		const temporaryPath = join(directory, `.${basename(this.path)}.${randomUUID()}.tmp`);
		try {
			const handle = await open(temporaryPath, "wx", 0o600);
			try {
				await handle.writeFile(markdown, "utf8");
				await handle.sync();
			} finally { await handle.close(); }
			await chmod(temporaryPath, 0o600);
			await rename(temporaryPath, this.path);
			await chmod(this.path, 0o600);
		} finally {
			await rm(temporaryPath, { force: true });
		}
	}

	private hasExpectedRevision(markdown: string, expectedRevision: number | null): boolean {
		try { return parseTodoMarkdown(markdown).revision === expectedRevision; }
		catch { return false; }
	}
}

function unsafeFileError(path: string): Error { return new Error(`Unsafe todo store file: ${path}`); }
function isUnsafeFile(error: unknown): boolean { return error instanceof Error && error.message.startsWith("Unsafe todo store file:"); }
function isMalformedTodo(error: unknown): boolean { return error instanceof Error && error.message.startsWith("Invalid todo document:"); }

function serialize<T>(path: string, operation: () => Promise<T>): Promise<T> {
	const previous = queues.get(path) ?? Promise.resolve();
	const current = previous.catch(() => undefined).then(operation);
	queues.set(path, current);
	void current.then(
		() => { if (queues.get(path) === current) queues.delete(path); },
		() => { if (queues.get(path) === current) queues.delete(path); },
	);
	return current;
}
