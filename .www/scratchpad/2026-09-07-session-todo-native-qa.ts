import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExecutorPort } from "../../src/system/contracts/ports/executor-port.js";
import { ProjectWorkbench } from "../../src/system/services/project-workbench.js";
import type { NativeHarnessEvent, NativeTurnStart } from "../../src/system/contracts/native-session.js";
import { parseTodoMarkdown, type TodoDocument } from "../../src/system/contracts/todos.js";
import { CodexAppServer } from "../../src/system/adapters/executors/codex-app-server.js";
import {
	createProjectWorkbenchSession,
	scopedTodoSessionId,
	type ProjectWorkbenchSession,
	type ProjectWorkbenchSessionFactories,
} from "../../src/system/services/project-workbench-session.js";

const MODEL = "gpt-5.6-sol";
const EFFORT = "low";
const TIMEOUT_MS = 120_000;

type NativeObservation = {
	readonly method: string;
	readonly threadId: string | null;
	readonly turnId: string | null;
	readonly planSteps: readonly string[];
	readonly turnStatus: string | null;
	readonly itemType: string | null;
	readonly toolName: string | null;
};

const observations: NativeObservation[] = [];
const temporaryRoot = await mkdtemp(join(tmpdir(), "www-woo-702-native-"));
const server = await CodexAppServer.connect({ requestTimeoutMs: 60_000 });
const unsubscribe = server.subscribe((event) => {
	if (event.type !== "notification") return;
	const params = asRecord(event.params);
	const plan = Array.isArray(params.plan) ? params.plan : [];
	const turn = asRecord(params.turn);
	const item = asRecord(params.item);
	observations.push({
		method: event.method,
		threadId: event.refs.threadId ?? null,
		turnId: event.refs.turnId ?? null,
		planSteps: plan.flatMap((entry) => {
			const step = asRecord(entry).step;
			return typeof step === "string" ? [step] : [];
		}),
		turnStatus: typeof turn.status === "string" ? turn.status : null,
		itemType: typeof item.type === "string" ? item.type : null,
		toolName: typeof item.tool === "string" ? item.tool : typeof item.name === "string" ? item.name : null,
	});
});

function readonlyEphemeralPort(): ExecutorPort {
	return {
		startThread: input => server.startThread({
			...input,
			model: MODEL,
			effort: EFFORT,
			approvalPolicy: "never",
			sandbox: "read-only",
			ephemeral: true,
		}),
		resumeThread: input => server.resumeThread({
			...input,
			model: MODEL,
			effort: EFFORT,
			approvalPolicy: "never",
			sandbox: "read-only",
		}),
		readThread: input => server.readThread(input),
		listThreads: input => server.listThreads(input),
		startTurn: input => {
			const { sandboxPolicy: _ignoredWorkspaceWritePolicy, ...readOnlyTurn } = input;
			return server.startTurn({
				...readOnlyTurn,
				model: MODEL,
				effort: EFFORT,
				approvalPolicy: "never",
			} as NativeTurnStart);
		},
		interruptTurn: input => server.interruptTurn(input),
		respondToApproval: input => server.respondToApproval(input),
		subscribe: listener => server.subscribe(listener),
		// One App Server process must outlive the first Workbench so its ephemeral
		// thread can be resumed by the second Workbench in this probe.
		close: async () => undefined,
	};
}

const overrides: Partial<ProjectWorkbenchSessionFactories> = {
	connectNative: async () => readonlyEphemeralPort(),
	createWorkbench: (native, journal, options) => new ProjectWorkbench(native, journal, {
		...options,
		approvalPolicy: "never",
		sandbox: "read-only",
	}),
	// Keep this acceptance probe focused on Native -> journal -> Todo. These
	// auxiliary model paths are unrelated and would add extra network requests.
	createActivityNarrator: () => ({
		narrate: async request => ({ what: request.stepTitle, inputSummary: request.inputSummary }),
	}),
	createTNoteSource: () => ({
		readAll: async () => [],
		create: async () => { throw new Error("T-note generation is outside the WOO-702 Native QA scope"); },
	}),
};

async function open(resumeThreadId?: string): Promise<ProjectWorkbenchSession> {
	return createProjectWorkbenchSession(temporaryRoot, {
		model: MODEL,
		effort: EFFORT,
		...(resumeThreadId ? { resumeThreadId } : {}),
	}, overrides);
}

