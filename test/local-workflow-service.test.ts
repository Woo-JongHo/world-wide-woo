import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { createLocalWorkflow } from "../src/adapters/outbound/development/local-workflow";
import { FileSkillRunStore } from "../src/adapters/outbound/persistence/skill-run-store";
import { FileSkillRegistry } from "../src/adapters/outbound/workspace/file-skill-registry";
import { startSkillRun, beginSkillStep } from "../src/core/workflows/skill-run";
import { planRpaScenario } from "../src/core/agents/rpa-agent";
import { verifyLocalWorkflow } from "../src/adapters/outbound/development/local-workflow-verifier";
const roots: string[] = [];
afterEach(() => {for (const root of roots.splice(0)) rmSync(root,{recursive:true,force:true});});
function fixture(name: string) {
 const root = mkdtempSync(join(tmpdir(),"www-workflow-flow-")); roots.push(root);
 for (const path of [".woo", ".www/control-ledger", "src", ".agents/skills/rpa-reconcile"]) mkdirSync(join(root,path),{recursive:true});
 writeFileSync(join(root,".agents/skills/rpa-reconcile/SKILL.md"),"---\nname: rpa-reconcile\ndescription: 로컬 fixture 정합 검사\n---\n# Fixture\n");
 writeFileSync(join(root,".woo/units.yaml"),JSON.stringify({schemaVersion:1,units:[{id:"Code-001",name:"예제",code:{path:"src/example.ts",symbol:"Example"},linear:["issue-1"]}]}));
 writeFileSync(join(root,".www/control-ledger/traceability-v3.json"),JSON.stringify({projectId:name,issues:[{id:"issue-1"}]}));
 writeFileSync(join(root,"src/example.ts"),"export class Example {}\n");
 for (const args of [["init","-q"],["add","."],["-c","user.name=Fixture","-c","user.email=fixture@example.invalid","commit","-qm","fixture"]]) {
  const result=Bun.spawnSync(["git",...args],{cwd:root}); if(result.exitCode) throw new Error(result.stderr.toString());
 }
 return root;
}
test("두 프로젝트에서 실제 로컬 검사→증거→저장→새 프로세스 조회를 수행한다",async()=>{
 for(const root of [fixture("a"),fixture("b")]){
  const result=await createLocalWorkflow(root).run("RPA-FIXTURE");
  expect(result.state.stage).toBe("completed"); expect(result.state.scope).toBe("local-preflight");
  expect(result.receipts).toHaveLength(1); expect(result.receipts[0]!.validation[0]!.validator).toBe("local-unit-references@1");
  expect(result.summary).toContain("원격 정합은 미검증");
  const child=Bun.spawnSync([process.execPath,resolve("scripts/skill-runtime.ts"),"show-local","--root",root,"--run",result.state.runId]);
  expect(child.exitCode).toBe(0); expect(JSON.parse(child.stdout.toString()).state.stage).toBe("completed");
 }
});
test("실패한 실제 검사는 실패 Receipt와 다음 행동을 남긴다",async()=>{
 const root=fixture("a");writeFileSync(join(root,"src/example.ts"),"export class Wrong {}\n");
 const result=await createLocalWorkflow(root).run("RPA-FIXTURE");
 expect(result.state.stage).toBe("failed");expect(result.receipts[0]!.status).toBe("failed");expect(result.summary).toContain("다음 행동");expect(result.summary).toContain("Example");
});
test("저장된 running 검사를 재개하고 변경된 입력은 거절한다",async()=>{
 for(const changed of [false,true]){
  const root=fixture("resume");const registry=await new FileSkillRegistry(root).load();
  const checked=await verifyLocalWorkflow(root);const initial={...startSkillRun(planRpaScenario({intent:"reconcile",registry,processId:"RPA-FIXTURE"}),undefined,"local-preflight"),subjectDigest:checked.subjectDigest};
  const store=new FileSkillRunStore(join(root,".www"));await store.write(initial);await store.write(beginSkillStep(initial),initial.revision);
  if(changed)writeFileSync(join(root,"src/example.ts"),"export class Example {changed() {}}\n");
  const result=await createLocalWorkflow(root).resume(initial.runId);expect(result.state.stage).toBe(changed?"failed":"completed");
 }
});
test("다른 프로젝트에 복사한 새 상태를 정상 기록으로 읽지 않는다",async()=>{
 const a=fixture("a"),b=fixture("b");const result=await createLocalWorkflow(a).run("RPA-FIXTURE");
 const source=new FileSkillRunStore(join(a,".www")),target=new FileSkillRunStore(join(b,".www"));
 mkdirSync(join(b,".www/runtime/skills"),{recursive:true});copyFileSync(source.statePath(result.state.runId),target.statePath(result.state.runId));
 await expect(createLocalWorkflow(b).inspect(result.state.runId)).rejects.toThrow("PROJECT_MISMATCH");
});
test("공개 CLI가 검사 결과와 동일한 종료 코드를 반환한다", async()=>{
 const root=fixture("cli");
 const good=Bun.spawnSync([process.execPath,resolve("src/cli.ts"),"workflow","check","RPA-FIXTURE"],{cwd:root});
 expect(good.exitCode).toBe(0);expect(good.stdout.toString()).toContain("원격 정합은 미검증");
 writeFileSync(join(root,"src/example.ts"),"export class Wrong {}\n");
 const bad=Bun.spawnSync([process.execPath,resolve("src/cli.ts"),"workflow","check","RPA-FIXTURE"],{cwd:root});
 expect(bad.exitCode).toBe(1);expect(bad.stderr.toString()).toContain("Example");
});

