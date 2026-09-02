import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, open, readFile, stat, truncate } from "node:fs/promises";
import { join } from "node:path";
import {
	PROJECT_ACTIVITY_KINDS,
	PROJECT_ACTIVITY_PHASES,
	isTerminalActivityPhase,
	type ProjectActivity,
	type ProjectActivityAppendResult,
	type ProjectActivityInput,
} from "../domain/project-activity.js";

const projectIdPattern = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const sha256Pattern = /^sha256:[a-f0-9]{64}$/;
const threadJournalKeyPattern = /^native-[a-f0-9]{48}$/;

export function digestActivitySource(source: string | Uint8Array): string {
	return `sha256:${createHash("sha256").update(source).digest("hex")}`;
}

/** Stable v1 stream name for one opaque native thread; no lookup map is used. */
export function nativeThreadJournalKey(threadId: string): string {
	if (typeof threadId !== "string" || !threadId.trim()) throw new Error("Native thread id is required for activity journal");
	return `native-${digestActivitySource(threadId).slice("sha256:".length, "sha256:".length + 48)}`;
}

export class ActivityJournalStore {
	public constructor(private readonly directory: string) {}

	public append(input: ProjectActivityInput): Promise<ProjectActivityAppendResult> {
		return this.serialize(input.projectId, async () => {
			this.assertInput(input);
			const state = await this.cachedState(input.projectId);
			if (isTerminalActivityPhase(input.phase)) {
				const duplicate = state.terminalObservations.get(terminalObservationKey(input));
				if (duplicate) return { activity: duplicate, appended: false };
			}

			const sequence = state.activities.length === 0 ? 1 : state.activities[state.activities.length - 1].sequence + 1;
			const activity: ProjectActivity = {
				schemaVersion: 1,
				id: randomUUID(),
				projectId: input.projectId,
				sequence,
				recordedAt: new Date().toISOString(),
				kind: input.kind,
				phase: input.phase,
				provider: input.provider,
				nativeRefs: input.nativeRefs,
				sourceDigest: input.sourceDigest,
				payload: input.payload,
			};
			const line = JSON.stringify(activity);
			await this.appendLine(input.projectId, line, state.fileSize > 0);
			state.activities.push(activity);
			state.fileSize += Buffer.byteLength(line, "utf8") + 1;
			if (isTerminalActivityPhase(activity.phase)) {
				state.terminalObservations.set(terminalObservationKey(activity), activity);
			}
			return { activity, appended: true };
		});
	}

	public readAll(projectId: string): Promise<ProjectActivity[]> {
		return this.serialize(projectId, () => this.readAllUnchecked(projectId));
	}

	/** Validates the deterministic stream key used by thread-bound composition. */
	public static assertNativeThreadJournalKey(key: string): void {
		if (!threadJournalKeyPattern.test(key)) throw new Error("Invalid native thread journal key");
	}

	private serialize<T>(projectId: string, operation: () => Promise<T>): Promise<T> {
		this.assertProjectId(projectId);
		const key = this.projectPath(projectId);
		const previous = queues.get(key) ?? Promise.resolve();
		const current = previous.catch(() => undefined).then(operation);
		queues.set(key, current);
		void current.finally(() => {
			if (queues.get(key) === current) queues.delete(key);
		}).catch(() => undefined);
		return current;
	}

	private async cachedState(projectId: string): Promise<JournalState> {
		const path = this.projectPath(projectId);
		const cached = journalStates.get(path);
		const fileSize = await stat(path).then((value) => value.size).catch((error: NodeJS.ErrnoException) => {
			if (error.code === "ENOENT") return 0;
			throw error;
		});
		if (cached && cached.fileSize === fileSize) return cached;
		const state = await this.loadState(projectId, true);
		journalStates.set(path, state);
		return state;
	}

	private async readAllUnchecked(projectId: string): Promise<ProjectActivity[]> {
		const state = await this.loadState(projectId, false);
		journalStates.set(this.projectPath(projectId), state);
		return [...state.activities];
	}

