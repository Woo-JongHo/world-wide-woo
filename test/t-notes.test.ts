import { afterEach, describe, expect, test } from "bun:test";
import { appendFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TNoteService } from "../src/application/t-note-service.js";
import type { DetachedTextGenerator } from "../src/application/detached-text-generator.js";
import { FileTNoteStore } from "../src/infrastructure/t-note-store.js";
import { createTNotePacket, projectActivityToTNoteSource } from "../src/domain/t-notes.js";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true }))); });

async function store(): Promise<FileTNoteStore> {
	const directory = await mkdtemp(join(tmpdir(), "www-tnotes-"));
	directories.push(directory);
	return new FileTNoteStore(directory);
}

const policy = { cwd: "" as const, noTools: true as const, network: false as const, readOnly: true as const, ephemeral: true as const };
const generator: DetachedTextGenerator = {
	async generate(request) {
		expect(request.policy).toEqual(policy);
		return { text: "질문: 무엇을 확인했나\n왜: 선택한 활동의 결과를 보존하기 위해서다\n결과: 검증이 통과했다", provenance: { provider: "anthropic", model: "claude-opus", version: "2026-09-01" }, isolation: { appliedPolicy: policy, projectRootVisible: false, toolCalls: 0, networkCalls: 0, filesystemWrites: 0 } };
	},
};

