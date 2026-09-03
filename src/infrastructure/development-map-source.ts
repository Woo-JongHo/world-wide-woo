import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
	DevelopmentMapEpic,
	DevelopmentMapInitiative,
	DevelopmentMapRelation,
	DevelopmentMapSnapshot,
	DevelopmentMapStory,
} from "../domain/development-map.js";

interface CatalogEpic { id: string; title: string }
interface CatalogStory { id: string; epicId: string; title: string }
interface InitiativeManifest {
	id: string;
	title?: string;
	status?: string;
	artifacts?: Array<{ id: string; kind: string }>;
}

const UNLINKED = Object.freeze({ state: "unlinked", references: Object.freeze([]), nextTransition: "Authoritative relation has not been recorded." } satisfies DevelopmentMapRelation);

export class FileDevelopmentMapSource {
	public constructor(private readonly root: string) {}

	public async read(): Promise<DevelopmentMapSnapshot> {
		try {
			return await this.readAvailable();
		} catch (error) {
			return Object.freeze({
				...emptySnapshot(),
				sourceHealth: Object.freeze({ state: isMissing(error) ? "unavailable" : "invalid", error: errorMessage(error) }),
			});
		}
	}

	private async readAvailable(): Promise<DevelopmentMapSnapshot> {
		const planningRoot = join(this.root, ".www", "planning");
		const events = await readJsonLines(join(planningRoot, "catalog.jsonl"));
		validateCatalog(events);
		const epics = new Map<string, CatalogEpic>();
		const stories = new Map<string, CatalogStory[]>();
		let revision = 0;
		for (const event of events) {
			revision = Math.max(revision, numberValue(event.revision));
			const artifact = objectValue(event.artifact);
			if (event.type === "epic.created") {
				const epic = { id: stringValue(artifact.id), title: stringValue(artifact.title) };
				if (epic.id) epics.set(epic.id, epic);
			}
			if (event.type === "story.created") {
				const story = { id: stringValue(artifact.id), epicId: stringValue(artifact.epicId), title: stringValue(artifact.title) };
				if (story.id && story.epicId) stories.set(story.epicId, [...(stories.get(story.epicId) ?? []), story]);
			}
		}
		const evidenceNames = await readdir(join(this.root, ".www", "evidence"));
		const legacyStories = await readLegacyStories(join(this.root, ".www", "Stories.md"));
		const legacyEpics = await readLegacyEpics(join(this.root, ".www", "Epics.md"));
		for (const epic of legacyEpics.values()) if (!epics.has(epic.id)) epics.set(epic.id, epic);
		for (const story of legacyStories.values()) {
			const existing = stories.get(story.epicId) ?? [];
			if (!existing.some(item => item.id === story.id)) stories.set(story.epicId, [...existing, story]);
		}
		const manifests = await readInitiatives(planningRoot);
		validateInitiatives(manifests, epics);
		const linkedEpicIds = new Set<string>();
		const initiatives: DevelopmentMapInitiative[] = manifests.map(manifest => {
			const ids = new Set((manifest.artifacts ?? []).filter(item => item.kind === "epic").map(item => item.id));
			for (const id of ids) linkedEpicIds.add(id);
			return { id: manifest.id, title: manifest.title ?? "제목 미지정", status: manifest.status ?? "unknown", epics: [...ids].map(id => projectEpic(id, epics, stories, evidenceNames, legacyEpics, legacyStories)) };
		});
		return Object.freeze({
			revision,
			observedAt: new Date().toISOString(),
			sourceHealth: Object.freeze({ state: "available" }),
			initiatives: Object.freeze(initiatives),
			unlinkedEpics: Object.freeze([...epics.keys()].filter(id => !linkedEpicIds.has(id)).sort().map(id => projectEpic(id, epics, stories, evidenceNames, legacyEpics, legacyStories))),
		});
	}

