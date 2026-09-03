import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ObservabilityHistorySource } from "../src/infrastructure/observability-history-source";

const activity = (id: string, sequence: number) => JSON.stringify({ schemaVersion: 1, id, projectId: "native-stream", sequence, recordedAt: `2026-09-0${sequence}T00:00:00.000Z`, kind: "progress", phase: "updated", provider: "test", nativeRefs: { threadId: "thread" }, sourceDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", payload: {} });

describe("observability history source", () => {
	test("reads existing JSONL streams without treating partial records as facts", async () => {
		const directory = await mkdtemp(join(tmpdir(), "observability-history-"));
		await writeFile(join(directory, "native-stream.jsonl"), `${activity("one", 1)}\nnot-json\n${activity("partial", 2)}`);
		const history = await new ObservabilityHistorySource(directory).read();
		expect(history.streams).toHaveLength(1);
		expect(history.streams[0]).toMatchObject({ streamId: "native-stream", activities: [{ id: "one" }] });
		expect(history.coverage).toMatchObject({ state: "partial-local-journal", streamsRead: 1, observedFrom: "2026-09-01T00:00:00.000Z" });
	});

	test("bounds discovered streams and reports unknown for an absent directory", async () => {
		const directory = await mkdtemp(join(tmpdir(), "observability-history-"));
		await writeFile(join(directory, "a.jsonl"), `${activity("a", 1)}\n`);
		await writeFile(join(directory, "b.jsonl"), `${activity("b", 1)}\n`);
		const history = await new ObservabilityHistorySource(directory, { streams: 1 }).read();
		expect(history.coverage).toMatchObject({ state: "partial-local-journal", streamsRead: 1, skippedStreams: 1 });
		expect((await new ObservabilityHistorySource(join(directory, "missing")).read()).coverage.state).toBe("unknown");
	});

	test("discovers thread journals nested under workbench directories", async () => {
		const directory = await mkdtemp(join(tmpdir(), "observability-history-"));
		await mkdir(join(directory, "workbench-session"), { recursive: true });
		await writeFile(join(directory, "workbench-session", "thread.jsonl"), `${activity("nested", 1)}\n`);
		const history = await new ObservabilityHistorySource(directory).read();
		expect(history.streams).toHaveLength(1);
		expect(history.streams[0]?.activities[0]?.id).toBe("nested");
	});
});
