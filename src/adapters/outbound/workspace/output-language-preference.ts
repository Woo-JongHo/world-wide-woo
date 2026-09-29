import { randomUUID }                  from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join }                        from "node:path";
import type { OutputLanguage }         from "@/core/domain/execution/output-language.js";

const preferencePath = (root: string): string => join(root, ".www", "runtime", "output-language.json");

/** Session preference lives outside the tracked project policy. */
export async function loadOutputLanguagePreference(root: string, fallback: OutputLanguage): Promise<OutputLanguage> {
	try {
		const value: unknown = JSON.parse(await readFile(preferencePath(root), "utf8"));
		if (value && typeof value === "object" && "schemaVersion" in value && value.schemaVersion === 1 && "language" in value && (value.language === "ko" || value.language === "en")) return value.language;
	} catch { /* Missing or damaged preferences fall back to project policy. */ }
	return fallback;
}

export async function saveOutputLanguagePreference(root: string, language: OutputLanguage): Promise<void> {
	const path = preferencePath(root);
	await mkdir(join(root, ".www", "runtime"), { recursive: true, mode: 0o700 });
	const temporary = `${path}.tmp-${randomUUID()}`;
	try {
		await writeFile(temporary, JSON.stringify({ schemaVersion: 1, language }), { encoding: "utf8", mode: 0o600, flag: "wx" });
		await rename(temporary, path);
	} catch (error) {
		await unlink(temporary).catch(() => undefined);
		throw error;
	}
}
