import { describe, expect, test }                  from "bun:test";
import { stripTerminalSequences }                  from "@earendil-works/pi-tui";
import { ProjectWorkbench }                        from "../src/core/application/orchestration/project-workbench";
import { projectNoteFeature }                      from "../src/core/application/orchestration/workbench-feature-reads";
import type { NoteFeatureProjection }              from "../src/core/application/orchestration/workbench-feature-reads";
import type { WorkbenchTNote }                     from "../src/core/domain/work/workbench";
import { TNoteBrowserController }                  from "../src/adapters/inbound/tui/features/tnote/controller/tnote-browser-controller";
import { projectTNoteBrowserViewModel }            from "../src/adapters/inbound/tui/features/tnote/view-model/tnote-browser-view-model";
import { wwwFixture }                              from "./fixtures/www-snapshot";
import { FakeNativeHarness, MemoryJournal, ready } from "./project-workbench.fixtures";

const currentNote: WorkbenchTNote = {
	id                : "note-current",
	sequence          : 2,
	title             : "현재 질문",
	summary           : "질문: 현재 질문\nPlan: 읽기 경로를 연결한다\n과정: 저장된 Note를 조회했다\n결론: 읽기 화면을 연결했다\nTest:\nTotal 1/1\n01. bun test : 1s · passed",
	sourceActivityIds : ["activity-1", "activity-2"],
	sourceRange       : { startSequence: 1, endSequence: 2 },
	completion        : { threadId: "thread-1", turnId: "turn-1", number: 1, terminalActivityId: "activity-2" },
	provenance        : { provider: "openai-codex", model: "gpt-5.6-luna", version: "2026-09-25" },
	format            : "request-report-v2",
	updatedAt         : "2026-09-25T00:00:00.000Z",
};

const legacyNote: WorkbenchTNote = {
	id                : "note-legacy",
	sequence          : 1,
	title             : "이전 질문",
	summary           : "질문: 이전 질문\n왜: 이전 이유\n결과: 이전 결과",
	sourceActivityIds : ["legacy-activity"],
	format            : "legacy-three-field",
	updatedAt         : "2026-09-24T00:00:00.000Z",
};

function projection(
	notes: readonly WorkbenchTNote[],
	status: NoteFeatureProjection["read"]["status"] = "ready",
	error: string | null = null,
): NoteFeatureProjection {
	return { projectId: "project-1", threadId: "thread-1", notes, read: { status, error } };
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
	let resolve = (): void => undefined;
	const promise = new Promise<void>(next => { resolve = next; });
	return { promise, resolve };
}

