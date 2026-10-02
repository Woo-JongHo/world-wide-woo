import      { describe, expect, test                  } from "bun:test"               ;
import      { sectionOrderFindings, typeOrderFindings } from "../scripts/feature-map" ;

describe("feature map section order candidates", () => {
	test("ignores declarations inside block comments", () => {
		const text = ["/*", "function helper() {}", "*/", "export function publicApi() {}"].join("\n");

		expect(sectionOrderFindings("a.ts", text)).toEqual([]);
	});

	test("reports exported arrow functions and names exported in a separate list", () => {
		const arrow = ["function helper() {}", "export const publicApi = () => helper();"].join("\n")                              ;
		const list  = ["const helper = () => 1;", "function publicApi() { return helper(); }", "export { publicApi };"].join("\n") ;

		expect(sectionOrderFindings("a.ts", arrow)).toEqual(["a.ts:2 공개 선언이 내부 처리(1줄) 뒤에 있음"]) ;
		expect(sectionOrderFindings("b.ts", list) ).toEqual(["b.ts:2 공개 선언이 내부 처리(1줄) 뒤에 있음"]) ;
	});

	test("tags classes whose move can change initialization order", () => {
		const text = ["class Inner { static value = 1; }", "export class Public extends Inner {}"].join("\n");

		expect(sectionOrderFindings("a.ts", text)).toEqual(["a.ts:2 공개 선언이 내부 처리(1줄) 뒤에 있음 — 초기화 순서 확인 필요(extends/static)"]);
	});

	test("does not treat an export list inside a block comment as public", () => {
		const text = ["/* export { helper }; */", "function helper() {}", "export function publicApi() {}"].join("\n");

		expect(sectionOrderFindings("a.ts", text)).toEqual(["a.ts:3 공개 선언이 내부 처리(2줄) 뒤에 있음"]);
	});

	test("tags one-line classes with static initializers", () => {
		const text = ["function helper() { return 1; }", "export class Api { static value = helper(); }"].join("\n");

		expect(sectionOrderFindings("a.ts", text)).toEqual(["a.ts:2 공개 선언이 내부 처리(1줄) 뒤에 있음 — 초기화 순서 확인 필요(extends/static)"]);
	});

	test("reports exactly the public types the reorder tool would move", () => {
		const statements = [
			{ role : "runtime"      as const , name : "LIMIT" , text : "const LIMIT = 2;"                           },
			{ role : "public-type"  as const , name : "Late"  , text : "\nexport interface Late {}"                 },
			{ role : "derived-type" as const , name : "Page"  , text : "\nexport type Page = typeof PAGES[number];" },
		];

		expect(typeOrderFindings("a.ts", statements)).toEqual(["a.ts 공개 타입 Late이 첫 실행 선언 뒤에 있음"]);
	});
});
