import { homedir } from "node:os";
import { join }    from "node:path";

import { FileDevelopmentMapSource }        from "@/adapters/outbound/development/development-map-source";
import { buildPiExecutionSystemPrompt }    from "@/adapters/outbound/execution/factory.js";
import { GitTelemetrySource }              from "@/adapters/outbound/git/git-telemetry-source.js";
import { ObservabilityHistorySource }      from "@/adapters/outbound/observability/observability-history-source.js";
import { createProjectWorkbenchSession }   from "@/adapters/outbound/workspace/project-workbench-session.js";
import { loadRequestCapabilityConfig }     from "@/adapters/outbound/workspace/request-capability-config";
import { saveWorkbenchExecutionSelection } from "@/adapters/outbound/workspace/workbench-config.js";
import { DEFAULT_SETTINGS }                from "@/core/domain/execution/model-settings.js";

import type { ExecutionLane }        from "@/adapters/outbound/execution/factory.js";
import type {
	ProjectWorkbenchSession,
	ProjectWorkbenchSessionOptions,
} from "@/adapters/outbound/workspace/project-workbench-session.js";
import type { WwwSettings }          from "@/core/domain/execution/model-settings.js";
import type { RecentSessionSummary } from "@/core/ports/persistence/session-repository";

export      { listNativeThreads               } from "@/adapters/outbound/workspace/native-thread-discovery.js";

/** Native Workbench 실행 입력. 생략된 속성은 호환 surface와 관측 runtime을 사용한다. */
export interface RunAppOptions {
	/** 생략하면 새 Native thread를 시작한다. */
	resumeThreadId ?: string;
	/** 생략하면 Codex execution lane을 사용한다. */
	executionLane  ?: ExecutionLane;
	/** 생략하면 호환 Workbench, www면 현재 Native 제품 surface를 연다. */
	surface        ?: "www";
	/** 생략하면 호환 관측 모드다. WWW 진입점은 명시적으로 off를 선택한다. */
	requestRuntimeMode ?: "off" | "observe";
	/** 생략하면 외부 runtime config를 로드하지 않는다. */
	runtimeConfig  ?: string;
}

/** runApp의 외부 설정·세션·화면 경계. */
export interface RunAppDependencies {
	loadSettings                 ()                                                         : Promise<WwwSettings>                 ;
	loadRequestCapabilityConfig  (path: string                                             ): ReturnType<typeof loadRequestCapabilityConfig>;
	createProjectWorkbenchSession(cwd: string, options: ProjectWorkbenchSessionOptions     ): Promise<ProjectWorkbenchSession>   ;
	openProjectWorkbench         (project: ProjectWorkbenchSession, options: RunAppOptions ): Promise<void>                      ;
}

const productionRunAppDependencies: RunAppDependencies = {
	loadSettings,
	loadRequestCapabilityConfig,
	createProjectWorkbenchSession,
	openProjectWorkbench,
};

export async function runApp(
	options      : RunAppOptions      = {},
	dependencies : RunAppDependencies = productionRunAppDependencies,
): Promise<void> {
	const settings      = await dependencies.loadSettings() ;
	const executionLane = options.executionLane ?? "codex" ;
	const requestCapabilityFactory     = options.runtimeConfig
		? await dependencies.loadRequestCapabilityConfig(options.runtimeConfig) : undefined;
	const requestRuntimeMode          = requestCapabilityFactory ? "broker" : options.requestRuntimeMode ?? "observe";
	const piExecutionSelection        = executionLane === "pi"
		? { provider: settings.provider, model: settings.model, effort: settings.effort }
		: {};
	const sessionOptions: ProjectWorkbenchSessionOptions = {
		executionLane,
		requestRuntimeMode,
		...(options.resumeThreadId !== undefined ? { resumeThreadId: options.resumeThreadId } : {}),
		...(requestCapabilityFactory ? { requestCapabilityFactory } : {}),
		// Project YAML owns the native Codex policy.  The legacy settings store is
		// still used by the compatibility/Pi lane and for explicit model changes,
		// but must not silently override `.www/workbench.yaml` on startup.
		...piExecutionSelection,
		...(executionLane === "pi" ? { systemPrompt: buildPiExecutionSystemPrompt(process.cwd()) } : {}),
		persistModelSelection : async (selection, catalog) => {
			if (executionLane === "pi") throw new Error("Pi Phase A 모델 변경은 새 Workbench에서만 적용할 수 있습니다.");
			const next : WwwSettings = { provider: "openai-codex", ...selection };
			await saveWorkbenchExecutionSelection(process.cwd(), next, catalog);
		},
	};
	const project = await dependencies.createProjectWorkbenchSession(process.cwd(), sessionOptions);
	try {
		await dependencies.openProjectWorkbench(project, options);
	} catch (error) {
		await project.close();
		throw error;
	}
}

export async function runWww(
	options      : RunAppOptions      = {},
	dependencies : RunAppDependencies = productionRunAppDependencies,
): Promise<void> { await runApp({ ...options, surface: "www", requestRuntimeMode: "off" }, dependencies); }

async function loadSettings(): Promise<WwwSettings> {
	const { FileSettingsStore } = await import("@/adapters/outbound/persistence/settings-store");
	return new FileSettingsStore().load();
}

async function openProjectWorkbench(project: ProjectWorkbenchSession, options: RunAppOptions): Promise<void> {
	const { createProjectAuthController } = await import("@/adapters/outbound/authentication/project-auth");
	const { runProjectWorkbenchShell }    = await import("@/adapters/inbound/tui/shell/workbench-shell");
	runProjectWorkbenchShell({
		workbench : project.workbench,
		cwd       : project.workspace.root,
		usage     : project.usage,
		auth      : createProjectAuthController(),
		...(options.surface !== undefined ? { surface: options.surface } : {}),
		developmentMapSource        : new FileDevelopmentMapSource(project.workspace.root),
		...(project.development ? { development: project.development } : {}),
		observabilityHistorySource : new ObservabilityHistorySource(join(project.workspace.root, ".www", "runtime", "activity")),
		gitTelemetrySource         : new GitTelemetrySource(),
		homeDirectory              : homedir(),
		composerDraft              : project.composerDraft,
		releaseSessionLease        : project.releaseSessionLease,
	});
}

export function codexInteractiveModel(settings: WwwSettings): string {
	return settings.provider === "openai-codex" ? settings.model : DEFAULT_SETTINGS.model;
}

export async function runAuth(args: string[]): Promise<void> {
	const { createProjectAuthController } = await import("@/adapters/outbound/authentication/project-auth");
	const { runAuthCommand }              = await import("@/adapters/inbound/cli/auth-command");
	await runAuthCommand(createProjectAuthController(), args);
}

/** Legacy SessionRuntime archive only. Native Codex threads are resumed by their opaque id. */
export async function listSessions(): Promise<RecentSessionSummary[]> {
	const { listProjectSessions } = await import("@/adapters/outbound/workspace/project-session");
	return listProjectSessions(process.cwd());
}
