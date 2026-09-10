export interface RpaDescriptionMap {
	schemaVersion: "1.0";
	project: RpaProject;
	tasks: RpaTask[];
}

export interface RpaProject {
	id: string;
	name: string;
	customer: string;
	department: string;
	purpose: string;
	systems: string[];
	repository: string;
	processId: string;
	mapRef: { path: string; revision: string };
	wbs: {
		reference: string;
		revision: string;
		baselineDate: string;
		startDate: string;
		endDate: string;
	};
}

export interface RpaTask {
	id: string;
	name: string;
	sequence: number;
	issueUrl: string;
	purpose: string;
	output: string;
	units: RpaUnit[];
	exceptions: RpaException[];
	tests: RpaTest[];
}

export interface RpaUnit {
	id: string;
	name: string;
	sequence: number;
	responsibility: string;
	input: string;
	output: string;
	technology: { name: string; purpose: string }[];
	code: { path: string; symbol: string; explanation: string }[];
	sideEffects: string;
	approval: string;
	rerunPolicy: string;
	steps: RpaStep[];
}

export interface RpaStep {
	id: string;
	sequence: number;
	action: string;
	codeSymbols: string[];
	output: string;
}

export interface RpaException {
	id: string;
	unitId: string;
	stepId: string | null;
	condition: string;
	handling: string;
	recovery: string;
	testIds: string[];
}

export type RpaTestKind = "normal" | "boundary" | "failure" | "partial-failure" | "rerun";
export type RpaTestStatus = "passed" | "failed" | "not-run";

export interface RpaTest {
	id: string;
	unitId: string;
	stepId: string | null;
	kind: RpaTestKind;
	scenario: string;
	expected: string;
	status: RpaTestStatus;
	evidence: string | null;
}

type JsonObject = Record<string, unknown>;
type Errors = string[];

const PLACEHOLDER = /(?:\b(?:TODO|TBD|WIP)\b|^<[^<>\r\n]+>$)/iu;
const TEST_KINDS = new Set<RpaTestKind>(["normal", "boundary", "failure", "partial-failure", "rerun"]);
const TEST_STATUSES = new Set<RpaTestStatus>(["passed", "failed", "not-run"]);

export function validateRpaDescriptionMap(value: unknown): string[] {
	const errors: Errors = [];
	if (!objectWithKeys(value, "map", ["schemaVersion", "project", "tasks"], errors)) return errors;
	stringValue(value.schemaVersion, "map.schemaVersion", errors);
	if (value.schemaVersion !== "1.0") errors.push("map.schemaVersion: must be '1.0'");
	validateProject(value.project, errors);
	if (!arrayValue(value.tasks, "map.tasks", errors, false)) return errors;
	const taskIds = new Set<string>();
	const taskSequences = new Set<number>();
	const processUnitIds = new Set<string>();
	const processExceptionIds = new Set<string>();
	const processTestIds = new Set<string>();
	value.tasks.forEach((task, index) => {
		validateTask(task, `map.tasks[${index}]`, errors);
		if (!isObject(task)) return;
		uniqueString(task.id, `map.tasks[${index}].id`, taskIds, "task", errors);
		uniqueSequence(task.sequence, `map.tasks[${index}].sequence`, taskSequences, "task", errors);
		if (Array.isArray(task.units)) task.units.forEach((unit, unitIndex) => {
			if (isObject(unit)) uniqueString(unit.id, `map.tasks[${index}].units[${unitIndex}].id`, processUnitIds, "process unit", errors);
		});
		if (Array.isArray(task.exceptions)) task.exceptions.forEach((exception, exceptionIndex) => {
			if (isObject(exception)) uniqueString(exception.id, `map.tasks[${index}].exceptions[${exceptionIndex}].id`, processExceptionIds, "process exception", errors);
		});
		if (Array.isArray(task.tests)) task.tests.forEach((test, testIndex) => {
			if (isObject(test)) uniqueString(test.id, `map.tasks[${index}].tests[${testIndex}].id`, processTestIds, "process test", errors);
		});
	});
	return errors;
}

