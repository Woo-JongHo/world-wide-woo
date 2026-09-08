import { createHash, randomUUID } from "node:crypto";
import type { RpaScenario } from "../agents/rpa-agent.js";

export type SkillRunStage = "ready" | "running" | "authorize" | "execute" | "verify" | "completed" | "failed" | "blocked" | "canceled" | "uncertain";
export type WooReceiptStatus = "succeeded" | "failed" | "blocked" | "canceled" | "uncertain";

export interface SkillStepState {
	readonly skill: string;
	readonly status: "pending" | "running" | "succeeded" | "failed" | "blocked" | "canceled" | "uncertain";
	readonly candidateId: string | null;
	readonly candidateDigest: string | null;
	readonly authorizationDigest: string | null;
	readonly evidence: readonly string[];
}

export interface SkillRunState {
	readonly schemaVersion: 1;
	readonly runId: string;
	readonly scenario: RpaScenario;
	readonly stage: SkillRunStage;
	readonly activeIndex: number | null;
	readonly steps: readonly SkillStepState[];
	readonly revision: number;
}

export interface SkillRunReceipt {
	readonly schemaVersion: "1.0";
	readonly receiptId: string;
	readonly runId: string;
	readonly skill: { readonly name: string; readonly version: "1.0" };
	readonly capability: string;
	readonly status: WooReceiptStatus;
	readonly stage: "observe" | "classify" | "validate" | "authorize" | "execute" | "verify";
	readonly actor: Readonly<Record<string, unknown>>;
	readonly context: Readonly<Record<string, unknown>>;
	readonly input: Readonly<Record<string, unknown>>;
	readonly decision: Readonly<Record<string, unknown>> | null;
	readonly validation: readonly Readonly<Record<string, unknown>>[];
	readonly authorization: Readonly<Record<string, unknown>> | null;
	readonly execution: Readonly<Record<string, unknown>>;
	readonly result: Readonly<Record<string, unknown>> | null;
	readonly failure: Readonly<Record<string, unknown>> | null;
	readonly candidateId: string | null;
	readonly evidence: readonly string[];
	readonly nextCapabilities: readonly string[];
	readonly receiptDigest: string;
}

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const freeze = (state: SkillRunState): SkillRunState => Object.freeze({ ...state, steps: Object.freeze(state.steps.map(step => Object.freeze({ ...step, evidence: Object.freeze([...step.evidence]) }))) });

export function startSkillRun(scenario: RpaScenario, runId: string = randomUUID()): SkillRunState {
	if (scenario.requiresProcessDefinition) throw new Error("RPA_PROCESS_REQUIRED");
	if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(runId)) throw new Error("SKILL_RUN_ID_INVALID");
	const steps = scenario.skillNames.map(skill => ({ skill, status: "pending", candidateId: null, candidateDigest: null, authorizationDigest: null, evidence: [] } as SkillStepState));
	return freeze({ schemaVersion: 1, runId, scenario, stage: steps.length ? "ready" : "completed", activeIndex: null, steps, revision: 1 });
}

export function beginSkillStep(state: SkillRunState): SkillRunState {
	if (state.stage !== "ready") throw new Error(`SKILL_RUN_STAGE_INVALID: ${state.stage}`);
	const index = state.steps.findIndex(step => step.status === "pending");
	if (index < 0) throw new Error("SKILL_RUN_COMPLETE");
	const steps = state.steps.map((step, at) => at === index ? { ...step, status: "running" as const } : step);
	return freeze({ ...state, stage: "running", activeIndex: index, steps, revision: state.revision + 1 });
}

export function requestSkillAuthorization(state: SkillRunState, candidate: { id: string; digest: string }, evidence: readonly string[]): SkillRunState {
	if (state.stage !== "running" || state.activeIndex === null) throw new Error("SKILL_NOT_RUNNING");
	if (!candidate.id || !/^[0-9a-f]{64}$/u.test(candidate.digest) || !evidence.length) throw new Error("SKILL_CANDIDATE_INVALID");
	const steps = state.steps.map((step, at) => at === state.activeIndex ? { ...step, candidateId: candidate.id, candidateDigest: candidate.digest, evidence: [...evidence] } : step);
	return freeze({ ...state, stage: "authorize", steps, revision: state.revision + 1 });
}

