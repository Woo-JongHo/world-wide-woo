import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { AtomicSettingsRepository } from "../application/ports";
import {
	DEFAULT_SETTINGS,
	normalizeSettings,
	type WwwSettings,
} from "../domain/model-settings";

export function settingsPath(env: NodeJS.ProcessEnv = process.env): string {
	const configRoot = env.WWW_CONFIG_DIR ?? join(homedir(), ".config", "www");
	return join(configRoot, "settings.json");
}

const LOCK_WAIT_MS = 2_000;
const STALE_LOCK_MS = 10_000;

function sameSettings(left: WwwSettings, right: WwwSettings): boolean {
	return left.provider === right.provider && left.model === right.model && left.effort === right.effort;
}

export class FileSettingsStore implements AtomicSettingsRepository {
	constructor(readonly path = settingsPath()) {}

	async load(): Promise<WwwSettings> {
		try {
			return normalizeSettings(JSON.parse(await readFile(this.path, "utf8")));
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return { ...DEFAULT_SETTINGS };
			if (error instanceof SyntaxError) {
				throw new Error(`설정 파일의 JSON이 올바르지 않습니다: ${this.path}`, { cause: error });
			}
			throw error;
		}
	}

	async save(settings: WwwSettings): Promise<void> {
		await this.withLock(() => this.write(settings));
	}

	async compareAndSwap(expected: WwwSettings, next: WwwSettings): Promise<boolean> {
		return this.withLock(async () => {
			if (!sameSettings(await this.load(), expected)) return false;
			await this.write(next);
			return true;
		});
	}

	private async write(settings: WwwSettings): Promise<void> {
		const directory = dirname(this.path);
		await mkdir(directory, { recursive: true, mode: 0o700 });
		await chmod(directory, 0o700);
		const temporary = `${this.path}.tmp-${process.pid}-${randomUUID()}`;
		try {
			await writeFile(temporary, `${JSON.stringify(normalizeSettings(settings), null, 2)}\n`, { mode: 0o600 });
			await rename(temporary, this.path);
			await chmod(this.path, 0o600);
		} catch (error) {
			await rm(temporary, { force: true });
			throw error;
		}
	}

	private async withLock<T>(operation: () => Promise<T>): Promise<T> {
		const directory = dirname(this.path);
		const lock = `${this.path}.lock`;
		await mkdir(directory, { recursive: true, mode: 0o700 });
		await chmod(directory, 0o700);
		const deadline = Date.now() + LOCK_WAIT_MS;
		for (;;) {
			try {
				await mkdir(lock, { mode: 0o700 });
				break;
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
				try {
					const info = await stat(lock);
					if (Date.now() - info.mtimeMs > STALE_LOCK_MS) {
						await rm(lock, { recursive: true, force: true });
						continue;
					}
				} catch (statError) {
					if ((statError as NodeJS.ErrnoException).code === "ENOENT") continue;
					throw statError;
				}
				if (Date.now() >= deadline) throw new Error("설정 파일 잠금을 획득하지 못했습니다.");
				await new Promise(resolve => setTimeout(resolve, 25));
			}
		}
		try {
			return await operation();
		} finally {
			await rm(lock, { recursive: true, force: true });
		}
	}
}