test("완료한 Run은 입력 변경 후 재개 성공으로 재사용하지 않는다", async()=>{
 const root=fixture("terminal"); const service=createLocalWorkflow(root);
 const result=await service.run("RPA-FIXTURE");
 writeFileSync(join(root,"src/example.ts"),"export class Wrong {}\n");
 await expect(service.resume(result.state.runId)).rejects.toThrow("새 로컬 검사");
 const child=Bun.spawnSync([process.execPath,resolve("scripts/skill-runtime.ts"),"resume-local","--root",root,"--run",result.state.runId]);
 expect(child.exitCode).not.toBe(0);
 expect((await service.inspect(result.state.runId)).summary).toContain("저장 당시");
});
test("full legacy 기록은 로컬 검사 통과로 표시하지 않는다", async()=>{
 const root=fixture("legacy"); const service=createLocalWorkflow(root);
 const result=await service.run("RPA-FIXTURE");
 const store=new FileSkillRunStore(join(root,".www"));
 const legacy={...result.state,runId:"legacy-full",scope:"full"};
 writeFileSync(store.statePath(legacy.runId),JSON.stringify(legacy));
 await expect(service.inspect(legacy.runId)).rejects.toThrow("로컬 검사 Run");
});

test("로컬 완료 상태만 있고 검증 Receipt가 없으면 통과 표시를 거절한다", async()=>{
 const root=fixture("missing-receipt"); const service=createLocalWorkflow(root);
 const result=await service.run("RPA-FIXTURE");
 const store=new FileSkillRunStore(join(root,".www"));
 const legacy={...result.state,runId:"legacy-local"};
 writeFileSync(store.statePath(legacy.runId),JSON.stringify(legacy));
 await expect(service.inspect(legacy.runId)).rejects.toThrow("검증 Receipt");
});

test("무관한 커밋으로 재개가 차단될 때 Skill 파일 변경으로 단정하지 않는다", async()=>{
 const root=fixture("registry-head"); const registry=await new FileSkillRegistry(root).load();
 const checked=await verifyLocalWorkflow(root);
 const initial={...startSkillRun(planRpaScenario({intent:"reconcile",registry,processId:"RPA-FIXTURE"}),undefined,"local-preflight"),subjectDigest:checked.subjectDigest};
 const store=new FileSkillRunStore(join(root,".www")); await store.write(initial); await store.write(beginSkillStep(initial),initial.revision);
 writeFileSync(join(root,"unrelated.txt"),"unrelated change\n");
 for(const args of [["add","unrelated.txt"],["-c","user.name=Fixture","-c","user.email=fixture@example.invalid","commit","-qm","unrelated"]]){
  expect(Bun.spawnSync(["git",...args],{cwd:root}).exitCode).toBe(0);
 }
 const result=await createLocalWorkflow(root).resume(initial.runId);
 expect(result.state.stage).toBe("failed"); expect(result.summary).toContain("저장소 HEAD 포함");
 expect(result.summary).not.toContain("Skill 원본이 변경됐습니다");
});