function validateProject(value: unknown, errors: Errors): void {
	const path = "map.project";
	if (!objectWithKeys(value, path, ["id", "name", "customer", "department", "purpose", "systems", "repository", "processId", "mapRef", "wbs"], errors)) return;
	for (const key of ["id", "name", "customer", "department", "purpose", "repository", "processId"] as const)
		stringValue(value[key], `${path}.${key}`, errors);
	if (arrayValue(value.systems, `${path}.systems`, errors, false))
		value.systems.forEach((system, index) => stringValue(system, `${path}.systems[${index}]`, errors));
	if (objectWithKeys(value.mapRef, `${path}.mapRef`, ["path", "revision"], errors)) {
		stringValue(value.mapRef.path, `${path}.mapRef.path`, errors);
		stringValue(value.mapRef.revision, `${path}.mapRef.revision`, errors);
	}
	if (!objectWithKeys(value.wbs, `${path}.wbs`, ["reference", "revision", "baselineDate", "startDate", "endDate"], errors)) return;
	stringValue(value.wbs.reference, `${path}.wbs.reference`, errors);
	stringValue(value.wbs.revision, `${path}.wbs.revision`, errors);
	for (const key of ["baselineDate", "startDate", "endDate"] as const) dateValue(value.wbs[key], `${path}.wbs.${key}`, errors);
	const { baselineDate, startDate, endDate } = value.wbs;
	if (isValidDateString(baselineDate) && isValidDateString(startDate) && isValidDateString(endDate)) {
		if (startDate > endDate) errors.push(`${path}.wbs: startDate must be on or before endDate`);
	}
}

function validateTask(value: unknown, path: string, errors: Errors): void {
	if (!objectWithKeys(value, path, ["id", "name", "sequence", "issueUrl", "purpose", "output", "units", "exceptions", "tests"], errors)) return;
	for (const key of ["id", "name", "issueUrl", "purpose", "output"] as const) stringValue(value[key], `${path}.${key}`, errors);
	positiveInteger(value.sequence, `${path}.sequence`, errors);
	if (typeof value.issueUrl === "string" && value.issueUrl.trim() && !isHttpUrl(value.issueUrl)) errors.push(`${path}.issueUrl: must be an http(s) URL`);
	if (!arrayValue(value.units, `${path}.units`, errors, false)) return;
	const unitIds = new Set<string>();
	const unitSequences = new Set<number>();
	const stepsByUnit = new Map<string, Set<string>>();
	value.units.forEach((unit, index) => {
		validateUnit(unit, `${path}.units[${index}]`, errors);
		if (!isObject(unit)) return;
		uniqueString(unit.id, `${path}.units[${index}].id`, unitIds, "unit", errors);
		uniqueSequence(unit.sequence, `${path}.units[${index}].sequence`, unitSequences, "unit", errors);
		if (typeof unit.id === "string" && Array.isArray(unit.steps)) {
			stepsByUnit.set(unit.id, new Set(unit.steps.flatMap(step => isObject(step) && typeof step.id === "string" ? [step.id] : [])));
		}
	});
	if (!arrayValue(value.exceptions, `${path}.exceptions`, errors, true) || !arrayValue(value.tests, `${path}.tests`, errors, true)) return;
	const tests = value.tests;
	const testIds = new Set<string>();
	tests.forEach((test, index) => {
		validateTest(test, `${path}.tests[${index}]`, errors);
		if (!isObject(test)) return;
		uniqueString(test.id, `${path}.tests[${index}].id`, testIds, "test", errors);
		validateUnitStepReference(test, `${path}.tests[${index}]`, unitIds, stepsByUnit, errors);
	});
	const exceptionIds = new Set<string>();
	value.exceptions.forEach((exception, index) => {
		validateException(exception, `${path}.exceptions[${index}]`, errors);
		if (!isObject(exception)) return;
		uniqueString(exception.id, `${path}.exceptions[${index}].id`, exceptionIds, "exception", errors);
		validateUnitStepReference(exception, `${path}.exceptions[${index}]`, unitIds, stepsByUnit, errors);
		if (!Array.isArray(exception.testIds)) return;
		const localTestIds = new Set<string>();
		exception.testIds.forEach((testId, testIndex) => {
			const referencePath = `${path}.exceptions[${index}].testIds[${testIndex}]`;
			if (typeof testId !== "string") return;
			if (localTestIds.has(testId)) errors.push(`${referencePath}: duplicate test reference '${testId}'`);
			localTestIds.add(testId);
			const target = tests.find(test => isObject(test) && test.id === testId);
			if (!isObject(target)) errors.push(`${referencePath}: unknown test '${testId}'`);
			else if (typeof exception.unitId === "string" && target.unitId !== exception.unitId)
				errors.push(`${referencePath}: test '${testId}' must target unit '${exception.unitId}'`);
		});
	});
}

