import { isReasoningActivityPayload, type ProjectActivity } from "../domain/execution/project-activity";
import { REQUEST_STAGES, REQUEST_REPORT_PREFIX, parseRequestStageReport, type RequestRuntimeRecord, type RequestStage, type RequestStageReport, type RequestEvidence, type RequestLifecycleEvent } from "../domain/execution/request-runtime";

const record = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const settled = (s: RequestStage) => s.status === "completed" || s.status === "skipped";
const delivered = (r: RequestRuntimeRecord, deliveries = r.deliveries) => r.requiredDeliveries.every(required => deliveries.some(d => d.target === required.target && d.artifact === required.artifact));
const goals = ["사용자의 목표·제약·성공 조건", "작업·의존성·병렬 가능성", "판단의 실제 근거", "결정·이유·실행 계획", "실제 수행 결과", "결과와 성공 조건의 대조", "대상별 결과와 근거 전달"];

function publicMessage(a: ProjectActivity): string | null {
	if (a.kind !== "message" || a.phase !== "completed" || a.payload.finalObservation === "missing" || isReasoningActivityPayload(a.payload)) return null;
	const p = a.payload, params = record(p.params), item = record(params.item);
	if (p.direction === "outbound" || p.role === "user" || (p.role !== "assistant" && item.type !== "agentMessage")) return null;
	return typeof p.text === "string" ? p.text : typeof item.text === "string" ? item.text : null;
}

function evidence(a: ProjectActivity): RequestEvidence {
	const item = record(record(a.payload.params).item);
	const failed = a.phase === "failed" || a.phase === "cancelled" || typeof item.exitCode === "number" && item.exitCode !== 0;
	return { activityId: a.id, sequence: a.sequence, sourceDigest: a.sourceDigest, itemId: a.nativeRefs.itemId ?? null, kind: a.kind,
		status: failed ? "failed" : a.phase === "completed" && item.exitCode === 0 ? "passed" : "observed" };
}

function event(r: RequestRuntimeRecord, a: ProjectActivity, type: RequestLifecycleEvent["type"], stage: RequestStage["id"] | null = null, reason: string | null = null): void {
	r.events = [...r.events, { id: `${a.id}:${r.requestId}:${type}:${stage ?? "request"}`, type, requestId: r.requestId, stage, activityId: a.id, at: a.recordedAt, reason }];
}
function reject(r: RequestRuntimeRecord, a: ProjectActivity, reason: string): void {
	r.issues = [...r.issues, `${a.id}: ${reason}`];
	event(r, a, "protocol.rejected", null, reason);
}
function create(a: ProjectActivity, id: string): RequestRuntimeRecord {
	return { schemaVersion: 1, protocolVersion: a.payload.protocolVersion === 2 ? 2 : 1, requestId: id, threadId: a.nativeRefs.threadId ?? null, turnId: null,
		objective: typeof a.payload.text === "string" ? a.payload.text : "요청 원문은 연결된 Activity에서 확인",
		status: "pending", attempt: 1, previousAttempts: [], stages: REQUEST_STAGES.map((id, i) => ({ id, status: "pending", goal: goals[i]!, input: [], owner: "orchestrator", model: null, agents: [], tools: [], tasks: [], output: null, evidence: [], decision: null, skipReason: null, startedAt: null, completedAt: null, next: REQUEST_STAGES[i + 1] ?? null, evidenceAfterSequence: 0 })),
		deliveries: [], requiredDeliveries: [], events: [], startedAt: a.recordedAt, completedAt: null, issues: [], actions: [] };
}

type ReplayState = {
	requests: Map<string, RequestRuntimeRecord>;
	submitted: Map<string, number>;
	approvals: Map<string, { stage: RequestStage; id: unknown }>;
};

function sameTurnRequests(state: ReplayState, a: ProjectActivity): RequestRuntimeRecord[] {
	return [...state.requests.values()].filter(r => {
		const submittedAt = state.submitted.get(r.requestId);
		return r.turnId !== null
			&& r.turnId === a.nativeRefs.turnId
			&& r.threadId === a.nativeRefs.threadId
			&& submittedAt !== undefined
			&& a.sequence >= submittedAt;
	});
}