async function startPlan(session: ProjectWorkbenchSession, label: string): Promise<{
	readonly threadId: string;
	readonly turnId: string;
	readonly todo: TodoDocument;
	readonly path: string;
	readonly source: string;
}> {
	const modeReceipt = await session.workbench.dispatch({ type: "session.mode", mode: "plan" });
	assert(modeReceipt.state === "accepted", `${label}: Plan collaboration mode was not accepted`);
	const receipt = await session.workbench.dispatch({
		type: "chat.send",
		text: [
			"Before any other action, call update_plan with exactly three concrete steps and keep that plan current while you work.",
			"Then inspect this temporary cwd using read-only operations only: print the cwd, list its top-level entries, and summarize what you observed.",
			`Include this harmless probe label in one plan step: ${label}.`,
		].join(" "),
	});
	assert(receipt.state === "accepted", `${label}: chat.send was not accepted`);
	const snapshot = await waitForPlanTodo(session, value => Boolean(
		value.threadId
		&& value.activeTurnId
		&& value.workFlow.source
		&& value.workFlow.steps.length === 3
		&& value.todo?.source
		&& value.todo.items.length === 3,
	), `${label}: actual Native Plan did not reach Todo.md`);
	const threadId = snapshot.threadId!;
	const turnId = snapshot.activeTurnId!;
	const todo = snapshot.todo!;
	const path = join(session.workspace.todosDirectory, scopedTodoSessionId(threadId), "Todo.md");
	const source = await readFile(path, "utf8");
	const reread = parseTodoMarkdown(source);
	assert(reread.source?.turnId === turnId, `${label}: file turn does not match the actual turn`);
	assert(reread.source?.input !== null, `${label}: file is missing the observed Input reference`);
	assert(reread.source?.rootExecution.model === MODEL, `${label}: file is missing the actual model reference`);
	assert(reread.items.every(item => item.source?.identity.length === 64), `${label}: file lost a full Native item identity`);
	assert(reread.items.every(item => item.id === `native-${item.source!.identity.slice(0, 48)}`), `${label}: display IDs do not derive from full item identities`);
	return { threadId, turnId, todo: reread, path, source };
}

async function waitForPlanTodo(
	session: ProjectWorkbenchSession,
	predicate: (snapshot: ProjectWorkbenchSession["workbench"]["snapshot"]) => boolean,
	message: string,
): Promise<ProjectWorkbenchSession["workbench"]["snapshot"]> {
	if (predicate(session.workbench.snapshot)) return session.workbench.snapshot;
	if (session.workbench.snapshot.threadId && session.workbench.snapshot.activeTurnId === null && session.workbench.snapshot.phase === "ready") {
		throw new Error(`${message}; Native turn completed without a synchronized Plan`);
	}
	return new Promise((resolve, reject) => {
		let stop = (): void => undefined;
		const timeout = setTimeout(() => {
			stop();
			reject(new Error(message));
		}, TIMEOUT_MS);
		stop = session.workbench.subscribe(snapshot => {
			if (predicate(snapshot)) {
				clearTimeout(timeout);
				stop();
				resolve(snapshot);
				return;
			}
			if (snapshot.threadId && snapshot.activeTurnId === null && snapshot.phase === "ready") {
				clearTimeout(timeout);
				stop();
				reject(new Error(`${message}; Native turn completed without a synchronized Plan`));
			}
		});
	});
}

async function waitForSnapshot(
	session: ProjectWorkbenchSession,
	predicate: (snapshot: ProjectWorkbenchSession["workbench"]["snapshot"]) => boolean,
	message: string,
): Promise<ProjectWorkbenchSession["workbench"]["snapshot"]> {
	if (predicate(session.workbench.snapshot)) return session.workbench.snapshot;
	return new Promise((resolve, reject) => {
		let stop = (): void => undefined;
		const timeout = setTimeout(() => {
			stop();
			reject(new Error(message));
		}, TIMEOUT_MS);
		stop = session.workbench.subscribe(snapshot => {
			if (!predicate(snapshot)) return;
			clearTimeout(timeout);
			stop();
			resolve(snapshot);
		});
	});
}

async function waitForTerminal(turnId: string): Promise<void> {
	const terminal = (observation: NativeObservation): boolean => observation.turnId === turnId
		&& (observation.method === "turn/completed"
			|| observation.method === "turn/failed"
			|| observation.method === "turn/interrupted");
	if (observations.some(terminal)) return;
	await new Promise<void>((resolve, reject) => {
		const deadline = Date.now() + TIMEOUT_MS;
		const poll = (): void => {
			if (observations.some(terminal)) return resolve();
			if (Date.now() >= deadline) return reject(new Error(`Native turn did not become terminal: ${turnId}`));
			setTimeout(poll, 50);
		};
		poll();
	});
}

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> {
	return value && typeof value === "object" && !Array.isArray(value)
		? value as Readonly<Record<string, unknown>>
		: {};
}

