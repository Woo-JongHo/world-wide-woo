import { describe, expect, test } from "bun:test";

import { runApp, runWww }   from "../src/app";
import { ProjectWorkbench } from "../src/core/application/orchestration/project-workbench";

import type { RunAppDependencies, RunAppOptions } from "../src/app";
import type {
	ProjectWorkbenchSession,
	ProjectWorkbenchSessionOptions,
} from "../src/adapters/outbound/workspace/project-workbench-session";

const requestCapabilityFactory: NonNullable<ProjectWorkbenchSessionOptions["requestCapabilityFactory"]> = () => [];

interface CompositionObservation {
	sessionOptions : ProjectWorkbenchSessionOptions ;
	surface        : RunAppOptions["surface"]       ;
}

function createClosableSession(close: () => Promise<void>): ProjectWorkbenchSession {
	return {
		workspace : {
			name              : "test-project",
			root              : "/workspace/test-project",
			directory         : "/workspace/test-project/.www",
			sessionsDirectory : "/workspace/test-project/.www/sessions",
			draftsDirectory   : "/workspace/test-project/.www/drafts",
			runtimeDirectory  : "/workspace/test-project/.www/runtime",
			todosDirectory    : "/workspace/test-project/.www/todos",
			vaultDirectory    : "/workspace/test-project/.www/vault",
			canonicalTodoPath : "/workspace/test-project/.www/vault/Todo.md",
			legacyTodoPath    : "/workspace/test-project/.www/Todo.md",
			manifestPath      : "/workspace/test-project/.www/project.json",
		},
		projectId : "test-project",
		workbench : Object.create(ProjectWorkbench.prototype),
		composerDraft : {
			initialText : "",
			save        : async () => {},
			clear       : async () => {},
		},
		usage : {
			refresh      : async () => [],
			startPolling : () => () => {},
			cacheMetrics : () => ({ entries: 0, hits: 0, misses: 0, evictions: 0, lastAccessedAt: null }),
		},
		releaseSessionLease : async () => {},
		close,
	};
}

async function observeComposition(
	options : RunAppOptions,
	entry   : (options: RunAppOptions, dependencies: RunAppDependencies) => Promise<void> = runApp,
): Promise<CompositionObservation> {
	const created: ProjectWorkbenchSessionOptions[] = [];
	const surfaces: RunAppOptions["surface"][] = [];
	const dependencies: RunAppDependencies = {
		loadSettings                 : async () => ({ provider: "openai-codex", model: "gpt-5.6-sol", effort: "ultra" }),
		loadRequestCapabilityConfig : async () => requestCapabilityFactory,
		createProjectWorkbenchSession: async (_cwd, sessionOptions) => {
			created.push(sessionOptions);
			return createClosableSession(async () => {});
		},
		openProjectWorkbench: async (_project, appOptions) => { surfaces.push(appOptions.surface); },
	};

	await entry(options, dependencies);
	const sessionOptions = created.at(0);
	if (!sessionOptions) throw new Error("runApp did not create a project workbench session.");
	return { sessionOptions, surface: surfaces.at(0) };
}

describe("runApp request Runtime composition", () => {
	test("runtime config with WWW surface selects broker mode and capability factory", async () => {
		const observation = await observeComposition({ runtimeConfig: "runtime.json", surface: "www", requestRuntimeMode: "off" });
		expect(observation.sessionOptions.requestRuntimeMode).toBe("broker");
		expect(observation.sessionOptions.requestCapabilityFactory).toBe(requestCapabilityFactory);
	});

	test("runtime config without a surface selects broker mode and capability factory", async () => {
		const observation = await observeComposition({ runtimeConfig: "runtime.json" });
		expect(observation.sessionOptions.requestRuntimeMode).toBe("broker");
		expect(observation.sessionOptions.requestCapabilityFactory).toBe(requestCapabilityFactory);
	});

	test("runWww with runtime config keeps WWW surface while broker capability wins", async () => {
		const observation = await observeComposition({ runtimeConfig: "runtime.json" }, runWww);
		expect(observation.surface).toBe("www");
		expect(observation.sessionOptions.requestRuntimeMode).toBe("broker");
		expect(observation.sessionOptions.requestCapabilityFactory).toBe(requestCapabilityFactory);
	});

	test("WWW surface and runtime policy are independently selectable", async () => {
		const observation = await observeComposition({ surface: "www", requestRuntimeMode: "off" });
		expect(observation.sessionOptions.requestRuntimeMode).toBe("off");
		expect("requestCapabilityFactory" in observation.sessionOptions).toBe(false);
	});

	test("an unspecified runtime config and surface selects observe mode without a capability factory", async () => {
		const observation = await observeComposition({});
		expect(observation.sessionOptions.requestRuntimeMode).toBe("observe");
		expect(observation.sessionOptions.executionLane).toBe("codex");
		expect("resumeThreadId" in observation.sessionOptions).toBe(false);
		expect("requestCapabilityFactory" in observation.sessionOptions).toBe(false);
	});

	test("runWww keeps WWW off mode while forwarding resume and execution lane", async () => {
		const observation = await observeComposition({ resumeThreadId: "thread-1", executionLane: "pi" }, runWww);
		expect(observation.surface).toBe("www");
		expect(observation.sessionOptions.requestRuntimeMode).toBe("off");
		expect(observation.sessionOptions.resumeThreadId).toBe("thread-1");
		expect(observation.sessionOptions.executionLane).toBe("pi");
		expect("requestCapabilityFactory" in observation.sessionOptions).toBe(false);
	});

	test("closes the created session exactly once and preserves an open failure", async () => {
		const failure  = new Error("workbench open failed")                      ;
		let closeCalls = 0                                                       ;
		const session  = createClosableSession(async () => { closeCalls += 1; }) ;
		const dependencies: RunAppDependencies = {
			loadSettings                  : async () => ({ provider: "openai-codex", model: "gpt-5.6-sol", effort: "ultra" }),
			loadRequestCapabilityConfig   : async () => requestCapabilityFactory,
			createProjectWorkbenchSession : async () => session,
			openProjectWorkbench          : async () => { throw failure; },
		};

		await expect(runApp({}, dependencies)).rejects.toBe(failure);
		expect(closeCalls).toBe(1);
	});
});