function validateUnit(value: unknown, path: string, errors: Errors): void {
	if (!objectWithKeys(value, path, ["id", "name", "sequence", "responsibility", "input", "output", "technology", "code", "sideEffects", "approval", "rerunPolicy", "steps"], errors)) return;
	for (const key of ["id", "name", "responsibility", "input", "output", "sideEffects", "approval", "rerunPolicy"] as const)
		stringValue(value[key], `${path}.${key}`, errors);
	positiveInteger(value.sequence, `${path}.sequence`, errors);
	if (arrayValue(value.technology, `${path}.technology`, errors, false)) value.technology.forEach((item, index) => {
		const itemPath = `${path}.technology[${index}]`;
		if (!objectWithKeys(item, itemPath, ["name", "purpose"], errors)) return;
		stringValue(item.name, `${itemPath}.name`, errors);
		stringValue(item.purpose, `${itemPath}.purpose`, errors);
	});
	const symbols = new Set<string>();
	if (arrayValue(value.code, `${path}.code`, errors, false)) value.code.forEach((item, index) => {
		const itemPath = `${path}.code[${index}]`;
		if (!objectWithKeys(item, itemPath, ["path", "symbol", "explanation"], errors)) return;
		stringValue(item.path, `${itemPath}.path`, errors);
		stringValue(item.symbol, `${itemPath}.symbol`, errors);
		stringValue(item.explanation, `${itemPath}.explanation`, errors);
		uniqueString(item.symbol, `${itemPath}.symbol`, symbols, "code symbol", errors);
	});
	if (!arrayValue(value.steps, `${path}.steps`, errors, false)) return;
	const stepIds = new Set<string>();
	const stepSequences = new Set<number>();
	value.steps.forEach((step, index) => {
		const stepPath = `${path}.steps[${index}]`;
		validateStep(step, stepPath, errors);
		if (!isObject(step)) return;
		uniqueString(step.id, `${stepPath}.id`, stepIds, "step", errors);
		uniqueSequence(step.sequence, `${stepPath}.sequence`, stepSequences, "step", errors);
		if (!Array.isArray(step.codeSymbols)) return;
		const seen = new Set<string>();
		step.codeSymbols.forEach((symbol, symbolIndex) => {
			const symbolPath = `${stepPath}.codeSymbols[${symbolIndex}]`;
			if (typeof symbol !== "string") return;
			if (seen.has(symbol)) errors.push(`${symbolPath}: duplicate code symbol reference '${symbol}'`);
			seen.add(symbol);
			if (!symbols.has(symbol)) errors.push(`${symbolPath}: unknown code symbol '${symbol}'`);
		});
	});
}

