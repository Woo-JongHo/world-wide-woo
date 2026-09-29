import { expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadOutputLanguagePreference, saveOutputLanguagePreference } from "../src/adapters/outbound/workspace/output-language-preference";

test("output language survives restart without changing tracked project policy", async () => {
	const root = await mkdtemp(join(tmpdir(), "www-language-pref-"));
	await mkdir(join(root, ".www"));
	expect(await loadOutputLanguagePreference(root, "ko")).toBe("ko");
	await saveOutputLanguagePreference(root, "en");
	expect(await loadOutputLanguagePreference(root, "ko")).toBe("en");
	expect(JSON.parse(await readFile(join(root, ".www", "runtime", "output-language.json"), "utf8"))).toEqual({ schemaVersion: 1, language: "en" });
	await writeFile(join(root, ".www", "runtime", "output-language.json"), JSON.stringify({ schemaVersion: 2, language: "en" }));
	expect(await loadOutputLanguagePreference(root, "ko")).toBe("ko");
});
