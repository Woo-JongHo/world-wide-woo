import { homedir } from "node:os";
import { join } from "node:path";
import { ActivityJournalStore } from "./system/adapters/activity-journal-store.js";
import { AuthService } from "./system/adapters/auth-service.js";
import { FileCanonicalDocumentStore } from "./system/adapters/canonical-document-store.js";
import { FileComposerDraftController } from "./system/adapters/composer-draft-store.js";
import { FileCredentialStore } from "./system/adapters/credential-store.js";
import { PiDetachedCodexGenerator } from "./system/adapters/detached-codex-generator.js";
import {
	buildPiExecutionSystemPrompt,
	createNativeHarness,
	type ExecutionLane,
} from "./system/adapters/executors/factory.js";
import { GitTelemetrySource } from "./system/adapters/git-telemetry-source.js";
import { ModelRouter, createModelRegistry } from "./system/adapters/model-router.js";
import { ObservabilityHistorySource } from "./system/adapters/observability-history-source.js";
import { PiActivityNarrator } from "./system/adapters/pi-activity-narrator.js";
import { createProjectSession } from "./system/adapters/project-session.js";
import { FileProjectWorkspace } from "./system/adapters/project-workspace.js";
import { GitHubRepositoryInsights } from "./system/adapters/repository-insights.js";
import {
	PiReviewGenerationClient,
	createProductionReviewAdapters,
	installedClaudeCliVersion,
	sha256ReviewDigest,
} from "./system/adapters/review-adapters.js";
import { FileReviewProvenanceStore } from "./system/adapters/review-store.js";
import { SessionEventStore } from "./system/adapters/session-store.js";
import { FileSettingsStore, routerSettingsPath } from "./system/adapters/settings-store.js";
import { FileTNoteStore } from "./system/adapters/t-note-store.js";
import { FileTodoStore, importLegacyTodo } from "./system/adapters/todo-store.js";
import { UsageService } from "./system/adapters/usage-service.js";
import { WesEntryCollector } from "./system/adapters/wes-entry-collector.js";
import { DEFAULT_SETTINGS, type WwwSettings } from "./system/contracts/model-settings.js";
import { CanonicalPromotionService } from "./system/services/canonical-promotion.js";
import { ProjectWorkbench } from "./system/services/project-workbench.js";
import {
	configureProjectWorkbenchSessionFactories,
	createProjectWorkbenchSession,
	type ProjectWorkbenchSessionFactories,
} from "./system/services/project-workbench-session.js";
import { ReviewService } from "./system/services/review-service.js";
import { RouterService, reconcileInitialRouter } from "./system/services/router-service.js";
import { TNoteService } from "./system/services/t-note-service.js";
import { TodoLedger } from "./system/services/todo-ledger.js";
import { WooEntry } from "./system/services/woo-entry.js";
import { runTuiShell } from "./tui/legacy/legacy-session-shell.js";
import {
	runLegacyRouter as runLegacyRouterEntry,
	type LegacyRouterAppDependencies,
	type RunLegacyRouterOptions,
} from "./tui/legacy/router-app.js";
import { FileDevelopmentMapSource } from "./workflows/tui-development/adapters/development-map-source.js";
import { createDevelopmentService } from "./workflows/tui-development/adapters/development-runtime.js";

export const productionProjectWorkbenchSessionFactories: ProjectWorkbenchSessionFactories = {
	openWorkspace: FileProjectWorkspace.open,
	acquireWriterLease: FileProjectWorkspace.acquireSessionLease,
	connectNative: createNativeHarness,
	createJournal: directory => new ActivityJournalStore(directory),
	createTodoStore: path => new FileTodoStore(path),
	createTodoLedger: (sessionId, store, events) => new TodoLedger(sessionId, store, events),
	importLegacyTodo,
	createSessionEvents: directory => new SessionEventStore(directory),
	createTNoteSource: (directory, model, observeUsage) => {
		const store = new FileTNoteStore(directory);
		return new TNoteService(
			new PiDetachedCodexGenerator(
				createModelRegistry(new FileCredentialStore()),
				model,
				model,
				observeUsage,
			),
			store,
		);
	},
	createActivityNarrator: () => new PiActivityNarrator(createModelRegistry(new FileCredentialStore())),
	createPromotionService: root => new CanonicalPromotionService(new FileCanonicalDocumentStore(root)),
	createReviewService: (runtimeDirectory, observeUsage) => {
		const registry = createModelRegistry(new FileCredentialStore());
		return new ReviewService(
			createProductionReviewAdapters(
				new PiReviewGenerationClient(registry, observeUsage),
				{ claudeCliVersion: installedClaudeCliVersion },
			),
			sha256ReviewDigest,
			new FileReviewProvenanceStore(join(runtimeDirectory, "review-provenance.jsonl")),
		);
	},
	createWorkbench: (native, journal, options) => new ProjectWorkbench(native, journal, options),
	createComposerDraft: (root, sessionId, directory) => FileComposerDraftController.create(root, sessionId, directory),
	createUsageMonitor: () => {
		const credentials = new FileCredentialStore();
		return new UsageService(credentials, createModelRegistry(credentials));
	},
	createWooEntry: () => new WooEntry(new WesEntryCollector()),
	createDevelopment: (projectRoot, runId) => createDevelopmentService({ projectRoot, runId }),
};

configureProjectWorkbenchSessionFactories(productionProjectWorkbenchSessionFactories);

