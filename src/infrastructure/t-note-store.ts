import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, open, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createTNoteDraft, validateTNoteDraft, type TNoteDraft, type TNoteDraftInput } from "../domain/t-notes.js";
import type { TNoteDraftStore } from "../application/t-note-service.js";

const STORE_FILE = "t-notes.jsonl";
const queues = new Map<string, Promise<unknown>>();

/** Private append-only store. It never writes the active transcript or a tracked vault file. */
export class FileTNoteStore implements TNoteDraftStore {
	public constructor(private readonly directory: string) {}

	public append(input: TNoteDraftInput): Promise<TNoteDraft> {
		return serialize(this.path(), async () => {
			const all = await this.readAllUnchecked();
			const draft = createTNoteDraft(input, all.length + 1, digest);
			await this.appendLine(JSON.stringify(draft));
			return draft;
		});
	}

	public readAll(projectId: string): Promise<readonly TNoteDraft[]> {
		return serialize(this.path(), async () => {
			if (typeof projectId !== "string" || projectId.length === 0) throw new Error("Invalid T-note project id");
			return (await this.readAllUnchecked()).filter((draft) => draft.packet.projectId === projectId);
		});
	}

	private path(): string { return join(this.directory, STORE_FILE); }

	private async readAllUnchecked(): Promise<TNoteDraft[]> {
		const path = this.path();
		let content: string;
		try {
			const info = await lstat(path);
			if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Unsafe T-note store file: ${path}`);
			content = await readFile(path, "utf8");
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
			throw error;
		}
		const endedCleanly = content.endsWith("\n");
		const lines = content.split("\n");
		const tail = endedCleanly ? undefined : lines.pop();
		if (endedCleanly) lines.pop();
		const drafts = lines.map((line, index) => this.parseDraft(line, index + 1));
		if (tail === undefined || tail === "") return drafts;
		try {
			drafts.push(this.parseDraft(tail, lines.length + 1));
			await this.terminateRecoveredLine(path);
		} catch {
			// A final, unterminated fragment can only be a crash residue. Middle
			// corruption was parsed above and remains a hard failure.
			await this.truncateCrashResidue(path, lines);
		}
		return drafts;
	}

	private parseDraft(line: string, lineNumber: number): TNoteDraft {
		try {
			const draft = validateTNoteDraft(JSON.parse(line) as TNoteDraft, digest);
			if (draft.sequence !== lineNumber) throw new Error("sequence is not monotonic");
			return draft;
		} catch (error) {
			throw new Error(`Invalid T-note draft at line ${lineNumber}: ${(error as Error).message}`);
		}
	}

	private async terminateRecoveredLine(path: string): Promise<void> {
		const handle = await open(path, "a");
		try {
			await handle.write("\n");
			await handle.sync();
		} finally { await handle.close(); }
	}

	private async truncateCrashResidue(path: string, validLines: readonly string[]): Promise<void> {
		const retained = validLines.length === 0 ? "" : `${validLines.join("\n")}\n`;
		const handle = await open(path, "r+");
		try {
			await handle.truncate(Buffer.byteLength(retained, "utf8"));
			await handle.sync();
		} finally { await handle.close(); }
	}

	private async appendLine(line: string): Promise<void> {
		await mkdir(this.directory, { recursive: true, mode: 0o700 });
		const info = await lstat(this.directory);
		if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`Unsafe T-note store directory: ${this.directory}`);
		await chmod(this.directory, 0o700);
		const path = this.path();
		let existing = false;
		try {
			const file = await lstat(path);
			if (!file.isFile() || file.isSymbolicLink()) throw new Error(`Unsafe T-note store file: ${path}`);
			existing = true;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
		const handle = await open(path, "a", 0o600);
		try {
			if (!existing) await chmod(path, 0o600);
			await handle.write(`${line}\n`);
			await handle.sync();
		} finally { await handle.close(); }
	}
}

function serialize<T>(path: string, operation: () => Promise<T>): Promise<T> {
	const previous = queues.get(path) ?? Promise.resolve();
	const current = previous.catch(() => undefined).then(operation);
	queues.set(path, current);
	void current.finally(() => { if (queues.get(path) === current) queues.delete(path); }).catch(() => undefined);
	return current;
}

function digest(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }
