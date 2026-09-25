import { afterEach, describe, expect, test }          from "bun:test";
import { appendFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join }                                       from "node:path";
import { tmpdir }                                     from "node:os";
import {
	ActivityJournalStore,
	digestActivitySource,
	nativeThreadJournalKey,
} from "../src/adapters/outbound/persistence/activity-journal-store.js";

const temporaryDirectories: string[] = [];

function createStore(): { directory: string; store: ActivityJournalStore } {
	const directory = join(tmpdir(), `www-activity-${crypto.randomUUID()}`);
	temporaryDirectories.push(directory);
	return { directory, store: new ActivityJournalStore(directory) };
}

function activityLine(input: {
	projectId : string ;
	sequence  : number ;
	source    : string ;
}): string {
	return JSON.stringify({
		schemaVersion : 1,
		id            : crypto.randomUUID(),
		projectId     : input.projectId,
		sequence      : input.sequence,
		recordedAt    : new Date().toISOString(),
		kind          : "progress",
		phase         : "updated",
		provider      : "openai-codex",
		nativeRefs    : {},
		sourceDigest  : digestActivitySource(input.source),
		payload       : { source: input.source },
	});
}

afterEach(async () => {
	await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("ActivityJournalStore", () => {
	test("appends monotonic project observations and deduplicates a repeated native terminal observation", async () => {
		const { store } = createStore();
		const sourceDigest = digestActivitySource('{"method":"item/completed","itemId":"item-1"}');
		const inputs = Array.from({ length: 8 }, (_, index) => ({
			projectId    : "project-1",
			kind         : "progress" as const,
			phase        : "updated" as const,
			provider     : "openai-codex",
			nativeRefs   : { threadId: "thread-1", turnId: "turn-1", itemId: `item-${index}` },
			sourceDigest : digestActivitySource(`progress-${index}`),
			payload      : { index },
		}));
		const appended = await Promise.all(inputs.map((input) => store.append(input)));
		expect(appended.map((result) => result.activity.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

		const terminal = {
			projectId  : "project-1",
			kind       : "tool" as const,
			phase      : "completed" as const,
			provider   : "openai-codex",
			nativeRefs : { threadId: "thread-1", turnId: "turn-1", itemId: "item-1" },
			sourceDigest,
			payload: { exitCode: 0 },
		};
		const first = await store.append(terminal);
		const duplicate = await store.append(terminal);
		expect(first.appended).toBe(true);
		expect(duplicate).toEqual({ activity: first.activity, appended: false });
		expect((await store.readAll("project-1")).map((activity) => activity.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
		expect(first.activity).toMatchObject({
			provider: "openai-codex",
			nativeRefs: { threadId: "thread-1", turnId: "turn-1", itemId: "item-1" },
			sourceDigest,
		});
	});

	test("discards only an unterminated final crash residue and rejects middle corruption or sequence gaps", async () => {
		const { directory, store } = createStore();
		await store.append({
			projectId    : "recoverable",
			kind         : "message",
			phase        : "completed",
			provider     : "openai-codex",
			nativeRefs   : { threadId: "thread-1", turnId: "turn-1", itemId: "message-1" },
			sourceDigest : digestActivitySource("message-1"),
			payload      : { text: "done" },
		});
		await appendFile(join(directory, "recoverable.jsonl"), '{"schemaVersion":1');
		expect(await store.readAll("recoverable")).toHaveLength(1);
		await store.append({
			projectId    : "recoverable",
			kind         : "progress",
			phase        : "updated",
			provider     : "openai-codex",
			nativeRefs   : { threadId: "thread-1", turnId: "turn-2" },
			sourceDigest : digestActivitySource("turn-2"),
			payload      : {},
		});
		expect(await store.readAll("recoverable")).toHaveLength(2);
		expect(await readFile(join(directory, "recoverable.jsonl"), "utf8")).toContain('"sequence":2');

		await mkdir(directory, { recursive: true });
		await writeFile(join(directory, "corrupt.jsonl"), "not-json\n{}\n");
		await expect(store.readAll("corrupt")).rejects.toThrow("line 1 for corrupt");

		const valid = (sequence: number) => JSON.stringify({
			schemaVersion : 1,
			id            : crypto.randomUUID(),
			projectId     : "gap",
			sequence,
			recordedAt   : new Date().toISOString(),
			kind         : "progress",
			phase        : "updated",
			provider     : "openai-codex",
			nativeRefs   : {},
			sourceDigest : digestActivitySource(String(sequence)),
			payload      : {},
		});
		await writeFile(join(directory, "gap.jsonl"), `${valid(1)}\n${valid(3)}\n`);
		await expect(store.readAll("gap")).rejects.toThrow("sequence at line 2 for gap");
	});

	test("shares one monotonic append stream across store instances for the same journal", async () => {
		const { directory, store: firstStore } = createStore();
		const secondStore = new ActivityJournalStore(directory);
		const results = await Promise.all(Array.from({ length: 40 }, (_, index) => {
			const store = index % 2 === 0 ? firstStore : secondStore;
			return store.append({
				projectId    : "shared",
				kind         : "progress",
				phase        : "updated",
				provider     : "openai-codex",
				nativeRefs   : { threadId: `thread-${index % 2}`, itemId: `item-${index}` },
				sourceDigest : digestActivitySource(`shared-${index}`),
				payload      : { index },
			});
		}));
		expect(results.map((result) => result.activity.sequence)).toEqual(Array.from({ length: 40 }, (_, index) => index + 1));
		expect((await secondStore.readAll("shared")).map((activity) => activity.sequence)).toEqual(
			Array.from({ length: 40 }, (_, index) => index + 1),
		);
	});

	test("does not re-read and parse the complete journal on every append", async () => {
		const { store } = createStore();
		const input = (index: number) => ({
			projectId    : "cached",
			kind         : "progress" as const,
			phase        : "updated" as const,
			provider     : "openai-codex",
			nativeRefs   : { itemId: `item-${index}` },
			sourceDigest : digestActivitySource(`cached-${index}`),
			payload      : { index, text: "x".repeat(4_096) },
		});
		for (let index = 0; index < 100; index += 1) await store.append(input(index));

		const originalParse = JSON.parse;
		let historicalRecordParses = 0;
		JSON.parse = ((text: string, reviver?: (this: unknown, key: string, value: unknown) => unknown) => {
			if (text.includes('\"projectId\":\"cached\"')) historicalRecordParses += 1;
			return originalParse(text, reviver);
		}) as typeof JSON.parse;
		try {
			for (let index = 100; index < 200; index += 1) await store.append(input(index));
		} finally {
			JSON.parse = originalParse;
		}

		expect(historicalRecordParses).toBe(0);
		expect((await store.readAll("cached")).at(-1)?.sequence).toBe(200);
	});

	test("reports a project-scoped Session Read cache hit with its retained journal size", async () => {
		const { directory, store } = createStore();
		const input = (source: string) => ({
			projectId    : "session-read",
			kind         : "progress" as const,
			phase        : "updated" as const,
			provider     : "openai-codex",
			nativeRefs   : {},
			sourceDigest : digestActivitySource(source),
			payload      : { source },
		});
		await store.append(input("first"));
		await store.append(input("second"));
		expect((await store.readAll("session-read")).map(activity => activity.sequence)).toEqual([1, 2]);

		const telemetry = store.cacheTelemetry("session-read");
		expect(telemetry).toMatchObject({
			projectId    : "session-read",
			state        : "ready",
			entries      : 2,
			logicalBytes : Buffer.byteLength(await readFile(join(directory, "session-read.jsonl"))),
			hits         : 2,
			misses       : 1,
			reloads      : 0,
			evictions    : 0,
		});
		expect(telemetry.lastAccessedAt).toEqual(expect.any(String));
	});

	test("reloads a changed project journal without attributing it to another session", async () => {
		const { directory, store } = createStore();
		await store.append({
			projectId: "reloaded", kind: "progress", phase: "updated", provider: "openai-codex",
			nativeRefs: {}, sourceDigest: digestActivitySource("first"), payload: { source: "first" },
		});
		await appendFile(join(directory, "reloaded.jsonl"), `${activityLine({ projectId: "reloaded", sequence: 2, source: "external" })}\n`);

		expect((await store.readAll("reloaded")).map(activity => activity.sequence)).toEqual([1, 2]);
		expect(store.cacheTelemetry("reloaded")).toMatchObject({
			state: "ready", entries: 2, hits: 0, misses: 2, reloads: 1, evictions: 0,
		});
		expect(store.cacheTelemetry("other-session")).toEqual({
			projectId: "other-session", state: "unobserved", entries: null, logicalBytes: null,
			hits: null, misses: null, reloads: null, evictions: null, lastAccessedAt: null,
		});
	});

	test("evicts only the least-recently-used session cache state and retains its scoped eviction telemetry", async () => {
		const { directory } = createStore();
		const store = new ActivityJournalStore(directory, { maxCachedStates: 1 });
		for (const projectId of ["first-session", "second-session"]) {
			await store.append({
				projectId, kind: "progress", phase: "updated", provider: "openai-codex",
				nativeRefs: {}, sourceDigest: digestActivitySource(projectId), payload: {},
			});
		}

		expect(store.cacheTelemetry("first-session")).toMatchObject({
			projectId: "first-session", state: "stale", entries: null, logicalBytes: null,
			hits: 0, misses: 1, reloads: 0, evictions: 1,
		});
		expect(store.cacheTelemetry("second-session")).toMatchObject({
			projectId: "second-session", state: "ready", entries: 1,
			hits: 0, misses: 1, reloads: 0, evictions: 0,
		});
	});

	test("replays a native-thread stream in a fresh store and still rejects a durable sequence gap", async () => {
		const { directory, store } = createStore();
		const projectId = nativeThreadJournalKey("opaque-native-thread");
		await store.append({
			projectId, kind: "progress", phase: "completed", provider: "openai-codex",
			nativeRefs: { threadId: "opaque-native-thread" }, sourceDigest: digestActivitySource("first"), payload: { method: "thread/start" },
		});
		expect((await new ActivityJournalStore(directory).readAll(projectId)).map((entry) => entry.sequence)).toEqual([1]);
		const valid = (sequence: number) => JSON.stringify({
			schemaVersion: 1, id: crypto.randomUUID(), projectId, sequence, recordedAt: new Date().toISOString(),
			kind: "progress", phase: "updated", provider: "openai-codex", nativeRefs: {},
			sourceDigest: digestActivitySource(`gap-${sequence}`), payload: {},
		});
		await writeFile(join(directory, `${projectId}.jsonl`), `${valid(1)}\n${valid(3)}\n`);
		await expect(new ActivityJournalStore(directory).readAll(projectId)).rejects.toThrow("sequence at line 2");
	});
});
