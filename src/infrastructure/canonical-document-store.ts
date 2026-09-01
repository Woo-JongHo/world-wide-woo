import { lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { digestCanonicalDocument, type CanonicalDocumentStore, type CanonicalWriteResult, type StoredCanonicalDocument } from "../application/canonical-promotion";
import { isCanonicalDocumentTarget, type CanonicalDocumentTarget } from "../domain/canonical-document";

/** Filesystem store constrained to project-local, tracked Markdown under `.www/vault`. */
export class FileCanonicalDocumentStore implements CanonicalDocumentStore {
	private readonly root: string;

	constructor(projectRoot: string) {
		if (!projectRoot || typeof projectRoot !== "string") throw new Error("프로젝트 루트가 필요합니다.");
		this.root = resolve(projectRoot);
	}

	async read(target: CanonicalDocumentTarget): Promise<StoredCanonicalDocument> {
		const path = await this.resolveTarget(target);
		return this.readResolved(path);
	}

	async writeAtomic(target: CanonicalDocumentTarget, expectedDigest: string, body: string): Promise<CanonicalWriteResult> {
		if (typeof body !== "string") throw new Error("정본 문서 본문은 문자열이어야 합니다.");
		if (!/^[a-f0-9]{64}$/u.test(expectedDigest)) throw new Error("기대하는 정본 문서 digest가 유효하지 않습니다.");
		const path = await this.resolveTarget(target);
		const directory = dirname(path);
		await mkdir(directory, { recursive: true, mode: 0o755 });
		await this.assertNoSymlinks(target);
		const temporary = canonicalTemporaryPath(path);
		try {
			await writeFile(temporary, body, { encoding: "utf8", mode: 0o644, flag: "wx" });
			// CAS immediately before rename protects against concurrent Obsidian/Git edits.
			const current = await this.readResolved(path);
			if (current.digest !== expectedDigest) return { status: "conflict", document: current };
			await this.assertNoSymlinks(target);
			await rename(temporary, path);
			return { status: "written", document: { body, digest: digestCanonicalDocument(body) } };
		} finally {
			await rm(temporary, { force: true }).catch(() => undefined);
		}
	}

	private async readResolved(path: string): Promise<StoredCanonicalDocument> {
		try {
			const stat = await lstat(path);
			if (stat.isSymbolicLink() || !stat.isFile()) throw new Error("정본 문서 target은 일반 파일이어야 합니다.");
			const body = await readFile(path, "utf8");
			return { body, digest: digestCanonicalDocument(body) };
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return { body: "", digest: digestCanonicalDocument("") };
			throw error;
		}
	}

	private async resolveTarget(target: CanonicalDocumentTarget): Promise<string> {
		if (!isCanonicalDocumentTarget(target)) throw new Error("정본 문서 target allowlist를 벗어났습니다.");
		if (isAbsolute(target) || target.includes("\\") || target.split("/").includes("..")) throw new Error("정본 문서 path traversal은 허용되지 않습니다.");
		const path = resolve(this.root, target);
		const local = relative(this.root, path);
		if (!local || local.startsWith(`..${sep}`) || local === ".." || isAbsolute(local)) throw new Error("정본 문서 target이 프로젝트 밖에 있습니다.");
		await this.assertNoSymlinks(target);
		return path;
	}

	private async assertNoSymlinks(target: CanonicalDocumentTarget): Promise<void> {
		let current = this.root;
		const parts = target.split("/");
		for (const [index, part] of parts.entries()) {
			current = resolve(current, part);
			try {
				const stat = await lstat(current);
				if (stat.isSymbolicLink()) throw new Error("정본 문서 경로에 symlink를 둘 수 없습니다.");
				if (!stat.isDirectory() && index < parts.length - 1) throw new Error("정본 문서 경로의 상위 항목은 디렉터리여야 합니다.");
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
				throw error;
			}
		}
	}
}

/** Matches the project `.gitignore` convention: `.${name}.*.tmp`. */
export function canonicalTemporaryPath(path: string, nonce: string = crypto.randomUUID()): string {
	return join(dirname(path), `.${basename(path)}.${process.pid}.${nonce}.tmp`);
}
