import      { afterAll, describe, expect, test      } from "bun:test"                       ;
import      { mkdtempSync, rmSync, writeFileSync    } from "node:fs"                        ;
import      { tmpdir                                } from "node:os"                        ;
import      { join                                  } from "node:path"                      ;
import      { isInterleaved, scanFunctionParagraphs } from "../scripts/function-paragraphs" ;

const root = mkdtempSync(join(tmpdir(), "function-paragraphs-"));

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("function paragraph candidates", () => {
	test("allows staged guards before the first step and flags a declaration after it", () => {
		expect(isInterleaved("DGDGDR")).toBe(false) ;
		expect(isInterleaved("GDDBBR")).toBe(false) ;
		expect(isInterleaved("DBDR"  )).toBe(true ) ;
		expect(isInterleaved("BGBB"  )).toBe(false) ;
	});

	test("classifies only direct body statements, with guards, declarations, steps and the result", async () => {
		writeFileSync(join(root, "a.ts"), [
			"export function render(rows: string[], value: string | undefined): string[] {",
			"\tif (!value) return rows;",
			"\tconst width = 3;",
			"\trows.push(value);",
			"\tconst tail = rows.length;",
			"\tfor (const row of rows) { const inner = row; rows.push(inner); }",
			"\treturn rows.slice(0, width + tail);",
			"}",
			"",
		].join("\n"));
		const [paragraph] = await scanFunctionParagraphs(root, ["a.ts"]);

		expect(paragraph).toEqual({ path: "a.ts", line: 1, name: "render", shape: "GDBDBR", interleaved: true });
	});

	test("reports short functions, skips local types, counts local functions as preparation and names arrows by owner", async () => {
		writeFileSync(join(root, "b.ts"), [
			"export function short(): number { step(); const result = 1; return result; }",
			"export function typed(): number { type Local = number; const value: Local = 1; return value; }",
			"export function helper(): number { step(); function inner() { return 1; } return inner(); }",
			"export class Card { private readonly render = (): number => { step(); const value = 1; return value; }; }",
			"function step(): void {}",
			"",
		].join("\n"));
		const found = await scanFunctionParagraphs(root, ["b.ts"])                              ;
		const shape = (name: string) => found.find(paragraph => paragraph.name === name)?.shape ;

		expect(shape("short" )).toBe("BDR") ;
		expect(shape("typed" )).toBe("DR" ) ;
		expect(shape("helper")).toBe("BDR") ;
		expect(shape("render")).toBe("BDR") ;
	});
});
