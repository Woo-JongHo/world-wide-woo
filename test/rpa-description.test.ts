import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
	renderRpaProject,
	renderRpaTask,
	validateRpaDescriptionMap,
	type RpaDescriptionMap,
} from "../src/core/domain/development/rpa-description";

const fixturePath = resolve(import.meta.dir, "fixtures/rpa-description-map.json");

function fixture(): RpaDescriptionMap {
	return JSON.parse(readFileSync(fixturePath, "utf8")) as RpaDescriptionMap;
}

function mutableFixture(): any {
	return structuredClone(fixture());
}

describe("RPA description map validation", () => {
	test("accepts the complete normalized fixture", () => {
		expect(validateRpaDescriptionMap(fixture())).toEqual([]);
	});

	test("rejects unknown object keys and unfilled scaffold markers", () => {
		const map = mutableFixture();
		map.project.confirmations = [];
		map.tasks[0].purpose = "TODO";
		const errors = validateRpaDescriptionMap(map);
		expect(errors).toContain("map.project.confirmations: unknown field");
		expect(errors).toContain("map.tasks[0].purpose: unfilled placeholder is not allowed");
	});

	test("rejects malformed, impossible, and out-of-order WBS dates", () => {
		const malformed = mutableFixture();
		malformed.project.wbs.startDate = "2026-02-30";
		expect(validateRpaDescriptionMap(malformed)).toContain("map.project.wbs.startDate: must be a real YYYY-MM-DD date");

		const reversed = mutableFixture();
		reversed.project.wbs.baselineDate = "2026-08-04";
		reversed.project.wbs.startDate = "2026-08-03";
		reversed.project.wbs.endDate = "2026-08-02";
		const errors = validateRpaDescriptionMap(reversed);
		expect(errors).toContain("map.project.wbs: startDate must be on or before endDate");
	});

	test("rejects duplicate sibling IDs, sequences, and ambiguous code symbols", () => {
		const map = mutableFixture();
		map.tasks[1].id = map.tasks[0].id;
		map.tasks[1].sequence = map.tasks[0].sequence;
		const unit = map.tasks[1].units[0];
		unit.code.push({ ...unit.code[0], path: "src/demo/other.ts" });
		unit.steps.push({ ...unit.steps[0], id: unit.steps[1].id, sequence: unit.steps[1].sequence });
		const errors = validateRpaDescriptionMap(map).join("\n");
		expect(errors).toContain("duplicate task id");
		expect(errors).toContain("duplicate task sequence");
		expect(errors).toContain("duplicate code symbol id");
		expect(errors).toContain("duplicate step id");
		expect(errors).toContain("duplicate step sequence");
	});

	test("rejects broken Unit, Step, code, exception-test cross-references", () => {
		const map = mutableFixture();
		const task = map.tasks[1];
		task.units[0].steps[0].codeSymbols = ["missingSymbol"];
		task.tests[0].unitId = "RPA-UNIT-MISSING";
		task.tests[1].stepId = "STEP-MISSING";
		task.exceptions[0].testIds = ["TEST-DEMO-PASS", "TEST-MISSING"];
		const errors = validateRpaDescriptionMap(map).join("\n");
		expect(errors).toContain("unknown code symbol 'missingSymbol'");
		expect(errors).toContain("unknown unit 'RPA-UNIT-MISSING'");
		expect(errors).toContain("unknown step 'STEP-MISSING'");
		expect(errors).toContain("must target unit 'RPA-UNIT-01'");
		expect(errors).toContain("unknown test 'TEST-MISSING'");
	});

	test("requires evidence for completed test outcomes and permits explicit unknown safety text", () => {
		const map = mutableFixture();
		map.tasks[1].tests[0].evidence = null;
		const errors = validateRpaDescriptionMap(map);
		expect(errors).toContain("map.tasks[1].tests[0].evidence: required when status is 'passed'");
		expect(errors.some(error => error.includes("sideEffects"))).toBe(false);
	});

	test("requires not-run evidence to remain null", () => {
		const map = mutableFixture();
		map.tasks[1].tests[1].evidence = "실행하지 않은 테스트의 가짜 증거";
		expect(validateRpaDescriptionMap(map)).toContain("map.tasks[1].tests[1].evidence: must be null when status is 'not-run'");
	});

	test("rejects a Unit identity reused by another Task", () => {
		const map = mutableFixture();
		map.tasks[0].units[0].id = map.tasks[1].units[0].id;
		expect(validateRpaDescriptionMap(map).join("\n")).toContain("duplicate process unit id");
	});
});

