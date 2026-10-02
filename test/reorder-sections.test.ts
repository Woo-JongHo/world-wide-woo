import      { afterAll, describe, expect, test                 } from "bun:test"                    ;
import      { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"                     ;
import      { tmpdir                                           } from "node:os"                     ;
import      { join                                             } from "node:path"                   ;
import      { parseFiles, plan, render                         } from "../scripts/reorder-sections" ;
import type { Command                                          } from "../scripts/reorder-sections" ;

const root = mkdtempSync(join(tmpdir(), "reorder-sections-"));

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("AST section reordering", () => {
	test("moves internal functions below the last public declaration with their comments", async () => {
		const result = await reorder("functions", ["const LIMIT = 2;", "", "/** Helper. */", "function helper() { return LIMIT; }", "", "export function api() { return helper(); }", ""]);

		expect(result).toBe(["const LIMIT = 2;", "", "export function api() { return helper(); }", "", "/** Helper. */", "function helper() { return LIMIT; }", ""].join("\n"));
	});

	test("never moves a statement that follows a type on the same top level", async () => {
		const result = await reorder("types", ["const log: string[] = [];", "export type Row = string; // row", "log.push(\"ready\");", "export const result = log;", ""]);

		expect(result).toBe(["export type Row = string; // row", "", "const log: string[] = [];", "log.push(\"ready\");", "export const result = log;", ""].join("\n"));
	});

	test("ignores declaration-shaped text inside template literals", async () => {
		const lines = ["const sample = `", "function example() {}", "`;", "export function api() { return sample; }", ""];

		expect(await reorder("functions", lines)).toBe(lines.join("\n"));
	});

	test("keeps blank lines inside template literals when a type moves", async () => {
		const result = await reorder("types", ["const text = `a", "", "", "b`;", "", "export type Row = string;", ""]);

		expect(result).toContain("`a\n\n\nb`");
	});

	test("moves whole functions whose bodies contain regex braces or multi-line division", async () => {
		const result = await reorder("functions", ["function check(s: string) { if (s) /}/.test(s); return (12", "/ 3); }", "export function api() { return check(\"\"); }", ""]);

		expect(result).toBe(["export function api() { return check(\"\"); }", "", "function check(s: string) { if (s) /}/.test(s); return (12", "/ 3); }", ""].join("\n"));
	});

	test("moves functions whose signatures contain object types before the body", async () => {
		const result = await reorder("functions", ["function helper<T extends {}>", "(value: T): T { return value; }", "export function api() { return helper(1); }", ""]);

		expect(result).toBe(["export function api() { return helper(1); }", "", "function helper<T extends {}>", "(value: T): T { return value; }", ""].join("\n"));
	});

	test("keeps decorators attached to their class when types move above it", async () => {
		const result = await reorder("types", ["declare function sealed(target: unknown): void;", "@sealed", "export class C {}", "export interface Row {", "\treadonly id: string;", "}", ""]);

		expect(result).toContain("@sealed\nexport class C {}");
		expect(result.indexOf("export interface Row")).toBeLessThan(result.indexOf("declare function sealed"));
	});

	test("keeps types that use typeof, even on a continuation line, next to their value", async () => {
		const lines  = ["export const PAGES = [\"a\", \"b\"] as const;", "export type Page =", "\ttypeof PAGES[number];", "/** mentions typeof only in a comment */", "export type Label = \"typeof\";", ""] ;
		const result = await reorder("types", lines)                                                                                                                                                         ;

		expect(result).toBe(["/** mentions typeof only in a comment */", "export type Label = \"typeof\";", "", "export const PAGES = [\"a\", \"b\"] as const;", "export type Page =", "\ttypeof PAGES[number];", ""].join("\n"));
	});
	test("moves overload signatures together with their internal implementation", async () => {
		const result = await reorder("functions", ["function pick(value: string): string;", "function pick(value: number): number;", "function pick(value: unknown) { return value; }", "export function api() { return pick(1); }", ""]);

		expect(result).toBe(["export function api() { return pick(1); }", "", "function pick(value: string): string;", "function pick(value: number): number;", "function pick(value: unknown) { return value; }", ""].join("\n"));
	});
	test("keeps file headers such as pragmas and shebangs at the top", async () => {
		const pragma  = await reorder("types", ["// @ts-nocheck"    , "const x: number = 1;", "export type X = string;", ""]) ;
		const shebang = await reorder("types", ["#!/usr/bin/env bun", "const x = 1;"        , "export type X = string;", ""]) ;
		const strict  = await reorder("types", ["\"use strict\";"   , "const x = 1;"        , "export type X = string;", ""]) ;

		expect(pragma ).toBe(["// @ts-nocheck", "export type X = string;", "", "const x: number = 1;", ""].join("\n")) ;
		expect(shebang).toBe(["#!/usr/bin/env bun", "export type X = string;", "", "const x = 1;", ""].join("\n")    ) ;
		expect(strict ).toBe(["\"use strict\";", "", "export type X = string;", "", "const x = 1;", ""].join("\n")   ) ;
	});

	test("keeps CRLF line endings", async () => {
		const result = await reorder("types", ["const x = 1;", "export type X = string;", ""], "\r\n");

		expect(result).toBe(["export type X = string;", "", "const x = 1;", ""].join("\r\n"));
	});

	test("does not separate a function from a namespace merged with it", async () => {
		const lines = ["function helper() { return 1; }", "namespace helper { export const x = 2; }", "export function api() { return helper.x; }", ""];

		expect(await reorder("functions", lines)).toBe(lines.join("\n"));
	});

	test("treats export default as a public boundary", async () => {
		const result = await reorder("functions", ["function helper() { return 1; }", "export default helper;", ""]);

		expect(result).toBe(["export default helper;", "", "function helper() { return 1; }", ""].join("\n"));
	});

	test("rewrites every file through the CLI and leaves them parseable", () => {
		const files = ["cli-a.ts", "cli-b.ts"];
		for (const file of files) writeFileSync(join(root, file), ["#!/usr/bin/env bun", "const x = 1;", "export type X = string;", ""].join("\n"));
		const run = Bun.spawnSync(["bun", join(import.meta.dir, "../scripts/reorder-sections.ts"), "types", ...files], { cwd: root });

		expect(run.exitCode).toBe(0);
		for (const file of files) expect(readFileSync(join(root, file), "utf8")).toBe(["#!/usr/bin/env bun", "export type X = string;", "", "const x = 1;", ""].join("\n"));
	});
});

let counter = 0;

async function reorder(command: Command, lines: readonly string[], eol = "\n"): Promise<string> {
	const file = `case-${counter++}.ts`;
	writeFileSync(join(root, file), lines.join(eol));
	const parsed = (await parseFiles(root, [file])).get(file)!;
	return render(parsed, plan(command, parsed.statements));
}
