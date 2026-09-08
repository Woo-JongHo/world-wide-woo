import type { ProjectActivity } from "../domain/execution/project-activity.js";
import type { TodoItem } from "../domain/work/todos.js";
import type {
	ExecutionRunId,
	RuntimeEventKind,
	RuntimeEventDurability,
	ExecutionRunPhase,
	CompletionReceiptStatus,
	WaitReason,
	ExecutionHash,
	RuntimeEvent,
	ExecutionEvidence,
	ExecutionTask,
	ExecutionActivity,
	CompletionReceipt,
	CompletionChange,
	CompletionVerification,
	CompletionRemaining,
	ExecutionCheckpoint,
	ExecutionRunState,
	ExecutionRunReduction
} from "../domain/execution/execution-run-contract.js";
export type {
	ExecutionRunId,
	RuntimeEventKind,
	RuntimeEventDurability,
	ExecutionRunPhase,
	CompletionReceiptStatus,
	WaitReason,
	ExecutionHash,
	RuntimeEvent,
	ExecutionEvidence,
	ExecutionTask,
	ExecutionActivity,
	CompletionReceipt,
	CompletionChange,
	CompletionVerification,
	CompletionRemaining,
	ExecutionCheckpoint,
	ExecutionRunState,
	ExecutionRunReduction
} from "../domain/execution/execution-run-contract.js";

const encoder = new TextEncoder();
const frame = (value: unknown): Uint8Array => encoder.encode(JSON.stringify(value));
const digest = (hash: ExecutionHash, value: unknown) => hash.sha256Hex(frame(value));
const terminal = (phase: ExecutionRunPhase) => phase === "completed" || phase === "failed" || phase === "interrupted";

export function createExecutionRun(input: { runId: ExecutionRunId; threadId: string; turnId: string; hash: ExecutionHash; objective?: string }): ExecutionRunState {
	const state = {
		runId: input.runId, threadId: input.threadId, turnId: input.turnId, phase: "requested" as const,
		waitReason: null, objective: input.objective ?? "현재 요청을 처리합니다.", tasks: [], activeActivity: null,
		evidence: [], activities: [], lastSequence: null, receipt: null, rejectedEventIds: [],
	};
	return { ...state, checkpoint: { runId: state.runId, sequence: 0, digest: digest(input.hash, state) } };
}

export function normalizeProjectActivity(activity: ProjectActivity): RuntimeEvent {
	const method = stringValue(activity.payload.method);
	return {
		kind: eventKind(activity, method), durability: "durable", runId: `${activity.nativeRefs.threadId ?? "unknown"}:${activity.nativeRefs.turnId ?? "unknown"}`,
		threadId: activity.nativeRefs.threadId ?? "unknown", turnId: activity.nativeRefs.turnId ?? "unknown", activity,
		id: activity.id,
		sequence: activity.sequence,
		runSequence: typeof activity.payload.runSequence === "number" ? activity.payload.runSequence : undefined,
		sourceDigest: activity.sourceDigest,
		payload: activity.payload,
	};
}