function validateStep(value: unknown, path: string, errors: Errors): void {
	if (!objectWithKeys(value, path, ["id", "sequence", "action", "codeSymbols", "output"], errors)) return;
	stringValue(value.id, `${path}.id`, errors);
	positiveInteger(value.sequence, `${path}.sequence`, errors);
	stringValue(value.action, `${path}.action`, errors);
	stringValue(value.output, `${path}.output`, errors);
	if (arrayValue(value.codeSymbols, `${path}.codeSymbols`, errors, true))
		value.codeSymbols.forEach((symbol, index) => stringValue(symbol, `${path}.codeSymbols[${index}]`, errors));
}

function validateException(value: unknown, path: string, errors: Errors): void {
	if (!objectWithKeys(value, path, ["id", "unitId", "stepId", "condition", "handling", "recovery", "testIds"], errors)) return;
	for (const key of ["id", "unitId", "condition", "handling", "recovery"] as const) stringValue(value[key], `${path}.${key}`, errors);
	nullableString(value.stepId, `${path}.stepId`, errors);
	if (arrayValue(value.testIds, `${path}.testIds`, errors, true)) value.testIds.forEach((id, index) => stringValue(id, `${path}.testIds[${index}]`, errors));
}

function validateTest(value: unknown, path: string, errors: Errors): void {
	if (!objectWithKeys(value, path, ["id", "unitId", "stepId", "kind", "scenario", "expected", "status", "evidence"], errors)) return;
	for (const key of ["id", "unitId", "scenario", "expected"] as const) stringValue(value[key], `${path}.${key}`, errors);
	nullableString(value.stepId, `${path}.stepId`, errors);
	if (typeof value.kind !== "string" || !TEST_KINDS.has(value.kind as RpaTestKind)) errors.push(`${path}.kind: invalid test kind`);
	if (typeof value.status !== "string" || !TEST_STATUSES.has(value.status as RpaTestStatus)) errors.push(`${path}.status: invalid test status`);
	if (value.evidence !== null) stringValue(value.evidence, `${path}.evidence`, errors);
	if ((value.status === "passed" || value.status === "failed") && (typeof value.evidence !== "string" || !value.evidence.trim()))
		errors.push(`${path}.evidence: required when status is '${value.status}'`);
	if (value.status === "not-run" && value.evidence !== null) errors.push(`${path}.evidence: must be null when status is 'not-run'`);
}

function validateUnitStepReference(value: JsonObject, path: string, unitIds: Set<string>, stepsByUnit: Map<string, Set<string>>, errors: Errors): void {
	if (typeof value.unitId !== "string" || !unitIds.has(value.unitId)) {
		if (typeof value.unitId === "string") errors.push(`${path}.unitId: unknown unit '${value.unitId}'`);
		return;
	}
	if (typeof value.stepId === "string" && !stepsByUnit.get(value.unitId)?.has(value.stepId))
		errors.push(`${path}.stepId: unknown step '${value.stepId}' in unit '${value.unitId}'`);
}

export function renderRpaProject(map: RpaDescriptionMap): string {
	assertValid(map);
	const tasks = sorted(map.tasks);
	const lines = [
		"## 프로젝트 정보", "",
		table(["항목", "값"], [
			["프로젝트", `${map.project.name} (${map.project.id})`], ["고객", map.project.customer], ["부서", map.project.department],
			["목적", map.project.purpose], ["대상 시스템", map.project.systems.join(", ")], ["Process ID", map.project.processId], ["Task 수", tasks.length],
		]), "", "## WBS", "",
		table(["원본", "revision", "기준일", "시작일", "종료일"], [[map.project.wbs.reference, map.project.wbs.revision, map.project.wbs.baselineDate, map.project.wbs.startDate, map.project.wbs.endDate]]),
		"", "## Task 구성", "",
		table(["단계", "업무", "RPA-ID", "무엇을 하는가", "결과", "Task 이슈", "Unit 수", "Step 수", "예외 수", "테스트 수"], tasks.map(task => [task.sequence, task.name, task.id, task.purpose, task.output, raw(linearLink(task.issueUrl)), task.units.length, countSteps(task), task.exceptions.length, task.tests.length])),
		"", "## 연결", "",
		table(["항목", "값"], [["Repository", map.project.repository], ["rpa-map", map.project.mapRef.path], ["rpa-map revision", map.project.mapRef.revision]]),
	];
	return `${lines.join("\n")}\n`;
}

