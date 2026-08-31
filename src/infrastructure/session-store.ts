import { chmod, mkdir, open, readFile, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import {
	SESSION_EVENT_CATEGORIES,
	SESSION_EVENT_STATUSES,
	SESSION_EVENT_TYPES,
	type SessionEvent,
	type SessionEventInput,
} from "../domain/session-events.js";

const DEFAULT_SESSION_DIRECTORY = join(homedir(), ".local", "share", "www", "sessions");
const sessionIdPattern = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

export function createSessionId(): string {
	return randomUUID();
}

export interface StoredSession {
	id: string;
	updatedAt: string;
	size: number;
}

export class SessionEventStore {
	private readonly queues = new Map<string, Promise<unknown>>();
	private readonly nextSequence = new Map<string, number>();

	public constructor(private readonly directory = DEFAULT_SESSION_DIRECTORY) {}

	public append(sessionId: string, input: SessionEventInput): Promise<SessionEvent> {
		return this.serialize(sessionId, async () => {
			let sequence = this.nextSequence.get(sessionId);
			if (sequence === undefined) {
				const events = await this.readAllUnchecked(sessionId);
				sequence = events.length === 0 ? 1 : events[events.length - 1].sequence + 1;
			}
			const event: SessionEvent = {
				schemaVersion: 1,
				id: randomUUID(),
				sessionId,
				sequence,
				timestamp: new Date().toISOString(),
				category: input.category,
				type: input.type,
				status: input.status,
				title: input.title,
				body: input.body,
				correlationId: input.correlationId ?? null,
				turnId: input.turnId ?? null,
				itemId: input.itemId ?? null,
				metadata: input.metadata ?? {},
			};

			await this.appendLine(sessionId, JSON.stringify(event));
			this.nextSequence.set(sessionId, sequence + 1);
			return event;
		});
	}

	public readAll(sessionId: string): Promise<SessionEvent[]> {
		return this.serialize(sessionId, () => this.readAllUnchecked(sessionId));
	}

	public async list(): Promise<StoredSession[]> {
		let entries;
		try {
			entries = await readdir(this.directory, { withFileTypes: true });
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
			throw error;
		}
		const sessions = await Promise.all(entries
			.filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
			.map(async (entry) => {
				const info = await stat(join(this.directory, entry.name));
				return {
					id: entry.name.slice(0, -".jsonl".length),
					updatedAt: info.mtime.toISOString(),
					size: info.size,
				};
			}));
		return sessions.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
	}

	private serialize<T>(sessionId: string, operation: () => Promise<T>): Promise<T> {
		this.assertSessionId(sessionId);
		const previous = this.queues.get(sessionId) ?? Promise.resolve();
		const current = previous.catch(() => undefined).then(operation);
		this.queues.set(sessionId, current);
		void current.then(
			() => {
				if (this.queues.get(sessionId) === current) this.queues.delete(sessionId);
			},
			() => {
				if (this.queues.get(sessionId) === current) this.queues.delete(sessionId);
			},
		);
		return current;
	}

	private sessionPath(sessionId: string): string {
		this.assertSessionId(sessionId);
		return join(this.directory, `${sessionId}.jsonl`);
	}

	private assertSessionId(sessionId: string): void {
		if (!sessionIdPattern.test(sessionId)) throw new Error(`Invalid session id: ${sessionId}`);
	}

	private async readAllUnchecked(sessionId: string): Promise<SessionEvent[]> {
		const path = this.sessionPath(sessionId);
		let content: string;
		try {
			content = await readFile(path, "utf8");
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
			throw error;
		}

		const lines = content.split("\n");
		if (lines[lines.length - 1] === "") lines.pop();
		const events = lines.map((line, index) => this.parseLine(line, index + 1, sessionId));
		for (const [index, event] of events.entries()) {
			if (event.sequence !== index + 1) {
				throw new Error(`Invalid session event sequence at line ${index + 1} for ${sessionId}`);
			}
		}
		return events;
	}

	private parseLine(line: string, lineNumber: number, sessionId: string): SessionEvent {
		let value: unknown;
		try {
			value = JSON.parse(line);
		} catch (error) {
			throw new Error(`Invalid session event JSON at line ${lineNumber} for ${sessionId}: ${(error as Error).message}`);
		}
		if (!isSessionEvent(value) || value.sessionId !== sessionId) {
			throw new Error(`Invalid session event at line ${lineNumber} for ${sessionId}`);
		}
		return value;
	}

	private async appendLine(sessionId: string, line: string): Promise<void> {
		await mkdir(this.directory, { recursive: true, mode: 0o700 });
		await chmod(this.directory, 0o700);
		const path = this.sessionPath(sessionId);
		const exists = await stat(path).then(() => true).catch((error: NodeJS.ErrnoException) => {
			if (error.code === "ENOENT") return false;
			throw error;
		});
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

function isSessionEvent(value: unknown): value is SessionEvent {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const event = value as Record<string, unknown>;
	return (
		event.schemaVersion === 1 &&
		typeof event.id === "string" &&
		typeof event.sessionId === "string" &&
		typeof event.sequence === "number" &&
		Number.isSafeInteger(event.sequence) &&
		event.sequence > 0 &&
		typeof event.timestamp === "string" &&
		typeof event.category === "string" &&
		(SESSION_EVENT_CATEGORIES as readonly string[]).includes(event.category) &&
		typeof event.type === "string" &&
		(SESSION_EVENT_TYPES as readonly string[]).includes(event.type) &&
		typeof event.status === "string" &&
		(SESSION_EVENT_STATUSES as readonly string[]).includes(event.status) &&
		typeof event.title === "string" &&
		typeof event.body === "string" &&
		(event.correlationId === null || typeof event.correlationId === "string") &&
		(event.turnId === null || typeof event.turnId === "string") &&
		(event.itemId === null || typeof event.itemId === "string") &&
		!!event.metadata &&
		typeof event.metadata === "object" &&
		!Array.isArray(event.metadata)
	);
}