export function reduceExecutionRun(state: ExecutionRunState, event: RuntimeEvent, hash: ExecutionHash): ExecutionRunReduction {
	if (event.runId !== state.runId || event.threadId !== state.threadId || event.turnId !== state.turnId) return { state, accepted: false, reason: "foreign" };
	if (state.activities.some(activity => activity.id === event.id)) return { state, accepted: false, reason: "duplicate" };
	if (terminal(state.phase)) return { state, accepted: false, reason: "late" };
	if (event.durability === "durable" && (!event.activity || event.sequence !== event.activity.sequence || event.sourceDigest !== event.activity.sourceDigest)) return { state, accepted: false, reason: "invalid" };
	if (event.runSequence !== undefined && state.lastRunSequence !== null && state.lastRunSequence !== undefined
		&& event.runSequence !== state.lastRunSequence + 1) {
		const next = checkpoint({
			...state,
			phase: "reconciling",
			waitReason: "gap",
			rejectedEventIds: [...state.rejectedEventIds, event.id],
		}, hash);
		return { state: next, accepted: false, reason: "gap" };
	}
	// Activity sequence is a journal-wide cursor, not a per-run ordinal. Other
	// root/child runs legitimately occupy values between two observations for
	// this run; only duplicate ids are meaningful without a dedicated run
	// ordinal. Journal continuity remains validated by the full-journal adapter.
	const activity = event.activity;
	const method = stringValue(event.payload?.method ?? activity?.payload.method);
	const nextActivities = activity ? [...state.activities, activity] : state.activities;
	let phase = state.phase === "reconciling" ? "reconciling" : nextPhase(state.phase, event, method);
	let objective = state.objective;
	if (activity?.kind === "message" && activity.payload.direction === "outbound" && typeof activity.payload.text === "string") objective = activity.payload.text;
	const taskResult = reduceTask(state.tasks, event, activity, method, hash);
	const evidence = activity ? [...state.evidence, evidenceFor(activity, method)] : state.evidence;
	const activeActivity = activity ? projectActivity(activity, method) : state.activeActivity;
	const base = { ...state, phase, waitReason: phase === "waiting" ? "approval" as const : null, objective, tasks: taskResult, evidence, activities: nextActivities, activeActivity, lastSequence: activity?.sequence ?? state.lastSequence, lastRunSequence: event.runSequence ?? state.lastRunSequence ?? null };
	let next = checkpoint(base, hash);
	if (isTerminal(event, activity, method) && phase !== "reconciling") {
		const status = terminalStatus(event, activity, method);
		phase = status === "cancelled" ? "interrupted" : status;
		next = checkpoint({ ...next, phase, activeActivity: null }, hash);
		const receipt = receiptFor(next, activity!, status, hash);
		next = { ...next, receipt };
	}
	return { state: next, accepted: true, reason: "applied" };
}

export function replayExecutionRun(initial: ExecutionRunState, events: readonly RuntimeEvent[], hash: ExecutionHash): ExecutionRunState {
	return events.reduce((state, event) => reduceExecutionRun(state, event, hash).state, initial);
}

export function projectExecutionTodo(run: ExecutionRunState): readonly Pick<TodoItem, "id" | "content" | "status">[] {
	return run.tasks.map(task => ({ id: task.id, content: task.title, status: task.status === "running" ? "in_progress" : task.status === "cancelled" || task.status === "failed" ? "blocked" : task.status }));
}
export function projectExecutionActivity(run: ExecutionRunState): ExecutionActivity | null { return run.activeActivity; }
export function projectExecutionCompletion(run: ExecutionRunState): CompletionReceipt | null { return run.receipt; }
export function executionCheckpointDigest(run: ExecutionRunState): string { return run.checkpoint.digest; }
export function completionReceiptDigest(receipt: CompletionReceipt): string { return receipt.receiptDigest; }