export function renderRpaTask(map: RpaDescriptionMap, taskId: string): string {
	assertValid(map);
	const task = map.tasks.find(candidate => candidate.id === taskId);
	if (!task) throw new Error(`Task를 찾을 수 없습니다 '${taskId}'`);
	const units = sorted(task.units);
	const unitOrder = new Map(units.map((unit, index) => [unit.id, index]));
	const exceptions = [...task.exceptions].sort((a, b) => compareReferences(a, b, unitOrder));
	const tests = [...task.tests].sort((a, b) => compareReferences(a, b, unitOrder));
	const lines: string[] = [
		"## Task 정보", "",
		table(["항목", "값"], [["Task", `${task.name} (${task.id})`], ["순서", task.sequence], ["목적", task.purpose], ["산출물", task.output], ["Unit 수", units.length], ["Step 수", countSteps(task)], ["예외 수", exceptions.length], ["테스트 수", tests.length]]),
		"", "## Unit 구성", "",
		table(["순서", "Unit", "RPA-ID", "책임", "입력", "출력", "Step 수"], units.map(unit => [unit.sequence, unit.name, unit.id, unit.responsibility, unit.input, unit.output, unit.steps.length])),
		"", "## 예외 케이스", "",
		exceptions.length ? table(["ID", "Unit", "Step", "조건", "처리", "복구", "연결 테스트"], exceptions.map(item => [item.id, item.unitId, item.stepId ?? "Unit 전체", item.condition, item.handling, item.recovery, item.testIds.length ? item.testIds.join(", ") : "정의 없음"])) : "정의 없음",
		"", "## 테스트 케이스", "",
		tests.length ? table(["ID", "Unit", "Step", "종류", "시나리오", "기대 결과", "상태", "증거"], tests.map(item => [item.id, item.unitId, item.stepId ?? "Unit 전체", item.kind, item.scenario, item.expected, item.status, item.evidence ?? "정의 없음"])) : "정의 없음",
		"", "## Unit 상세", "",
	];
	for (const unit of units) {
		lines.push(`### ${safeHeading(`${unit.sequence}. ${unit.name} (${unit.id})`)}`, "",
			table(["항목", "값"], [["책임", unit.responsibility], ["입력", unit.input], ["출력", unit.output], ["Step 수", unit.steps.length], ["부작용", unit.sideEffects], ["승인", unit.approval], ["재실행 정책", unit.rerunPolicy]]), "",
			"#### 사용 기술", "", table(["기술", "사용 목적"], unit.technology.map(item => [item.name, item.purpose])), "",
			"#### 코드 설명", "", table(["경로", "심볼", "설명"], unit.code.map(item => [item.path, item.symbol, item.explanation])), "",
			"#### Step 구성", "", table(["순서", "Step ID", "동작", "코드 심볼", "출력"], sorted(unit.steps).map(step => [step.sequence, step.id, step.action, step.codeSymbols.length ? step.codeSymbols.join(", ") : "정의 없음", step.output])), "");
	}
	lines.push("## 연결", "", table(["항목", "값"], [["Linear Task", raw(linearLink(task.issueUrl))], ["rpa-map", map.project.mapRef.path], ["rpa-map revision", map.project.mapRef.revision], ["Process ID", map.project.processId]]));
	return `${lines.join("\n")}\n`;
}

