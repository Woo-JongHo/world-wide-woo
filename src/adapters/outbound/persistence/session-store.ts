import { randomUUID } from "node:crypto";

import { chmod, mkdir, open, readFile, readdir, stat } from "node:fs/promises";

import { homedir }       from "node:os";
import { dirname, join } from "node:path";

import {
	SESSION_EVENT_CATEGORIES,
	SESSION_EVENT_STATUSES,
	SESSION_EVENT_TYPES,
} from "@/core/domain/execution/session-events.js";

import type { SessionEvent, SessionEventInput } from "@/core/domain/execution/session-events.js";
import type { RecentSessionSummary }            from "@/core/ports/persistence/session-repository";

const DEFAULT_SESSION_DIRECTORY = join(homedir(), ".local", "share", "www", "sessions");
const sessionIdPattern          = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/** Legacy SessionRuntime 이벤트를 세션별 추가 전용 JSONL로 저장한다. */
export class SessionEventStore {
	private readonly queues       = new Map< string, Promise< unknown > >();
	private readonly nextSequence = new Map< string, number >();

	public constructor( private readonly directory : string = DEFAULT_SESSION_DIRECTORY ) {}

	/** 생략된 correlationId·turnId·itemId는 null, metadata는 빈 객체로 정규화해 저장한다. */
	public append(
		sessionId : string,
		input     : SessionEventInput,
	) : Promise< SessionEvent > {
		return this.serialize(sessionId, async () => {
			let sequence = this.nextSequence.get(sessionId);
			if (sequence === undefined) {
				const events = await this.readAllUnchecked(sessionId);
				sequence = events.length === 0 ? 1 : events[events.length - 1].sequence + 1;
			}
			const event : SessionEvent = {
				schemaVersion : 1,
				id            : randomUUID(),
				sessionId     : sessionId,
				sequence      : sequence,
				timestamp     : new Date().toISOString(),
				category      : input.category,
				type          : input.type,
				status        : input.status,
				title         : input.title,
				body          : input.body,
				correlationId : input.correlationId ?? null,
				turnId        : input.turnId ?? null,
				itemId        : input.itemId ?? null,
				metadata      : input.metadata ?? {},
			};

			await this.appendLine(sessionId, JSON.stringify(event));
			this.nextSequence.set(sessionId, sequence + 1);
			return event;
		});
	}

	/** 세션 파일이 없으면 빈 이벤트 목록을 반환한다. */
	public readAll( sessionId : string ) : Promise< SessionEvent[] > {
		return this.serialize(sessionId, () => this.readAllUnchecked(sessionId));
	}

	/** 저장된 세션의 ID와 파일 수정 시각을 최신순으로 반환한다. */
	public async list() : Promise< RecentSessionSummary[] > {
		const entries = await readdir(this.directory, { withFileTypes: true }).catch((error : unknown) => {
			if (isNodeErrorCode(error, "ENOENT")) return [];
			throw error;
		});
		const sessions = await Promise.all(entries
			.filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
			.map(async (entry) => {
				const info = await stat(join(this.directory, entry.name));
				return {
					id        : entry.name.slice(0, -".jsonl".length),
					updatedAt : info.mtime.toISOString(),
				};
			}));
		return sessions.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
	}

	private serialize< T >(
		sessionId : string,
		operation : () => Promise< T >,
	) : Promise< T > {
		this.assertSessionId(sessionId);
		const previous = this.queues.get(sessionId) ?? Promise.resolve();
		const current  = previous.catch(() => undefined).then(operation);
		const cleanup  = () : void => {
			if (this.queues.get(sessionId) === current) this.queues.delete(sessionId);
		};
		this.queues.set(sessionId, current);
		void current.then(cleanup, cleanup);
		return current;
	}

	private sessionPath( sessionId : string ) : string {
		this.assertSessionId(sessionId);
		return join(this.directory, `${sessionId}.jsonl`);
	}

	private assertSessionId( sessionId : string ) : void {
		if (!sessionIdPattern.test(sessionId)) throw new Error(`Invalid session id: ${sessionId}`);
	}

	private async readAllUnchecked( sessionId : string ) : Promise< SessionEvent[] > {
		const path = this.sessionPath(sessionId);
		let content : string;
		try {
			content = await readFile(path, "utf8");
		} catch (error) {
			if (isNodeErrorCode(error, "ENOENT")) return [];
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

	private parseLine(
		line       : string,
		lineNumber : number,
		sessionId  : string,
	) : SessionEvent {
		let value : unknown;
		try {
			value = JSON.parse(line);
		} catch (error) {
			throw new Error(`Invalid session event JSON at line ${lineNumber} for ${sessionId}: ${errorMessage(error)}`);
		}
		if (!isSessionEvent(value) || value.sessionId !== sessionId) {
			throw new Error(`Invalid session event at line ${lineNumber} for ${sessionId}`);
		}
		return value;
	}

	private async appendLine(
		sessionId : string,
		line      : string,
	) : Promise< void > {
		await mkdir(this.directory, { recursive: true, mode: 0o700 });
		await chmod(this.directory, 0o700);
		const path = this.sessionPath(sessionId);
		const exists = await stat(path).then(() => true).catch((error : unknown) => {
			if (isNodeErrorCode(error, "ENOENT")) return false;
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

function isSessionEvent( value : unknown ) : value is SessionEvent {
	if (!isRecord(value)) return false;
	const event = value;
	return (
		event.schemaVersion === 1 &&
		typeof event.id === "string" &&
		typeof event.sessionId === "string" &&
		typeof event.sequence === "number" &&
		Number.isSafeInteger(event.sequence) &&
		event.sequence > 0 &&
		typeof event.timestamp === "string" &&
		hasStringMember(SESSION_EVENT_CATEGORIES, event.category) &&
		hasStringMember(SESSION_EVENT_TYPES, event.type) &&
		hasStringMember(SESSION_EVENT_STATUSES, event.status) &&
		typeof event.title === "string" &&
		typeof event.body === "string" &&
		(event.correlationId === null || typeof event.correlationId === "string") &&
		(event.turnId === null || typeof event.turnId === "string") &&
		(event.itemId === null || typeof event.itemId === "string") &&
		isRecord(event.metadata)
	);
}

function isRecord    ( value : unknown ) : value is Record< string, unknown > { return typeof value === "object" && value !== null && !Array.isArray(value); }
function errorMessage( error : unknown ) : string                             { return error instanceof Error ? error.message : String(error); }

function hasStringMember( values : readonly string[], value : unknown ) : boolean { return typeof value === "string" && values.includes(value); }
function isNodeErrorCode( error  : unknown,          code   : string  ) : boolean { return (
	typeof error === "object"
	&& error !== null
	&& "code" in error
	&& error.code === code
); }