	private async loadState(projectId: string, discardCrashResidue: boolean): Promise<JournalState> {
		let content: Buffer;
		try {
			content = await readFile(this.projectPath(projectId));
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return createJournalState([], 0);
			throw error;
		}

		const hasTerminatingNewline = content.length === 0 || content[content.length - 1] === 0x0a;
		const finalNewline = hasTerminatingNewline ? content.length - 1 : content.lastIndexOf(0x0a);
		const validBytes = hasTerminatingNewline ? content.length : finalNewline + 1;
		const lines = content.subarray(0, validBytes).toString("utf8").split("\n");
		if (hasTerminatingNewline) lines.pop();
		else if (lines[lines.length - 1] === "") lines.pop();

		const activities = lines.map((line, index) => this.parseLine(line, index + 1, projectId));
		for (const [index, activity] of activities.entries()) {
			if (activity.sequence !== index + 1) {
				throw new Error(`Invalid project activity sequence at line ${index + 1} for ${projectId}`);
			}
		}
		if (discardCrashResidue && validBytes !== content.length) {
			await truncate(this.projectPath(projectId), validBytes);
		}
		return createJournalState(activities, validBytes);
	}

	private parseLine(line: string, lineNumber: number, projectId: string): ProjectActivity {
		let value: unknown;
		try {
			value = JSON.parse(line);
		} catch (error) {
			throw new Error(`Invalid project activity JSON at line ${lineNumber} for ${projectId}: ${(error as Error).message}`);
		}
		if (!isProjectActivity(value) || value.projectId !== projectId) {
			throw new Error(`Invalid project activity at line ${lineNumber} for ${projectId}`);
		}
		return value;
	}

	private assertInput(input: ProjectActivityInput): void {
		this.assertProjectId(input.projectId);
		if (!input.provider.trim()) throw new Error("Project activity provider is required");
		if (!sha256Pattern.test(input.sourceDigest)) throw new Error("Project activity sourceDigest must be a sha256 digest");
	}

	private assertProjectId(projectId: string): void {
		if (!projectIdPattern.test(projectId)) throw new Error(`Invalid project id: ${projectId}`);
	}

	private projectPath(projectId: string): string {
		this.assertProjectId(projectId);
		return join(this.directory, `${projectId}.jsonl`);
	}

	private async appendLine(projectId: string, line: string, exists: boolean): Promise<void> {
		await mkdir(this.directory, { recursive: true, mode: 0o700 });
		await chmod(this.directory, 0o700);
		const path = this.projectPath(projectId);
		const handle = await open(path, "a", 0o600);
		try {
			if (!exists) await chmod(path, 0o600);
			await handle.write(`${line}\n`);
			await handle.sync();
		} finally {
			await handle.close();
		}
	}
}

interface JournalState {
	activities: ProjectActivity[];
	fileSize: number;
	terminalObservations: Map<string, ProjectActivity>;
}

const queues = new Map<string, Promise<unknown>>();
const journalStates = new Map<string, JournalState>();

function createJournalState(activities: ProjectActivity[], fileSize: number): JournalState {
	const terminalObservations = new Map<string, ProjectActivity>();
	for (const activity of activities) {
		if (isTerminalActivityPhase(activity.phase)) {
			terminalObservations.set(terminalObservationKey(activity), activity);
		}
	}
	return { activities, fileSize, terminalObservations };
}

function terminalObservationKey(input: ProjectActivity | ProjectActivityInput): string {
	return JSON.stringify([
		input.kind,
		input.phase,
		input.provider,
		input.sourceDigest,
		nativeRefKey(input.nativeRefs),
	]);
}

function nativeRefKey(refs: ProjectActivity["nativeRefs"]): string {
	return JSON.stringify([
		refs.threadId ?? null,
		refs.turnId ?? null,
		refs.itemId ?? null,
		refs.approvalRequestId ?? refs.approvalId ?? null,
		refs.approvalCallbackId ?? null,
	]);
}

function isProjectActivity(value: unknown): value is ProjectActivity {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const activity = value as Record<string, unknown>;
	return (
		activity.schemaVersion === 1 &&
		typeof activity.id === "string" &&
		typeof activity.projectId === "string" &&
		typeof activity.sequence === "number" &&
		Number.isSafeInteger(activity.sequence) &&
		activity.sequence > 0 &&
		typeof activity.recordedAt === "string" &&
		typeof activity.kind === "string" &&
		(PROJECT_ACTIVITY_KINDS as readonly string[]).includes(activity.kind) &&
		typeof activity.phase === "string" &&
		(PROJECT_ACTIVITY_PHASES as readonly string[]).includes(activity.phase) &&
		typeof activity.provider === "string" &&
		isRecord(activity.nativeRefs) &&
		typeof activity.sourceDigest === "string" &&
		sha256Pattern.test(activity.sourceDigest) &&
		isRecord(activity.payload)
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}