function sha256(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

let firstSession: ProjectWorkbenchSession | null = null;
let resumedSession: ProjectWorkbenchSession | null = null;
let foreignSession: ProjectWorkbenchSession | null = null;
try {
	firstSession = await open();
	const first = await startPlan(firstSession, "WOO-702-primary");
	await firstSession.close();
	firstSession = null;
	await waitForTerminal(first.turnId);

	resumedSession = await open(first.threadId);
	const resumed = await waitForSnapshot(
		resumedSession,
		snapshot => snapshot.phase === "ready" && snapshot.threadId === first.threadId && Boolean(snapshot.todo?.source),
		"resumed Workbench did not restore the source-bound Todo",
	);
	assert(JSON.stringify(resumed.todo) === JSON.stringify(first.todo), "resume changed the persisted Todo projection");
	const resumedSource = await readFile(first.path, "utf8");
	assert(resumedSource === first.source, "resume changed Todo.md bytes without a newer Plan");
	await resumedSession.close();
	resumedSession = null;

	foreignSession = await open();
	const foreign = await startPlan(foreignSession, "WOO-702-foreign");
	assert(foreign.threadId !== first.threadId, "fresh session reused the primary Native thread");
	assert(foreign.path !== first.path, "different Native threads resolved to the same Todo.md path");
	assert(await readFile(first.path, "utf8") === first.source, "foreign session changed the primary Todo.md");
	await foreignSession.close();
	foreignSession = null;
	await waitForTerminal(foreign.turnId);

	const firstPlanEvents = observations.filter(event => event.method === "turn/plan/updated" && event.turnId === first.turnId);
	const foreignPlanEvents = observations.filter(event => event.method === "turn/plan/updated" && event.turnId === foreign.turnId);
	assert(firstPlanEvents.length > 0, "primary Plan was not observed from the real App Server");
	assert(foreignPlanEvents.length > 0, "foreign Plan was not observed from the real App Server");

	console.log(JSON.stringify({
		verdict: "PASS",
		native: {
			adapter: "CodexAppServer",
			model: MODEL,
			effort: EFFORT,
			ephemeral: true,
			sandbox: "read-only",
			approvalPolicy: "never",
		},
		primary: {
			threadId: first.threadId,
			turnId: first.turnId,
			todoRelativePath: first.path.slice(temporaryRoot.length + 1),
			todoSha256: sha256(first.source),
			revision: first.todo.revision,
			input: first.todo.source!.input,
			planRevision: first.todo.source!.planRevision,
			rootExecution: first.todo.source!.rootExecution,
			items: first.todo.items.map(item => ({
				id: item.id,
				identity: item.source!.identity,
				status: item.status,
			})),
			planEventCount: firstPlanEvents.length,
		},
		resume: {
			threadId: resumed.threadId,
			todoByteIdentical: resumedSource === first.source,
			todoProjectionIdentical: JSON.stringify(resumed.todo) === JSON.stringify(first.todo),
		},
		foreignIsolation: {
			threadId: foreign.threadId,
			turnId: foreign.turnId,
			todoRelativePath: foreign.path.slice(temporaryRoot.length + 1),
			primaryTodoUnchanged: await readFile(first.path, "utf8") === first.source,
			planEventCount: foreignPlanEvents.length,
		},
	}, null, 2));
} catch (error) {
	const active = firstSession ?? resumedSession ?? foreignSession;
	const counts = observations.reduce<Record<string, number>>((result, observation) => {
		result[observation.method] = (result[observation.method] ?? 0) + 1;
		return result;
	}, {});
	const itemTypeCounts = observations.reduce<Record<string, number>>((result, observation) => {
		if (observation.itemType) result[observation.itemType] = (result[observation.itemType] ?? 0) + 1;
		return result;
	}, {});
	console.error(JSON.stringify({
		verdict: "FAIL",
		error: error instanceof Error ? error.message : String(error),
		nativeEventCounts: counts,
		itemTypeCounts,
		publicToolItems: observations.filter(observation => observation.itemType && observation.toolName)
			.map(observation => ({ method: observation.method, itemType: observation.itemType, toolName: observation.toolName })),
		planEvents: observations.filter(observation => observation.method === "turn/plan/updated"),
		workbench: active ? {
			phase: active.workbench.snapshot.phase,
			threadId: active.workbench.snapshot.threadId,
			activeTurnId: active.workbench.snapshot.activeTurnId,
			error: active.workbench.snapshot.error,
			workFlowSource: active.workbench.snapshot.workFlow.source,
			workFlowSteps: active.workbench.snapshot.workFlow.steps.map(step => ({ title: step.title, status: step.status })),
			todo: active.workbench.snapshot.todo,
		} : null,
	}, null, 2));
	throw error;
} finally {
	await firstSession?.close().catch(() => undefined);
	await resumedSession?.close().catch(() => undefined);
	await foreignSession?.close().catch(() => undefined);
	unsubscribe();
	await server.close().catch(() => undefined);
	await rm(temporaryRoot, { recursive: true, force: true });
}
