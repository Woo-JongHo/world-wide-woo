import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileComposerDraftController } from "../src/infrastructure/composer-draft-store";

const directories: string[] = [];
afterEach(async () => {
	await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function draftDirectory(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "www-drafts-"));
	directories.push(directory);
	return join(directory, "drafts");
}

describe("file composer draft controller", () => {
	test("starts empty when its draft is missing", async () => {
		const controller = await FileComposerDraftController.create("/projects/one", "session-1", await draftDirectory());
		expect(controller.initialText).toBe("");
	});

	test("saves and restores a draft without exposing stored metadata", async () => {
		const directory = await draftDirectory();
		await (await FileComposerDraftController.create("/projects/one", "session-1", directory)).save("안녕하세요");
		const restored = await FileComposerDraftController.create("/projects/one", "session-1", directory);
		expect(restored.initialText).toBe("안녕하세요");
		const files = await readdir(directory);
		expect(files).toHaveLength(1);
		expect(files[0]).not.toContain("/projects/one");
		const stored = await readFile(join(directory, files[0]), "utf8");
		expect(stored).not.toContain("/projects/one");
		expect(stored).not.toContain("session-1");
	});

	test("restores the project draft into a newly created session", async () => {
		const directory = await draftDirectory();
		await (await FileComposerDraftController.create("/projects/one", "session-1", directory)).save("재기동 초안");
		const restored = await FileComposerDraftController.create("/projects/one", "session-2", directory);
		expect(restored.initialText).toBe("재기동 초안");
	});

	test("clears drafts explicitly and when saving empty text", async () => {
		const directory = await draftDirectory();
		const controller = await FileComposerDraftController.create("/projects/one", "session-1", directory);
		await controller.save("draft");
		await controller.save("");
		expect((await FileComposerDraftController.create("/projects/one", "session-1", directory)).initialText).toBe("");
		await controller.save("draft");
		await controller.clear();
		expect((await FileComposerDraftController.create("/projects/one", "session-1", directory)).initialText).toBe("");
	});

	test("writes private directories and files", async () => {
		const directory = await draftDirectory();
		await (await FileComposerDraftController.create("/projects/one", "session-1", directory)).save("draft");
		const [file] = await readdir(directory);
		expect((await stat(directory)).mode & 0o777).toBe(0o700);
		expect((await stat(join(directory, file))).mode & 0o777).toBe(0o600);
	});

	test("isolates drafts by project key", async () => {
		const directory = await draftDirectory();
		await (await FileComposerDraftController.create("/projects/one", "session-1", directory)).save("one");
		expect((await FileComposerDraftController.create("/projects/two", "session-1", directory)).initialText).toBe("");
	});

	test("fails closed for malformed schema", async () => {
		const directory = await draftDirectory();
		const controller = await FileComposerDraftController.create("/projects/one", "session-1", directory);
		await controller.save("draft");
		const [file] = await readdir(directory);
		await writeFile(join(directory, file), '{"schemaVersion":1}');
		await expect(FileComposerDraftController.create("/projects/one", "session-1", directory)).rejects.toThrow("형식");
	});

	test("fails closed when a stored draft names another project", async () => {
		const directory = await draftDirectory();
		const controller = await FileComposerDraftController.create("/projects/one", "session-1", directory);
		await controller.save("draft");
		const [file] = await readdir(directory);
		await writeFile(
			join(directory, file),
			JSON.stringify({
				schemaVersion: 1,
				projectKey: "another-project",
				text: "draft",
				updatedAt: new Date().toISOString(),
			}),
		);
		await expect(FileComposerDraftController.create("/projects/one", "session-1", directory)).rejects.toThrow("일치하지");
	});

	test("rejects oversized UTF-8 text", async () => {
		const controller = await FileComposerDraftController.create("/projects/one", "session-1", await draftDirectory());
		await expect(controller.save("가".repeat(22_000))).rejects.toThrow("초과");
	});

	test("ignores interrupted temporary artifacts", async () => {
		const directory = await draftDirectory();
		await mkdir(directory, { recursive: true });
		await writeFile(join(directory, "interrupted.tmp"), "{not-json");
		const controller = await FileComposerDraftController.create("/projects/one", "session-1", directory);
		expect(controller.initialText).toBe("");
	});

	test("keeps concurrent session drafts isolated and restores the newest", async () => {
		const directory = await draftDirectory();
		const first = await FileComposerDraftController.create("/projects/one", "session-1", directory);
		const second = await FileComposerDraftController.create("/projects/one", "session-2", directory);
		await first.save("first");
		await Bun.sleep(2);
		await second.save("second");
		expect((await readdir(directory)).filter(name => name.endsWith(".json"))).toHaveLength(2);
		expect((await FileComposerDraftController.create("/projects/one", "session-3", directory)).initialText).toBe("second");
	});

	test("does not clear a source draft that changed after it was restored", async () => {
		const directory = await draftDirectory();
		const source = await FileComposerDraftController.create("/projects/one", "session-source", directory);
		await source.save("old");
		const restored = await FileComposerDraftController.create("/projects/one", "session-restored", directory);
		await Bun.sleep(2);
		await source.save("new");
		await restored.clear();
		expect((await FileComposerDraftController.create("/projects/one", "session-next", directory)).initialText).toBe("new");
	});
});
