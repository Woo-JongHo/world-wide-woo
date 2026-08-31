import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { ComposerDraftController } from "../application/ports";

const SCHEMA_VERSION = 1;
const MAX_TEXT_BYTES = 64 * 1024;

interface StoredDraft {
	schemaVersion: number;
	projectKey: string;
	text: string;
	updatedAt: string;
}

interface LoadedDraft {
	path: string;
	stored: StoredDraft;
}

function draftDirectory(): string {
	return join(homedir(), ".local", "share", "www", "drafts");
}

function digest(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

function isStoredDraft(value: unknown): value is StoredDraft {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const draft = value as Record<string, unknown>;
	return (
		draft.schemaVersion === SCHEMA_VERSION &&
		typeof draft.projectKey === "string" &&
		typeof draft.text === "string" &&
		typeof draft.updatedAt === "string" &&
		Number.isFinite(Date.parse(draft.updatedAt))
	);
}

/** Per-session files prevent one WWW process from overwriting another process's project draft. */
export class FileComposerDraftController implements ComposerDraftController {
	private loaded: LoadedDraft | undefined;

	private constructor(
		readonly initialText: string,
		private readonly projectKey: string,
		private readonly directory: string,
		private readonly path: string,
		loaded: LoadedDraft | undefined,
	) {
		this.loaded = loaded;
	}

	static async create(
		projectPath: string,
		sessionId: string,
		directory = draftDirectory(),
	): Promise<FileComposerDraftController> {
		const projectKey = digest(resolve(projectPath));
		const loaded = await this.loadLatest(directory, projectKey);
		const path = join(directory, `${projectKey}-${digest(sessionId)}-${randomUUID()}.json`);
		return new FileComposerDraftController(loaded?.stored.text ?? "", projectKey, directory, path, loaded);
	}

	async save(text: string): Promise<void> {
		if (typeof text !== "string") throw new Error("작성 초안은 문자열이어야 합니다.");
		if (text === "") return this.clear();
		if (Buffer.byteLength(text, "utf8") > MAX_TEXT_BYTES) {
			throw new Error(`작성 초안은 ${MAX_TEXT_BYTES}바이트를 초과할 수 없습니다.`);
		}

		await mkdir(this.directory, { recursive: true, mode: 0o700 });
		await chmod(this.directory, 0o700);
		const temporary = `${this.path}.tmp-${process.pid}-${randomUUID()}`;
		const stored: StoredDraft = {
			schemaVersion: SCHEMA_VERSION,
			projectKey: this.projectKey,
			text,
			updatedAt: new Date().toISOString(),
		};
		const previous = this.loaded;
		try {
			await writeFile(temporary, `${JSON.stringify(stored)}\n`, { mode: 0o600 });
			await rename(temporary, this.path);
			await chmod(this.path, 0o600);
			this.loaded = { path: this.path, stored };
		} catch (error) {
			await rm(temporary, { force: true });
			throw error;
		}
		if (previous && previous.path !== this.path && await this.isUnchanged(previous).catch(() => false)) {
			await rm(previous.path, { force: true }).catch(() => undefined);
		}
	}

	async clear(): Promise<void> {
		const paths = new Set([this.path]);
		if (this.loaded && await this.isUnchanged(this.loaded)) paths.add(this.loaded.path);
		await Promise.all([...paths].map(path => rm(path, { force: true })));
		this.loaded = undefined;
	}

	private async isUnchanged(loaded: LoadedDraft): Promise<boolean> {
		try {
			const current = await FileComposerDraftController.readStored(loaded.path, this.projectKey);
			return current.updatedAt === loaded.stored.updatedAt && current.text === loaded.stored.text;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
			throw error;
		}
	}

	private static async loadLatest(directory: string, projectKey: string): Promise<LoadedDraft | undefined> {
		let names: string[];
		try {
			names = await readdir(directory);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
			throw error;
		}
		const candidates = await Promise.all(names
			.filter(name => name.startsWith(`${projectKey}-`) && name.endsWith(".json"))
			.map(async name => {
				const path = join(directory, name);
				return { path, stored: await this.readStored(path, projectKey) };
			}));
		return candidates.sort((left, right) => right.stored.updatedAt.localeCompare(left.stored.updatedAt))[0];
	}

	private static async readStored(path: string, projectKey: string): Promise<StoredDraft> {
		let parsed: unknown;
		try {
			parsed = JSON.parse(await readFile(path, "utf8"));
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") throw error;
			throw new Error(`작성 초안 파일을 읽을 수 없습니다: ${path}`, { cause: error });
		}
		if (!isStoredDraft(parsed)) throw new Error(`작성 초안 파일 형식이 올바르지 않습니다: ${path}`);
		if (parsed.projectKey !== projectKey) throw new Error(`작성 초안 파일이 현재 프로젝트와 일치하지 않습니다: ${path}`);
		if (Buffer.byteLength(parsed.text, "utf8") > MAX_TEXT_BYTES) {
			throw new Error(`작성 초안 파일의 텍스트가 너무 큽니다: ${path}`);
		}
		return parsed;
	}
}