	public startPolling(listener: (snapshot: DevelopmentMapSnapshot) => void, intervalMs = 1_000): () => void {
		let stopped = false;
		let refreshing = false;
		let fingerprint = "";
		let lastValid: DevelopmentMapSnapshot | null = null;
		const refresh = async () => {
			if (stopped || refreshing) return;
			refreshing = true;
			try {
				const snapshot = await this.read();
				const next = snapshot.sourceHealth.state === "available" ? snapshot : lastValid ? Object.freeze({ ...lastValid, observedAt: snapshot.observedAt, sourceHealth: Object.freeze({ state: "stale", error: snapshot.sourceHealth.error }) }) : snapshot;
				if (snapshot.sourceHealth.state === "available") lastValid = snapshot;
				const nextFingerprint = JSON.stringify([next.revision, next.initiatives, next.unlinkedEpics, next.sourceHealth]);
				if (!stopped && nextFingerprint !== fingerprint) { fingerprint = nextFingerprint; listener(next); }
			} finally { refreshing = false; }
		};
		void refresh();
		const timer = setInterval(() => void refresh(), intervalMs);
		return () => { if (!stopped) { stopped = true; clearInterval(timer); } };
	}
}

function emptySnapshot(): Omit<DevelopmentMapSnapshot, "sourceHealth"> {
	return { revision: 0, observedAt: new Date().toISOString(), initiatives: Object.freeze([]), unlinkedEpics: Object.freeze([]) };
}
function projectEpic(id: string, epics: Map<string, CatalogEpic>, stories: Map<string, CatalogStory[]>, evidenceNames: readonly string[], legacyEpics: Map<string, CatalogEpic & { status: string }>, legacyStories: Map<string, CatalogStory & { status: DevelopmentMapStory["status"] }>): DevelopmentMapEpic {
	const epic = epics.get(id);
	return { id, title: epic?.title ?? "Catalog 미등록", status: legacyEpics.get(id)?.status ?? "drafted", stories: (stories.get(id) ?? []).map(story => ({
		id: story.id,
		title: story.title,
		status: legacyStories.get(story.id)?.status ?? "drafted",
		relations: Object.freeze({
			run: UNLINKED,
			todo: UNLINKED,
			evidence: Object.freeze({ state: "unknown", references: Object.freeze(evidenceNames.filter(name => name.startsWith(story.id)).sort().map(name => `.www/evidence/${name}`)), nextTransition: "Record an authoritative Story-to-Evidence relation." }),
		}),
	})) };
}
async function readJsonLines(path: string): Promise<Record<string, unknown>[]> {
	const text = await readFile(path, "utf8");
	return text.split(/\r?\n/u).filter(Boolean).map(line => JSON.parse(line) as Record<string, unknown>);
}

function validateCatalog(events: readonly Record<string, unknown>[]): void {
	const epicIds = new Set<string>();
	const storyIds = new Set<string>();
	for (const [index, event] of events.entries()) {
		if (event.revision !== index + 1) throw new Error(`Invalid planning catalog revision at line ${index + 1}`);
		const artifact = objectValue(event.artifact);
		if (event.type === "epic.created") {
			const id = stringValue(artifact.id);
			if (!/^EP-\d{3}$/u.test(id) || !stringValue(artifact.title).trim() || epicIds.has(id)) {
				throw new Error(`Invalid planning Epic at line ${index + 1}`);
			}
			epicIds.add(id);
			continue;
		}
		if (event.type === "story.created") {
			const id = stringValue(artifact.id);
			const epicId = stringValue(artifact.epicId);
			if (!/^ST-\d{3}-\d{2}$/u.test(id) || id.slice(3, 6) !== epicId.slice(3)
				|| !epicIds.has(epicId) || !stringValue(artifact.title).trim() || storyIds.has(id)) {
				throw new Error(`Invalid planning Story at line ${index + 1}`);
			}
			storyIds.add(id);
			continue;
		}
		throw new Error(`Invalid planning catalog event at line ${index + 1}`);
	}
}
async function readInitiatives(planningRoot: string): Promise<InitiativeManifest[]> {
	const entries = await readdir(planningRoot, { withFileTypes: true });
	const manifests: InitiativeManifest[] = [];
	for (const entry of entries) {
		if (!entry.isDirectory() || entry.name === "artifacts") continue;
		const raw = await readFile(join(planningRoot, entry.name, "INITIATIVE.json"), "utf8");
		manifests.push(JSON.parse(raw) as InitiativeManifest);
	}
	return manifests.sort((a, b) => a.id.localeCompare(b.id));
}

