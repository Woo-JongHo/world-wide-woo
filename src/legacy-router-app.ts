import      { runTuiShell                           } from "@/adapters/inbound/tui/legacy/legacy-session-shell";

import      { AuthService                           } from "@/adapters/outbound/authentication/auth-service";
import      { FileCredentialStore                   } from "@/adapters/outbound/authentication/credential-store";
import      { ModelRouter, createModelRegistry      } from "@/adapters/outbound/authentication/model-router";
import      { GitHubRepositoryInsights              } from "@/adapters/outbound/git/repository-insights";
import      { UsageService                          } from "@/adapters/outbound/observability/usage-service";
import      { FileComposerDraftController           } from "@/adapters/outbound/persistence/composer-draft-store";
import      { FileSettingsStore, routerSettingsPath } from "@/adapters/outbound/persistence/settings-store";
import      { createProjectSession                  } from "@/adapters/outbound/workspace/project-session";

import      { RouterService, reconcileInitialRouter } from "@/core/application/routing/router-service";

import type { TuiShellDependencies                  } from "@/adapters/inbound/tui/legacy/legacy-session-shell";

/** Legacy SessionRuntime Router를 조립하고 TUI에 전달하는 선택 입력이다. */
export interface RunLegacyRouterOptions {
	/** 재개할 Legacy SessionRuntime ID다. 생략하면 새 세션을 시작한다. */
	resumeSessionId ?: string;
}

/** Legacy Router의 환경·저장소·TUI 전달을 대체하는 테스트 경계다. */
//  NAME                  : ( PARAMETERS                          ) => RETURN TYPE        ;
export interface LegacyRouterAppDependencies {
	/** Router workspace를 여는 현재 작업 경로다. */
	cwd                   : ()                                      => string             ;
	/** Native Workbench와 분리된 Router 설정 저장소를 만든다. */
	createSettingsStore   : ()                                      => FileSettingsStore  ;
	/** Router 모델 인증용 credential 저장소를 만든다. */
	createCredentialStore : ()                                      => FileCredentialStore;
	/** 정상 전달 뒤 runtime과 lease의 종료 책임을 TUI에 넘긴다. */
	runShell              : ( dependencies : TuiShellDependencies ) => void               ;
}

const productionDependencies: LegacyRouterAppDependencies = {
	cwd                   : () => process.cwd(),
	createSettingsStore   : () => new FileSettingsStore(routerSettingsPath()),
	createCredentialStore : () => new FileCredentialStore(),
	runShell              :       runTuiShell,
};

/** 호환 Legacy Router 진입점이다. 기본 실행은 Native Codex Workbench가 소유한다. */
export async function runLegacyRouter(
	options      : RunLegacyRouterOptions      = {},
	dependencies : LegacyRouterAppDependencies = productionDependencies,
): Promise< void > {
	const cwd           = dependencies.cwd();
	const settingsStore = dependencies.createSettingsStore();
	const credentials   = dependencies.createCredentialStore();
	const registry      = createModelRegistry(credentials);
	const modelRouter   = new ModelRouter(registry);
	const settings      = await reconcileInitialRouter(await settingsStore.load(), modelRouter, settingsStore);
	const project       = await createProjectSession(
		cwd,
		settings,
		modelRouter,
		options.resumeSessionId,
	);

	const { workspace, runtime, todos, monitor, planning, releaseSessionLease } = project;
	let handedOff = false;

	try {
		const composerDraft = await FileComposerDraftController.create(
			workspace.root,
			runtime.id,
			workspace.draftsDirectory,
		);
		dependencies.runShell({
			runtime             : runtime,
			auth                : new AuthService(registry),
			usage               : new UsageService(credentials, registry),
			routerSettings      : new RouterService(settingsStore, runtime, settings),
			repository          : new GitHubRepositoryInsights(cwd),
			composerDraft       : composerDraft,
			releaseSessionLease : releaseSessionLease,
			todos               : todos,
			monitor             : monitor,
			planning            : planning,
		});
		handedOff = true;
	} finally {
		if (!handedOff) {
			monitor.dispose();
			try {
				await runtime.close();
			} finally {
				await releaseSessionLease();
			}
		}
	}
}