export function authorizeSkillStep(state: SkillRunState, candidateDigest: string, actor: string): SkillRunState {
	if (state.stage !== "authorize" || state.activeIndex === null) throw new Error("SKILL_AUTH_NOT_REQUESTED");
	const active = state.steps[state.activeIndex]!;
	if (active.candidateDigest !== candidateDigest) throw new Error("SKILL_AUTH_STALE");
	if (!actor.trim()) throw new Error("SKILL_AUTH_ACTOR_REQUIRED");
	const authorizationDigest = digest({ runId: state.runId, skill: active.skill, candidateDigest, actor });
	const steps = state.steps.map((step, at) => at === state.activeIndex ? { ...step, authorizationDigest } : step);
	return freeze({ ...state, stage: "execute", steps, revision: state.revision + 1 });
}

export function finishSkillStep(state: SkillRunState, status: WooReceiptStatus, evidence: readonly string[]): { state: SkillRunState; receipt: SkillRunReceipt } {
	if ((state.stage !== "running" && state.stage !== "execute") || state.activeIndex === null) throw new Error("SKILL_STEP_NOT_FINISHABLE");
	if (!["succeeded", "failed", "blocked", "canceled", "uncertain"].includes(status)) throw new Error("SKILL_RECEIPT_STATUS_INVALID");
	if (!evidence.length) throw new Error("SKILL_EVIDENCE_REQUIRED");
	const active = state.steps[state.activeIndex]!;
	if (active.candidateDigest && !active.authorizationDigest) throw new Error("SKILL_AUTH_REQUIRED");
	const stepStatus = status;
	const terminal = status !== "succeeded";
	const steps = state.steps.map((step, at) => at === state.activeIndex ? { ...step, status: stepStatus, evidence: [...step.evidence, ...evidence] } : step);
	const hasPending = steps.some(step => step.status === "pending");
	const nextState = freeze({ ...state, stage: terminal ? status : hasPending ? "ready" : "completed", activeIndex: null, steps, revision: state.revision + 1 });
	const nextSkill = steps.find(step => step.status === "pending")?.skill;
	const unsigned = { schemaVersion: "1.0" as const, receiptId: randomUUID(), runId: state.runId, skill: { name: active.skill, version: "1.0" as const }, capability: active.skill.toUpperCase().replaceAll("-", "_"), status, stage: "verify" as const, candidateId: active.candidateId, actor: { type: "skill-runtime" }, context: { intent: state.scenario.intent, processId: state.scenario.processId, taskId: state.scenario.taskId, unitIds: state.scenario.unitIds, registryDigest: state.scenario.registryDigest }, input: { candidateDigest: active.candidateDigest }, decision: { terminal }, validation: [{ status, evidence }], authorization: active.authorizationDigest ? { digest: active.authorizationDigest } : null, execution: { revision: state.revision }, result: status === "succeeded" ? { step: active.skill } : null, failure: status === "succeeded" ? null : { status }, evidence: [...active.evidence, ...evidence], nextCapabilities: nextSkill ? [nextSkill] : [] };
	return { state: nextState, receipt: Object.freeze({ ...unsigned, receiptDigest: digest(unsigned) }) };
}

export function verifySkillRunReceipt(receipt: SkillRunReceipt): void {
	const { receiptDigest, ...unsigned } = receipt;
	if (!/^[0-9a-f]{64}$/u.test(receiptDigest) || digest(unsigned) !== receiptDigest) throw new Error("SKILL_RECEIPT_DIGEST_MISMATCH");
}

export function skillRunMonitor(state: SkillRunState) {
	const active = state.activeIndex === null ? null : state.steps[state.activeIndex]!;
	return Object.freeze({ protocol: "www-skill-monitor", version: "0.1.0", runId: state.runId, intent: state.scenario.intent, processId: state.scenario.processId, taskId: state.scenario.taskId, unitIds: state.scenario.unitIds, stage: state.stage, skill: active?.skill ?? null, candidateId: active?.candidateId ?? null, candidateDigest: active?.candidateDigest ?? null, approval: state.stage === "authorize" ? "waiting" : active?.authorizationDigest ? "approved" : "none", completed: state.steps.filter(step => step.status === "succeeded").length, total: state.steps.length });
}
