import type { ModelClient, RecentSessionSummary, TodoController } from "../application/ports";
import { join } from "node:path";
import { SessionRuntime } from "../application/session-runtime";
import { SessionMonitor } from "../application/session-monitor";
import { PlanningService } from "../application/planning-service";
import { TodoLedger } from "../application/todo-ledger";
import type { WwwSettings } from "../domain/model-settings";
import { createProjectAgentTools } from "./agent-tools";
import { FileProjectWorkspace, type ProjectWorkspace } from "./project-workspace";
import { SessionEventStore } from "./session-store";
import { FileTodoStore, migrateLegacyTodo } from "./todo-store";
import { FilePlanningStore } from "./planning-store";

export interface ProjectSessionBundle {
	workspace: ProjectWorkspace;
	runtime: SessionRuntime;
	todos: TodoController;
	monitor: SessionMonitor;
	planning: PlanningService;
	releaseSessionLease(): Promise<void>;
}

export async function createProjectSession(
	cwd: string,
	settings: WwwSettings,
	model: ModelClient,
	requestedSessionId?: string,
): Promise<ProjectSessionBundle> {
	const workspace = await FileProjectWorkspace.open(cwd);
	const sessions = new SessionEventStore(workspace.sessionsDirectory);
	const sessionId = requestedSessionId ?? crypto.randomUUID();
	const lease = await FileProjectWorkspace.acquireSessionLease(workspace, sessionId);
	try {
		await migrateLegacyTodo(
			workspace.legacyTodoPath,
			workspace.todosDirectory,
			async owner => owner === sessionId || !(await FileProjectWorkspace.hasSessionLease(workspace, owner)),
		);
		const todos = new TodoLedger(
			sessionId,
			new FileTodoStore(join(workspace.todosDirectory, sessionId, "Todo.md")),
			sessions,
		);
		await todos.initialize();
		const planning = new PlanningService(new FilePlanningStore(workspace.directory));
		const planningSnapshot = await planning.initialize();
		const tools = createProjectAgentTools(workspace.root, { todos });
		const runtime = new SessionRuntime(
			settings,
			model,
			sessions,
			{ cwd, root: workspace.root, projectName: workspace.name },
			sessionId,
			tools,
			todos,
			planningSnapshot,
		);
		await runtime.initialize({ resume: requestedSessionId !== undefined });
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

export async function listProjectSessions(cwd: string): Promise<RecentSessionSummary[]> {
	const workspace = await FileProjectWorkspace.open(cwd);
	return (await new SessionEventStore(workspace.sessionsDirectory).list())
		.map(({ id, updatedAt }) => ({ id, updatedAt }));
}
