import { join } from "node:path";

import { SessionMonitor  } from "../../../core/application/session/session-monitor";
import { SessionRuntime  } from "../../../core/application/session/session-runtime";
import { PlanningService } from "../../../core/application/work/planning-service";
import { TodoLedger      } from "../../../core/application/work/todo-ledger";

import { createProjectAgentTools      } from "../execution/agent-tools";
import { LocalTerminalCommandExecutor } from "../execution/terminal-command-executor";

import { FilePlanningStore                } from "../persistence/planning-store";
import { SessionEventStore                } from "../persistence/session-store";
import { FileTodoStore, migrateLegacyTodo } from "../persistence/todo-store";

import { FileProjectWorkspace, type ProjectWorkspace } from "./project-workspace";
import { loadWorkbenchConfig                         } from "./workbench-config.js";

import type { WwwSettings } from "../../../core/domain/execution/model-settings";

import type { ModelClient, RecentSessionSummary, TodoController } from "../../../core/ports";

/** Legacy Router가 TUI에 넘기는 project session 자원과 종료 책임이다. */
export interface ProjectSessionBundle {
	workspace           : ProjectWorkspace;
	runtime             : SessionRuntime;
	todos               : TodoController;
	monitor             : SessionMonitor;
	planning            : PlanningService;
	/** TUI가 종료한 뒤 session writer lease를 반납한다. 반복 호출은 최초 호출만 효과가 있다. */
	releaseSessionLease : () => Promise< void >;
}

/**
 * Legacy Router용 project session을 새로 만들거나 기존 ID로 재개한다.
 * @param requestedSessionId 기존 session ID다. 생략하면 새 session을 만든다.
 */
export async function createProjectSession(
	cwd                 : string,
	settings            : WwwSettings,
	model               : ModelClient,
	requestedSessionId ?: string,
): Promise< ProjectSessionBundle > {
	const workspace = await FileProjectWorkspace.open(cwd);
	const config    = await loadWorkbenchConfig(workspace.root);
	const sessions  = new SessionEventStore(workspace.sessionsDirectory);
	const resume    = requestedSessionId !== undefined;
	const sessionId = requestedSessionId ?? crypto.randomUUID();
	const lease     = await FileProjectWorkspace.acquireSessionLease(workspace, sessionId);

	try {
		await migrateLegacyTodo(workspace.legacyTodoPath, workspace.todosDirectory);

		const todos            = new TodoLedger(
			sessionId,
			new FileTodoStore(join(workspace.todosDirectory, sessionId, "Todo.md")),
			sessions,
		);
		await todos.initialize();

		const planning         = new PlanningService(new FilePlanningStore(workspace.directory));
		const planningSnapshot = await planning.initialize();
		const tools            = createProjectAgentTools(workspace.root, { todos });
		const runtime          = new SessionRuntime(
			settings,
			model,
			sessions,
			{ cwd, root: workspace.root, projectName: workspace.name },
			sessionId,
			tools,
			todos,
			planningSnapshot,
			new LocalTerminalCommandExecutor(),
			config.retry,
			config.orchestration.maxAgentRounds,
		);
		await runtime.initialize({ resume });

		const monitor = new SessionMonitor(runtime, todos);
		return {
			workspace,
			runtime,
			todos,
			monitor,
			planning,
			releaseSessionLease: () => lease.release(),
		};
	} catch (error) {
		await lease.release();
		throw error;
	}
}

/** Legacy SessionRuntime 보관소의 세션 ID와 파일 수정 시각을 최신순으로 조회한다. */
export async function listProjectSessions(cwd: string): Promise< RecentSessionSummary[] > {
	const workspace = await FileProjectWorkspace.open(cwd);
	return (await new SessionEventStore(workspace.sessionsDirectory).list())
		.map(({ id, updatedAt }) => ({ id, updatedAt }));
}
