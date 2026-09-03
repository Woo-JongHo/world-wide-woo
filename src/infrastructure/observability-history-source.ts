import { readdir, readFile } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { join } from "node:path";
import type { ObservabilityActivityStream, ObservabilityCoverage } from "../domain/observability-dashboard.js";
import type { ProjectActivity } from "../domain/project-activity.js";

export const OBSERVABILITY_HISTORY_STREAM_LIMIT = 64;
export const OBSERVABILITY_HISTORY_ACTIVITY_LIMIT = 5_000;

export interface ObservabilityHistory {
	readonly coverage: ObservabilityCoverage;
	readonly streams: readonly ObservabilityActivityStream[];
}

/** Read-only, bounded discovery of existing ActivityJournalStore JSONL streams. */
export class ObservabilityHistorySource {
	public constructor(
		private readonly activityDirectory: string,
		private readonly limits: { readonly streams?: number; readonly activitiesPerStream?: number } = {},
	) {}

	public async read(): Promise<ObservabilityHistory> {
		const streamLimit = positiveLimit(this.limits.streams, OBSERVABILITY_HISTORY_STREAM_LIMIT);
		const activityLimit = positiveLimit(this.limits.activitiesPerStream, OBSERVABILITY_HISTORY_ACTIVITY_LIMIT);
		let names: string[];
		try { names = await listJsonl(this.activityDirectory); }
		catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyHistory();
			throw error;
		}
		const selected = names.slice(0, streamLimit);
		const streams = await Promise.all(selected.map(name => this.readStream(name, activityLimit)));
		const activities = streams.flatMap(stream => stream.activities);
		const observed = activities.map(activity => activity.recordedAt).filter(isTimestamp).sort();
		const malformed = streams.some(stream => (stream.malformedLines ?? 0) > 0);
		return Object.freeze({
			coverage: Object.freeze({ state: streams.length === 0 ? "unknown" : malformed || names.length > selected.length ? "partial-local-journal" : "observed", observedFrom: observed[0] ?? null, observedUntil: observed.at(-1) ?? null, streamsRead: streams.length, skippedStreams: names.length - selected.length }),
			streams: Object.freeze(streams),
		});
	}

	private async readStream(name: string, activityLimit: number): Promise<ObservabilityActivityStream> {
		const content = await readFile(join(this.activityDirectory, name), "utf8");
		const complete = content.endsWith("\n") ? content.slice(0, -1).split("\n") : content.slice(0, Math.max(0, content.lastIndexOf("\n"))).split("\n");
		let malformedLines = content.endsWith("\n") ? 0 : content.length > 0 ? 1 : 0;
		const activities: ProjectActivity[] = [];
		for (const line of complete) {
			if (!line) continue;
			try {
				const value: unknown = JSON.parse(line);
				if (isProjectActivity(value)) activities.push(value);
				else malformedLines += 1;
			} catch { malformedLines += 1; }
		}
		const retained = activities.sort((left, right) => left.sequence - right.sequence || left.recordedAt.localeCompare(right.recordedAt)).slice(-activityLimit);
		if (activities.length > retained.length) malformedLines += 1;
		return Object.freeze({ streamId: name.slice(0, -".jsonl".length), activities: Object.freeze(retained), malformedLines });
	}
}

function emptyHistory(): ObservabilityHistory {
	return Object.freeze({ coverage: Object.freeze({ state: "unknown", observedFrom: null, observedUntil: null, streamsRead: 0, skippedStreams: 0 }), streams: Object.freeze([]) });
}
async function listJsonl(directory: string, prefix = ""): Promise<string[]> {
	const entries: Dirent<string>[] = await readdir(directory, { encoding: "utf8", withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const relative = prefix ? join(prefix, entry.name) : entry.name;
		if (entry.isDirectory()) files.push(...await listJsonl(join(directory, entry.name), relative));
		else if (entry.isFile() && entry.name.endsWith(".jsonl")) files.push(relative);
	}
	return files.sort();
}
function positiveLimit(value: number | undefined, fallback: number): number {
	return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}
function isTimestamp(value: string): boolean { return Number.isFinite(Date.parse(value)); }
function isProjectActivity(value: unknown): value is ProjectActivity {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const activity = value as Record<string, unknown>;
	return activity.schemaVersion === 1 && typeof activity.id === "string" && typeof activity.projectId === "string" && typeof activity.sequence === "number" && Number.isSafeInteger(activity.sequence) && activity.sequence > 0 && typeof activity.recordedAt === "string" && typeof activity.kind === "string" && typeof activity.phase === "string" && typeof activity.provider === "string" && record(activity.nativeRefs) && typeof activity.sourceDigest === "string" && record(activity.payload);
}
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
