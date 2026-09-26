import { describe, expect, test }                           from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { relative, resolve }                                from "node:path";

const root              = resolve(import.meta.dir, "..")                                                                       ;
const importsScript     = resolve(root, ".agents/skills/woo-code-readability/scripts/typescript/00_normalize-imports.ts")      ;
const uncertaintyScript = resolve(root, ".agents/skills/woo-code-readability/scripts/typescript/02_audit-type-uncertainty.ts") ;
const hoverScript       = resolve(root, ".agents/skills/woo-code-readability/scripts/typescript/05_inspect-hover.mjs")         ;
const layoutScript      = resolve(root, ".agents/skills/woo-code-readability/scripts/measure-layout.ts")                       ;
const regionsScript     = resolve(root, ".agents/skills/woo-code-readability/scripts/typescript/01_group-regions.ts")          ;
const alignScript       = resolve(root, ".agents/skills/woo-code-readability/scripts/typescript/06_align-tables.ts")           ;
const wrapScript        = resolve(root, ".agents/skills/woo-code-readability/scripts/typescript/07_wrap-conditions.ts")        ;
const functionMapScript = resolve(root, ".agents/skills/woo-code-readability/scripts/typescript/08_function-map.ts")           ;

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

function imports(...files: string[]): { exitCode: number; output: string } {
	const result = Bun.spawnSync(["bun", importsScript, ...files], {
		cwd    : root,
		stdout : "pipe",
		stderr : "pipe",
	});
	return {
		exitCode : result.exitCode,
		output   : `${result.stdout.toString()}${result.stderr.toString()}`,
	};
}

function importsWrite(...files: string[]): { exitCode: number; output: string } {
	const result = Bun.spawnSync(["bun", importsScript, "--write", ...files], {
		cwd    : root,
		stdout : "pipe",
		stderr : "pipe",
	});
	return { exitCode: result.exitCode, output: `${result.stdout.toString()}${result.stderr.toString()}` };
}

