import { planRpaScenario } from "../../agents/rpa-agent.js";
import type { SkillRegistryPort } from "../../skills/skill-registry.js";
import { beginSkillStep, finishSkillStep, skillRunMonitor, startSkillRun, type SkillRunReceipt, type SkillRunState, type SkillVerification } from "../../workflows/skill-run.js";

export interface LocalWorkflowCheck {
 readonly status: "passed" | "failed" | "uncertain";
 readonly subjectDigest: string;
 readonly evidence: readonly string[];
 readonly issues: readonly string[];
 readonly checkedAt: string;
}
export interface LocalWorkflowStore {
 read(id: string): Promise<SkillRunState>;
 write(state: SkillRunState, expectedRevision?: number): Promise<void>;
 commitStep(state: SkillRunState, receipt: SkillRunReceipt, expectedRevision: number): Promise<string>;
 listReceipts(id: string): Promise<readonly SkillRunReceipt[]>;
}
export interface LocalWorkflowResult {
 readonly state: SkillRunState;
 readonly receipts: readonly SkillRunReceipt[];
 readonly summary: string;
}
/** 로컬 참조 검사만 실행한다. 원격 네 표면의 RPA 정합 수락과 구분한다. */
export class LocalWorkflowService {
 constructor(private readonly registry: SkillRegistryPort, private readonly store: LocalWorkflowStore,
  private readonly verify: (expected?: {subjectDigest: string}) => Promise<LocalWorkflowCheck>) {}
 async run(processId: string): Promise<LocalWorkflowResult> {
  const registry = await this.registry.load();
  const scenario = planRpaScenario({intent: "reconcile", registry, processId});
  // 검사 시작의 입력을 고정한다. 이후 재개는 동일 입력만 재검사한다.
  const input = await this.verify();
  const initial = {...startSkillRun(scenario, undefined, "local-preflight"), subjectDigest: input.subjectDigest};
  await this.store.write(initial);
  return this.resume(initial.runId);
 }
 async resume(runId: string): Promise<LocalWorkflowResult> {
  let state = await this.store.read(runId);
  if (state.scope !== "local-preflight") throw new Error("로컬 검사 Run만 재개할 수 있습니다.");
  if (state.stage !== "ready" && state.stage !== "running") throw new Error("종료·차단된 Run은 재개할 수 없습니다. show로 저장 기록을 확인하거나 새 로컬 검사를 실행하세요.");
  if (!state.subjectDigest) throw new Error("검사 입력이 고정되지 않아 재개할 수 없습니다.");
  if (state.stage === "ready") {
   const next = beginSkillStep(state); await this.store.write(next, state.revision); state = next;
  }
  const currentRegistry = await this.registry.load();
  const check: LocalWorkflowCheck = currentRegistry.digest !== state.scenario.registryDigest
   ? {status: "failed", subjectDigest: state.subjectDigest!, checkedAt: new Date().toISOString(), evidence: ["Skill 레지스트리 revision 변경"], issues: ["레지스트리 스냅샷이 변경됐습니다(저장소 HEAD 포함). Skill 파일 변경 여부와 별개로 새 Run으로 다시 검사하세요."]}
   : await this.verify({subjectDigest: state.subjectDigest!});
  const evidence = [...check.evidence, ...check.issues];
  if (!evidence.length) evidence.push("로컬 검사 결과 확인");
  const verification: SkillVerification | undefined = check.status === "passed" ? {
   validator: "local-unit-references@1", scope: "local-preflight", runId, skill: state.steps[state.activeIndex!]!.skill,
   registryDigest: state.scenario.registryDigest, subjectDigest: check.subjectDigest,
   checkedAt: check.checkedAt, status: "passed", evidence,
  } : undefined;
  const result = finishSkillStep(state, check.status === "passed" ? "succeeded" : check.status, evidence, verification);
  await this.store.commitStep(result.state, result.receipt, state.revision);
  return this.inspect(runId);
 }
 async inspect(runId: string): Promise<LocalWorkflowResult> {
  const state = await this.store.read(runId);
  if (state.scope !== "local-preflight") throw new Error("로컬 검사 Run만 조회할 수 있습니다.");
  const receipts = await this.store.listReceipts(runId);
  if (state.stage === "completed" && (!state.subjectDigest || state.steps.length === 0 || !state.steps.every(step => receipts.some(receipt =>
   receipt.runId === runId && receipt.skill.name === step.skill && receipt.status === "succeeded" &&
   receipt.validation.some(check => check.validator === "local-unit-references@1" && check.scope === "local-preflight" &&
    check.runId === runId && check.subjectDigest === state.subjectDigest && check.registryDigest === state.scenario.registryDigest && check.status === "passed")
  )))) throw new Error("완료 기록의 로컬 검증 Receipt가 없습니다.");
  const monitor = skillRunMonitor(state);
  const labels: Record<string, string> = {ready: "준비", running: "검사 중", failed: "실패", blocked: "차단", uncertain: "결과 불확실", canceled: "취소", authorize: "승인 대기", execute: "실행 중", verify: "검증 중"};
  const status = state.stage === "completed" ? "저장 당시 로컬 참조 검사 통과 (현재 입력 재검증 아님)" : `로컬 참조 검사: ${labels[state.stage] ?? state.stage}`;
  const next = state.stage === "ready" || state.stage === "running" ? `다음 행동: /workflow resume ${runId}`
   : state.stage === "completed" ? "다음 행동: 전체 정합 수락 전에 원격 표면을 별도로 확인하세요."
   : "다음 행동: 원본·연결을 확인하고 새 로컬 검사를 실행하세요.";
  return {state, receipts, summary: [status, `Run: ${runId}`, `업무: ${monitor.processId}`, `단계: ${monitor.completed}/${monitor.total}`,
   "범위: 로컬 코드·참조 사전 검사. Linear·Obsidian 원격 정합은 미검증.",
   ...receipts.flatMap(receipt => receipt.evidence), next].join("\n")};
 }
}
