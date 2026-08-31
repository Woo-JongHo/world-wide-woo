import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { SettingsRepository } from "../application/ports";
import {
	DEFAULT_SETTINGS,
	normalizeSettings,
	type WwwSettings,
} from "../domain/model-settings";

export function settingsPath(env: NodeJS.ProcessEnv = process.env): string {
	const configRoot = env.WWW_CONFIG_DIR ?? join(homedir(), ".config", "www");
	return join(configRoot, "settings.json");
}

export class FileSettingsStore implements SettingsRepository {
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
}