function deliveryRequirement(r: RequestRuntimeRecord, a: ProjectActivity, state: ReplayState): { target: string; artifact: string } | null {
	const { target, artifact } = a.payload;
	if (a.payload.authority !== "runtime" || r.protocolVersion !== 2 || r.completedAt) return null;
	if (settled(r.stages[6]!) || state.approvals.has(r.requestId) || r.actions.some(action => action.status === "unconfirmed")) return null;
	if (r.requiredDeliveries.length >= 32) return null;
	if (typeof target !== "string" || !target.trim() || target === "chat" || target.length > 400) return null;
	if (typeof artifact !== "string" || !artifact.trim() || artifact.length > 4000) return null;
	return { target, artifact };
}

function applyDeliveryRequirement(r: RequestRuntimeRecord, a: ProjectActivity, state: ReplayState): void {
	const requirement = deliveryRequirement(r, a, state);
	if (!requirement) {
		reject(r, a, "필수 전달 등록은 활성 요청에서 정확한 대상과 artifact가 필요합니다.");
		return;
	}
	const { target, artifact } = requirement;
	if (r.requiredDeliveries.some(delivery => delivery.target === target && delivery.artifact === artifact)) return;
	r.requiredDeliveries = [...r.requiredDeliveries, { target, artifact }];
	event(r, a, "delivery.required", "DELIVER", `${target}: ${artifact}`);
}

function applyReplan(r: RequestRuntimeRecord, a: ProjectActivity, state: ReplayState): void {
	const fromStage = REQUEST_STAGES.find(stage => stage === a.payload.stage);
	const index = fromStage ? REQUEST_STAGES.indexOf(fromStage) : -1;
	const replanStage = r.stages[index];
	const reason = a.payload.reason;
	const invalid = a.payload.authority !== "runtime"
		|| r.protocolVersion !== 2
		|| r.completedAt !== null
		|| state.approvals.has(r.requestId)
		|| r.actions.some(action => action.status === "unconfirmed")
		|| r.attempt >= 32
		|| index < 0
		|| typeof reason !== "string"
		|| !reason.trim()
		|| reason.length > 4000
		|| !replanStage
		|| replanStage.status === "pending"
		|| r.stages.slice(0, index).some(stage => !settled(stage));
	if (invalid || typeof reason !== "string") {
		reject(r, a, "재계획은 활성 요청의 시작된 단계에만 가능하며 이유·승인 해소·실행 정합이 필요합니다.");
		return;
	}
	if (!fromStage) return;
	r.previousAttempts = [...r.previousAttempts, { attempt: r.attempt, fromStage, reason, activityId: a.id, stages: structuredClone(r.stages), deliveries: structuredClone(r.deliveries) }];
	r.attempt++;
	r.stages = r.stages.map((stage, stageIndex) => stageIndex < index ? stage : {
		...stage,
		status: stageIndex === index ? "running" : "pending",
		output: null,
		evidence: [],
		decision: null,
		skipReason: null,
		startedAt: stageIndex === index ? a.recordedAt : null,
		completedAt: null,
		evidenceAfterSequence: a.sequence,
		tasks: stage.tasks.map(task => ({ ...task, status: "pending" })),
	});
	// Retrying only delivery preserves already confirmed destinations; changing work invalidates acceptance.
	if (index < REQUEST_STAGES.indexOf("DELIVER")) r.deliveries = [];
	r.status = "running";
	event(r, a, "request.replanned", fromStage, reason);
	event(r, a, "stage.started", fromStage);
}

function applyRuntimeAction(r: RequestRuntimeRecord, a: ProjectActivity, method: string): void {
	const recoverable = !r.completedAt
		|| a.payload.hostRecovery === true
		&& a.payload.reconciliation === true
		&& ["runtime/action-completed", "runtime/action-reconciliation"].includes(method);
	if (!recoverable || a.payload.authority !== "runtime") return;
	const preparedStage = REQUEST_STAGES.find(stage => stage === a.payload.stage);
	if (!r.completedAt && method === "runtime/action-prepared" && typeof a.payload.operationId === "string" && typeof a.payload.capability === "string" && preparedStage && !r.actions.some(action => action.operationId === a.payload.operationId)) {
		r.actions = [...r.actions, { operationId: a.payload.operationId, stage: preparedStage, capability: a.payload.capability, status: "unconfirmed", preparedActivityId: a.id, receiptActivityId: null }];
		event(r, a, "action.prepared", preparedStage, a.payload.operationId);
	}
	const action = r.actions.find(candidate => candidate.preparedActivityId === a.payload.preparedActivityId && candidate.operationId === a.payload.operationId && candidate.capability === a.payload.capability && candidate.stage === a.payload.stage && candidate.status === "unconfirmed");
	if (action && method === "runtime/action-completed") {
		const status = a.phase === "completed" ? a.payload.reconciliation === true ? "reconciled" : "completed" : "failed";
		r.actions = r.actions.map(candidate => candidate === action ? { ...candidate, status, receiptActivityId: a.id } : candidate);
		event(r, a, status === "reconciled" ? "action.reconciled" : status === "failed" ? "action.failed" : "action.completed", action.stage, action.operationId);
	}
	if (action && method === "runtime/action-reconciliation") event(r, a, "action.reconciliation-failed", action.stage, action.operationId);
}

