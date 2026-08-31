import type { ModelClient, RecentSessionSummary, TodoController } from "../application/ports";
import { join } from "node:path";
import { SessionRuntime } from "../application/session-runtime";
import { TodoLedger } from "../application/todo-ledger";
import type { WwwSettings } from "../domain/model-settings";
import { createProjectAgentTools } from "./agent-tools";
import { FileProjectWorkspace, type ProjectWorkspace } from "./project-workspace";
import { SessionEventStore } from "./session-store";
import { FileTodoStore, migrateLegacyTodo } from "./todo-store";

export interface ProjectSessionBundle {
	workspace: ProjectWorkspace;
	runtime: SessionRuntime;
	todos: TodoController;
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
		const tools = createProjectAgentTools(workspace.root, { todos });
		const runtime = new SessionRuntime(
			settings,
			model,
			sessions,
			{ cwd, root: workspace.root, projectName: workspace.name },
			sessionId,
			tools,
			todos,
		);
		await runtime.initialize({ resume: requestedSessionId !== undefined });
		return {
			workspace,
			runtime,
			todos,
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
