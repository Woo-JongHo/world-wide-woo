import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";

const root   = resolve(import.meta.dir, "..");
const uncertaintyScript = resolve(root, ".agents/skills/woo-code-readability/scripts/typescript/02_audit-type-uncertainty.ts");
const hoverScript       = resolve(root, ".agents/skills/woo-code-readability/scripts/typescript/05_inspect-hover.mjs");
const layoutScript      = resolve(root, ".agents/skills/woo-code-readability/scripts/measure-layout.ts");
const regionsScript     = resolve(root, ".agents/skills/woo-code-readability/scripts/typescript/01_group-regions.ts");

function audit(file: string): { exitCode: number; output: string } {
	const result = Bun.spawnSync(["bun", uncertaintyScript, "--file", file], {
		cwd    : root,
		stdout : "pipe",
		stderr : "pipe",
	});
	return {
		exitCode : result.exitCode,
		output   : `${result.stdout.toString()}${result.stderr.toString()}`,
	};
}

function hover(...symbols: string[]): { exitCode: number; output: string } {
	const result = Bun.spawnSync([
		"node",
		hoverScript,
		".agents/skills/woo-code-readability/fixtures/hover-contract.ts",
		...symbols,
	], {
		cwd    : root,
		stdout : "pipe",
		stderr : "pipe",
	});
	return {
		exitCode : result.exitCode,
		output   : `${result.stdout.toString()}${result.stderr.toString()}`,
	};
}

function regions(...args: string[]): { exitCode: number; output: string } {
	const result = Bun.spawnSync([
		"bun",
		regionsScript,
		"--file",
		".agents/skills/woo-code-readability/fixtures/grid-regions.ts",
		...args,
	], {
		cwd    : root,
		stdout : "pipe",
		stderr : "pipe",
	});
	return {
		exitCode : result.exitCode,
		output   : `${result.stdout.toString()}${result.stderr.toString()}`,
	};
}

function layout(...args: string[]): { exitCode: number; output: string } {
	const result = Bun.spawnSync([
		"bun",
		layoutScript,
		".agents/skills/woo-code-readability/fixtures/layout-contract.ts",
		...args,
	], {
		cwd    : root,
		stdout : "pipe",
		stderr : "pipe",
	});
	return {
		exitCode : result.exitCode,
		output   : `${result.stdout.toString()}${result.stderr.toString()}`,
	};
}

describe("code readability type uncertainty auditor", () => {
	test("classifies TypeScript uncertainty syntax without logical operator false positives", () => {
		const result = audit(".agents/skills/woo-code-readability/fixtures/type-uncertainty.ts");

		expect(result.exitCode).toBe(0);
		expect(result.output).toContain("type-uncertainty findings=14");
		expect(result.output).toContain("angle-bracket-assertion=1");
		expect(result.output).toContain("as-assertion=1");
		expect(result.output).toContain("definite-assignment=1");
		expect(result.output).toContain("non-null-assertion=1");
		expect(result.output).toContain("null=2");
		expect(result.output).toContain("optional-method=1");
		expect(result.output).toContain("optional-parameter=1");
		expect(result.output).toContain("optional-property=1");
		expect(result.output).toContain("optional-tuple-element=1");
		expect(result.output).toContain("optional-type=1");
		expect(result.output).toContain("undefined=3");
		expect(result.output).not.toContain("logical");
		expect(result.output).not.toContain("conditional");
	});

	test("traverses JSDoc optional types while excluding logical and conditional operators", () => {
		const result = audit(".agents/skills/woo-code-readability/fixtures/type-uncertainty.js");

		expect(result.exitCode).toBe(0);
		expect(result.output).toContain("type-uncertainty findings=1");
		expect(result.output).toContain("optional-type=1");
	});
});

describe("code readability hover inspector", () => {
	test("reads JSDoc from exact declaration symbols", () => {
		const result = hover("CompactResult", "HoverOptions", "resourceId#1", "StoredOptions", "resourceId#2");

		expect(result.exitCode).toBe(0);
		expect(result.output).toContain("CompactResult: 작업 결과의 간결한 의미 타입이다.");
		expect(result.output).toContain("resourceId#1: 생략하면 새 리소스를 생성한다.");
		expect(result.output).toContain("resourceId#2: null이면 연결된 리소스가 없다는 뜻이다.");
	});

	test("fails closed when a declaration name is ambiguous", () => {
		const result = hover("resourceId");

		expect(result.exitCode).toBe(1);
		expect(result.output).toContain("ambiguous symbol declaration: resourceId; use resourceId#1..#2");
	});

	test("fails when the declaration has no JSDoc", () => {
		const result = hover("MissingDocumentation");

		expect(result.exitCode).toBe(1);
		expect(result.output).toContain("hover documentation missing: MissingDocumentation");
	});
});

describe("code readability region grouper", () => {
	test("groups sibling declarations by AST kind instead of text position", () => {
		const result = regions();

		expect(result.exitCode).toBe(0);
		expect(result.output).toContain("members    PropertySignature        rows= 3  table axes=type-annotation-colon");
		expect(result.output).toContain("properties PropertyAssignment       rows= 3  table axes=object-literal-colon,object-comma");
		expect(result.output).toContain("elements   Identifier               rows= 3  table axes=array-comma");
		expect(result.output).toContain("arguments  Identifier               rows= 3  table axes=call-arg-comma");
	});

	test("separates ternary colons into their own group instead of joining property or object-literal colons", () => {
		const result = regions();

		expect(result.exitCode).toBe(0);
		expect(result.output).toContain("arguments  ConditionalExpression    rows= 3  table axes=ternary-colon,call-arg-comma");
	});

	test("raises min-row threshold to drop pair-sized candidates", () => {
		const result = regions("--min-rows", "4");

		expect(result.exitCode).toBe(0);
		expect(result.output).not.toContain("rows= 3");
	});
});

describe("code readability layout inspector", () => {
	test("accepts the minimum shared cell width and centered shorter values", () => {
		const result = layout("--lines", "2-3", "--center-cell", "(#1");

		expect(result.exitCode).toBe(0);
		expect(result.output).toContain("center(()=ok");
	});

	test("rejects cells padded wider than their longest actual value", () => {
		const result = layout("--lines", "7-8", "--center-cell", "(#1");

		expect(result.exitCode).toBe(1);
		expect(result.output).toContain("center(()=fail:width=");
	});

	test("accepts one space after the final semicolon and rejects alignment padding", () => {
		const compact = layout("--lines", "12-13", "--compact-before", "}#1");
		const padded  = layout("--lines", "17", "--compact-before", "}#1");

		expect(compact.exitCode).toBe(0);
		expect(compact.output).toContain("compact-before(})=ok");
		expect(padded.exitCode).toBe(1);
		expect(padded.output).toContain("compact-before(})=fail");
	});
});