function resolveEvidence(refs: readonly string[], r: RequestRuntimeRecord, source: ProjectActivity, journal: readonly ProjectActivity[]): RequestEvidence[] | null {
	const result: RequestEvidence[] = [];
	const submittedAt = journal.find(a => a.payload.method === "request/submitted" && a.payload.requestId === r.requestId && a.nativeRefs.threadId === r.threadId)?.sequence ?? source.sequence;
	for (const ref of refs) {
		// Native knows item IDs; ledger consumers can use exact Activity IDs.
		const matches = journal.filter(a => a.sequence >= submittedAt && a.sequence < source.sequence && a.nativeRefs.threadId === r.threadId && a.nativeRefs.turnId === r.turnId && !isReasoningActivityPayload(a.payload)
			&& (a.id === ref || a.nativeRefs.itemId === ref) && ["completed", "failed", "cancelled"].includes(a.phase));
		const a = matches.at(-1);
		if (!a) return null;
		result.push(evidence(a));
	}
	return result;
}

function applyReport(r: RequestRuntimeRecord, report: RequestStageReport, a: ProjectActivity, journal: readonly ProjectActivity[]): void {
	if (r.completedAt) { reject(r, a, "종료된 Request의 Stage를 변경할 수 없습니다."); return; }
	const index = REQUEST_STAGES.indexOf(report.stage), stage = r.stages[index]!;
	if (r.protocolVersion === 2 && ["failed", "blocked"].includes(stage.status) && ["running", "completed"].includes(report.status)) { reject(r, a, "실패/차단 단계의 새 시도는 runtime replan으로 시작하세요."); return; }
	if (r.stages.slice(0, index).some(s => !settled(s)) || settled(stage)) { reject(r, a, "앞 단계의 완료/생략 또는 현재 단계의 재시도 상태를 확인하세요."); return; }
	if (r.protocolVersion === 2 && report.status === "skipped" && journal.some(source => source.sequence < a.sequence && source.sequence > stage.evidenceAfterSequence && source.payload.method === "runtime/action-prepared" && source.payload.authority === "runtime" && source.payload.requestId === r.requestId && source.payload.stage === stage.id)) { reject(r, a, "실제 작업을 시작한 단계는 생략으로 감출 수 없습니다. 결과를 기록하거나 재계획하세요."); return; }
	const refs = resolveEvidence(report.evidence ?? [], r, a, journal);
	if (!refs) { reject(r, a, "같은 요청 실행의 실제 선행 Evidence가 필요합니다."); return; }
	if (["EXECUTE", "VERIFY", "DELIVER"].includes(stage.id) && refs.some(e => e.sequence <= stage.evidenceAfterSequence)) { reject(r, a, "재계획 이전 Evidence로 현재 시도를 완료할 수 없습니다."); return; }
	if (report.status === "completed") {
		if (r.protocolVersion === 2 && ["EXECUTE", "VERIFY"].includes(stage.id) && !refs.some(e => e.status === "passed" && journal.some(source => source.id === e.activityId && source.payload.method === "runtime/action-completed" && source.payload.authority === "runtime" && source.payload.requestId === r.requestId && source.payload.stage === stage.id))) { reject(r, a, "현재 단계의 Runtime 성공 Receipt가 필요합니다. Native 로그만으로 완료할 수 없습니다."); return; }
		if (report.stage === "DECIDE" && !report.decision) { reject(r, a, "DECIDE에는 공개 decision/rationale/approach/alternatives/plan이 필요합니다."); return; }
		if (report.stage === "EXECUTE" && (!refs.some(e => e.kind === "tool" || e.kind === "file-change") || refs.some(e => e.status === "failed"))) { reject(r, a, "EXECUTE에는 실패하지 않은 실제 도구/변경 Evidence가 필요합니다."); return; }
		if (report.stage === "VERIFY" && (!refs.some(e => e.kind === "tool" || e.kind === "file-change") || refs.some(e => e.status === "failed"))) { reject(r, a, "VERIFY에는 실패하지 않은 실제 검증 Evidence가 필요합니다."); return; }
		if (report.stage === "DELIVER" && !report.deliveries?.length) { reject(r, a, "DELIVER에는 대상·artifact·실제 전달 Evidence가 필요합니다."); return; }
	}
	const deliveries = [];
	for (const p of report.plan ?? []) {
		const target = r.stages.find(s => s.id === p.stage)!;
		if (settled(target) || p.stage !== report.stage && !["DECOMPOSE", "DECIDE"].includes(report.stage)) { reject(r, a, "Native 계획은 현재 단계 또는 DECOMPOSE/DECIDE에서 미완료 단계에만 배치합니다."); return; }
	}
	const planned = r.stages.map(s => ({ ...s, tasks: report.plan?.find(p => p.stage === s.id)?.tasks ?? s.tasks }));
	const tasks = planned.flatMap(s => s.tasks.map(t => ({ ...t, stage: s.id })));
	const byId = new Map(tasks.map(t => [t.id, t]));
	const visiting = new Set<string>(), visited = new Set<string>();
	const cyclic = (id: string): boolean => {
		if (visiting.has(id)) return true;
		if (visited.has(id)) return false;
		visiting.add(id);
		for (const dependency of byId.get(id)?.dependsOn ?? []) if (!byId.has(dependency) || cyclic(dependency)) return true;
		visiting.delete(id); visited.add(id); return false;
	};
	if (byId.size !== tasks.length || tasks.some(t => cyclic(t.id) || t.dependsOn.some(id => REQUEST_STAGES.indexOf(byId.get(id)!.stage) > REQUEST_STAGES.indexOf(t.stage)))) {
		reject(r, a, "Task ID는 요청 안에서 고유해야 하며 의존성은 존재하고 순환/후속 단계 참조가 없어야 합니다."); return;
	}
	for (const p of report.plan ?? []) {
		if (p.stage !== report.stage && p.tasks.some(t => t.status !== "pending") || p.tasks.some(t => ["running", "completed"].includes(t.status) && t.dependsOn.some(id => byId.get(id)?.status !== "completed"))) {
			reject(r, a, "후속 단계는 pending으로 계획하며 선행 Task 완료 후 실행합니다."); return;
		}
	}
	if (report.status === "completed" && planned[index]!.tasks.some(t => t.status !== "completed")) { reject(r, a, "단계 완료 전에 하위 Todo를 완료하거나 단계 생략 이유를 기록해야 합니다."); return; }
	for (const d of report.deliveries ?? []) {
		const resolved = resolveEvidence(d.evidence, r, a, journal);
		if (report.stage !== "DELIVER" || !resolved?.length || resolved.some(e => e.status === "failed" || e.sequence <= stage.evidenceAfterSequence)) { reject(r, a, "전달 기록에는 DELIVER 단계와 현재 시도의 성공한 관측 근거가 필요합니다."); return; }
		if (r.protocolVersion === 2 && !resolved.some(e => e.status === "passed" && journal.some(source => source.id === e.activityId && source.payload.method === "runtime/action-completed" && source.payload.authority === "runtime" && source.payload.requestId === r.requestId && source.payload.stage === "DELIVER" && source.payload.effect === "publish" && record(source.payload.delivery).target === d.target && record(source.payload.delivery).artifact === d.artifact))) { reject(r, a, "외부 전달에는 대상·artifact가 일치하는 DELIVER publish Receipt가 필요합니다."); return; }
		deliveries.push({ target: d.target, artifact: d.artifact, evidence: resolved });
	}
	if (stage.id === "DELIVER" && ["completed", "skipped"].includes(report.status) && !delivered(r, [...r.deliveries, ...deliveries])) { reject(r, a, "필수 전달 미완료: 모든 대상의 일치하는 Receipt가 필요합니다."); return; }
	if (stage.status === "pending" || stage.status === "failed" || stage.status === "blocked") {
		stage.startedAt ??= a.recordedAt;
		if (report.status !== "skipped") {
			event(r, a, "stage.started", stage.id);
			if (stage.id === "EXECUTE") event(r, a, "execution.started", stage.id);
		}
	}
	stage.status = report.status;
	stage.output = report.summary;
	stage.input = report.input ?? stage.input;
	stage.agents = report.agents ?? stage.agents;
	stage.tools = report.tools ?? stage.tools;
	stage.evidence = [...stage.evidence, ...refs.filter(e => !stage.evidence.some(old => old.activityId === e.activityId))];
	stage.decision = report.decision ?? stage.decision;
	for (const p of report.plan ?? []) r.stages.find(s => s.id === p.stage)!.tasks = p.tasks;
	stage.skipReason = report.status === "skipped" ? report.summary : null;
	stage.completedAt = settled(stage) ? a.recordedAt : null;
	if (report.status !== "running") event(r, a, `stage.${report.status}`, stage.id, report.status === "skipped" ? report.summary : null);
	if (report.decision) event(r, a, "decision.created", stage.id);
	if (report.status === "completed" && stage.id === "EXECUTE") event(r, a, "execution.completed", stage.id);
	if (report.status === "completed" && stage.id === "VERIFY") event(r, a, "verification.completed", stage.id);
	r.deliveries = [...r.deliveries, ...deliveries];
	if (deliveries.length) event(r, a, "delivery.recorded", stage.id);
	r.status = report.status === "blocked" || report.status === "failed" ? report.status : "running";
}

