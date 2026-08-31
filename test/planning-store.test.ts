import { afterEach, describe, expect, test } from "bun:test";
import { access, mkdtemp, lstat, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FilePlanningStore } from "../src/infrastructure/planning-store.js";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });
async function workspace(): Promise<string> { const path = await mkdtemp(join(tmpdir(), "www-planning-")); directories.push(path); return path; }

describe("FilePlanningStore", () => {
	test("does not create Planning files during an empty read", async () => {
		const root = await workspace();
		expect(await new FilePlanningStore(root).read()).toMatchObject({ revision: 0, epics: [], stories: [] });
		await expect(access(join(root, "planning"))).rejects.toThrow();
		await expect(access(join(root, "Epics.md"))).rejects.toThrow();
		await expect(access(join(root, "Stories.md"))).rejects.toThrow();
	});
	test("uses legacy maxima, preserves unmanaged bytes, and restores on restart", async () => {
		const root = await workspace();
		await writeFile(join(root, "Epics.md"), "legacy EP-007\n"); await writeFile(join(root, "Stories.md"), "before ST-008-09\nafter human note\n");
		const store = new FilePlanningStore(root); const { epic } = await store.createEpic("A", "G"); expect(epic.id).toBe("EP-008");
		const { story } = await store.createStory(epic.id, "S", "done"); expect(story.id).toBe("ST-008-10");
		expect(await readFile(join(root, "Epics.md"), "utf8")).toStartWith("legacy EP-007\n");
		expect(await readFile(join(root, "Stories.md"), "utf8")).toContain("after human note");
		const restored = await new FilePlanningStore(root).read(); expect(restored).toMatchObject({ revision: 2, epics: [{ id: "EP-008" }], stories: [{ id: "ST-008-10" }] });
	});
	test("serializes concurrent writers, redacts secrets, and creates private immutable artifacts", async () => {
		const root = await workspace(); const store = new FilePlanningStore(root); const epic = (await store.createEpic("\u001b[31mBearer abc", "AKIA1234567890ABCDEF")).epic;
		const stories = await Promise.all(Array.from({ length: 5 }, (_, n) => store.createStory(epic.id, `S${n}`, "pass")));
		expect(stories.map(({ story }) => story.id)).toEqual(["ST-001-01", "ST-001-02", "ST-001-03", "ST-001-04", "ST-001-05"]);
		const catalog = await readFile(join(root, "planning", "catalog.jsonl"), "utf8");
		expect(catalog).not.toContain("AKIA1234567890ABCDEF");
		expect(catalog).not.toContain("Bearer abc");
		const info = await lstat(join(root, "planning", "artifacts", "EP-001.md")); expect(info.mode & 0o777).toBe(0o600);
	});
	test("serializes independent process writers without duplicate IDs", async () => {
		const root = await workspace();
		const script = `import { FilePlanningStore } from "./src/infrastructure/planning-store.ts"; await new FilePlanningStore(process.env.PLANNING_ROOT).createEpic(process.argv[1], "Goal");`;
		const children = ["First", "Second"].map(title => Bun.spawn(["bun", "-e", script, title], {
			cwd: process.cwd(),
			env: { ...process.env, PLANNING_ROOT: root },
			stdout: "ignore",
			stderr: "pipe",
		}));
		expect(await Promise.all(children.map(child => child.exited))).toEqual([0, 0]);
		expect((await new FilePlanningStore(root).read()).epics.map(epic => epic.id)).toEqual(["EP-001", "EP-002"]);
	});
	test("rejects invalid parents and unsafe symlink catalog paths", async () => {
		const root = await workspace(); const store = new FilePlanningStore(root); await expect(store.createStory("EP-001", "S", "A")).rejects.toThrow("does not exist");
		await mkdir(join(root, "planning"), { recursive: true }); await symlink("/tmp", join(root, "planning", "catalog.jsonl"));
		await expect(store.read()).rejects.toThrow("Unsafe planning path");
	});
	test("does not commit a catalog record over an untracked artifact collision", async () => {
		const root = await workspace();
		await mkdir(join(root, "planning", "artifacts"), { recursive: true });
		await writeFile(join(root, "planning", "artifacts", "EP-001.md"), "foreign artifact");
		await expect(new FilePlanningStore(root).createEpic("Epic", "Goal")).rejects.toThrow("outside the catalog");
		await expect(access(join(root, "planning", "catalog.jsonl"))).rejects.toThrow();
	});
	test("records only backward same-Epic supersedes relations", async () => {
		const root = await workspace(); const store = new FilePlanningStore(root);
		const epic = (await store.createEpic("Epic", "Goal")).epic;
		const original = (await store.createStory(epic.id, "Original", "A")).story;
		const replacement = (await store.createStory(epic.id, "Replacement", "B", original.id)).story;
		expect(replacement.supersedes).toBe(original.id);
		await expect(store.createStory(epic.id, "Missing", "C", "ST-001-99")).rejects.toThrow("supersedes relation");
		const otherEpic = (await store.createEpic("Other", "Goal")).epic;
		await expect(store.createStory(otherEpic.id, "Cross", "C", original.id)).rejects.toThrow("supersedes relation");
	});
	test("repairs catalog-derived artifacts and projections but rejects immutable divergence", async () => {
		const root = await workspace(); const store = new FilePlanningStore(root);
		const epic = (await store.createEpic("Epic", "Goal")).epic;
		const artifact = join(root, "planning", "artifacts", `${epic.id}.md`);
		await rm(artifact);
		await writeFile(join(root, "Epics.md"), "human prefix\n<!-- www-planning-v1:start -->\nstale\n<!-- www-planning-v1:end -->\nhuman suffix\n");
		await store.read();
		expect(await readFile(artifact, "utf8")).toContain(`# ${epic.id}: Epic`);
		const projection = await readFile(join(root, "Epics.md"), "utf8");
		expect(projection).toContain("human prefix");
		expect(projection).toContain("human suffix");
		expect(projection).not.toContain("stale");
		await writeFile(artifact, "corrupted");
		await expect(store.read()).rejects.toThrow("Immutable planning artifact differs");
	});
	test("fails closed for catalog revision gaps and unclosed projection markers", async () => {
		const root = await workspace();
		await mkdir(join(root, "planning"), { recursive: true });
		await writeFile(join(root, "planning", "catalog.jsonl"), `${JSON.stringify({
			schemaVersion: 1,
			revision: 2,
			type: "epic.created",
			artifact: { id: "EP-001", title: "Epic", goal: "Goal", createdAt: "2026-08-31T11:24:24.000Z" },
		})}\n`);
		await expect(new FilePlanningStore(root).read()).rejects.toThrow("revision sequence");
		await writeFile(join(root, "planning", "catalog.jsonl"), "");
		await writeFile(join(root, "Epics.md"), "<!-- www-planning-v1:start -->\n");
		await expect(new FilePlanningStore(root).read()).rejects.toThrow("Invalid planning projection markers");
	});
});
