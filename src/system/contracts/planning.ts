export interface PlanningEpic {
	readonly id: string;
	readonly title: string;
	readonly goal: string;
	readonly createdAt: string;
}

export interface PlanningStory {
	readonly id: string;
	readonly epicId: string;
	readonly title: string;
	readonly acceptance: string;
	readonly createdAt: string;
	readonly supersedes: string | null;
}

export interface PlanningSnapshot {
	readonly revision: number;
	readonly epics: readonly PlanningEpic[];
	readonly stories: readonly PlanningStory[];
}

export const EPIC_ID = /^EP-\d{3}$/;
export const STORY_ID = /^ST-\d{3}-\d{2}$/;

export function sanitizePlanningText(value: string, maximumCodePoints: number): string {
	if (typeof value !== "string") throw new Error("Planning text must be a string");
	const cleaned = value
		.replace(/\x1B(?:\[[0-?]*[ -/]*[@-~]|\][\s\S]*?(?:\x07|\x1B\\))/g, "")
		.replace(/<!--[\s\S]*?-->/g, "")
		.replace(/[\x00-\x1F\x7F-\x9F]/g, " ")
		.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
		.replace(/\b(?:authorization|api[_-]?key|access[_-]?token|token|secret|password|credential)\b\s*(?:=|:)\s*(?:"[^"]*"|'[^']*'|[^\s,;"']+)/gi, "[redacted]")
		.replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[redacted]")
		.replace(/\b(?:gh[pousr]_[A-Za-z0-9_]{8,}|github_pat_[A-Za-z0-9_]{8,})\b/g, "[redacted]")
		.replace(/\bAIza[A-Za-z0-9_-]{20,}\b/g, "[redacted]")
		.replace(/\bAKIA[0-9A-Z]{16}\b/g, "[redacted]")
		.replace(/\s+/g, " ")
		.trim();
	return Array.from(cleaned).slice(0, maximumCodePoints).join("");
}

export function createPlanningSnapshot(revision: number, epics: readonly PlanningEpic[], stories: readonly PlanningStory[]): PlanningSnapshot {
	if (!Number.isSafeInteger(revision) || revision < 0) throw new Error("Invalid planning revision");
	const snapshot = { revision, epics: epics.map(freezeEpic), stories: stories.map(freezeStory) };
	validatePlanningSnapshot(snapshot);
	return Object.freeze({
		revision,
		epics: Object.freeze(snapshot.epics),
		stories: Object.freeze(snapshot.stories),
	});
}

export function validatePlanningSnapshot(snapshot: Pick<PlanningSnapshot, "revision" | "epics" | "stories">): void {
	const epics = new Set<string>();
	for (const epic of snapshot.epics) {
		if (!EPIC_ID.test(epic.id) || epics.has(epic.id)) throw new Error("Invalid or duplicate planning epic ID");
		epics.add(epic.id);
		validateText(epic.title, 120); validateText(epic.goal, 500); validateDate(epic.createdAt);
	}
	const stories = new Map<string, PlanningStory>();
	for (const story of snapshot.stories) {
		if (!STORY_ID.test(story.id) || stories.has(story.id)) throw new Error("Invalid or duplicate planning story ID");
		if (!epics.has(story.epicId)) throw new Error(`Planning story parent epic does not exist: ${story.epicId}`);
		if (!story.id.startsWith(`ST-${story.epicId.slice(3)}-`)) throw new Error(`Planning story ID does not match epic: ${story.id}`);
		validateText(story.title, 120); validateText(story.acceptance, 500); validateDate(story.createdAt);
		stories.set(story.id, story);
	}
	for (const [index, story] of snapshot.stories.entries()) {
		if (story.supersedes === null) continue;
		const target = stories.get(story.supersedes);
		const targetIndex = snapshot.stories.findIndex(candidate => candidate.id === story.supersedes);
		if (!target || target.epicId !== story.epicId || target.id === story.id || targetIndex >= index) {
			throw new Error(`Invalid planning story supersedes relation: ${story.id}`);
		}
	}
	for (const story of snapshot.stories) {
		const seen = new Set<string>(); let current: PlanningStory | undefined = story;
		while (current?.supersedes !== null && current !== undefined) {
			if (seen.has(current.id)) throw new Error("Planning story supersedes cycle");
			seen.add(current.id); current = stories.get(current.supersedes);
		}
	}
}

function validateText(value: string, limit: number): void {
	if (typeof value !== "string" || value !== sanitizePlanningText(value, limit)) throw new Error("Unsafe or invalid planning text");
}
function validateDate(value: string): void { if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new Error("Invalid planning timestamp"); }
function freezeEpic(epic: PlanningEpic): PlanningEpic { return Object.freeze({ ...epic }); }
function freezeStory(story: PlanningStory): PlanningStory { return Object.freeze({ ...story }); }
