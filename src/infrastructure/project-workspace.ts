import { randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, open, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

const WORKSPACE_DIRECTORY = ".www";
const MANIFEST_FILE = "project.json";
const WORKSPACE_GITIGNORE_FILE = ".gitignore";
const LOCAL_DIRECTORIES = ["sessions", "drafts", "runtime"] as const;
const WORKSPACE_GITIGNORE = "sessions/\ndrafts/\ncache/\nruntime/\n";

type ProjectManifest = {
	schemaVersion: 1;
	name: string;
	createdAt: string;
};

export type ProjectWorkspace = {
	name: string;
	root: string;
	directory: string;
	sessionsDirectory: string;
	draftsDirectory: string;
	runtimeDirectory: string;
	manifestPath: string;
};

export type SessionLease = {
	release(): Promise<void>;
};

function isManifest(value: unknown): value is ProjectManifest {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
	const manifest = value as Record<string, unknown>;
	return (
		manifest.schemaVersion === 1 &&
		typeof manifest.name === "string" &&
		manifest.name.length > 0 &&
		typeof manifest.createdAt === "string" &&
		manifest.createdAt.length > 0
	);
}

async function ensureDirectory(path: string): Promise<void> {
	try {
		const info = await lstat(path);
		if (info.isSymbolicLink() || !info.isDirectory()) {
			throw new Error(`Workspace path must be a directory: ${path}`);
		}
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		await mkdir(path, { mode: 0o700 });
	}

	const info = await lstat(path);
	if (info.isSymbolicLink() || !info.isDirectory()) {
		throw new Error(`Workspace path must be a directory: ${path}`);
	}
	await chmod(path, 0o700);
}

async function atomicWrite(path: string, content: string, mode: number): Promise<void> {
	const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
	try {
		await writeFile(temporary, content, { mode });
		await rename(temporary, path);
		await chmod(path, mode);
	} catch (error) {
		await rm(temporary, { force: true });
		throw error;
	}
}

async function existsRegularFile(path: string): Promise<boolean> {
	try {
		const info = await lstat(path);
		if (info.isSymbolicLink() || !info.isFile()) {
			throw new Error(`Workspace path must be a regular file: ${path}`);
		}
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
		throw error;
	}
}

async function gitRoot(cwd: string): Promise<string | undefined> {
	try {
		const process = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
			cwd,
			stdout: "pipe",
			stderr: "pipe",
		});
		const [exitCode, output] = await Promise.all([
			process.exited,
			new Response(process.stdout).text(),
		]);
		if (exitCode !== 0) return undefined;
		const root = output.trim();
		return root.length > 0 ? root : undefined;
	} catch {
		return undefined;
	}
}

export class FileProjectWorkspace {
	static async open(cwd: string): Promise<ProjectWorkspace> {
		const resolvedCwd = await realpath(cwd);
		if (!(await stat(resolvedCwd)).isDirectory()) {
			throw new Error(`Workspace cwd must be a directory: ${cwd}`);
		}
		const root = await realpath((await gitRoot(resolvedCwd)) ?? resolvedCwd);
		const directory = join(root, WORKSPACE_DIRECTORY);
		await ensureDirectory(directory);

		const sessionsDirectory = join(directory, "sessions");
		const draftsDirectory = join(directory, "drafts");
		const runtimeDirectory = join(directory, "runtime");
		for (const localDirectory of LOCAL_DIRECTORIES) {
			await ensureDirectory(join(directory, localDirectory));
		}

		const manifestPath = join(directory, MANIFEST_FILE);
		let manifest: ProjectManifest;
		if (await existsRegularFile(manifestPath)) {
			try {
			const parsed = JSON.parse(await readFile(manifestPath, "utf8")) as unknown;
			if (!isManifest(parsed)) {
				throw new Error(`Project manifest has an unsupported schema: ${manifestPath}`);
			}
			manifest = parsed;
			} catch (error) {
				if (!(error instanceof SyntaxError)) throw error;
				throw new Error(`Project manifest is not valid JSON: ${manifestPath}`, { cause: error });
			}
		} else {
			manifest = {
				schemaVersion: 1,
				name: basename(root),
				createdAt: new Date().toISOString(),
			};
			await atomicWrite(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 0o600);
		}

		const gitignorePath = join(directory, WORKSPACE_GITIGNORE_FILE);
		if (!(await existsRegularFile(gitignorePath))) {
			await atomicWrite(gitignorePath, WORKSPACE_GITIGNORE, 0o600);
		}

		return { name: manifest.name, root, directory, sessionsDirectory, draftsDirectory, runtimeDirectory, manifestPath };
	}

	static async acquireSessionLease(workspace: ProjectWorkspace, sessionId: string): Promise<SessionLease> {
		if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/u.test(sessionId)) throw new Error("Invalid session lease id.");
		await ensureDirectory(workspace.runtimeDirectory);
		const path = join(workspace.runtimeDirectory, `${sessionId}.lock`);
		const token = randomUUID();
		const acquire = async (): Promise<void> => {
			try {
				const handle = await open(path, "wx", 0o600);
				try {
					await handle.writeFile(`${JSON.stringify({ pid: process.pid, token, createdAt: new Date().toISOString() })}\n`);
				} finally {
					await handle.close();
				}
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
				let owner: unknown;
				try {
					owner = JSON.parse(await readFile(path, "utf8"));
				} catch {
					throw new Error(`Session lease is unreadable: ${sessionId}`);
				}
				const pid = typeof owner === "object" && owner !== null ? (owner as { pid?: unknown }).pid : undefined;
				if (typeof pid === "number" && !isProcessAlive(pid)) {
					throw new Error(`Session lease is stale: ${sessionId}. 활성 프로세스가 없는지 확인한 뒤 ${path} 파일을 삭제하세요.`);
				}
				throw new Error(`Session is already active: ${sessionId}`);
			}
		};
		await acquire();
		let released = false;
		return {
			release: async () => {
				if (released) return;
				released = true;
				try {
					const owner = JSON.parse(await readFile(path, "utf8")) as { token?: unknown };
					if (owner.token === token) await rm(path, { force: true });
				} catch (error) {
					if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
				}
			},
		};
	}
}

function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === "EPERM";
	}
}
