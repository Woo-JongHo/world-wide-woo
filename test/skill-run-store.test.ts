import { afterEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planRpaScenario } from "../src/core/agents/rpa-agent";
import { authorizeSkillStep, beginSkillStep, finishSkillStep, requestSkillAuthorization, startSkillRun } from "../src/core/workflows/skill-run";
import { FileSkillRunStore } from "../src/adapters/outbound/persistence/skill-run-store";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
 const root = await mkdtemp(join(tmpdir(), "skill-store-")); roots.push(root);
 const scenario = planRpaScenario({ intent: "reconcile", processId: "RPA-TEST", registry: { schemaVersion: 1, root: ".agents/skills", sourceRevision: "git:test", digest: "a".repeat(64), skills: [{ name: "rpa-reconcile", description: "reconcile", path: ".agents/skills/rpa-reconcile/SKILL.md", digest: "b".repeat(64), sourceRevision: "git:test" }] } });
 const initial = startSkillRun(scenario);
 const running = beginSkillStep(initial);
 const store = new FileSkillRunStore(root);
 await store.write(initial); await store.write(running, initial.revision);
 return { root, store, running };
}

test("Receipt projection 저장 실패에도 재시작 후 상태와 Receipt를 함께 읽는다", async () => {
 const { root, store, running } = await fixture();
 const result = finishSkillStep(running, "failed", ["test failed"]);
 await mkdir(join(root, "receipts"), { recursive: true });
 await writeFile(join(root, "receipts/skills"), "blocked projection");
 await store.commitStep(result.state, result.receipt, running.revision);
 const reopened = new FileSkillRunStore(root);
 expect(await reopened.read(running.runId)).toEqual(result.state);
 expect(await reopened.readReceipt(running.runId, result.receipt.receiptId)).toEqual(result.receipt);
 expect(await reopened.listReceipts(running.runId)).toEqual([result.receipt]);
});

test("독립 프로세스 둘이 같은 revision에서 저장하면 하나만 수락한다", async () => {
 const { root, running } = await fixture();
 const modulePath = join(import.meta.dir, "../src/adapters/outbound/persistence/skill-run-store.ts");
 const workflowPath = join(import.meta.dir, "../src/core/workflows/skill-run.ts");
 const worker = join(root, "worker.ts");
 await writeFile(worker, `import { FileSkillRunStore } from ${JSON.stringify(modulePath)};
 import { finishSkillStep } from ${JSON.stringify(workflowPath)};
 const store = new FileSkillRunStore(process.argv[2]);
 const state = await store.read(process.argv[3]);
 console.log("ready");
 for await (const chunk of Bun.stdin.stream()) { break; }
 try { const result = finishSkillStep(state, process.argv[4], ["process outcome"]); await store.commitStep(result.state, result.receipt, state.revision); console.log("accepted"); }
 catch (error) { console.log(error.message); }
 `);
 const children = ["failed", "blocked"].map(stage => Bun.spawn([process.execPath, worker, root, running.runId, stage], { stdin: "pipe", stdout: "pipe", stderr: "pipe" }));
 const readers = children.map(child => child.stdout.getReader());
 const ready = await Promise.all(readers.map(reader => reader.read()));
 expect(ready.every(value => new TextDecoder().decode(value.value).includes("ready"))).toBeTrue();
 children.forEach(child => { child.stdin.write("go\n"); child.stdin.end(); });
 const output = await Promise.all(readers.map(async reader => { let text = ""; for (;;) { const chunk = await reader.read(); if (chunk.done) return text; text += new TextDecoder().decode(chunk.value); } }));
 expect(output.filter(value => value.includes("accepted"))).toHaveLength(1);
 expect(output.filter(value => value.includes("SKILL_RUN_CONFLICT"))).toHaveLength(1);
 expect(await Promise.all(children.map(child => child.exited))).toEqual([0, 0]);
 const reopened = new FileSkillRunStore(root);
 const committed = await reopened.read(running.runId);
 expect(committed.revision).toBe(running.revision + 1);
 const receipts = await reopened.listReceipts(running.runId);
 expect(receipts).toHaveLength(1);
 expect(receipts[0]).toMatchObject({ status: committed.stage });
});

