import type { ModelClient, RecentSessionSummary, TodoController } from "../application/ports";
import { SessionRuntime } from "../application/session-runtime";
import { TodoLedger } from "../application/todo-ledger";
import type { WwwSettings } from "../domain/model-settings";
import { createProjectAgentTools } from "./agent-tools";
import { FileProjectWorkspace, type ProjectWorkspace } from "./project-workspace";
import { SessionEventStore } from "./session-store";
import { FileTodoStore } from "./todo-store";

export interface ProjectSessionBundle {
	workspace: ProjectWorkspace;
	runtime: SessionRuntime;
	todos: TodoController;
	recentSessions: readonly RecentSessionSummary[];
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
		const todos = new TodoLedger(
			sessionId,
			new FileTodoStore(workspace.todoPath),
			sessions,
			undefined,
			owner => FileProjectWorkspace.isSessionLeaseActive(workspace, owner),
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
		const recentSessions = (await sessions.list())
			.filter(session => session.id !== runtime.id)
			.map(({ id, updatedAt }) => ({ id, updatedAt }));
		return {
			workspace,
			runtime,
			todos,
			recentSessions,
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