export { listNativeThreads } from "./system/adapters/native-thread-discovery.js";
export interface RunAppOptions {
	resumeThreadId?: string;
	executionLane?: ExecutionLane;
}

export async function runApp(options: RunAppOptions = {}): Promise<void> {
	const { runProjectWorkbenchShell } = await import("./tui/shell/workbench-shell");
	const settingsStore = new FileSettingsStore();
	const settings = await settingsStore.load();
	let persistedSettings = settings;
	const executionLane = options.executionLane ?? "codex";
	const project = await createProjectWorkbenchSession(process.cwd(), {
		resumeThreadId: options.resumeThreadId,
		executionLane,
		provider: executionLane === "pi" ? settings.provider : "openai-codex",
		model: executionLane === "pi" ? settings.model : codexInteractiveModel(settings),
		effort: settings.effort,
		systemPrompt: executionLane === "pi" ? buildPiExecutionSystemPrompt(process.cwd()) : undefined,
		persistModelSelection: async (selection) => {
			if (executionLane === "pi") throw new Error("Pi Phase A 모델 변경은 새 Workbench에서만 적용할 수 있습니다.");
			const next: WwwSettings = { provider: "openai-codex", ...selection };
			const saved = await settingsStore.compareAndSwap(persistedSettings, next);
			if (!saved) throw new Error("다른 WWW 프로세스가 모델 설정을 먼저 변경했습니다. 다시 선택하세요.");
			persistedSettings = next;
		},
	});
	try {
		const { createProjectAuthController } = await import("./system/adapters/project-auth");
		runProjectWorkbenchShell({
			workbench: project.workbench,
			cwd: project.workspace.root,
			usage: project.usage,
			auth: createProjectAuthController(),
			developmentMapSource: new FileDevelopmentMapSource(project.workspace.root),
			development: project.development,
			observabilityHistorySource: new ObservabilityHistorySource(join(project.workspace.root, ".www", "runtime", "activity")),
			gitTelemetrySource: new GitTelemetrySource(),
			homeDirectory: homedir(),
			composerDraft: project.composerDraft,
			releaseSessionLease: project.releaseSessionLease,
		});
	} catch (error) {
		await project.close();
		throw error;
	}
}

export function codexInteractiveModel(settings: WwwSettings): string {
	return settings.provider === "openai-codex" ? settings.model : DEFAULT_SETTINGS.model;
}

export async function runAuth(args: string[]): Promise<void> {
	const { AuthService } = await import("./system/adapters/auth-service");
	const { FileCredentialStore } = await import("./system/adapters/credential-store");
	const { createModelRegistry } = await import("./system/adapters/model-router");
	const { runAuthCommand } = await import("./tui/auth/auth-command");
	const registry = createModelRegistry(new FileCredentialStore());
	await runAuthCommand(new AuthService(registry), args);
}
export async function runDevelopment(args: string[]): Promise<string> {
	const { runDevelopmentCli } = await import("./workflows/tui-development/adapters/development-runtime.js");
	return runDevelopmentCli(args, { projectRoot: process.cwd() });
}

export interface LegacyRouterProductionOverrides {
	cwd?: () => string;
	createSettingsStore?: () => FileSettingsStore;
	createCredentialStore?: () => FileCredentialStore;
	runShell?: LegacyRouterAppDependencies["runShell"];
}

export function createLegacyRouterAppDependencies(
	overrides: LegacyRouterProductionOverrides = {},
): LegacyRouterAppDependencies {
	return {
		cwd: overrides.cwd ?? (() => process.cwd()),
		runShell: overrides.runShell ?? runTuiShell,
		createSession: async (cwd, options) => {
			const settingsStore = overrides.createSettingsStore?.() ?? new FileSettingsStore(routerSettingsPath());
			const credentials = overrides.createCredentialStore?.() ?? new FileCredentialStore();
			const registry = createModelRegistry(credentials);
			const modelRouter = new ModelRouter(registry);
			const settings = await reconcileInitialRouter(await settingsStore.load(), modelRouter, settingsStore);
			const project = await createProjectSession(cwd, settings, modelRouter, options.resumeSessionId);
			const { workspace, runtime, todos, monitor, planning, releaseSessionLease } = project;
			try {
				const composerDraft = await FileComposerDraftController.create(
					workspace.root,
					runtime.id,
					workspace.draftsDirectory,
				);
				return {
					shell: {
						runtime,
						auth: new AuthService(registry),
						usage: new UsageService(credentials, registry),
						routerSettings: new RouterService(settingsStore, runtime, settings),
						repository: new GitHubRepositoryInsights(cwd),
						composerDraft,
						releaseSessionLease,
						todos,
						monitor,
						planning,
					},
					close: async () => {
						monitor.dispose();
						try {
							await runtime.close();
						} finally {
							await releaseSessionLease();
						}
					},
				};
			} catch (error) {
				monitor.dispose();
				try {
					await runtime.close();
				} finally {
					await releaseSessionLease();
				}
				throw error;
			}
		},
	};
}

export async function runLegacyRouter(options: RunLegacyRouterOptions = {}): Promise<void> {
	await runLegacyRouterEntry(options, createLegacyRouterAppDependencies());
}

/** Legacy SessionRuntime archive only. Native Codex threads are resumed by their opaque id. */
export async function listSessions(): Promise<Array<{ id: string; updatedAt: string }>> {
	const { listProjectSessions } = await import("./system/adapters/project-session");
	return listProjectSessions(process.cwd());
}
