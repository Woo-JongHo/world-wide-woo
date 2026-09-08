import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import YAML from "yaml";
import { parseSnapshot, validate } from "../scripts/linear-contract";

const contract = YAML.parse(readFileSync(resolve(import.meta.dir, "../docs/planning/linear-development/ISSUE_CONTRACT.yaml"), "utf8"));
const meta = { description: "", project: "World Wide Woo", archivedAt: null, status: "Todo", labels: [], priority: 0 };
const body = (kind: string, ids = "Code-001") => contract.bodies[kind].map((heading: string) => {
	if (heading === "범위") return "## 범위\n\n### 포함\n\n- 기능\n\n### 제외\n\n- 검색";
	if (heading === "연결") return `## 연결\n\n- Code-ID: ${ids}\n- GitHub: [#46](https://github.com/Woo-JongHo/world-wide-woo/pull/46)\n- Obsidian: [상세](obsidian://open?vault=5521cc40c75eb293&file=note)`;
	if (heading === "완료 조건") return "## 완료 조건\n\n- [ ] 실제 결과를 확인한다.";
	return `## ${heading}\n\n확인 가능한 내용`;
}).join("\n\n");

function snapshot(): any[] {
	const issues: any[] = [{ id: "WOO-674", title: "[Workbench]", parentId: "WOO-673", ...meta }];
	for (const [name, feature] of Object.entries(contract.hierarchy.workbench.features) as Array<[string, any]>) {
		issues.push({ id: feature.parent, title: `[${name}]`, parentId: "WOO-674", ...meta, description: body("parent") });
		for (let number = feature.numbered[0]; number <= feature.numbered[1]; number++) issues.push({ id: `${name}-${number}`, title: `${String(number).padStart(2, "0")}. 결과`, parentId: feature.parent, ...meta, description: body("numbered") });
		issues.push({ id: feature.exception, title: "예외 처리", parentId: feature.parent, ...meta, description: body("exception") });
		issues.push({ id: feature.test, title: "테스트", parentId: feature.parent, ...meta, description: body("test") });
	}
	for (const id of contract.hierarchy.traceability.issues) issues.push({ id, title: "추적 결과", parentId: contract.hierarchy.traceability.parent, ...meta, projectMilestone: { name: contract.hierarchy.traceability.milestone }, description: body("traceability", id === "WOO-695" ? "Code-006, Code-007" : "Code-008") });
	issues.push({ id: contract.hierarchy.artifactSkills.root, title: "[Skills] 실행 절차", parentId: null, ...meta });
	for (const [name, group] of Object.entries(contract.hierarchy.artifactSkills.groups) as Array<[string, any]>) {
		issues.push({ id: group.parent, title: `[${name}] 작업`, parentId: contract.hierarchy.artifactSkills.root, ...meta, projectMilestone: { name: contract.hierarchy.artifactSkills.milestone } });
		for (const [index, id] of group.children.entries()) issues.push({ id, title: `${String(index + 1).padStart(2, "0")}. 작업`, parentId: group.parent, ...meta, projectMilestone: { name: contract.hierarchy.artifactSkills.milestone } });
	}
	issues.push({ id: "WOO-683", title: "Message", parentId: "WOO-679", ...meta, archivedAt: "2026-09-07T00:00:00Z" });
	return issues;
}

describe("Linear v2 contract", () => {
	test("accepts the fixed hierarchy and Feynman-readable body order", () => {
		expect(validate(snapshot(), undefined, contract, "Chat")).toEqual([]);
		expect(validate(snapshot(), undefined, contract, "Traceability")).toEqual([]);
		expect(validate(snapshot(), undefined, contract, "Skills")).toEqual([]);
	});

	test("validates Artifact Skill groups and their exact parents", () => {
		const issues = snapshot();
		issues.find(issue => issue.id === "WOO-844").parentId = "WOO-747";
		expect(validate(issues, undefined, contract, "Skills")).toContain("WOO-844: invalid Skill parent");
	});

	test("rejects missing sections, unfilled template markers, linked Code-ID, and active WOO-683", () => {
		const issues = snapshot();
		const target = issues.find(issue => issue.id === "Chat-1");
		target.description = target.description.replace("## 동작\n\n확인 가능한 내용\n\n", "").replace("Code-001", "[Code-001](https://example.com)").replace("실제 결과", "TODO");
		issues.find(issue => issue.id === "WOO-683").archivedAt = null;
		const errors = validate(issues, undefined, contract, "Chat");
		expect(errors.some(error => error.includes("sections must be exactly"))).toBeTrue();
		expect(errors.some(error => error.includes("unfilled template marker"))).toBeTrue();
		expect(errors.some(error => error.includes("invalid plain Code-ID"))).toBeTrue();
		expect(errors.some(error => error.includes("forbidden active intermediate"))).toBeTrue();
	});

	test("requires protected metadata changes to be declared", () => {
		const issues = snapshot();
		const errors = validate(issues, [{ id: "WOO-695", title: "추적 결과", parentId: "WOO-999" }], contract, "Traceability");
		expect(errors.some(error => error.includes("parentId change must be declared"))).toBeTrue();
	});

	test("validates a traceability-only snapshot and its exact milestone", () => {
		const issues = snapshot().filter(issue => contract.hierarchy.traceability.issues.includes(issue.id));
		expect(validate(issues, undefined, contract, "Traceability")).toEqual([]);
		issues[0].projectMilestone = null;
		expect(validate(issues, undefined, contract, "Traceability")).toContain("WOO-695: invalid traceability milestone");
	});

	test("accepts Linear's canonical bullet and angle-wrapped Obsidian URL", () => {
		const issues = snapshot().filter(issue => contract.hierarchy.traceability.issues.includes(issue.id));
		issues[0].description = issues[0].description
			.replaceAll("- ", "* ")
			.replace("(obsidian://open?vault=5521cc40c75eb293&file=note)", "(<obsidian://open?vault=5521cc40c75eb293&file=note>)");
		expect(validate(issues, undefined, contract, "Traceability")).toEqual([]);
	});

	test("accepts Linear's native pull request embed in a GitHub connection line", () => {
		const issues = snapshot();
		const chat = issues.find(issue => issue.id === "WOO-679");
		chat.description = chat.description.replace(
			"- GitHub: [#46](https://github.com/Woo-JongHo/world-wide-woo/pull/46)",
			'- GitHub: <pull-request id="review-46" href="https://linear.app/woo-world/review/example">Woo-JongHo/world-wide-woo#46</pull-request>',
		);
		expect(validate(issues, undefined, contract, "Chat")).toEqual([]);
	});

	test("requires a complete, unpaginated readback snapshot", () => {
		const issue = { ...snapshot()[0], uuid: "11111111-1111-4111-8111-111111111111", projectMilestone: null };
		expect(parseSnapshot({ issues: [issue], hasNextPage: false })).toHaveLength(1);
		expect(() => parseSnapshot({ issues: [{ ...issue, uuid: undefined }], hasNextPage: false })).toThrow("snapshot missing uuid");
		expect(() => parseSnapshot({ issues: [issue], hasNextPage: true })).toThrow("hasNextPage=false");
	});
});