describe("T-note service", () => {
	test("creates an immutable redacted packet and replays an append-only detached draft", async () => {
		const draftStore = await store();
		const service = new TNoteService(generator, draftStore, () => new Date("2026-09-01T00:00:00.000Z"), () => "tnote-1");
		const note = await service.create({
			projectId: "project-1",
			expectedQuestion: "무엇을 확인했나",
			range: { startSequence: 3, endSequence: 4 },
			activities: [
				{ id: "act-3", projectId: "project-1", sequence: 3, occurredAt: "2026-09-01T00:00:00.000Z", kind: "assistant", title: "결과", body: "token=secret-value /Users/customer-X/acme customer=Acme", nativeRefs: ["thread-1", "item-3"] },
				{ id: "act-4", projectId: "project-1", sequence: 4, occurredAt: "2026-09-01T00:01:00.000Z", kind: "tool", title: "검증", body: "통과", nativeRefs: ["item-4"] },
			],
			instruction: "핵심만 정리",
		});
		expect(note.packet.activities[0]?.body).toContain("[redacted:secret]");
		expect(note.packet.digest).toMatch(/^[a-f0-9]{64}$/u);
		expect(Object.isFrozen(note.packet)).toBe(true);
		expect(note.provenance).toEqual({ provider: "anthropic", model: "claude-opus", version: "2026-09-01" });
		expect(await draftStore.readAll("project-1")).toEqual([note]);
		const text = await readFile(join((draftStore as unknown as { directory: string }).directory, "t-notes.jsonl"), "utf8");
		expect(text).toContain(note.packet.digest);
		expect(text).not.toContain("secret-value");
		expect(text).not.toContain("customer-X");
		expect(text).not.toContain("Acme");
	});

	test("sanitizes a question embedded in the instruction before detached generation", async () => {
		const draftStore = await store();
		let dispatchedInstruction = "";
		const capturingGenerator: DetachedTextGenerator = {
			async generate(request) {
				dispatchedInstruction = request.instruction;
				return { text: "질문: Git과 Bash\n왜: 출력을 확인했습니다.\n결과: 표시를 검증했습니다.", provenance: { provider: "openai-codex", model: "gpt-5.6-luna", version: "gpt-5.6-luna" }, isolation: { appliedPolicy: policy, projectRootVisible: false, toolCalls: 0, networkCalls: 0, filesystemWrites: 0 } };
			},
		};
		const service = new TNoteService(capturingGenerator, draftStore, () => new Date("2026-09-01T00:00:00.000Z"), () => "tnote-safe-instruction");
		await service.create({
			projectId: "project-1",
			expectedQuestion: "Git과 Bash",
			range: { startSequence: 1, endSequence: 1 },
			activities: [{ id: "act-1", projectId: "project-1", sequence: 1, occurredAt: "2026-09-01T00:00:00.000Z", kind: "message", title: "질문", body: "Git/Bash와 /Users/example/private를 확인" }],
			instruction: "Git/Bash와 /Users/example/private를 질문별로 정리",
		});

		expect(dispatchedInstruction).toContain("[redacted:local-path]");
		expect(dispatchedInstruction).not.toContain("/Users/example/private");
	});

	test("rejects a cross-project, unordered range and a generator that does not confirm isolation", async () => {
		const draftStore = await store();
		const service = new TNoteService(generator, draftStore);
		await expect(service.create({ projectId: "one", expectedQuestion: "무엇을 확인했나", range: { startSequence: 1, endSequence: 1 }, activities: [{ id: "a", projectId: "two", sequence: 1, occurredAt: "2026-09-01T00:00:00.000Z", kind: "x", title: "x", body: "x" }], instruction: "요약" })).rejects.toThrow("one project");
		await expect(service.create({ projectId: "one", expectedQuestion: "무엇을 확인했나", range: { startSequence: 1, endSequence: 2 }, activities: [{ id: "b", projectId: "one", sequence: 2, occurredAt: "2026-09-01T00:00:00.000Z", kind: "x", title: "x", body: "x" }, { id: "a", projectId: "one", sequence: 1, occurredAt: "2026-09-01T00:00:00.000Z", kind: "x", title: "x", body: "x" }], instruction: "요약" })).rejects.toThrow("sorted");
		const unsafe: DetachedTextGenerator = { async generate() { return { text: "x", provenance: { provider: "p", model: "m", version: "v" }, isolation: { appliedPolicy: policy, projectRootVisible: true, toolCalls: 0, networkCalls: 0, filesystemWrites: 0 } as never }; } };
		await expect(new TNoteService(unsafe, draftStore).create({ projectId: "one", expectedQuestion: "무엇을 확인했나", range: { startSequence: 1, endSequence: 1 }, activities: [{ id: "a", projectId: "one", sequence: 1, occurredAt: "2026-09-01T00:00:00.000Z", kind: "x", title: "x", body: "x" }], instruction: "요약" })).rejects.toThrow("isolation");
	});

	test("persists strictly increasing sparse global source sequences", async () => {
		const draftStore = await store();
		const service = new TNoteService(generator, draftStore);
		const note = await service.create({
			projectId: "project-1",
			expectedQuestion: "무엇을 확인했나",
			range: { startSequence: 3, endSequence: 9 },
			activities: [
				{ id: "act-3", projectId: "project-1", sequence: 3, occurredAt: "2026-09-01T00:00:00.000Z", kind: "message", title: "질문", body: "질문" },
				{ id: "act-9", projectId: "project-1", sequence: 9, occurredAt: "2026-09-01T00:01:00.000Z", kind: "progress", title: "완료", body: "완료" },
			],
			instruction: "요약",
		});
		expect(note.packet.activities.map((activity) => activity.sequence)).toEqual([3, 9]);
		expect(await draftStore.readAll("project-1")).toEqual([note]);
	});

	test("retries one missing sparse interleaved-turn note after a failed generation", async () => {
		const draftStore = await store();
		let attempts = 0;
		const recovering: DetachedTextGenerator = {
			async generate() {
				attempts += 1;
				if (attempts === 1) throw new Error("temporary generation failure");
				return {
					text: "질문: 첫 thread 질문\n왜: 완료된 turn을 다시 확인했습니다.\n결과: 재시작 뒤 요약을 저장했습니다.",
					provenance: { provider: "test", model: "test", version: "test" },
					isolation: { appliedPolicy: policy, projectRootVisible: false, toolCalls: 0, networkCalls: 0, filesystemWrites: 0 },
				};
			},
		};
		const input = {
			projectId: "project-1",
			expectedQuestion: "첫 thread 질문",
			range: { startSequence: 1, endSequence: 5 },
			activities: [
				{ id: "thread-1-question", projectId: "project-1", sequence: 1, occurredAt: "2026-09-01T00:00:00.000Z", kind: "message", title: "질문", body: "첫 thread 질문" },
				{ id: "thread-1-complete", projectId: "project-1", sequence: 5, occurredAt: "2026-09-01T00:01:00.000Z", kind: "progress", title: "완료", body: "완료" },
			],
			instruction: "요약",
		};
		await expect(new TNoteService(recovering, draftStore).create(input)).rejects.toThrow("temporary");
		expect(await draftStore.readAll("project-1")).toEqual([]);
		const recovered = await new TNoteService(recovering, draftStore).create(input);
		expect(attempts).toBe(2);
		expect(await draftStore.readAll("project-1")).toEqual([recovered]);
	});

	test("adapts the append-only ProjectActivity journal without provider-state reconstruction", () => {
		const source = projectActivityToTNoteSource({ schemaVersion: 1, id: "activity-1", projectId: "project-1", sequence: 1, recordedAt: "2026-09-01T00:00:00.000Z", kind: "message", phase: "completed", provider: "openai-codex", nativeRefs: { threadId: "thread-1", itemId: "item-1" }, sourceDigest: "a".repeat(64), payload: { text: "token=secret" } });
		expect(source).toMatchObject({ id: "activity-1", kind: "message.completed" });
		expect(source).not.toHaveProperty("nativeRefs");
	});

	test("removes native identifiers inside a non-reasoning event payload", () => {
		const source = projectActivityToTNoteSource({
			schemaVersion: 1,
			id: "activity-2",
			projectId: "project-1",
			sequence: 2,
			recordedAt: "2026-09-01T00:00:00.000Z",
			kind: "tool",
			phase: "completed",
			provider: "openai-codex",
			nativeRefs: { threadId: "thread-ref-2", turnId: "turn-ref-2", itemId: "item-ref-2" },
			sourceDigest: "b".repeat(64),
			payload: {
				params: {
					threadId: "thread-payload-2",
					thread_id: "thread-snake-2",
					turn: { id: "turn-payload-2" },
					item: { id: "item-payload-2", type: "command", content: "보존할 도구 결과" },
					native_refs: { item_id: "item-snake-2" },
				},
			},
		});
		const serialized = JSON.stringify(createTNotePacket("project-1", { startSequence: 2, endSequence: 2 }, [source], "2026-09-01T00:00:00.000Z", () => "d".repeat(64)));
		expect(serialized).toContain("보존할 도구 결과");
		for (const nativeValue of ["thread-ref-2", "turn-ref-2", "item-ref-2", "thread-payload-2", "thread-snake-2", "turn-payload-2", "item-payload-2", "item-snake-2", "threadId", "thread_id", "turnId", "itemId", "nativeRefs", "native_refs"]) {
			expect(serialized).not.toContain(nativeValue);
		}
	});

	test("removes nested native reasoning bodies and all native references before they enter a T-note packet", () => {
		const source = projectActivityToTNoteSource({
			schemaVersion: 1,
			id: "reasoning-1",
			projectId: "project-1",
			sequence: 1,
			recordedAt: "2026-09-01T00:00:00.000Z",
			kind: "progress",
			phase: "completed",
			provider: "openai-codex",
			nativeRefs: { threadId: "thread-1", itemId: "reasoning-item-1" },
			sourceDigest: "b".repeat(64),
			payload: {
				method: "item/completed",
				params: {
					msg: {
						update: {
							item: { content: { type: "reasoning", text: "비공개 reasoning 원문" } },
						},
					},
				},
			},
		});
		expect(source.body).toContain('"classification":"reasoning"');
		expect(source.body).not.toContain("비공개 reasoning 원문");
		expect(source).not.toHaveProperty("nativeRefs");

		const packet = createTNotePacket("project-1", { startSequence: 1, endSequence: 1 }, [source], "2026-09-01T00:00:00.000Z", () => "c".repeat(64));
		const serialized = JSON.stringify(packet);
		expect(serialized).not.toContain("비공개 reasoning 원문");
		expect(serialized).not.toContain("thread-1");
		expect(serialized).not.toContain("reasoning-item-1");
		expect(serialized).not.toContain("nativeRefs");
	});

	test("truncates only a final crash residue while rejecting an invalid middle record", async () => {
		const draftStore = await store();
		const service = new TNoteService(generator, draftStore, () => new Date("2026-09-01T00:00:00.000Z"), () => "tnote-tail");
		const note = await service.create({ projectId: "project-1", expectedQuestion: "무엇을 확인했나", range: { startSequence: 1, endSequence: 1 }, activities: [{ id: "act-1", projectId: "project-1", sequence: 1, occurredAt: "2026-09-01T00:00:00.000Z", kind: "tool", title: "검증", body: "통과" }], instruction: "요약" });
		const path = join((draftStore as unknown as { directory: string }).directory, "t-notes.jsonl");
		await appendFile(path, "{\"schemaVersion\":");
		expect(await draftStore.readAll("project-1")).toEqual([note]);
		expect(await readFile(path, "utf8")).toBe(`${JSON.stringify(note)}\n`);
		await writeFile(path, `${JSON.stringify(note)}\n{not-json}\n`);
		await expect(draftStore.readAll("project-1")).rejects.toThrow("line 2");
	});
});