describe("RPA Linear description rendering", () => {
	test("derives counts and sorts Task and Step rows by sequence", () => {
		const map = fixture();
		const before = JSON.stringify(map);
		const project = renderRpaProject(map);
		expect(project.indexOf("RPA-TASK-01")).toBeLessThan(project.indexOf("RPA-TASK-02"));
		expect(project).toContain("| Task 수 | 2 |");
		expect(project).toContain("| 1 | 가상 정산 검증 | RPA-TASK-01 | 가상 입력의 합계와 형식을 검증한다. | 검증된 가상 정산 결과 | [Linear](<https://linear.example.invalid/issue/RPA-TASK-01>) | 1 | 2 | 1 | 2 |");

		const task = renderRpaTask(map, "RPA-TASK-01");
		expect(task.indexOf("STEP-FORMAT")).toBeLessThan(task.indexOf("STEP-SUM"));
		expect(task).toContain("| Unit 수 | 1 |");
		expect(task).toContain("| Step 수 | 2 |");
		expect(task).toContain("| 예외 수 | 1 |");
		expect(task).toContain("| 테스트 수 | 2 |");
		expect(JSON.stringify(map)).toBe(before);
	});

	test("renders the exact fixed H2 surfaces and explicit empty collections", () => {
		const projectHeadings = renderRpaProject(fixture()).match(/^## .+$/gmu);
		expect(projectHeadings).toEqual(["## 프로젝트 정보", "## WBS", "## Task", "## 연결"]);
		const task = renderRpaTask(fixture(), "RPA-TASK-02");
		expect(task.match(/^## .+$/gmu)).toEqual(["## Task 정보", "## Unit 구성", "## 예외 케이스", "## 테스트 케이스", "## Unit 상세", "## 연결"]);
		expect(task.match(/정의 없음/gu)?.length).toBeGreaterThanOrEqual(2);
		expect(task).not.toContain("확인 이력");
		expect(task).not.toContain("고객 결정 이력");
	});

	test("escapes dynamic markdown so input cannot add headings or table cells", () => {
		const map = mutableFixture();
		map.tasks[1].purpose = "첫 줄\n## 임의 제목 | 새 셀";
		map.tasks[1].units[0].name = "이름\n## 공격";
		const output = renderRpaTask(map, "RPA-TASK-01");
		expect(output.match(/^## .+$/gmu)).toEqual(["## Task 정보", "## Unit 구성", "## 예외 케이스", "## 테스트 케이스", "## Unit 상세", "## 연결"]);
		expect(output).toContain("첫 줄<br>\\#\\# 임의 제목 \\| 새 셀");
		expect(output).toContain("### 1. 이름 \\#\\# 공격 \\(RPA-UNIT-01\\)");
		map.tasks[1].purpose = "<script>alert(1)</script>";
		expect(renderRpaTask(map, "RPA-TASK-01")).not.toContain("<script>");
	});

	test("rejects an unknown Task instead of rendering a partial surface", () => {
		expect(() => renderRpaTask(fixture(), "RPA-TASK-MISSING")).toThrow("Task를 찾을 수 없습니다 'RPA-TASK-MISSING'");
	});
});

describe("rpa-description CLI", () => {
	test("validates, renders, and detects stale read-back content", () => {
		const validate = Bun.spawnSync(["bun", "scripts/rpa-description.ts", "validate", "--map", fixturePath], { cwd: resolve(import.meta.dir, "..") });
		expect(validate.exitCode).toBe(0);
		expect(validate.stdout.toString()).toContain("RPA 설명 map 검증 통과");

		const rendered = renderRpaProject(fixture());
		const directory = mkdtempSync(join(tmpdir(), "rpa-description-"));
		const actualPath = join(directory, "actual.md");
		try {
			writeFileSync(actualPath, rendered.replace(/\n/gu, "\r\n") + "\r\n");
			const current = Bun.spawnSync(["bun", "scripts/rpa-description.ts", "check", "--map", fixturePath, "--surface", "project", "--actual", actualPath], { cwd: resolve(import.meta.dir, "..") });
			expect(current.exitCode).toBe(0);
			writeFileSync(actualPath, `${rendered}\n임의 수동 변경\n`);
			const stale = Bun.spawnSync(["bun", "scripts/rpa-description.ts", "check", "--map", fixturePath, "--surface", "project", "--actual", actualPath], { cwd: resolve(import.meta.dir, "..") });
			expect(stale.exitCode).toBe(1);
			expect(stale.stderr.toString()).toContain("RPA 설명이 생성 결과와 다릅니다");
		} finally { rmSync(directory, { recursive: true }); }
	});
});