test("다른 프로젝트에 복사한 새 state projection은 import하지 않는다", async () => {
 const { root, store, running } = await fixture();
 const destination = await mkdtemp(join(tmpdir(), "skill-other-")); roots.push(destination);
 const target = new FileSkillRunStore(destination);
 await mkdir(join(destination, "runtime/skills"), { recursive: true });
 await writeFile(target.statePath(running.runId), await Bun.file(store.statePath(running.runId)).text());
 await expect(target.read(running.runId)).rejects.toThrow("SKILL_RUN_PROJECT_MISMATCH");
});

test("기존 무바인딩 JSON은 읽고 다음 mutation부터 현재 프로젝트에 결박한다", async () => {
 const { running } = await fixture();
 const root = await mkdtemp(join(tmpdir(), "skill-legacy-")); roots.push(root);
 const store = new FileSkillRunStore(root);
 await mkdir(join(root, "runtime/skills"), { recursive: true });
 await writeFile(store.statePath(running.runId), JSON.stringify(running));
 expect(await store.read(running.runId)).toEqual(running);
 await store.write({ ...running, revision: running.revision + 1 }, running.revision);
 expect((await new FileSkillRunStore(root).read(running.runId)).revision).toBe(running.revision + 1);
});

test("불일치 Receipt commit을 거절하고 기존 상태를 보존한다", async () => {
 const { store, running } = await fixture();
 const result = finishSkillStep(running, "uncertain", ["unknown result"]);
 await expect(store.commitStep(result.state, { ...result.receipt, runId: "another-run" }, running.revision)).rejects.toThrow();
 expect(await store.read(running.runId)).toEqual(running);
 expect(await store.listReceipts(running.runId)).toEqual([]);
});

test("step 완료를 Receipt 없이 state write로 저장할 수 없다", async () => {
 const { store, running } = await fixture();
 const result = finishSkillStep(running, "failed", ["test failure"]);
 await expect(store.write(result.state, running.revision)).rejects.toThrow("SKILL_STEP_COMMIT_REQUIRED");
 expect(await store.read(running.runId)).toEqual(running);
});

test("projection 장애를 제거하면 재조회로 JSON export를 복구하고 중복 commit은 거절한다", async () => {
 const { root, store, running } = await fixture();
 const result = finishSkillStep(running, "uncertain", ["provider disconnected"]);
 await mkdir(join(root, "receipts"), { recursive: true });
 await writeFile(join(root, "receipts/skills"), "blocked");
 await store.commitStep(result.state, result.receipt, running.revision);
 await rm(join(root, "receipts/skills"));
 const reopened = new FileSkillRunStore(root);
 expect(await reopened.readReceipt(running.runId, result.receipt.receiptId)).toEqual(result.receipt);
 expect(JSON.parse(await Bun.file(store.receiptPath(result.receipt)).text()).receiptDigest).toBe(result.receipt.receiptDigest);
 await expect(reopened.commitStep(result.state, result.receipt, running.revision)).rejects.toThrow("SKILL_RUN_CONFLICT");
 expect(await reopened.listReceipts(running.runId)).toHaveLength(1);
});