function validateInitiatives(manifests: readonly InitiativeManifest[], epics: ReadonlyMap<string, CatalogEpic>): void {
	const ids = new Set<string>();
	for (const manifest of manifests) {
		if (!/^INIT-\d{3}$/u.test(manifest.id) || !manifest.title?.trim() || ids.has(manifest.id)) {
			throw new Error("Invalid or duplicate Initiative manifest");
		}
		ids.add(manifest.id);
		if (!Array.isArray(manifest.artifacts)) throw new Error(`Initiative ${manifest.id} artifacts are required`);
		const artifactIds = new Set<string>();
		for (const artifact of manifest.artifacts) {
			if (!artifact || typeof artifact.id !== "string" || !artifact.id.trim()
				|| !validArtifactIdentity(artifact.kind, artifact.id) || artifactIds.has(artifact.id)) {
				throw new Error(`Invalid or duplicate artifact in Initiative ${manifest.id}`);
			}
			artifactIds.add(artifact.id);
			if (artifact.kind === "epic" && (!/^EP-\d{3}$/u.test(artifact.id) || !epics.has(artifact.id))) {
				throw new Error(`Initiative ${manifest.id} references an unknown Epic`);
			}
		}
	}
}

function validArtifactIdentity(kind: string, id: string): boolean {
	if (kind === "prd") return /^PRD-\d{3}$/u.test(id);
	if (kind === "architecture") return /^ARCH-\d{3}$/u.test(id);
	if (kind === "epic") return /^EP-\d{3}$/u.test(id);
	if (kind === "story") return /^ST-\d{3}-\d{2}$/u.test(id);
	return false;
}
async function readLegacyEpics(path: string): Promise<Map<string, CatalogEpic & { status: string }>> {
	const text = await readFile(path, "utf8").catch(error => isMissing(error) ? "" : Promise.reject(error));
	const epics = new Map<string, CatalogEpic & { status: string }>(); let current: (CatalogEpic & { status: string }) | null = null;
	for (const line of text.split(/\r?\n/u)) {
		const heading = line.match(/^## (EP-\d{3})\s+[—-]\s+(.+)$/u);
		if (heading) { current = { id: heading[1]!, title: heading[2]!.trim(), status: "unknown" }; epics.set(current.id, current); }
		const status = line.match(/^- 상태:\s*(.+)$/u); if (current && status) current.status = status[1]!.trim();
	}
	return epics;
}
async function readLegacyStories(path: string): Promise<Map<string, CatalogStory & { status: DevelopmentMapStory["status"] }>> {
	const text = await readFile(path, "utf8").catch(error => isMissing(error) ? "" : Promise.reject(error));
	const stories = new Map<string, CatalogStory & { status: DevelopmentMapStory["status"] }>();
	for (const match of text.matchAll(/^- \[([ xX])\] (ST-(\d{3})-\d{2})\s+(.+)$/gmu)) stories.set(match[2]!, { id: match[2]!, epicId: `EP-${match[3]!}`, title: match[4]!.trim(), status: match[1] === " " ? "pending" : "legacy-completed" });
	return stories;
}
function objectValue(value: unknown): Record<string, unknown> { return value && typeof value === "object" ? value as Record<string, unknown> : {}; }
function stringValue(value: unknown): string { return typeof value === "string" ? value : ""; }
function numberValue(value: unknown): number { return typeof value === "number" && Number.isFinite(value) ? value : 0; }
function isMissing(error: unknown): boolean { return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "ENOENT"); }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