const rpaBody = (id: string) => contract.bodies.rpa.map((heading: string) => {
	if (heading === "범위") return "## 범위\n\n### 포함\n\n- 정규화\n\n### 제외\n\n- 원격 코드 변경";
	if (heading === "연결") return `## 연결\n\n- RPA-ID: ${id}`;
	if (heading === "완료 조건") return "## 완료 조건\n\n- [ ] 실제 결과를 확인한다.";
	return `## ${heading}\n\n확인 가능한 내용`;
}).join("\n\n");

function rpaSnapshot(): any[] {
	const milestone = { name: contract.hierarchy.rpa.milestone };
	const issues: any[] = [
		{ id: contract.hierarchy.rpa.environmentRoot, title: "[Environment] 실행 환경", parentId: null, ...meta },
		{ id: contract.hierarchy.rpa.skillsRoot, title: "[Skills] 실행 절차", parentId: null, ...meta },
		{ id: contract.hierarchy.rpa.agentsRoot, title: "[Agents] 실행 주체", parentId: null, ...meta },
		{ id: contract.hierarchy.rpa.agent, title: contract.hierarchy.rpa.agentTitle, parentId: contract.hierarchy.rpa.agentsRoot, ...meta, projectMilestone: milestone, description: rpaBody("RPA-AGENT") },
		{ id: contract.hierarchy.rpa.rpaSkillsRoot, title: "[RPA] 실행 절차", parentId: contract.hierarchy.rpa.skillsRoot, ...meta, projectMilestone: milestone, description: rpaBody("RPA-SKILLS") },
		{ id: contract.hierarchy.rpa.monitor.issue, title: "RPA Monitor", parentId: contract.hierarchy.rpa.monitor.parent, ...meta, projectMilestone: { name: contract.hierarchy.rpa.monitor.milestone }, description: rpaBody("RPA-MONITOR") },
	];
	for (const [index, capabilityId] of (contract.hierarchy.rpa.capabilities as string[]).entries()) issues.push({ id: `${capabilityId}-ISSUE`, title: `${String(index + 1).padStart(2, "0")}. ${capabilityId}`, parentId: contract.hierarchy.rpa.rpaSkillsRoot, ...meta, projectMilestone: milestone, description: rpaBody(capabilityId) });
	for (const [projectId, project] of Object.entries(contract.hierarchy.rpa.projects) as Array<[string, any]>) {
		const parent = project.root;
		issues.push({ id: parent, title: projectId, parentId: null, ...meta, projectMilestone: milestone, description: rpaBody(projectId) });
		for (let number = project.numbered[0]; number <= project.numbered[1]; number++) issues.push({ id: `${projectId}-T${number}`, title: `${String(number).padStart(2, "0")}. 업무`, parentId: parent, ...meta, projectMilestone: milestone, description: rpaBody(`${projectId}.T${String(number).padStart(2, "0")}`) });
		for (const title of ["예외 처리", "테스트"]) issues.push({ id: `${projectId}-${title}`, title, parentId: parent, ...meta, projectMilestone: milestone, description: rpaBody(projectId) });
	}
	return issues;
}

describe("Linear RPA contract", () => {
	test("accepts separate Environment, Skills, and Agents roots with four independent project RPA roots", () => {
		expect(validate(rpaSnapshot(), undefined, contract, "RPA")).toEqual([]);
	});

	test("rejects missing capability and project tasks plus invalid RPA identity", () => {
		const issues = rpaSnapshot().filter(issue => issue.id !== "RPA-GMB-FTA-T9");
		issues.find(issue => issue.id === contract.hierarchy.rpa.monitor.issue).parentId = contract.hierarchy.rpa.skillsRoot;
		issues.find(issue => issue.id === "RPA-GMB-HELIX-T1").description = rpaBody("RPA-UNKNOWN");
		const errors = validate(issues, undefined, contract, "RPA");
		expect(errors).toContain("RPA-GMB-FTA: numbered issue 9 must exist exactly once");
		expect(errors).toContain("RPA-MONITOR: invalid Monitor parent");
		expect(errors.some(error => error.includes("invalid RPA-ID line"))).toBeTrue();
	});
});
