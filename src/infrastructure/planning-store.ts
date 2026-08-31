import { chmod, lstat, mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import { randomUUID } from "node:crypto";
import { Database } from "bun:sqlite";
import { createPlanningSnapshot, sanitizePlanningText, type PlanningEpic, type PlanningSnapshot, type PlanningStory } from "../domain/planning.js";
import type { PlanningCatalogStore } from "../application/planning-service.js";

const queues = new Map<string, Promise<unknown>>();
const START = "<!-- www-planning-v1:start -->";
const END = "<!-- www-planning-v1:end -->";
type Record = { schemaVersion: 1; revision: number; type: "epic.created"; artifact: PlanningEpic } | { schemaVersion: 1; revision: number; type: "story.created"; artifact: PlanningStory };

export class FilePlanningStore implements PlanningCatalogStore {
	public constructor(private readonly wwwDirectory: string) {}
	public async read(): Promise<PlanningSnapshot> {
		return this.serial(async () => {
			const initial = await this.loadRecords();
			if (!(await this.catalogExists())) return initial.snapshot;
			return this.withLock(async () => {
			const { snapshot, records } = await this.loadRecords();
			await this.syncArtifacts(records);
			await this.syncProjections(snapshot);
			return snapshot;
			});
		});
	}
	public async createEpic(title: string, goal: string): Promise<{ snapshot: PlanningSnapshot; epic: PlanningEpic }> {
		const result = await this.mutate(async (snapshot, records) => {
			const epic: PlanningEpic = Object.freeze({ id: nextEpicId(snapshot, await this.legacyText("Epics.md")), title: sanitizePlanningText(title, 120), goal: sanitizePlanningText(goal, 500), createdAt: new Date().toISOString() });
			if (!epic.title || !epic.goal) throw new Error("Planning epic title and goal are required");
			const next = createPlanningSnapshot(snapshot.revision + 1, [...snapshot.epics, epic], snapshot.stories);
			return { snapshot: next, records: [...records, { schemaVersion: 1, revision: next.revision, type: "epic.created", artifact: epic }], value: epic };
		});
		return { snapshot: result.snapshot, epic: result.value };
	}
	public async createStory(epicId: string, title: string, acceptance: string, supersedes: string | null = null): Promise<{ snapshot: PlanningSnapshot; story: PlanningStory }> {
		const result = await this.mutate(async (snapshot, records) => {
			if (!snapshot.epics.some((epic) => epic.id === epicId)) throw new Error(`Planning epic does not exist: ${epicId}`);
			const story: PlanningStory = Object.freeze({ id: nextStoryId(epicId, snapshot, await this.legacyText("Stories.md")), epicId, title: sanitizePlanningText(title, 120), acceptance: sanitizePlanningText(acceptance, 500), createdAt: new Date().toISOString(), supersedes });
			if (!story.title || !story.acceptance) throw new Error("Planning story title and acceptance are required");
			const next = createPlanningSnapshot(snapshot.revision + 1, snapshot.epics, [...snapshot.stories, story]);
			return { snapshot: next, records: [...records, { schemaVersion: 1, revision: next.revision, type: "story.created", artifact: story }], value: story };
		});
		return { snapshot: result.snapshot, story: result.value };
	}
	private async mutate<T>(operation: (snapshot: PlanningSnapshot, records: Record[]) => Promise<{ snapshot: PlanningSnapshot; records: Record[]; value: T }>): Promise<{ snapshot: PlanningSnapshot; value: T }> {
		return this.serial(() => this.withLock(async () => {
			const { snapshot, records } = await this.loadRecords(); const result = await operation(snapshot, records);
			await this.ensureDirectory(this.planningDirectory());
			await this.preflightNewArtifact(result.records.at(-1)!);
			await this.validateProjection("Epics.md");
			await this.validateProjection("Stories.md");
			await this.writeCatalog(result.records);
			await this.syncArtifacts(result.records);
			await this.syncProjections(result.snapshot);
			return { snapshot: result.snapshot, value: result.value };
		}));
	}
	private async loadRecords(): Promise<{ snapshot: PlanningSnapshot; records: Record[] }> {
		const path = this.catalogPath(); let raw: string;
		try { raw = await this.readSafeFile(path); await chmod(path, 0o600); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { snapshot: createPlanningSnapshot(0, [], []), records: [] }; throw error; }
		const records = raw.split("\n").filter(Boolean).map((line) => parseRecord(line));
		for (let index = 0; index < records.length; index++) if (records[index].revision !== index + 1) throw new Error("Invalid planning catalog revision sequence");
		return { snapshot: createPlanningSnapshot(records.length, records.filter((x): x is Extract<Record, { type: "epic.created" }> => x.type === "epic.created").map((x) => x.artifact), records.filter((x): x is Extract<Record, { type: "story.created" }> => x.type === "story.created").map((x) => x.artifact)), records };
	}
	private async withLock<T>(operation: () => Promise<T>): Promise<T> {
		await this.ensureDirectory(this.wwwDirectory); const runtime = join(this.wwwDirectory, "runtime"); await this.ensureDirectory(runtime);
		const dbPath = join(runtime, "planning-lock.sqlite"); await this.assertSafeOptionalFile(dbPath);
		const db = new Database(dbPath, { create: true, strict: true });
		try { await chmod(dbPath, 0o600); db.run("PRAGMA busy_timeout = 5000"); db.run("CREATE TABLE IF NOT EXISTS planning_mutex (id INTEGER PRIMARY KEY)"); db.run("BEGIN IMMEDIATE");
			try { const value = await operation(); db.run("COMMIT"); return value; } catch (error) { db.run("ROLLBACK"); throw error; }
		} finally { db.close(); }
	}
	private async writeArtifact(record: Record): Promise<void> {
		const dir = this.artifactsDirectory(); await this.ensureDirectory(dir); const path = join(dir, `${record.artifact.id}.md`);
		const expected = renderArtifact(record);
		try {
			const existing = await this.readSafeFile(path);
			if (existing !== expected) throw new Error(`Immutable planning artifact differs from catalog: ${record.artifact.id}`);
			await chmod(path, 0o600);
			return;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
		const handle = await open(path, "wx", 0o600);
		try { await handle.writeFile(expected); await handle.sync(); } finally { await handle.close(); }
		await chmod(path, 0o600);
	}
	private async preflightNewArtifact(record: Record): Promise<void> {
		const dir = this.artifactsDirectory();
		await this.ensureDirectory(dir);
		const path = join(dir, `${record.artifact.id}.md`);
		try {
			await this.assertSafeOptionalFile(path);
			await lstat(path);
			throw new Error(`Planning artifact already exists outside the catalog: ${record.artifact.id}`);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
	}
	private async syncArtifacts(records: readonly Record[]): Promise<void> {
		for (const record of records) await this.writeArtifact(record);
	}
	private async writeCatalog(records: Record[]): Promise<void> {
		let existing = "";
		try { existing = await this.readSafeFile(this.catalogPath()); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
		const prior = existing.split("\n").filter(Boolean).map(parseRecord);
		if (prior.length >= records.length || prior.some((record, index) => JSON.stringify(record) !== JSON.stringify(records[index]))) throw new Error("Planning catalog changed during mutation");
		const appended = records.slice(prior.length).map((record) => JSON.stringify(record)).join("\n");
		const content = existing ? `${existing}${existing.endsWith("\n") ? "" : "\n"}${appended}\n` : `${appended}\n`;
		await this.atomicWrite(this.catalogPath(), content);
	}
	private async syncProjections(snapshot: PlanningSnapshot): Promise<void> {
		await this.updateProjection("Epics.md", snapshot.epics.map((e) => `- ${e.id} | ${e.title} | ${e.goal}`).join("\n"));
		await this.updateProjection("Stories.md", snapshot.stories.map((s) => `- ${s.id} | ${s.epicId} | ${s.title} | ${s.acceptance}${s.supersedes ? ` | supersedes ${s.supersedes}` : ""}`).join("\n"));
	}
	private async updateProjection(name: string, body: string): Promise<void> {
		const path = join(this.wwwDirectory, name); let original = "";
		try { original = await this.readSafeFile(path); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
		const { start, end } = projectionMarkers(original, name);
		const block = `${START}\n${body}\n${END}`;
		const next = start < 0 ? `${original}${original && !original.endsWith("\n") ? "\n" : ""}${block}\n` : `${original.slice(0, start)}${block}${original.slice(end + END.length)}`;
		if (next === original) return;
		await this.atomicWrite(path, next);
	}
	private async validateProjection(name: string): Promise<void> {
		try { projectionMarkers(await this.readSafeFile(join(this.wwwDirectory, name)), name); }
		catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
	}
	private async legacyText(name: string): Promise<string> { try { return await this.readSafeFile(join(this.wwwDirectory, name)); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return ""; throw error; } }
	private async atomicWrite(path: string, content: string): Promise<void> { const dir = join(path, ".."); const temp = join(dir, `.${basename(path)}.${randomUUID()}.tmp`); try { const handle = await open(temp, "wx", 0o600); try { await handle.writeFile(content); await handle.sync(); } finally { await handle.close(); } await rename(temp, path); await chmod(path, 0o600); } finally { await rm(temp, { force: true }); } }
	private async ensureDirectory(path: string): Promise<void> { await mkdir(path, { recursive: true, mode: 0o700 }); const info = await lstat(path); if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`Unsafe planning path: ${path}`); await chmod(path, 0o700); }
	private async assertSafeOptionalFile(path: string): Promise<void> { try { const info = await lstat(path); if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Unsafe planning path: ${path}`); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; } }
	private async readSafeFile(path: string): Promise<string> { await this.assertSafeOptionalFile(path); return readFile(path, "utf8"); }
	private async catalogExists(): Promise<boolean> {
		try { await this.assertSafeOptionalFile(this.catalogPath()); await lstat(this.catalogPath()); return true; }
		catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
	}
	private serial<T>(operation: () => Promise<T>): Promise<T> { const key = this.wwwDirectory; const previous = queues.get(key) ?? Promise.resolve(); const current = previous.catch(() => undefined).then(operation); queues.set(key, current); void current.finally(() => { if (queues.get(key) === current) queues.delete(key); }).catch(() => undefined); return current; }
	private planningDirectory(): string { return join(this.wwwDirectory, "planning"); }
	private artifactsDirectory(): string { return join(this.planningDirectory(), "artifacts"); }
	private catalogPath(): string { return join(this.planningDirectory(), "catalog.jsonl"); }
}

function parseRecord(line: string): Record { let value: unknown; try { value = JSON.parse(line); } catch { throw new Error("Invalid planning catalog JSON"); } const r = value as Partial<Record>; if (r.schemaVersion !== 1 || !Number.isSafeInteger(r.revision) || (r.type !== "epic.created" && r.type !== "story.created") || !r.artifact) throw new Error("Invalid planning catalog record"); return r as Record; }
function nextEpicId(snapshot: PlanningSnapshot, legacy: string): string { const ids = [...snapshot.epics.map((e) => e.id), ...Array.from(legacy.matchAll(/\bEP-(\d{3})\b/g), (m) => m[0])]; const max = Math.max(0, ...ids.map((id) => Number(id.slice(3)))); if (max >= 999) throw new Error("Planning epic ID space exhausted"); return `EP-${String(max + 1).padStart(3, "0")}`; }
function nextStoryId(epicId: string, snapshot: PlanningSnapshot, legacy: string): string { const prefix = `ST-${epicId.slice(3)}-`; const ids = [...snapshot.stories.map((s) => s.id), ...Array.from(legacy.matchAll(/\bST-\d{3}-(\d{2})\b/g), (m) => m[0]).filter((id) => id.startsWith(prefix))]; const max = Math.max(0, ...ids.map((id) => Number(id.slice(-2)))); if (max >= 99) throw new Error("Planning story ID space exhausted"); return `${prefix}${String(max + 1).padStart(2, "0")}`; }
function renderArtifact(record: Record): string {
	if (record.type === "epic.created") { const a = record.artifact; return `# ${a.id}: ${a.title}\n\nGoal\n${a.goal}\n\nCreated: ${a.createdAt}\n`; }
	const a = record.artifact; return `# ${a.id}: ${a.title}\n\nEpic: ${a.epicId}\n\nAcceptance\n${a.acceptance}\n\nSupersedes: ${a.supersedes ?? "none"}\n\nCreated: ${a.createdAt}\n`;
}

function projectionMarkers(content: string, name: string): { start: number; end: number } {
	const start = content.indexOf(START);
	const end = content.indexOf(END);
	if ((start < 0) !== (end < 0) || (start >= 0 && (end < start || content.indexOf(START, start + START.length) >= 0 || content.indexOf(END, end + END.length) >= 0))) {
		throw new Error(`Invalid planning projection markers in ${name}`);
	}
	return { start, end };
}
