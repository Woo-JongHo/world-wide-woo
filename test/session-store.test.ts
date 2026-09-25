import { randomUUID }                           from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join }                                 from "node:path";
import { tmpdir }                               from "node:os";
import { afterEach, describe, expect, test }    from "bun:test";
import { SessionEventStore }                    from "../src/adapters/outbound/persistence/session-store.js";

const temporaryDirectories: string[] = [];

async function createStore(): Promise<{ directory: string; store: SessionEventStore }> {
	const directory = join(tmpdir(), `www-session-store-${randomUUID()}`);
	temporaryDirectories.push(directory);
	return { directory, store: new SessionEventStore(directory) };
}

function storedEvent(sessionId: string) {
	return {
		schemaVersion: 1,
		id: randomUUID(),
		sessionId,
		sequence      : 1,
		timestamp     : "2026-01-01T00:00:00.000Z",
		category      : "system",
		type          : "session.started",
		status        : "passed",
		title         : "Created",
		body          : "",
		correlationId : null,
		turnId        : null,
		itemId        : null,
		metadata      : {},
	};
}

afterEach(async () => {
	await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("SessionEventStore", () => {
	test("serializes concurrent appends with monotonically increasing sequences", async () => {
		const { store } = await createStore();
		const sessionId = randomUUID();
		const appended = await Promise.all(
			Array.from({ length: 20 }, (_, index) =>
				store.append(sessionId, {
					category : "action",
					type     : "turn.started",
					status   : "pending",
					title    : `event ${index}`,
					body     : String(index),
				}),
			),
		);

		expect(appended[0]).toMatchObject({
			correlationId : null,
			turnId        : null,
			itemId        : null,
			metadata      : {},
		});
		expect(appended.map((event) => event.sequence)).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
		expect((await store.readAll(sessionId)).map((event) => event.sequence)).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
	});

	test("round-trips event data without alteration", async () => {
		const { directory, store } = await createStore();
		const sessionId = randomUUID();
		const event = await store.append(sessionId, {
			category      : "evidence",
			type          : "command.output",
			status        : "passed",
			title         : "한글 제목",
			body          : "line one\nline two",
			correlationId : "operation-7",
			metadata      : { exitCode: 0, nested: { preserved: true } },
		});

		expect(await store.readAll(sessionId)).toEqual([event]);
		expect(await readFile(join(directory, `${sessionId}.jsonl`), "utf8")).toBe(`${JSON.stringify(event)}\n`);
	});

	test("creates private directories and files", async () => {
		const { directory, store } = await createStore();
		const sessionId = randomUUID();
		await store.append(sessionId, { category: "system", type: "session.started", status: "passed", title: "Created", body: "" });

		if (process.platform !== "win32") {
			expect((await stat(directory)).mode & 0o777).toBe(0o700);
			expect((await stat(join(directory, `${sessionId}.jsonl`))).mode & 0o777).toBe(0o600);
		}
	});

	test("lists stored sessions by most recent update", async () => {
		const { store } = await createStore();
		await store.append("older", { category: "system", type: "session.started", status: "passed", title: "", body: "" });
		await Bun.sleep(5);
		await store.append("newer", { category: "system", type: "session.started", status: "passed", title: "", body: "" });
		const sessions = await store.list();
		expect(sessions.map((session) => session.id)).toEqual(["newer", "older"]);
		expect(sessions.map((session) => Object.keys(session))).toEqual([
			["id", "updatedAt"],
			["id", "updatedAt"],
		]);
	});

	test("returns an empty list when the session directory is missing", async () => {
		const { store } = await createStore();
		expect(await store.list()).toEqual([]);
	});

	test("rethrows filesystem errors other than a missing directory", async () => {
		const { directory, store } = await createStore();
		await writeFile(directory, "not a directory");
		await expect(store.list()).rejects.toMatchObject({ code: "ENOTDIR" });
	});

	test("reports the line number for corrupt JSONL", async () => {
		const { directory, store } = await createStore();
		const sessionId = randomUUID();
		await mkdir(directory, { recursive: true, mode: 0o700 });
		const validEvent = storedEvent(sessionId);
		await writeFile(join(directory, `${sessionId}.jsonl`), `${JSON.stringify(validEvent)}\n{"id":`, { mode: 0o600 });

		await expect(store.readAll(sessionId)).rejects.toThrow(`line 2 for ${sessionId}`);
		await expect(store.append(sessionId, { category: "system", type: "warning.recorded", status: "failed", title: "", body: "" })).rejects.toThrow(
			`line 2 for ${sessionId}`,
		);
	});

	test("rejects valid JSON with an invalid event category or metadata shape", async () => {
		const { directory, store } = await createStore();
		const sessionId = randomUUID();
		const path = join(directory, `${sessionId}.jsonl`);
		await mkdir(directory, { recursive: true, mode: 0o700 });

		await writeFile(path, `${JSON.stringify({ ...storedEvent(sessionId), category: "invalid" })}\n`, { mode: 0o600 });
		await expect(store.readAll(sessionId)).rejects.toThrow(`Invalid session event at line 1 for ${sessionId}`);

		await writeFile(path, `${JSON.stringify({ ...storedEvent(sessionId), metadata: [] })}\n`, { mode: 0o600 });
		await expect(store.readAll(sessionId)).rejects.toThrow(`Invalid session event at line 1 for ${sessionId}`);
	});
});
