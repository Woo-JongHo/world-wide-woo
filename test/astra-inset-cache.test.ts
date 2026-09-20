import { expect, test } from "bun:test";
import { stripTerminalSequences, truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";
import { AstraInset } from "../src/adapters/inbound/tui/shell/astra-surface";

class MutableRows implements Component {
	invalidations = 0;
	constructor(readonly rows: string[]) {}
	invalidate(): void { this.invalidations++; }
	render(): string[] { return this.rows; }
}

// Independent pre-cache algorithm, not another instance of the implementation under test.
function uncached(rows: string[], width: number, requestedPadding = 2): string[] {
	const padding = width > requestedPadding * 2 + 4 ? requestedPadding : 0;
	return rows.map(row => {
		if (width <= 0) return "";
		const clipped = truncateToWidth(" ".repeat(padding) + row, width, "…");
		return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
	});
}

test("같은 자식 배열에서 행이 이동해도 새 순서의 바이트 출력을 반환한다", () => {
	const rows = [
		"\u001b[36m첫 행 👩🏽‍💻\u001b[39m",
		"한글 e\u0301",
		"",
		"\u001b]8;;https://example.com\u0007링크\u001b]8;;\u0007",
	];
	const inset = new AstraInset(new MutableRows(rows));
	const original = inset.render(80);
	rows.unshift(rows.pop()!);
	const changed = inset.render(80);

	expect(changed).toEqual(uncached(rows, 80));
	expect(changed).toEqual([original.at(-1)!, ...original.slice(0, -1)]);
});

test("같은 자식 배열의 내부 변경을 감지하고 반환 배열 변경으로 캐시가 오염되지 않는다", () => {
	const child = new MutableRows(["고정 행 👩🏽‍💻", "\u001b[31m이전 ANSI 행\u001b[39m"]);
	const inset = new AstraInset(child);
	const first = inset.render(24);
	const expectedFirst = first.slice();

	first[0] = "호출자가 바꾼 행";
	expect(inset.render(24)).toEqual(expectedFirst);

	child.rows[1] = "\u001b[32m새 ANSI 행 e\u0301\u001b[39m";
	const changed = inset.render(24);
	expect(changed).toEqual(uncached(child.rows, 24));
	expect(stripTerminalSequences(changed[0]!)).toContain("고정 행 👩🏽‍💻");
	expect(stripTerminalSequences(changed[1]!)).toContain("새 ANSI 행 e\u0301");
	expect(stripTerminalSequences(changed[1]!)).not.toContain("이전 ANSI 행");
});

test("width와 padding 전환 및 invalidate 뒤에도 원본 바이트 출력을 유지한다", () => {
	const source = ["한글 👩🏽‍💻 e\u0301", "\u001b[38;2;95;174;255m색상 행\u001b[39m"];
	const child = new MutableRows(source.slice());
	const inset = new AstraInset(child, 2);

	for (const width of [5, 9, 40, 12, 40]) {
		const expected = uncached(source, width);
		expect(inset.render(width)).toEqual(expected);
	}

	const beforeInvalidate = inset.render(40);
	inset.invalidate();
	expect(child.invalidations).toBe(1);
	expect(inset.render(40)).toEqual(beforeInvalidate);
});

test("보존 cache는 entry/논리 byte 상한과 마지막 generation만 유지한다", () => {
	// Deliberate white-box exception: retention is a private Resource invariant.
	// Public output cannot distinguish bounded storage, while heap/RSS includes child arrays and GC timing.
	const child = new MutableRows(Array.from({ length: 20_000 }, (_, i) => `행 ${i}`));
	const inset = new AstraInset(child, 0);
	const retained = () => [...((inset as unknown as { cache?: { rows: ReadonlyMap<string, { source: string; rendered: string; logicalBytes: number }> } }).cache?.rows.values() ?? [])];
	const assertBound = () => {
		expect(retained().length).toBeLessThanOrEqual(16_384);
		expect(retained().reduce((sum, row) => sum + (row.source.length + row.rendered.length) * 2 + 32, 0)).toBeLessThanOrEqual(8 * 1024 * 1024);
	};
	expect(inset.render(16)).toHaveLength(child.rows.length); assertBound(); expect(retained()).toHaveLength(16_384);
	child.rows[19_999] = "마지막 변경 👩🏽‍💻";
	expect(stripTerminalSequences(inset.render(16).at(-1)!)).toContain("마지막 변경"); assertBound();
	child.rows.splice(0, child.rows.length, ...Array.from({ length: 10 }, (_, i) => `${i}${"x".repeat(600_000)}`));
	expect(inset.render(16)).toEqual(uncached(child.rows, 16, 0)); assertBound();
	expect(retained().length).toBeLessThan(child.rows.length);
	child.rows.splice(0, child.rows.length, "x".repeat(4_194_289));
	expect(inset.render(16)).toEqual(uncached(child.rows, 16, 0)); assertBound();
	expect(retained()).toHaveLength(0);
	child.rows.splice(0, child.rows.length, ...Array.from({ length: 20_000 }, (_, i) => `반복 행 ${i % 100}`));
	expect(inset.render(16)).toEqual(uncached(child.rows, 16, 0)); assertBound();
	expect(retained()).toHaveLength(100);
	for (let generation = 0; generation < 100; generation++) {
		child.rows.splice(0, child.rows.length, `새 세션 ${generation}`);
		const width = generation % 2 ? 16 : 24;
		expect(inset.render(width)).toEqual(uncached(child.rows, width, 0)); assertBound();
		expect(retained().map(row => row.source)).toEqual(child.rows);
	}
	inset.invalidate(); expect(retained()).toHaveLength(0);
});