describe("code readability import declaration normalizer", () => {
	test("accepts the repository declaration baseline without another rewrite", () => {
		const result = imports(
			"src/core/application/orchestration/workbench-artifacts.ts",
			"src/core/application/work/t-note-service.ts",
			"src/adapters/inbound/tui/features/chat/view/www-execution.ts",
		);

		expect(result.exitCode).toBe(0);
		expect(result.output).toContain("files=3 changed=0");
	});

	test("splits mixed imports without touching side effects, templates, or separate blocks", () => {
		const directory    = mkdtempSync(resolve(root, ".www/runtime/woo-imports-")) ;
		const file         = resolve(directory, "fixture.ts")                        ;
		const relativeFile = relative(root, file)                                    ;
		const before = [
			'// 🚀 UTF-16 index preservation',
			'import "./register.js";',
			'import Runtime, { run, type Run2Options } from "https://cdn.example/runtime.js";',
			'import { canonicalJson, sha256 } from "@/digest.js";',
			'import { firstExtremelyLongIdentifier, secondExtremelyLongIdentifier, thirdExtremelyLongIdentifier, fourthExtremelyLongIdentifier } from "@/long.js";',
			'import { short } from "@/short.js";',
			'',
			'import { independent } from "@/independent.js";',
			'const boundary = true;',
			'import { afterBoundary } from "@/after-boundary.js";',
			'',
			'const example = `import { fake, type Fake } from "@/fake.js";`;',
			'',
		].join("\n");
		writeFileSync(file, before);
		try {
			const check = imports(relativeFile);
			expect(check.exitCode).toBe(1);
			expect(check.output).toContain(`invalid ${relativeFile}`);
			expect(importsWrite(relativeFile).exitCode).toBe(0);
			const once = readFileSync(file, "utf8");
			expect(once).toContain('import "./register.js";');
			expect(once).toContain('import Runtime, { run }');
			expect(once).toContain('from "https://cdn.example/runtime.js";');
			expect(once).toContain('import type { Run2Options }');
			expect(once).toContain('import { canonicalJson, sha256 }');
			expect(once).toContain('import {\n\tfirstExtremelyLongIdentifier,');
			expect(once).toContain('import { independent } from "@/independent.js";');
			expect(once).toContain('import { afterBoundary } from "@/after-boundary.js";');
			expect(once).toContain('`import { fake, type Fake } from "@/fake.js";`');
			const aligned = once.split("\n").filter(line => line.startsWith("import ") && line.includes(" from ") && !line.includes("independent") && !line.includes("afterBoundary"));
			expect(new Set(aligned.map(line => line.indexOf(" from "))).size).toBe(1);
			expect(once).toContain("// 🚀 UTF-16 index preservation\n");
			expect(once).toContain("const boundary = true;\n");
			expect(importsWrite(relativeFile).exitCode).toBe(0);
			expect(readFileSync(file, "utf8")).toBe(once);
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	test("fails closed instead of rewriting comments inside a mixed import", () => {
		const directory    = mkdtempSync(resolve(root, ".www/runtime/woo-import-comments-")) ;
		const file         = resolve(directory, "fixture.ts")                                ;
		const relativeFile = relative(root, file)                                            ;
		writeFileSync(file, 'import { run, /* keep, comma */ type RunOptions } from "@/runtime.js";\n');
		try {
			const result = importsWrite(relativeFile);
			expect(result.exitCode).toBe(1);
			expect(result.output).toContain("주석이 있는 import는 자동 수정하지 않습니다");
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	test("fails closed when one import block mixes terminator styles", () => {
		const directory    = mkdtempSync(resolve(root, ".www/runtime/woo-import-terminators-")) ;
		const file         = resolve(directory, "fixture.ts")                                   ;
		const relativeFile = relative(root, file)                                               ;
		writeFileSync(file, 'import { a } from "x";\nimport { b } from "y"\n');
		try {
			const result = importsWrite(relativeFile);
			expect(result.exitCode).toBe(1);
			expect(result.output).toContain("종결자 스타일이 섞여 있습니다");
			expect(readFileSync(file, "utf8")).toBe('import { a } from "x";\nimport { b } from "y"\n');
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	test("normalizes CRLF imports and fails closed for import attributes", () => {
		const directory  = mkdtempSync(resolve(root, ".www/runtime/woo-import-boundaries-")) ;
		const crlf       = resolve(directory, "crlf.ts")                                     ;
		const attributes = resolve(directory, "attributes.ts")                               ;
		writeFileSync(crlf, 'import { run, type RunOptions } from "@/runtime.js";\r\n');
		writeFileSync(attributes, 'import data, { type Schema } from "./data.json" with { type: "json" };\n');
		try {
			expect(importsWrite(relative(root, crlf)).exitCode).toBe(0);
			const normalized = readFileSync(crlf, "utf8");
			expect(normalized).toContain('import { run }             from "@/runtime.js";\r\n');
			expect(normalized).toContain('import type { RunOptions } from "@/runtime.js";\r\n');
			const unsupported = importsWrite(relative(root, attributes));
			expect(unsupported.exitCode).toBe(1);
			expect(unsupported.output).toContain("attributes가 있는 혼합 import는 자동 수정하지 않습니다");
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	test("collapses value, type, and alias single-specifier multiline imports to one line", () => {
		const directory    = mkdtempSync(resolve(root, ".www/runtime/woo-imports-single-")) ;
		const file         = resolve(directory, "fixture.ts")                               ;
		const relativeFile = relative(root, file)                                           ;
		const before = [
			'import {',
			'\tobsidianWikiTarget,',
			'} from "@/core/domain/development/obsidian-contract.js";',
			'import type {',
			'\tLinearIssueReference,',
			'} from "@/core/domain/work/index.js";',
			'import {',
			'\trenamedTarget as aliasTarget,',
			'} from "@/core/domain/development/obsidian-contract.js";',
			'',
		].join("\n");
		writeFileSync(file, before);
		try {
			expect(importsWrite(relativeFile).exitCode).toBe(0);
			const once = readFileSync(file, "utf8");
			expect(once).toContain('import { obsidianWikiTarget }           from "@/core/domain/development/obsidian-contract.js";\n');
			expect(once).toContain('import type { LinearIssueReference }    from "@/core/domain/work/index.js";\n');
			expect(once).toContain('import { renamedTarget as aliasTarget } from "@/core/domain/development/obsidian-contract.js";\n');
			expect(importsWrite(relativeFile).exitCode).toBe(0);
			expect(readFileSync(file, "utf8")).toBe(once);
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	test("keeps imports at or below 120 columns one line and wraps only longer multi-specifier imports", () => {
		const directory    = mkdtempSync(resolve(root, ".www/runtime/woo-imports-width-")) ;
		const file         = resolve(directory, "fixture.ts")                              ;
		const relativeFile = relative(root, file)                                          ;
		const exactName    = "b".repeat(120 - 'import {  } from "@/boundary.js";'.length)  ;
		const overName     = "s".repeat(121 - 'import {  } from "@/boundary.js";'.length)  ;
		const before = [
			`import { ${exactName} } from "@/boundary.js";`,
			`import { ${overName} } from "@/boundary.js";`,
			`import { ${"v".repeat(60)}, ${"w".repeat(60)} } from "@/boundary.js";`,
			"",
		].join("\n");
		writeFileSync(file, before);
		try {
			expect(imports(relativeFile).exitCode).toBe(1);
			expect(importsWrite(relativeFile).exitCode).toBe(0);
			const once = readFileSync(file, "utf8");
			const lines = once.split("\n");
			expect(lines[0]).toBe(`import { ${exactName} }  from "@/boundary.js";`);
			expect(lines[1]).toBe(`import { ${overName} } from "@/boundary.js";`);
			expect(lines[2]).toBe("import {");
			expect(lines[3]).toBe(`\t${"v".repeat(60)},`);
			expect(lines[4]).toBe(`\t${"w".repeat(60)},`);
			expect(lines[5]).toBe('} from "@/boundary.js";');
			expect(importsWrite(relativeFile).exitCode).toBe(0);
			expect(readFileSync(file, "utf8")).toBe(once);
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	test("fails closed for comments and attributes inside single-specifier multiline imports", () => {
		const directory  = mkdtempSync(resolve(root, ".www/runtime/woo-imports-failclosed-")) ;
		const comment    = resolve(directory, "comment.ts")                                   ;
		const attributes = resolve(directory, "attributes.ts")                                ;
		const crlf       = resolve(directory, "crlf.ts")                                      ;
		writeFileSync(comment, 'import {\n\t/* keep position */ run,\n} from "@/runtime.js";\n');
		writeFileSync(attributes, 'import {\n\tdata,\n} from "./data.json" with { type: "json" };\n');
		writeFileSync(crlf, 'import {\r\n\trun,\r\n} from "@/runtime.js";\r\n');
		try {
			const commentResult = importsWrite(relative(root, comment));
			expect(commentResult.exitCode).toBe(1);
			expect(commentResult.output).toContain("주석이 있는 import는 자동 수정하지 않습니다");
			const attributeResult = importsWrite(relative(root, attributes));
			expect(attributeResult.exitCode).toBe(1);
			expect(attributeResult.output).toContain("attributes가 있는 import는 자동 수정하지 않습니다");
			expect(importsWrite(relative(root, crlf)).exitCode).toBe(0);
			expect(readFileSync(crlf, "utf8")).toBe('import { run } from "@/runtime.js";\r\n');
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});
});

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

function alignTables(...args: string[]): { exitCode: number; output: string } {
	const result = Bun.spawnSync(["bun", alignScript, ...args], {
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
	}, 40000);

	test("fails closed when a declaration name is ambiguous", () => {
		const result = hover("resourceId");

		expect(result.exitCode).toBe(1);
		expect(result.output).toContain("ambiguous symbol declaration: resourceId; use resourceId#1..#2");
	}, 40000);

	test("fails when the declaration has no JSDoc", () => {
		const result = hover("MissingDocumentation");

		expect(result.exitCode).toBe(1);
		expect(result.output).toContain("hover documentation missing: MissingDocumentation");
	}, 40000);
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

describe("code readability table aligner", () => {
	test("reports declaration, interface, and member tables without JSDoc or pair rows", () => {
		const result = alignTables("--file", ".agents/skills/woo-code-readability/fixtures/table-alignment.ts");

		expect(result.exitCode).toBe(1);
		expect(result.output).toContain("align-tables file=.agents/skills/woo-code-readability/fixtures/table-alignment.ts groups=4 misaligned=4");
		expect(result.output).toContain("interface-members  rows= 3");
		expect(result.output).toContain("class-members      rows= 3");
		expect(result.output).toContain("declaration-equals rows= 3");
		expect(result.output).toContain("object-rows        rows= 3");
		expect(result.output).not.toContain("rows= 4");
	}, 40000);

	test("aligns colon and semicolon columns and object row boundaries, then stays idempotent", () => {
		const directory    = mkdtempSync(resolve(root, ".www/runtime/woo-align-tables-")) ;
		const file         = resolve(directory, "fixture.ts")                             ;
		const relativeFile = relative(root, file)                                         ;
		writeFileSync(file, readFileSync(resolve(root, ".agents/skills/woo-code-readability/fixtures/table-alignment.ts"), "utf8"));
		try {
			expect(alignTables("--file", relativeFile, "--write").exitCode).toBe(0);
			const once = readFileSync(file, "utf8");
			expect(once).toContain("\tfirst  : string             ;\n\tsecond : readonly string[]  ;\n\tthird  : string | undefined ;\n");
			expect(once).toContain("\treadonly one         : string  ;\n\tprivate readonly two : number  ;\n\tthree                : boolean ;\n");
			expect(once).toContain('const alpha : string  = "a"  ;\nconst beta  : number  = 2    ;\nconst gamma : boolean = true ;\n');
			expect(once).toContain('\t{ heading : "SOURCE"       , minWidth : 7 , weight : 0 },\n\t{ heading : "DISTRIBUTION" , minWidth : 4 , weight : 1 },\n\t{ heading : "SIZE"         , minWidth : 6 , weight : 0 },\n');
			expect(alignTables("--file", relativeFile).exitCode).toBe(0);
			expect(alignTables("--file", relativeFile, "--write").exitCode).toBe(0);
			expect(readFileSync(file, "utf8")).toBe(once);
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	}, 40000);

	test("leaves conditional types, for statements, empty statements, and one-line execution blocks untouched", () => {
		const directory    = mkdtempSync(resolve(root, ".www/runtime/woo-align-exclusions-"))                                       ;
		const file         = resolve(directory, "fixture.ts")                                                                       ;
		const relativeFile = relative(root, file)                                                                                   ;
		const fixture      = readFileSync(resolve(root, ".agents/skills/woo-code-readability/fixtures/table-alignment.ts"), "utf8") ;
		writeFileSync(file, fixture);
		try {
			expect(alignTables("--file", relativeFile, "--write").exitCode).toBe(0);
			const once = readFileSync(file, "utf8");
			expect(once).toContain('type Conditional = string extends string ? "yes" : "no";\n');
			expect(once).toContain("for (let index = 0; index < 3; index += 1) kept.push(value);\n");
			expect(once).toContain("\t;\n");
			expect(once).toContain("const run = (item: string) => { const inner: string = item; return inner; };\n");
			expect(once).toContain("\tfourth: number;\n");
			expect(once).toContain('const pairOnlyOne: string = "x";\nconst pairOnlyTwo: string = "y";\n');
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	}, 40000);

	test("rejects interface members compressed onto one physical line", () => {
		const directory    = mkdtempSync(resolve(root, ".www/runtime/woo-align-compressed-")) ;
		const file         = resolve(directory, "fixture.ts")                                 ;
		const relativeFile = relative(root, file)                                             ;
		writeFileSync(file, "export interface Request { requestId: string; projectId: string; runId: string; }\n");
		try {
			const check = alignTables("--file", relativeFile);
			expect(check.exitCode).toBe(1);
			expect(check.output).toContain("compressed=1");
			expect(check.output).toContain("compressed-members=3");
			expect(alignTables("--file", relativeFile, "--write").exitCode).toBe(1);
			expect(readFileSync(file, "utf8")).toBe("export interface Request { requestId: string; projectId: string; runId: string; }\n");
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	}, 40000);
});

describe("code readability table kind registry", () => {
	test("detects method, alias, declaration, registration, enum, and case tables", () => {
		const result = alignTables("--file", ".agents/skills/woo-code-readability/fixtures/table-kinds.ts");

		expect(result.exitCode).toBe(1);
		expect(result.output).toContain("align-tables file=.agents/skills/woo-code-readability/fixtures/table-kinds.ts groups=8 misaligned=8");
		expect(result.output).toContain("method-signature   rows= 3");
		expect(result.output).toContain("type-alias         rows= 3");
		expect(result.output).toContain("type-members       rows= 3");
		expect(result.output).toContain("declaration-equals rows= 3");
		expect(result.output).toContain("registration       rows= 3");
		expect(result.output).toContain("enum-member        rows= 3");
		expect(result.output).toContain("case-clause        rows= 3");
	}, 40000);

	test("aligns every kind to minimum width and stays idempotent", () => {
		const directory    = mkdtempSync(resolve(root, ".www/runtime/woo-align-kinds-")) ;
		const file         = resolve(directory, "fixture.ts")                            ;
		const relativeFile = relative(root, file)                                        ;
		writeFileSync(file, readFileSync(resolve(root, ".agents/skills/woo-code-readability/fixtures/table-kinds.ts"), "utf8"));
		try {
			expect(alignTables("--file", relativeFile, "--write").exitCode).toBe(0);
			const once = readFileSync(file, "utf8");
			expect(once).toContain("\tschemaVersion : 1      ;\n\tname          : string ;\n\tcreatedAt     : string ;\n");
			expect(once).toContain("\trunFirst (first: string                ): Promise<void>;\n\trunSecond(second: number, extra: string): void;\n\tlistAll  ()                             : Promise<string[]>;\n");
			expect(once).toContain("type AppOptions      = RunOptions             ;\ntype SessionList     = RecentSessionSummary[] ;\ntype ThreadSelection = string | null          ;\n");
			expect(once).toContain('const alpha : string  = "a"  ;\nconst beta  : number  = 22   ;\nconst gamma : boolean = true ;\n');
			expect(once).toContain("\tdashboard : new DashboardRail(get, synthetic),\n\tworkflow  : new WorkflowRail(get, synthetic),\n\tcontext   : new ContextRail(get, synthetic),\n");
			expect(once).toContain("\tLow    = 1   ,\n\tMiddle = 22  ,\n\tHigh   = 333 ,\n");
			expect(once).toContain('\t\tcase "a"  : return "first";\n\t\tcase "bb" : return "second";\n\t\tcase "ccc": return "third";\n');
			expect(alignTables("--file", relativeFile).exitCode).toBe(0);
			expect(readFileSync(file, "utf8")).toBe(once);
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	}, 40000);

	test("explains the detected kind and its axes for a given line", () => {
		const fixturePath   = ".agents/skills/woo-code-readability/fixtures/table-kinds.ts"          ;
		const source        = readFileSync(resolve(root, fixturePath), "utf8")                       ;
		const dashboardLine = source.split("\n").findIndex(line => line.includes("dashboard")) + 1   ;
		const result        = alignTables("--file", fixturePath, "--explain", String(dashboardLine)) ;

		expect(result.exitCode).toBe(0);
		expect(result.output).toContain(`explain line=${dashboardLine} node=PropertyAssignment`);
		expect(result.output).toContain("registration: colon@");
	}, 40000);
});

describe("code readability table tail and wrap", () => {
	test("aligns object rows that close with as const tails", () => {
		const directory    = mkdtempSync(resolve(root, ".www/runtime/woo-align-tail-")) ;
		const file         = resolve(directory, "fixture.ts")                           ;
		const relativeFile = relative(root, file)                                       ;
		writeFileSync(file, [
			"const columns = [",
			'\t{ heading: "SOURCE", minWidth: 7 } as const,',
			'\t{ heading: "DISTRIBUTION", minWidth: 4 } as const,',
			'\t{ heading: "SIZE", minWidth: 6 } as const,',
			"];",
			"",
		].join("\n"));
		try {
			const check = alignTables("--file", relativeFile);
			expect(check.exitCode).toBe(1);
			expect(check.output).toContain("object-rows");
			expect(alignTables("--file", relativeFile, "--write").exitCode).toBe(0);
			const once = readFileSync(file, "utf8");
			expect(once).toContain('\t{ heading : "SOURCE"       , minWidth : 7 } as const,\n\t{ heading : "DISTRIBUTION" , minWidth : 4 } as const,\n\t{ heading : "SIZE"         , minWidth : 6 } as const,\n');
			expect(alignTables("--file", relativeFile).exitCode).toBe(0);
			expect(readFileSync(file, "utf8")).toBe(once);
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	}, 40000);

	test("wraps long single-line condition chains per rule 38", () => {
		const directory    = mkdtempSync(resolve(root, ".www/runtime/woo-align-wrap-")) ;
		const file         = resolve(directory, "fixture.ts")                           ;
		const relativeFile = relative(root, file)                                       ;
		writeFileSync(file, [
			"export function probe(value: unknown): string {",
			'\tif (!value || typeof value !== "object" || Array.isArray(value) || !("id" in value) || !("kind" in value)) return "no";',
			'\treturn "yes";',
			"}",
			"",
		].join("\n"));
		try {
			expect(alignTables("--file", relativeFile).exitCode).toBe(0);
			const wrapped = [
				"export function probe(value: unknown): string {",
				"\tif (!value",
				'\t\t|| typeof value !== "object"',
				"\t\t|| Array.isArray(value)",
				'\t\t|| !("id" in value)',
				'\t\t|| !("kind" in value)) return "no";',
				'\treturn "yes";',
				"}",
				"",
			].join("\n");
			const result = Bun.spawnSync(["bun", wrapScript, "--file", relativeFile, "--write"], { cwd: root, stdout: "pipe", stderr: "pipe" });
			expect(result.exitCode).toBe(0);
			const once = readFileSync(file, "utf8");
			expect(once).toBe(wrapped);
			expect(Bun.spawnSync(["bun", wrapScript, "--file", relativeFile], { cwd: root, stdout: "pipe", stderr: "pipe" }).exitCode).toBe(0);
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	}, 40000);
});

describe("code readability function map", () => {
	test("verifies the function map against declarations", () => {
		const directory    = mkdtempSync(resolve(root, ".www/runtime/woo-align-map-")) ;
		const file         = resolve(directory, "fixture.ts")                          ;
		const relativeFile = relative(root, file)                                      ;
		writeFileSync(file, [
			"// GROUP | FUNCTION | INPUT | RETURN | CALLS | ROLE",
			"// A | one | value | string | - | first",
			"// A | two | value, flag | boolean | one | second",
			"export function one(value: string): string {",
			"\treturn value.trim();",
			"}",
			"",
			"export function two(value: string, flag: boolean): boolean {",
			"\treturn flag ? one(value).length > 0 : false;",
			"}",
			"",
		].join("\n"));
		try {
			const aligned = Bun.spawnSync(["bun", functionMapScript, "--file", relativeFile, "--write"], { cwd: root, stdout: "pipe", stderr: "pipe" });
			expect(aligned.exitCode).toBe(0);
			const once = readFileSync(file, "utf8");
			expect(once).toContain([
				"// GROUP | FUNCTION | INPUT       | RETURN  | CALLS | ROLE",
				"// A     | one      | value       | string  | -     | first",
				"// A     | two      | value, flag | boolean | one   | second",
			].join("\n"));
			const clean = Bun.spawnSync(["bun", functionMapScript, "--file", relativeFile], { cwd: root, stdout: "pipe", stderr: "pipe" });
			expect(clean.exitCode).toBe(0);
			expect(clean.stdout.toString()).toContain("errors=0");
			writeFileSync(file, readFileSync(file, "utf8").replace("| value       | string", "| value, extra | string"));
			const drift = Bun.spawnSync(["bun", functionMapScript, "--file", relativeFile], { cwd: root, stdout: "pipe", stderr: "pipe" });
			expect(drift.exitCode).toBe(1);
			expect(drift.stdout.toString()).toContain("INPUT 2개 != 선언 매개변수 1개");
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	}, 40000);
});

describe("code readability axis contract sync", () => {
	test("keeps the authoring contract and template in lockstep with the kind registry", async () => {
		const { AXIS_NOTES, KIND_AXES, ROW_KINDS } = await import(resolve(root, ".agents/skills/woo-code-readability/scripts/typescript/grid-kinds.ts"));
		const contract = readFileSync(resolve(root, ".agents/skills/woo-code-readability/references/readability-contract.md"), "utf8");
		const template = readFileSync(resolve(root, ".agents/skills/woo-code-readability/references/typescript-grid-template.md"), "utf8");

		const kindRegistry = KIND_AXES as Record<string, { gap: readonly string[]; insert: readonly string[] }>;
		const kindNames = ROW_KINDS.map((kind: { name: string }) => kind.name).concat("declaration-equals");
		for (const name of kindNames) expect(kindRegistry[name]).toBeDefined();
		for (const [name, axes] of Object.entries(kindRegistry)) {
			for (const axis of [...axes.gap, ...axes.insert]) expect(AXIS_NOTES[axis.replace("{i}", "")]).toBeDefined();
		}

		for (const name of kindNames) expect(contract).toContain(name);
		for (const axis of Object.keys(AXIS_NOTES)) expect(contract).toContain(axis);
		expect(contract).toContain("작성 시 축 계약");
		expect(contract).toContain("검사기가 기준");
		for (const marker of ["runFirst (first: string", "dashboard : new DashboardRail", "const alpha : string", "Low    = 1"]) {
			expect(contract).toContain(marker);
			expect(template).toContain(marker);
		}
		expect(template).toContain("검사기가 기준");
	});
});
