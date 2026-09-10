import { describe, expect, test } from "bun:test";
import { beginSkillStep, finishSkillStep, startSkillRun } from "../src/core/workflows/skill-run";
const scenario = { schemaVersion: 1 as const, intent: "reconcile" as const, processId: "RPA-FIXTURE", taskId: null, unitIds: [], skillNames: ["rpa-reconcile"], registryDigest: "a".repeat(64), requiresProcessDefinition: false };
describe("Skill 검증 경계", () => {
 for (const evidence of [[""], [" "], ["임의 성공 주장"]]) test(`검증 없이 성공 거절: ${JSON.stringify(evidence)}`, () => {
  const state = beginSkillStep(startSkillRun(scenario));
  expect(() => finishSkillStep(state, "succeeded", evidence)).toThrow();
 });
});

test("다른 Run·검사 입력의 결과와 full 범위의 로컬 검증을 거절한다", () => {
 const local = {...beginSkillStep(startSkillRun(scenario, undefined, "local-preflight")), subjectDigest: "e".repeat(64)};
 const evidence = ["fixture: 실제 검사 결과 대역"];
 const result = {validator: "local-unit-references@1" as const, scope: "local-preflight" as const, runId: local.runId, skill: "rpa-reconcile", registryDigest: local.scenario.registryDigest, subjectDigest: "e".repeat(64), checkedAt: "2026-09-08T00:00:00.000Z", status: "passed" as const, evidence};
 expect(() => finishSkillStep(local, "succeeded", evidence, {...result, runId: "other"})).toThrow("SKILL_VERIFICATION_REQUIRED");
 expect(() => finishSkillStep(local, "succeeded", evidence, {...result, subjectDigest: "f".repeat(64)})).toThrow("SKILL_VERIFICATION_REQUIRED");
 expect(() => finishSkillStep({...local, scope: "full"}, "succeeded", evidence, result)).toThrow("SKILL_VERIFICATION_REQUIRED");
});

test("검증 결과가 있어도 Run에 검사 입력이 고정되지 않았다면 성공을 거절한다", () => {
 const state = beginSkillStep(startSkillRun(scenario, undefined, "local-preflight"));
 const evidence = ["fixture: 실제 검사 결과 대역"];
 const verification = {validator: "local-unit-references@1" as const, scope: "local-preflight" as const, runId: state.runId, skill: "rpa-reconcile", registryDigest: state.scenario.registryDigest, subjectDigest: "e".repeat(64), checkedAt: "2026-09-08T00:00:00.000Z", status: "passed" as const, evidence};
 expect(() => finishSkillStep(state, "succeeded", evidence, verification)).toThrow("SKILL_VERIFICATION_REQUIRED");
 expect(() => finishSkillStep({ ...state, subjectDigest: "e".repeat(64) }, "succeeded", evidence, verification)).not.toThrow();
});