function countSteps(task: RpaTask): number { return task.units.reduce((sum, unit) => sum + unit.steps.length, 0); }
function sorted<T extends { readonly sequence: number }>(values: readonly T[]): T[] { return [...values].sort((a, b) => a.sequence - b.sequence); }
function compareReferences(a: { unitId: string; stepId: string | null; id: string }, b: { unitId: string; stepId: string | null; id: string }, order: Map<string, number>): number {
	return (order.get(a.unitId)! - order.get(b.unitId)!) || codepointCompare(a.stepId ?? "", b.stepId ?? "") || codepointCompare(a.id, b.id);
}
interface RawCell { readonly value: string; }
type Cell = string | number | RawCell;
function raw(value: string): RawCell { return { value }; }
function table(headers: readonly string[], rows: readonly (readonly Cell[])[]): string {
	return [`| ${headers.map(markdownCell).join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map(row => `| ${row.map(markdownCell).join(" | ")} |`)].join("\n");
}
function markdownCell(value: Cell): string {
	if (typeof value === "object") return value.value;
	return escapeMarkdown(String(value)).replace(/\r\n?|\n/gu, "<br>");
}
function safeHeading(value: string): string { return escapeMarkdown(value).replace(/\r\n?|\n/gu, " "); }
function escapeMarkdown(value: string): string {
	return value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/\\/gu, "\\\\").replace(/([|`*_{}\[\]()#+!])/gu, "\\$1");
}
function linearLink(issueUrl: string): string { return `[Linear](<${new URL(issueUrl).href}>)`; }
function codepointCompare(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function assertValid(map: RpaDescriptionMap): void {
	const errors = validateRpaDescriptionMap(map);
	if (errors.length) throw new Error(`invalid RPA description map:\n${errors.join("\n")}`);
}

function isObject(value: unknown): value is JsonObject { return typeof value === "object" && value !== null && !Array.isArray(value); }
function objectWithKeys(value: unknown, path: string, keys: readonly string[], errors: Errors): value is JsonObject {
	if (!isObject(value)) { errors.push(`${path}: must be an object`); return false; }
	const allowed = new Set(keys);
	for (const key of Object.keys(value)) if (!allowed.has(key)) errors.push(`${path}.${key}: unknown field`);
	for (const key of keys) if (!(key in value)) errors.push(`${path}.${key}: required field`);
	return true;
}
function stringValue(value: unknown, path: string, errors: Errors): value is string {
	if (typeof value !== "string" || !value.trim()) { errors.push(`${path}: must be a non-empty string`); return false; }
	if (PLACEHOLDER.test(value.trim())) errors.push(`${path}: unfilled placeholder is not allowed`);
	return true;
}
function nullableString(value: unknown, path: string, errors: Errors): void { if (value !== null) stringValue(value, path, errors); }
function positiveInteger(value: unknown, path: string, errors: Errors): value is number {
	if (!Number.isInteger(value) || (value as number) < 1) { errors.push(`${path}: must be a positive integer`); return false; }
	return true;
}
function arrayValue(value: unknown, path: string, errors: Errors, emptyAllowed: boolean): value is unknown[] {
	if (!Array.isArray(value)) { errors.push(`${path}: must be an array`); return false; }
	if (!emptyAllowed && value.length === 0) errors.push(`${path}: must not be empty`);
	return true;
}
function uniqueString(value: unknown, path: string, seen: Set<string>, label: string, errors: Errors): void {
	if (typeof value !== "string") return;
	if (seen.has(value)) errors.push(`${path}: duplicate ${label} id '${value}'`);
	seen.add(value);
}
function uniqueSequence(value: unknown, path: string, seen: Set<number>, label: string, errors: Errors): void {
	if (!Number.isInteger(value)) return;
	if (seen.has(value as number)) errors.push(`${path}: duplicate ${label} sequence '${value}'`);
	seen.add(value as number);
}
function dateValue(value: unknown, path: string, errors: Errors): void { if (!isValidDateString(value)) errors.push(`${path}: must be a real YYYY-MM-DD date`); }
function isValidDateString(value: unknown): value is string {
	if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
	const [year, month, day] = value.split("-").map(Number) as [number, number, number];
	const date = new Date(Date.UTC(year, month - 1, day));
	return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
function isHttpUrl(value: string): boolean { try { const url = new URL(value); return url.protocol === "http:" || url.protocol === "https:"; } catch { return false; } }
