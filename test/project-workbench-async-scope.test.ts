import { describe, expect, test }                                from "bun:test";
import { ProjectWorkbench }                                      from "../src/core/application/orchestration/project-workbench";
import type { WorkbenchTodoSource }                              from "../src/core/application/orchestration/project-workbench";
import type { LinearProjectDashboard }                           from "../src/core/domain/work/linear-dashboard";
import { FakeNativeHarness, MemoryJournal, ready, todoDocument } from "./project-workbench.fixtures";

describe("ProjectWorkbench · async scope", () => {
	test("ignores a model catalog refresh that completes after close", async () => {
		type ModelList = Awaited<ReturnType<FakeNativeHarness["listModels"]>>;
		let resolveRefresh: ((catalog: ModelList) => void) | undefined;
		const pendingRefresh = new Promise<ModelList>((resolve) => { resolveRefresh = resolve; });
		class DelayedRefreshNative extends FakeNativeHarness {
			override async listModels() {
				this.listModelCalls += 1;
				if (this.listModelCalls === 1) {
					return [{ model: "gpt-5.6-sol", displayName: "GPT-5.6 Sol", efforts: ["high"] as const, defaultEffort: "high" as const }];
				}
				return pendingRefresh;
			}
		}
		const workbench = new ProjectWorkbench(new DelayedRefreshNative(), new MemoryJournal(), {
			projectId : "sample-project",
			cwd       : "/workspace/sample",
		});
		await ready(workbench);
		const refresh = workbench.refreshModels();

		await workbench.close();
		const closedSnapshot = workbench.snapshot;
		resolveRefresh?.([{ model: "gpt-5.6-terra", displayName: "GPT-5.6 Terra", efforts: ["medium", "high"], defaultEffort: "medium" }]);
		const result = await refresh;

		expect(result.models.map(model => model.model)).toEqual(["gpt-5.6-sol"]);
		expect(workbench.snapshot).toBe(closedSnapshot);
		expect(workbench.snapshot.phase).toBe("closed");
		expect(workbench.snapshot.modelCatalog?.models.map(model => model.model)).toEqual(["gpt-5.6-sol"]);
	});

	test("ignores a Linear Dashboard refresh that completes after close", async () => {
		let resolveDashboard: ((dashboard: LinearProjectDashboard) => void) | undefined;
		const pendingDashboard = new Promise<LinearProjectDashboard>((resolve) => { resolveDashboard = resolve; });
		const workbench = new ProjectWorkbench(new FakeNativeHarness(), new MemoryJournal(), {
			projectId       : "sample-project",
			cwd             : "/workspace/sample",
			linearDashboard : { refresh: async () => pendingDashboard },
		});
		await ready(workbench);
		await workbench.close();
		const closedSnapshot = workbench.snapshot;

		resolveDashboard?.({
			state       : "ready",
			projectName : "Late Dashboard",
			fetchedAt   : "2026-09-25T00:00:00.000Z",
			issues      : [],
			update      : null,
			comments    : [],
			milestones  : [],
			error       : null,
		});
		await Bun.sleep(0);

		expect(workbench.snapshot).toBe(closedSnapshot);
		expect(workbench.snapshot.phase).toBe("closed");
		expect(workbench.snapshot.linearDashboard?.state).toBe("loading");
	});

	test("keeps the latest turn Todo sync pending when an older turn finishes late", async () => {
		let releaseFirst  : (() => void) | undefined                                                ;
		let releaseSecond : (() => void) | undefined                                                ;
		let signalFirst   : (() => void) | undefined                                                ;
		let signalSecond  : (() => void) | undefined                                                ;
		const firstGate              = new Promise<void>((resolve) => { releaseFirst = resolve; })  ;
		const secondGate             = new Promise<void>((resolve) => { releaseSecond = resolve; }) ;
		const firstStarted           = new Promise<void>((resolve) => { signalFirst = resolve; })   ;
		const secondStarted          = new Promise<void>((resolve) => { signalSecond = resolve; })  ;
		const syncedTurns : string[] = []                                                           ;
		const unsupported            = async (): Promise<never> => { throw new Error("not used"); } ;
		const todos: WorkbenchTodoSource = {
			snapshot  : null,
			subscribe : () => () => undefined,
			syncNativePlan: async (flow) => {
				const turnId = flow.source?.turnId ?? "missing";
				syncedTurns.push(turnId);
				if (syncedTurns.length === 1) {
					signalFirst?.();
					await firstGate;
				} else {
					signalSecond?.();
					await secondGate;
				}
				return todoDocument(syncedTurns.length);
			},
			create         : unsupported,
			add            : unsupported,
			addDetails     : unsupported,
			start          : unsupported,
			complete       : unsupported,
			block          : unsupported,
			reopen         : unsupported,
			recordEvidence : async () => null,
			importLegacy   : async () => null,
		};
		const native = new FakeNativeHarness();
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
			projectId          : "sample-project",
			cwd                : "/workspace/sample",
			requestRuntimeMode : "off",
			todos,
		});
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "첫 계획" });
		native.emit({
			type   : "notification",
			method : "turn/plan/updated",
			refs   : { threadId: "thread-1", turnId: "turn-1" },
			params : { plan: [{ step: "첫 작업", status: "inProgress" }] },
		});
		await firstStarted;
		native.emit({
			type   : "notification",
			method : "turn/completed",
			refs   : { threadId: "thread-1", turnId: "turn-1" },
			params : {},
		});
		await Bun.sleep(0);
		await workbench.dispatch({ type: "chat.send", text: "두 번째 계획" });
		native.emit({
			type   : "notification",
			method : "turn/plan/updated",
			refs   : { threadId: "thread-1", turnId: "turn-2" },
			params : { plan: [{ step: "두 번째 작업", status: "inProgress" }] },
		});
		await Bun.sleep(0);

		expect(workbench.snapshot.todoSync).toMatchObject({ state: "syncing" });
		releaseFirst?.();
		await secondStarted;

		expect(syncedTurns).toEqual(["turn-1", "turn-2"]);
		expect(workbench.snapshot.todoSync).toMatchObject({ state: "syncing" });
		releaseSecond?.();
		await workbench.close();
	});
});