describe("completed-question Note read flow", () => {
	test("projects a narrow read contract while preserving stored identities and provenance", () => {
		const snapshot = { ...wwwFixture("ready"), tnotes: [currentNote], tnoteRead: { status: "ready" as const, error: null } };
		const read = projectNoteFeature(snapshot);

		expect(Object.keys(read).sort()).toEqual(["notes", "projectId", "read", "threadId"]);
		expect(read.notes).toBe(snapshot.tnotes);
		expect(read.notes[0]?.sourceRange).toEqual({ startSequence: 1, endSequence: 2 });
		expect(read.notes[0]?.completion?.turnId).toBe("turn-1");
		expect(read.notes[0]?.provenance?.model).toBe("gpt-5.6-luna");
	});

	test("distinguishes empty, unavailable, and stale read states", () => {
		expect(projectTNoteBrowserViewModel(projection([]), 0, "list").statusMessage).toBe("저장된 완료 Note가 없습니다.");
		expect(projectTNoteBrowserViewModel(projection([], "unavailable"), 0, "list").statusMessage).toBe("Note 저장소가 연결되지 않았습니다.");
		expect(projectTNoteBrowserViewModel({ ...projection([], "unavailable"), read: { status: "unavailable", error: null, unavailableReason: "awaiting-thread" } }, 0, "list").statusMessage)
			.toBe("Native 세션이 시작되면 저장된 Note를 읽습니다.");
		expect(projectTNoteBrowserViewModel(projection([], "stale", "disk unavailable"), 0, "list").statusMessage).toContain("목록을 표시할 수 없습니다");
		expect(projectTNoteBrowserViewModel(projection([currentNote], "stale", "disk unavailable"), 0, "list").statusMessage).toContain("이전 결과를 표시합니다");
	});

	test("selects and opens current and legacy Notes without mutating the projection", () => {
		let closed       = false                                                                             ;
		const read       = projection([legacyNote, currentNote])                                             ;
		const controller = new TNoteBrowserController(() => read, () => undefined, () => { closed = true; }) ;

		const list = stripTerminalSequences(controller.render(90).join("\n"));
		expect(list).toContain("› 2. 현재 질문 · note-current");
		controller.handleInput("\r");
		const current = stripTerminalSequences(controller.render(90).join("\n"));
		expect(current).toContain("Turn thread-1 / turn-1 · 질문 #1");
		expect(current).toContain("openai-codex / gpt-5.6-luna / 2026-09-25");

		controller.handleInput("\x1b[B");
		controller.handleInput("\r");
		const legacy = stripTerminalSequences(controller.render(90).join("\n"));
		expect(legacy).toContain("LEGACY · 이전 3-field Note");
		expect(legacy).toContain("이전 결과");
		controller.handleInput("\x1b");
		controller.handleInput("\x1b");
		expect(closed).toBe(true);
		expect(read.notes).toEqual([legacyNote, currentNote]);
	});

	test("keeps a durable Note read failure separate from Workbench execution errors", async () => {
		const workbench = new ProjectWorkbench(new FakeNativeHarness(), new MemoryJournal(), {
			projectId : "project-1",
			cwd       : "/workspace/project-1",
			tnotes    : {
				readAll : async () => { throw new Error("note store unavailable"); },
				create  : async () => { throw new Error("generation not requested"); },
			},
		});
		await ready(workbench);

		expect(workbench.snapshot.phase).toBe("ready");
		expect(workbench.snapshot.error).toBeNull();
		expect(workbench.snapshot.actionResult).toBeNull();
		expect(workbench.snapshot.tnoteRead).toEqual({ status: "stale", error: "note store unavailable" });
		await workbench.close();
	});

	test("starts a fresh thread-scoped read only after bind and settles loading to ready", async () => {
		const started         = deferred() ;
		const release         = deferred() ;
		const binds: string[] = []         ;
		let reads             = 0          ;
		const workbench = new ProjectWorkbench(new FakeNativeHarness(), new MemoryJournal(), {
			projectId : "project-1",
			cwd       : "/workspace/project-1",
			tnotes    : {
				bindThread: async threadId => { binds.push(threadId); },
				readAll: async () => {
					reads += 1;
					started.resolve();
					await release.promise;
					return [];
				},
				create: async () => { throw new Error("generation not requested"); },
			},
		});
		await ready(workbench);
		expect(workbench.snapshot.tnoteRead).toEqual({ status: "unavailable", error: null, unavailableReason: "awaiting-thread" });
		expect(reads).toBe(0);

		const sending = workbench.dispatch({ type: "chat.send", text: "질문", delivery: "queue" });
		await started.promise;
		expect(binds).toEqual(["thread-1"]);
		expect(reads).toBe(1);
		expect(workbench.snapshot.tnoteRead).toEqual({ status: "loading", error: null });
		release.resolve();
		await sending;
		expect(workbench.snapshot.tnoteRead).toEqual({ status: "ready", error: null });
		await workbench.close();
	});

	test("keeps an unconfigured Note source unavailable after Native thread start", async () => {
		const workbench = new ProjectWorkbench(new FakeNativeHarness(), new MemoryJournal(), {
			projectId : "project-1",
			cwd       : "/workspace/project-1",
		});
		await ready(workbench);
		expect(workbench.snapshot.tnoteRead).toEqual({ status: "unavailable", error: null, unavailableReason: "not-configured" });
		await workbench.dispatch({ type: "chat.send", text: "질문", delivery: "queue" });
		expect(workbench.snapshot.tnoteRead).toEqual({ status: "unavailable", error: null, unavailableReason: "not-configured" });
		await workbench.close();
	});

	test("loads a resumed thread and exposes bind failure without pretending to read", async () => {
		let resumedReads = 0;
		const resumed = new ProjectWorkbench(new FakeNativeHarness(), new MemoryJournal(), {
			projectId      : "project-1",
			cwd            : "/workspace/project-1",
			resumeThreadId : "thread-resume",
			tnotes: {
				bindThread : async () => undefined,
				readAll    : async () => { resumedReads += 1; return []; },
				create     : async () => { throw new Error("generation not requested"); },
			},
		});
		await ready(resumed);
		expect(resumedReads).toBe(1);
		expect(resumed.snapshot.tnoteRead).toEqual({ status: "ready", error: null });
		await resumed.close();

		let failedReads = 0;
		const failed = new ProjectWorkbench(new FakeNativeHarness(), new MemoryJournal(), {
			projectId : "project-1",
			cwd       : "/workspace/project-1",
			tnotes    : {
				bindThread : async () => { throw new Error("scope bind failed"); },
				readAll    : async () => { failedReads += 1; return []; },
				create     : async () => { throw new Error("generation not requested"); },
			},
		});
		await ready(failed);
		const receipt = await failed.dispatch({ type: "chat.send", text: "질문", delivery: "queue" });
		expect(receipt).toMatchObject({ state: "rejected", reason: "scope bind failed" });
		expect(failedReads).toBe(0);
		expect(failed.snapshot.tnoteRead).toEqual({ status: "stale", error: "scope bind failed" });
		await failed.close();
	});

	test("ignores a late thread read after close", async () => {
		const started = deferred();
		const release = deferred();
		const workbench = new ProjectWorkbench(new FakeNativeHarness(), new MemoryJournal(), {
			projectId : "project-1",
			cwd       : "/workspace/project-1",
			tnotes    : {
				bindThread : async () => undefined,
				readAll: async () => {
					started.resolve();
					await release.promise;
					return [];
				},
				create: async () => { throw new Error("generation not requested"); },
			},
		});
		await ready(workbench);
		const sending = workbench.dispatch({ type: "chat.send", text: "질문", delivery: "queue" });
		await started.promise;
		const closing = workbench.close();
		release.resolve();
		await Promise.allSettled([sending, closing]);
		expect(workbench.snapshot.phase).toBe("closed");
		expect(workbench.snapshot.tnoteRead).toEqual({ status: "loading", error: null });
	});
});