test("새 Receipt JSON을 다른 프로젝트의 legacy run에 복사해도 import하지 않는다", async () => {
 const { store, running } = await fixture();
 const result = finishSkillStep(running, "failed", ["failure"]);
 await store.commitStep(result.state, result.receipt, running.revision);
 const root = await mkdtemp(join(tmpdir(), "skill-receipt-copy-")); roots.push(root);
 const destination = new FileSkillRunStore(root);
 await mkdir(join(root, "runtime/skills"), { recursive: true });
 await mkdir(join(root, "receipts/skills", running.runId), { recursive: true });
 await writeFile(destination.statePath(running.runId), JSON.stringify(running));
 await writeFile(destination.receiptPath(result.receipt), await Bun.file(store.receiptPath(result.receipt)).text());
 await expect(destination.listReceipts(running.runId)).rejects.toThrow("SKILL_RUN_PROJECT_MISMATCH");
});

test("유효한 digest여도 다른 skill Receipt 또는 다른 종료 state를 commit하지 않는다", async () => {
 const { store, running } = await fixture();
 const result = finishSkillStep(running, "failed", ["test failure"]);
 const otherSkill = finishSkillStep({ ...running, steps: running.steps.map(step => ({ ...step, skill: "other-skill" })) }, "failed", ["test failure"]);
 await expect(store.commitStep(result.state, otherSkill.receipt, running.revision)).rejects.toThrow("SKILL_RECEIPT_STATE_MISMATCH");
 await expect(store.commitStep({ ...result.state, stage: "completed" }, result.receipt, running.revision)).rejects.toThrow("SKILL_RECEIPT_STATE_MISMATCH");
 await expect(store.commitStep({ ...result.state, steps: result.state.steps.map(step => ({ ...step, status: "succeeded" })) }, result.receipt, running.revision)).rejects.toThrow("SKILL_RECEIPT_STATE_MISMATCH");
 expect(await store.read(running.runId)).toEqual(running);
 expect(await store.listReceipts(running.runId)).toEqual([]);
});

test("stage만 완료로 바꾸는 state write도 Receipt 없이 거절한다", async () => {
 const { store, running } = await fixture();
 await expect(store.write({ ...running, stage: "completed", revision: running.revision + 1 }, running.revision)).rejects.toThrow("SKILL_STEP_COMMIT_REQUIRED");
 expect(await store.read(running.runId)).toEqual(running);
});

test("state write와 commitStep은 고정된 scope·subject·scenario·skill identity를 변경하지 못한다", async () => {
 const { store, running } = await fixture();
 const next = { ...running, revision: running.revision + 1 };
 const mutations = [
  { ...next, scope: "local-preflight" as const },
  { ...next, subjectDigest: "f".repeat(64) },
  { ...next, scenario: { ...next.scenario, processId: "RPA-OTHER" } },
  { ...next, steps: next.steps.map(step => ({ ...step, skill: "other-skill" })) },
 ];
 for (const mutation of mutations) await expect(store.write(mutation, running.revision)).rejects.toThrow("SKILL_RUN_IDENTITY_MISMATCH");
 const result = finishSkillStep(running, "failed", ["test failure"]);
 await expect(store.commitStep({ ...result.state, subjectDigest: "f".repeat(64) }, result.receipt, running.revision)).rejects.toThrow("SKILL_RUN_IDENTITY_MISMATCH");
 expect(await store.read(running.runId)).toEqual(running);
 expect(await store.listReceipts(running.runId)).toEqual([]);
});


test("고정 identity를 유지한 승인 요청과 승인은 저장하고 종료 Receipt와 연결한다", async () => {
 const { store, running } = await fixture();
 const requested = requestSkillAuthorization(running, { id: "candidate-1", digest: "c".repeat(64) }, ["candidate validated"]);
 await store.write(requested, running.revision);
 const authorized = authorizeSkillStep(requested, "c".repeat(64), "user");
 await store.write(authorized, requested.revision);
 expect(await store.read(running.runId)).toEqual(authorized);
 const result = finishSkillStep(authorized, "uncertain", ["provider disconnected"]);
 await store.commitStep(result.state, result.receipt, authorized.revision);
 expect(await store.read(running.runId)).toEqual(result.state);
 expect(await store.listReceipts(running.runId)).toEqual([result.receipt]);
});
