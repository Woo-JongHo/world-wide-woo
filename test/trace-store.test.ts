import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import { FileTraceStore, renderSessionTrace } from "../src/adapters/outbound/persistence/trace-store";
import type { ProjectActivity } from "../src/core/domain/execution/project-activity";

function activity(sequence: number, kind: ProjectActivity["kind"], phase: ProjectActivity["phase"]): ProjectActivity {
	return {
		schemaVersion: 1, id: `activity-${sequence}`, projectId: "session", sequence,
		recordedAt: `2026-09-08T00:00:0${sequence}.000Z`, kind, phase, provider: "openai-codex",
		nativeRefs: { threadId: "thread-1", turnId: "turn-1", itemId: `item-${sequence}` },
		sourceDigest: `sha256:${String(sequence).padStart(64, "0")}`, payload: {},
	};
}

describe("session Tracer.md projection", () => {
	test("projects the canonical journal in sequence order with exact Source addresses", () => {
		const output = renderSessionTrace([activity(2, "tool", "completed"), activity(1, "message", "started")]);
		expect(output.indexOf("activity-1")).toBeLessThan(output.indexOf("activity-2"));
		expect(output).toContain("- [ ] 1. message · started · activity-1");
		expect(output).toContain("- [x] 2. tool · completed · activity-2");
		expect(output).toContain("Source: /trace activity-2");
		expect(output).toContain("thread=thread-1 · turn=turn-1 · item=item-2");
	});

	test("atomically replaces the session projection", async () => {
		const root = await mkdtemp(join(tmpdir(), "www-trace-"));
		const path = join(root, "native-session", "Tracer.md");
		const store = new FileTraceStore(path);
		await store.replace([activity(1, "approval", "failed")]);
		expect(await readFile(path, "utf8")).toContain("- [!] 1. approval · failed · activity-1");
		await store.append(activity(2, "tool", "completed"));
		const appended = await readFile(path, "utf8");
		expect(appended).toContain("- [x] 2. tool · completed · activity-2");
	});
});