function checkpoint(state: Omit<ExecutionRunState, "checkpoint"> & { checkpoint?: ExecutionCheckpoint }, hash: ExecutionHash): ExecutionRunState {
	const sequence = state.lastSequence ?? 0;
	const { checkpoint: _checkpoint, receipt: _receipt, ...digestable } = state;
	return { ...state, checkpoint: { runId: state.runId, sequence, digest: digest(hash, digestable) } } as ExecutionRunState;
}
function eventKind(activity: ProjectActivity, method: string): RuntimeEventKind {
	if (isTerminal({ kind: "activity", activity } as RuntimeEvent, activity, method)) return "terminal";
	if (activity.kind === "approval" || method.includes("approval") || method.includes("permission")) return "request";
	if (method.includes("plan")) return "plan";
	if (method.includes("verif")) return "verification";
	if (activity.kind === "tool") return "tool";
	return "activity";
}
function nextPhase(current: ExecutionRunPhase, event: RuntimeEvent, method: string): ExecutionRunPhase {
	if (isTerminal(event, event.activity, method)) {
		const status = terminalStatus(event, event.activity, method);
		return status === "cancelled" ? "interrupted" : status;
	}
	if (event.kind === "request" && (event.activity?.kind === "approval" || method.includes("approval") || method.includes("permission"))) return "waiting";
	if (event.kind === "tool" && (event.activity?.phase === "failed" || event.activity?.phase === "cancelled")) return "blocked";
	if (event.kind === "verification" || method.includes("verif")) return "verifying";
	if (event.kind === "plan" || method.includes("plan")) return "planning";
	if (event.kind === "tool" || event.kind === "task" || event.kind === "activity") return "executing";
	if (event.kind === "request") return "understanding";
	return current;
}
function reduceTask(tasks: readonly ExecutionTask[], event: RuntimeEvent, activity: ProjectActivity | undefined, method: string, hash: ExecutionHash): readonly ExecutionTask[] {
	const plan = record(event.payload?.params ?? activity?.payload.params)?.plan;
	if (Array.isArray(plan)) {
		return plan.flatMap((entry, index) => {
			const value = record(entry);
			const title = stringValue(value?.step ?? value?.title).trim();
			if (!title) return [];
			const rawStatus = stringValue(value?.status).toLowerCase();
			const status = rawStatus === "completed" || rawStatus === "complete" ? "completed"
				: rawStatus === "failed" ? "failed"
					: rawStatus === "cancelled" || rawStatus === "canceled" ? "cancelled"
						: rawStatus === "inprogress" || rawStatus === "in_progress" || rawStatus === "running" ? "running"
							: "pending";
			const id = `plan:${index + 1}`;
			const prior = tasks.find(task => task.id === id);
			return [{ id, title, status, activityIds: activity ? [...(prior?.activityIds ?? []), activity.id] : prior?.activityIds ?? [] }];
		});
	}
	const itemId = activity?.nativeRefs.itemId ?? stringValue(event.payload?.itemId);
	if (!itemId) return tasks;
	const existing = tasks.find(task => task.id === itemId);
	const status = activity?.phase === "failed" ? "failed" : activity?.phase === "cancelled" ? "cancelled" : activity?.phase === "completed" ? "completed" : "running" as const;
	const title = stringValue(activity?.payload.title ?? event.payload?.title) || method || itemId;
	const planTask = tasks.find(task => task.id.startsWith("plan:") && (task.status === "running" || task.status === "pending"));
	if (planTask) {
		return tasks.map(task => task.id === planTask.id
			? { ...task, status: status === "completed" && task.status === "pending" ? "pending" : status, activityIds: activity ? [...task.activityIds, activity.id] : task.activityIds }
			: task);
	}
	if (!existing) return [...tasks, { id: itemId || digest(hash, [event.runId, activity?.sequence ?? event.sequence, title]), title, status, activityIds: activity ? [activity.id] : [] }];
	if (existing.status === "completed" || existing.status === "failed" || existing.status === "cancelled") return tasks;
	return tasks.map(task => task.id === itemId ? { ...task, status, activityIds: activity ? [...task.activityIds, activity.id] : task.activityIds } : task);
}
function evidenceFor(activity: ProjectActivity, method: string): ExecutionEvidence {
	const kind = activity.kind === "file-change" ? "change" : method.includes("verif") ? "verification" : activity.kind === "tool" ? "tool" : activity.kind === "message" ? "message" : "terminal";
	const status = activity.phase === "failed" ? "failed" : activity.phase === "cancelled" ? "interrupted" : "observed";
	return { activityId: activity.id, sequence: activity.sequence, sourceDigest: activity.sourceDigest, kind, status, summary: stringValue(activity.payload.text ?? activity.payload.title ?? activity.payload.method) };
}
function projectActivity(activity: ProjectActivity, method: string): ExecutionActivity | null {
	if (activity.phase === "completed" || activity.phase === "failed" || activity.phase === "cancelled") return null;
	const kind = activity.kind === "tool" ? "tool" : activity.kind === "file-change" ? "file-change" : activity.kind === "approval" ? "approval" : "progress";
	return { id: activity.id, sequence: activity.sequence, method, text: stringValue(activity.payload.text ?? activity.payload.title), kind };
}
function isTerminal(_event: RuntimeEvent, _activity: ProjectActivity | undefined, method: string): boolean {
	return method === "turn/completed" || method === "turn/failed" || method === "turn/cancelled" || method === "turn/interrupted"
		|| method === "run/completed" || method === "run/failed" || method === "run/cancelled" || method === "run/interrupted";
}
function terminalStatus(event: RuntimeEvent, activity: ProjectActivity | undefined, method: string): CompletionReceiptStatus {
	if (method.includes("cancel")) return "cancelled";
	if (event.kind === "interrupt" || method.includes("interrupt")) return "interrupted";
	if (method.includes("failed") || activity?.phase === "failed") return "failed";
	return "completed";
}
function receiptFor(run: ExecutionRunState, activity: ProjectActivity, status: CompletionReceiptStatus, hash: ExecutionHash): CompletionReceipt {
	const evidenceRefs = run.evidence.slice().sort((a, b) => a.sequence - b.sequence);
	const activities = new Map(run.activities.map(observation => [observation.id, observation]));
	const changed = evidenceRefs.flatMap((evidence) => {
		if (evidence.kind !== "change") return [];
		const payload = receiptFields(activities.get(evidence.activityId)?.payload);
		const ref = stringValue(payload.ref ?? payload.path ?? payload.file);
		const summary = stringValue(payload.summary ?? payload.text ?? payload.title);
		return ref && summary ? [{ kind: stringValue(payload.changeKind ?? payload.kind) || "file-change", ref, summary }] : [];
	});
	const verification: CompletionVerification[] = evidenceRefs.flatMap((evidence) => {
		if (evidence.kind !== "verification") return [];
		const payload = receiptFields(activities.get(evidence.activityId)?.payload);
		const command = stringValue(payload.command);
		const exitCode = typeof payload.exitCode === "number" ? payload.exitCode : null;
		const result = stringValue(payload.result ?? payload.text ?? payload.summary) || (exitCode === null ? "" : `exit code ${exitCode}`);
		if (!command || !result) return [];
		return [{ command, status: verificationStatus(payload, evidence, exitCode), result, evidenceRefs: [evidence.activityId] }];
	});
	const remaining = run.tasks
		.filter(task => task.status === "pending" || task.status === "running" || task.status === "failed" || task.status === "cancelled")
		.map(task => ({ summary: task.title, blocking: task.status === "failed" || task.status === "cancelled" }));
	const terminalSource = { id: activity.id, sequence: activity.sequence, sourceDigest: activity.sourceDigest };
	const receiptId = digest(hash, ["completion-receipt-v1", run.runId, terminalSource]);
	const bare = { receiptId, runId: run.runId, threadId: run.threadId, turnId: run.turnId, status, objective: run.objective, changed, verification, evidenceRefs, remaining, completedAt: activity.recordedAt, terminalSource, checkpointDigest: run.checkpoint.digest };
	return { ...bare, receiptDigest: digest(hash, bare) };
}
function stringValue(value: unknown): string { return typeof value === "string" ? value : ""; }
function record(value: unknown): Readonly<Record<string, unknown>> | null {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? value as Readonly<Record<string, unknown>>
		: null;
}
function receiptFields(payload: Readonly<Record<string, unknown>> | undefined): Readonly<Record<string, unknown>> {
	const params = record(payload?.params);
	const item = record(params?.item);
	return { ...payload, ...params, ...item };
}
function verificationStatus(
	payload: Readonly<Record<string, unknown>>,
	evidence: ExecutionEvidence,
	exitCode: number | null,
): CompletionVerification["status"] {
	const explicit = stringValue(payload.status ?? payload.outcome).trim().toLowerCase();
	if (explicit === "passed" || explicit === "pass" || explicit === "success" || explicit === "succeeded") return "passed";
	if (explicit === "failed" || explicit === "fail" || explicit === "error") return "failed";
	if (explicit === "skipped" || explicit === "skip") return "skipped";
	if (explicit === "unknown") return "unknown";
	if (exitCode !== null) return exitCode === 0 ? "passed" : "failed";
	return evidence.status === "failed" ? "failed" : "unknown";
}