/** Same append-only Activity journal is the record. No second database or provider state machine. */
export function projectRequestRuntime(journal: readonly ProjectActivity[], threadId: string | null): readonly RequestRuntimeRecord[] {
	const activities = [...new Map(journal.map(a => [a.id, a])).values()].sort((a, b) => a.sequence - b.sequence);
	const requests = new Map<string, RequestRuntimeRecord>();
	const submitted = new Map<string, number>();
	const approvals = new Map<string, { stage: RequestStage; id: unknown }>();
	const state = { requests, submitted, approvals };
	const protocolIds = new Set(activities.filter(a => [1, 2].includes(Number(a.payload.protocolVersion)) && a.payload.method === "request/submitted").map(a => a.payload.requestId));
	// Bind before replay: Native may emit notifications before startTurn resolves.
	for (const a of activities) {
		if (threadId && a.nativeRefs.threadId !== threadId) continue;
		const id = a.payload.requestId;
		if (typeof id !== "string" || !protocolIds.has(id) || !String(a.payload.method).startsWith("request/")) continue;
		const r = requests.get(id) ?? create(a, id);
		if (!submitted.has(id)) submitted.set(id, a.sequence);
		if (a.payload.method === "request/started" && a.nativeRefs.turnId) {
			r.turnId = a.nativeRefs.turnId;
			for (const stage of r.stages) stage.model = typeof a.payload.model === "string" ? a.payload.model : null;
		}
		if (typeof a.payload.text === "string") r.objective = a.payload.text;
		requests.set(id, r);
	}
	for (const a of activities) {
		const method = String(a.payload.method ?? "");
		const direct = typeof a.payload.requestId === "string" ? requests.get(a.payload.requestId) : undefined;
		if (direct && method.startsWith("request/")) {
			if (method === "request/submitted") event(direct, a, "request.started");
			if (method === "request/started" && direct.stages[0]!.status === "pending") {
				direct.stages[0]!.status = "running"; direct.stages[0]!.startedAt = a.recordedAt;
				direct.stages[0]!.input = [direct.objective]; direct.status = "running";
				event(direct, a, "stage.started", "UNDERSTAND");
			}
			if (method === "request/failed" || method === "request/uncertain") {
				direct.status = method === "request/failed" ? "failed" : "blocked";
				direct.stages[0]!.status = direct.status;
				direct.stages[0]!.output = method === "request/failed" ? "Native 요청 전송 실패" : "Native 요청 수신 미확인";
				if (method === "request/failed") direct.completedAt = a.recordedAt;
				event(direct, a, direct.status === "failed" ? "stage.failed" : "stage.blocked", "UNDERSTAND", direct.stages[0]!.output);
				event(direct, a, direct.status === "failed" ? "request.failed" : "request.blocked");
			}
			continue;
		}
		const sameTurn = sameTurnRequests(state, a);
		if (method === "runtime/delivery-required" && direct && sameTurn.includes(direct)) {
			applyDeliveryRequirement(direct, a, state);
			continue;
		}
		if (method === "runtime/replan" && direct && sameTurn.includes(direct)) {
			applyReplan(direct, a, state);
			continue;
		}
		if (direct && sameTurn.includes(direct)) applyRuntimeAction(direct, a, method);
		const message = publicMessage(a);
		const controlReport = method === "runtime/stage-report" && a.payload.authority === "runtime";
		if (controlReport || message?.startsWith(REQUEST_REPORT_PREFIX)) {
			const report = parseRequestStageReport(controlReport ? REQUEST_REPORT_PREFIX + JSON.stringify(a.payload.report) : message!);
			const r = report ? sameTurn.find(r => r.requestId === report.requestId) ?? sameTurn.at(-1) : sameTurn.at(-1);
			if (r?.protocolVersion === 2 && !controlReport) reject(r, a, "runtime.propose 도구로 Stage 전환을 요청해야 합니다.");
			else if (r?.actions.some(x => x.status === "unconfirmed")) reject(r, a, "실행 결과 미확인: read-back Receipt 확보 전에는 Stage를 진행할 수 없습니다.");
			else if (r && approvals.has(r.requestId) && report && !["blocked", "failed"].includes(report.status)) reject(r, a, "승인 요청 처리 전에는 Stage를 진행할 수 없습니다.");
			else if (r && report && r.requestId === report.requestId) applyReport(r, report, a, activities);
			else if (r) reject(r, a, "공개 Stage 보고 형식이 올바르지 않습니다.");
			continue;
		}
		for (const r of sameTurn) {
			if (r.completedAt) continue;
			if (r === sameTurn.at(-1) && a.kind === "approval" && a.phase === "started") {
				const stage = r.stages.find(s => s.status === "running");
				if (stage) { stage.status = "blocked"; r.status = "blocked"; approvals.set(r.requestId, { stage, id: a.nativeRefs.approvalRequestId ?? record(a.payload.approval).requestId }); event(r, a, "stage.blocked", stage.id, "사용자 승인 대기"); }
			}
			if (a.kind === "approval" && a.phase === "completed") {
				const approval = approvals.get(r.requestId), stage = approval?.stage;
				if (approval?.id !== undefined && approval.id === (a.nativeRefs.approvalRequestId ?? a.payload.requestId) && stage?.status === "blocked") { stage.status = "running"; r.status = "running"; approvals.delete(r.requestId); event(r, a, "stage.started", stage.id, "승인 요청 처리 확인"); }
			}
			const transportItem = record(record(a.payload.params).item);
			const runtimeTransport = transportItem.type === "dynamicToolCall" && typeof transportItem.tool === "string" && transportItem.tool.startsWith("www_runtime_");
			if (r === sameTurn.at(-1) && ["tool", "file-change"].includes(a.kind) && !runtimeTransport) {
				const stage = r.stages.find(s => s.status === "running");
				if (stage) stage.evidence = [...stage.evidence.filter(e => e.activityId !== a.id), evidence(a)];
			}
			if (r === sameTurn.at(-1) && message && delivered(r) && !r.actions.some(x => x.status === "unconfirmed") && record(record(a.payload.params).item).phase !== "commentary" && r.stages.slice(0, 6).every(settled) && r.stages[6]!.tasks.every(t => t.status === "completed")) {
				const stage = r.stages[6]!;
				if (!settled(stage)) applyReport(r, { requestId: r.requestId, stage: "DELIVER", status: "running", summary: "사용자 응답 전달" }, a, activities);
				const wasSettled = settled(stage);
				if (!wasSettled) { stage.status = "completed"; stage.output = message; stage.completedAt = a.recordedAt; event(r, a, "stage.completed", "DELIVER"); }
				stage.evidence = [...stage.evidence, evidence(a)];
				r.deliveries = [...r.deliveries, { target: "chat", artifact: a.id, evidence: [evidence(a)] }];
				event(r, a, "delivery.recorded", "DELIVER");
			}
			if (["turn/completed", "turn/failed", "turn/interrupted", "turn/cancelled", "turn/canceled"].includes(method)) {
				const interrupted = ["turn/interrupted", "turn/cancelled", "turn/canceled"].includes(method) || a.phase === "cancelled";
				const failed = method === "turn/failed" || a.phase === "failed";
				for (const stage of r.stages.filter(s => !settled(s))) {
					stage.status = failed ? "failed" : "blocked";
					stage.output = failed ? "Native 실행이 실패했습니다." : interrupted ? "Native 실행이 중단되었습니다." : "Native는 종료됐지만 이 단계의 공개 결과가 미관측입니다.";
					event(r, a, failed ? "stage.failed" : "stage.blocked", stage.id, stage.output);
				}
				r.status = failed ? "failed" : r.stages.every(settled) && delivered(r) && !r.actions.some(x => x.status === "unconfirmed") ? "completed" : "blocked";
				r.completedAt = a.recordedAt;
				event(r, a, r.status === "completed" ? "request.completed" : r.status === "failed" ? "request.failed" : "request.blocked");
			}
		}
	}
	return [...requests.values()];
}
