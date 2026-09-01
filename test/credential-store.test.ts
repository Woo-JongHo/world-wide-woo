import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { FileCredentialStore } from "../src/infrastructure/credential-store";

const directories: string[] = [];
afterEach(async () => {
	await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function credentialPath(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "www-credentials-"));
	directories.push(directory);
	return join(directory, "private", "auth.json");
}

describe("file credential store", () => {
	test("stores, reads, modifies, lists metadata, and deletes credentials", async () => {
		const store = new FileCredentialStore(await credentialPath());
		await store.modify("anthropic", async () => ({ type: "api_key", key: "secret" }));
		expect(await store.read("anthropic")).toEqual({ type: "api_key", key: "secret" });
		expect(await store.list()).toEqual([{ providerId: "anthropic", type: "api_key" }]);

		await store.modify("anthropic", async (current) => ({ ...current!, key: "rotated" }));
		expect(await store.read("anthropic")).toEqual({ type: "api_key", key: "rotated" });
		await store.delete("anthropic");
		expect(await store.read("anthropic")).toBeUndefined();
	});

	test("serializes concurrent modifications against the file", async () => {
		const store = new FileCredentialStore(await credentialPath());
		await store.modify("openai", async () => ({ type: "oauth", access: "access", refresh: "refresh", expires: 1, count: 0 }));
		await Promise.all(
			Array.from({ length: 10 }, () =>
				store.modify("openai", async (current) => ({
					...current!,
					count: Number((current as unknown as Record<string, unknown>).count) + 1,
				})),
			),
		);
		expect(((await store.read("openai")) as unknown as Record<string, unknown>).count).toBe(10);
	});

	test("writes private directories and files atomically", async () => {
		const path = await credentialPath();
		const store = new FileCredentialStore(path);
		await store.modify("google", async () => ({ type: "api_key", key: "secret" }));
		if (process.platform !== "win32") {
			expect((await stat(dirname(path))).mode & 0o777).toBe(0o700);
			expect((await stat(path)).mode & 0o777).toBe(0o600);
		}
	});

	test("rejects corrupt credential files", async () => {
		const path = await credentialPath();
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, "{not-json");
		await expect(new FileCredentialStore(path).read("anthropic")).rejects.toThrow("invalid JSON");
	});

	test("rejects operations with an already aborted signal", async () => {
		const store = new FileCredentialStore(await credentialPath());
		const controller = new AbortController();
		controller.abort();
		await expect(store.read("anthropic", { signal: controller.signal })).rejects.toHaveProperty("name", "AbortError");
		await expect(store.list({ signal: controller.signal })).rejects.toHaveProperty("name", "AbortError");
		await expect(store.modify("anthropic", async () => ({ type: "api_key", key: "secret" }), { signal: controller.signal })).rejects.toHaveProperty("name", "AbortError");
		await expect(store.delete("anthropic", { signal: controller.signal })).rejects.toHaveProperty("name", "AbortError");
	});
});
