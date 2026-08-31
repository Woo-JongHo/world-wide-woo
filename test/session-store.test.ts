import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "bun:test";
import { createSessionId, SessionEventStore } from "../src/infrastructure/session-store.js";

const temporaryDirectories: string[] = [];

async function createStore(): Promise<{ directory: string; store: SessionEventStore }> {
	const directory = join(tmpdir(), `www-session-store-${createSessionId()}`);
	temporaryDirectories.push(directory);
	return { directory, store: new SessionEventStore(directory) };
}

afterEach(async () => {
	await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("SessionEventStore", () => {
	test("serializes concurrent appends with monotonically increasing sequences", async () => {
		const { store } = await createStore();
		const sessionId = createSessionId();
		const appended = await Promise.all(
			Array.from({ length: 20 }, (_, index) =>
				store.append(sessionId, {
					category: "action",
					type: "turn.started",
					status: "pending",
					title: `event ${index}`,
					body: String(index),
				}),
			),
		);

		expect(appended.map((event) => event.sequence)).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
		expect((await store.readAll(sessionId)).map((event) => event.sequence)).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
	});

	test("round-trips event data without alteration", async () => {
		const { directory, store } = await createStore();
		const sessionId = createSessionId();
		const event = await store.append(sessionId, {
			category: "evidence",
			type: "command.output",
			status: "passed",
			title: "한글 제목",
			body: "line one\nline two",
			correlationId: "operation-7",
			metadata: { exitCode: 0, nested: { preserved: true } },
		});

		expect(await store.readAll(sessionId)).toEqual([event]);
		expect(await readFile(join(directory, `${sessionId}.jsonl`), "utf8")).toBe(`${JSON.stringify(event)}\n`);
	});

	test("creates private directories and files", async () => {
		const { directory, store } = await createStore();
		const sessionId = createSessionId();
		await store.append(sessionId, { category: "system", type: "session.started", status: "passed", title: "Created", body: "" });

		expect((await stat(directory)).mode & 0o777).toBe(0o700);
		expect((await stat(join(directory, `${sessionId}.jsonl`))).mode & 0o777).toBe(0o600);
	});

	test("lists stored sessions by most recent update", async () => {
		const { store } = await createStore();
		await store.append("older", { category: "system", type: "session.started", status: "passed", title: "", body: "" });
		await Bun.sleep(5);
		await store.append("newer", { category: "system", type: "session.started", status: "passed", title: "", body: "" });
		expect((await store.list()).map((session) => session.id)).toEqual(["newer", "older"]);
	});

	test("reports the line number for corrupt JSONL", async () => {
		const { directory, store } = await createStore();
		const sessionId = createSessionId();
		await mkdir(directory, { recursive: true, mode: 0o700 });
		const validEvent = {
			schemaVersion: 1,
			id: createSessionId(),
			sessionId,
			sequence: 1,
			timestamp: "2026-01-01T00:00:00.000Z",
			category: "system",
			type: "session.started",
			status: "passed",
			title: "Created",
			body: "",
			correlationId: null,
			turnId: null,
			itemId: null,
			metadata: {},
		};
		await writeFile(join(directory, `${sessionId}.jsonl`), `${JSON.stringify(validEvent)}\n{"id":`, { mode: 0o600 });

		await expect(store.readAll(sessionId)).rejects.toThrow(`line 2 for ${sessionId}`);
		await expect(store.append(sessionId, { category: "system", type: "warning.recorded", status: "failed", title: "", body: "" })).rejects.toThrow(
			`line 2 for ${sessionId}`,
		);
	});
});
