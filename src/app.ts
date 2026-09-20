import      { homedir                         } from "node:os";
import      { join                            } from "node:path";

import      { FileDevelopmentMapSource        } from "@/adapters/outbound/development/development-map-source";
import      { buildPiExecutionSystemPrompt    } from "@/adapters/outbound/execution/factory.js";
import      { GitTelemetrySource              } from "@/adapters/outbound/git/git-telemetry-source.js";
import      { ObservabilityHistorySource      } from "@/adapters/outbound/observability/observability-history-source.js";
import      { createProjectWorkbenchSession   } from "@/adapters/outbound/workspace/project-workbench-session.js";
import      { loadRequestCapabilityConfig     } from "@/adapters/outbound/workspace/request-capability-config";
import      { saveWorkbenchExecutionSelection } from "@/adapters/outbound/workspace/workbench-config.js";
import      { DEFAULT_SETTINGS                } from "@/core/domain/execution/model-settings.js";

import type { ExecutionLane                   } from "@/adapters/outbound/execution/factory.js";
import type { WwwSettings                     } from "@/core/domain/execution/model-settings.js";
import type { RecentSessionSummary            } from "@/core/ports";

export      { listNativeThreads               } from "@/adapters/outbound/workspace/native-thread-discovery.js";

/** Workbench와 Astra 실행 입력. 생략된 속성은 새 thread와 기본 Codex runtime을 사용한다. */
export interface RunAppOptions {
	/** 생략하면 새 Native thread를 시작한다. */
	resumeThreadId ?: string;
	/** 생략하면 Codex execution lane을 사용한다. */
	executionLane  ?: ExecutionLane;
	/** 생략하면 호환 Workbench, astra면 Astra Console을 연다. */
	design         ?: "astra";
	/** 생략하면 외부 runtime config를 로드하지 않는다. */
	runtimeConfig  ?: string;
}

export async function runApp(options : RunAppOptions = {}): Promise<void> {
	const { FileSettingsStore }        = await import("@/adapters/outbound/persistence/settings-store");
	const { runProjectWorkbenchShell } = await import("@/adapters/inbound/tui/shell/workbench-shell");
	const settingsStore                = new FileSettingsStore();
	const settings                     = await settingsStore.load();
	const executionLane                = options.executionLane ?? "codex";
	const requestCapabilityFactory     = options.runtimeConfig
		? await loadRequestCapabilityConfig(options.runtimeConfig) : undefined;
	const project                      = await createProjectWorkbenchSession(process.cwd(), {
		resumeThreadId           : options.resumeThreadId,
		executionLane            : executionLane,
		requestCapabilityFactory : requestCapabilityFactory,
		requestRuntimeMode       : requestCapabilityFactory ? "broker" : options.design === "astra" ? "off" : "observe",
		// Project YAML owns the native Codex policy.  The legacy settings store is
		// still used by the compatibility/Pi lane and for explicit model changes,
		// but must not silently override `.www/workbench.yaml` on startup.
		...(executionLane === "pi" ? { provider: settings.provider, model: settings.model, effort: settings.effort } : {}),
		systemPrompt          : executionLane === "pi" ? buildPiExecutionSystemPrompt(process.cwd()) : undefined,
		persistModelSelection : async (selection, catalog) => {
			if (executionLane === "pi") throw new Error("Pi Phase A 모델 변경은 새 Workbench에서만 적용할 수 있습니다.");
			const next : WwwSettings = { provider: "openai-codex", ...selection };
			await saveWorkbenchExecutionSelection(process.cwd(), next, catalog);
		},
	});
	try {
		const { createProjectAuthController } = await import("@/adapters/outbound/authentication/project-auth");
		runProjectWorkbenchShell({
			workbench                   : project.workbench,
			cwd                         : project.workspace.root,
			usage                       : project.usage,
			auth                        : createProjectAuthController(),
			design                      : options.design,
			developmentMapSource        : new FileDevelopmentMapSource(project.workspace.root),
			development                 : project.development,
			observabilityHistorySource  : new ObservabilityHistorySource(join(project.workspace.root, ".www", "runtime", "activity")),
			gitTelemetrySource          : new GitTelemetrySource(),
			homeDirectory               : homedir(),
			composerDraft               : project.composerDraft,
			releaseSessionLease         : project.releaseSessionLease,
		});
	} catch (error) {
		await project.close();
		throw error;
	}
}

export async function runAstra(options: RunAppOptions = {}): Promise<void> { await runApp({ ...options, design: "astra" }); }

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
