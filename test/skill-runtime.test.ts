import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { classifyRpaIntent, planRpaScenario } from "../src/core/agents/rpa-agent";
import type { SkillRegistrySnapshot } from "../src/core/skills/skill-registry";
import { FileSkillRegistry } from "../src/adapters/outbound/workspace/file-skill-registry";
import { authorizeSkillStep, beginSkillStep, finishSkillStep, requestSkillAuthorization, skillRunMonitor, startSkillRun } from "../src/core/workflows/skill-run";
import { FileSkillRunStore } from "../src/adapters/outbound/persistence/skill-run-store";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

const names = ["rpa-intake", "rpa-map", "rpa-build", "rpa-safety", "rpa-maintenance", "rpa-publish", "rpa-reconcile"];
function registry(): SkillRegistrySnapshot { return { schemaVersion: 1, root: ".agents/skills", sourceRevision: "git:test", digest: "a".repeat(64), skills: names.map(name => ({ name, description: name, path: `.agents/skills/${name}/SKILL.md`, digest: "b".repeat(64), sourceRevision: "git:test" })) }; }

// 외부 검사기의 구조화된 결과를 소비하는 domain 경계. 실제 검사기는 별도 통합 테스트한다.
function finishVerified(state: ReturnType<typeof startSkillRun>) {
 const evidence = ["read-back matched"];
 return finishSkillStep(state, "succeeded", evidence, {validator: "local-unit-references@1", scope: "local-preflight", runId: state.runId, skill: "rpa-reconcile", registryDigest: state.scenario.registryDigest, subjectDigest: "e".repeat(64), checkedAt: "2026-09-08T00:00:00.000Z", status: "passed", evidence});
}

describe("RPA Agent runtime", () => {
	test("명확한 intent만 분류하고 모호한 요청은 질문 대상으로 남긴다", () => {
		expect(classifyRpaIntent("신규 자동화 개발 시작하자")).toBe("new-development");
		expect(classifyRpaIntent("버그 로그를 보고 유지보수하자")).toBe("maintenance");
		expect(classifyRpaIntent("신규 개발 테스트도 하자")).toBeNull();
	});

	test("신규 개발을 고정 Skill 체인으로 계획한다", () => {
		const scenario = planRpaScenario({ intent: "new-development", registry: registry(), processId: "RPA-GMB-FTA", taskId: "T01", unitIds: ["U01"] });
		expect(scenario.skillNames).toEqual(["rpa-intake", "rpa-map", "rpa-build", "rpa-safety", "rpa-publish", "rpa-reconcile"]);
		expect(scenario.requiresProcessDefinition).toBeFalse();
	});

	test("Skill Run이 순서, stale 승인, evidence와 Receipt를 강제한다", () => {
		const scenario = planRpaScenario({ intent: "reconcile", registry: registry(), processId: "RPA-GMB-FTA" });
		const runId = "00000000-0000-4000-8000-000000000001";
		let state = beginSkillStep({ ...startSkillRun(scenario, runId, "local-preflight"), subjectDigest: "e".repeat(64) });
		state = requestSkillAuthorization(state, { id: "ARTIFACT-CANDIDATE-1", digest: "c".repeat(64) }, ["candidate validated"]);
		expect(() => authorizeSkillStep(state, "d".repeat(64), "user")).toThrow("SKILL_AUTH_STALE");
		state = authorizeSkillStep(state, "c".repeat(64), "user");
		const result = finishVerified(state);
		expect(result.state.stage).toBe("completed");
		expect(result.receipt).toMatchObject({ runId, status: "succeeded", candidateId: "ARTIFACT-CANDIDATE-1" });
		expect(skillRunMonitor(result.state)).toMatchObject({ protocol: "www-skill-monitor", version: "0.1.0", stage: "completed", completed: 1, total: 1 });
	});

	test("상태 CAS와 Receipt 저장·조회를 run 경계 안에서 수행한다", async () => {
		const root = mkdtempSync(join(tmpdir(), "woo-skill-run-")); roots.push(root);
		const runId = "00000000-0000-4000-8000-000000000002";
		const store = new FileSkillRunStore(root);
		const scenario = planRpaScenario({ intent: "reconcile", registry: registry(), processId: "RPA-GMB-FTA" });
		const initial = { ...startSkillRun(scenario, runId, "local-preflight"), subjectDigest: "e".repeat(64) };
		await store.write(initial);
		const running = beginSkillStep(initial);
		await store.write(running, initial.revision);
		await expect(store.write(running, initial.revision)).rejects.toThrow("SKILL_RUN_CONFLICT");
		const result = finishVerified(running);
		const receiptPath = await store.writeReceipt(result.receipt);
		expect(JSON.parse(readFileSync(receiptPath, "utf8"))).toMatchObject({ runId, receiptDigest: result.receipt.receiptDigest });
		expect(await store.readReceipt(runId, result.receipt.receiptId)).toEqual(result.receipt);
		expect(await store.listReceipts(runId)).toEqual([result.receipt]);
	});
});

describe("File Skill Registry", () => {
	test("프로젝트 Skill frontmatter와 bytes digest를 실제 Git revision에 고정한다", async () => {
		const root = mkdtempSync(join(tmpdir(), "woo-skills-")); roots.push(root);
		mkdirSync(join(root, ".agents/skills/rpa-intake"), { recursive: true });
		writeFileSync(join(root, ".agents/skills/rpa-intake/SKILL.md"), "---\nname: rpa-intake\ndescription: 사실을 수집한다.\n---\n\n# Intake\n");
		execFileSync("git", ["init", "-q", root]); execFileSync("git", ["-C", root, "config", "user.name", "Test"]); execFileSync("git", ["-C", root, "config", "user.email", "test@example.invalid"]); execFileSync("git", ["-C", root, "add", "."]); execFileSync("git", ["-C", root, "commit", "-qm", "base"]);
		const snapshot = await new FileSkillRegistry(root).load();
		expect(snapshot.skills).toHaveLength(1);
		expect(snapshot.skills[0]).toMatchObject({ name: "rpa-intake", path: ".agents/skills/rpa-intake/SKILL.md" });
		expect(snapshot.sourceRevision).toMatch(/^git:[0-9a-f]{40}$/u);
	});
});
