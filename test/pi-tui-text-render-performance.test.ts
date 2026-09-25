/** @linear WOO-915 */
import { describe, expect, spyOn, test }                   from "bun:test";
import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { getGraphemeSegmenter }                            from "@earendil-works/pi-tui/dist/utils.js";

describe("pi-tui simple terminal text rendering", () => {
	test("renders ASCII, precomposed Hangul, and Han without grapheme segmentation", () => {
		const segmenter = getGraphemeSegmenter();
		const segment = spyOn(segmenter, "segment");
		try {
			const text = "가나 다A 漢字";
			expect(visibleWidth(text)).toBe(13);
			expect(wrapTextWithAnsi(text, 4)).toEqual(["가나", "다A", "漢字"]);
			expect(truncateToWidth(text, 4, "...", true)).toBe("\x1b[0m...\x1b[0m ");
			expect(segment).not.toHaveBeenCalled();
		} finally {
			segment.mockRestore();
		}
	});

	test("keeps grapheme and ANSI fallbacks byte-for-byte stable", () => {
		const complex = "e\u0301🙂 ᄀ";
		expect(visibleWidth(complex)).toBe(6);
		expect(wrapTextWithAnsi(complex, 4)).toEqual(["e\u0301🙂", "ᄀ"]);
		expect(truncateToWidth(complex, 4, "…", true)).toBe("e\u0301🙂\x1b[0m…\x1b[0m");

		const ansi = "\x1b[31m가나\x1b[0m 다";
		expect(visibleWidth(ansi)).toBe(7);
		expect(wrapTextWithAnsi(ansi, 4)).toEqual(["\x1b[31m가나", "\x1b[31m\x1b[0m 다"]);
		expect(truncateToWidth(ansi, 4, "…", true)).toBe("\x1b[31m가\x1b[0m…\x1b[0m ");
	});

	test("truncates simple ANSI text without grapheme segmentation", () => {
		const segmenter = getGraphemeSegmenter();
		const segment = spyOn(segmenter, "segment");
		try {
			expect(truncateToWidth("\x1b[31m가나다\x1b[0m", 5, "...", true)).toBe("\x1b[31m가\x1b[0m...\x1b[0m");
			expect(truncateToWidth("\x1b]8;;https://e.test\x07가나다\x1b]8;;\x07", 5, "...", true)).toBe("\x1b]8;;https://e.test\x07가\x1b]8;;\x07\x1b[0m...\x1b[0m");
			expect(truncateToWidth("\x1b[2G가나다", 5, "...", true)).toBe("\x1b[2G가\x1b[0m...\x1b[0m");
			expect(truncateToWidth("\x1b[31m가\x1b[0m나다", 5, "...", true)).toBe("\x1b[31m가\x1b[0m...\x1b[0m");
			expect(truncateToWidth("가나다\x1b[31m", 5, "...", true)).toBe("가\x1b[0m...\x1b[0m");
			expect(truncateToWidth("\x1b[31m가나\x1b[0m", 5, "...", true)).toBe("\x1b[31m가나\x1b[0m ");
			expect(truncateToWidth("\x1b]8;;https://e.test\x07가\x1b]8;;\x07나다", 5, "...", true)).toBe("\x1b]8;;https://e.test\x07가\x1b]8;;\x07\x1b[0m...\x1b[0m");
			expect(segment).not.toHaveBeenCalled();
		} finally {
			segment.mockRestore();
		}
	});

	test("preserves malformed escape and complex ANSI fallbacks", () => {
		expect(truncateToWidth("\x1b[31가나", 3, "…", true)).toBe("\x1b[3\x1b[0m…\x1b[0m");
		expect(truncateToWidth("\x1b[31m가\t나\x1b[0m", 4, "…", true)).toBe("\x1b[31m가\x1b[0m…\x1b[0m ");
		expect(truncateToWidth("\x1b[31me\u0301🙂가\x1b[0m", 4, "…", true)).toBe("\x1b[31me\u0301🙂\x1b[0m…\x1b[0m");
	});

	test("renders box drawing frame rows without grapheme segmentation", () => {
		const segmenter = getGraphemeSegmenter();
		visibleWidth("…");
		const segment = spyOn(segmenter, "segment");
		try {
			expect(visibleWidth("│")).toBe(1);
			expect(visibleWidth("A│가")).toBe(4);
			expect(wrapTextWithAnsi("┌─┐", 1)).toEqual(["┌", "─", "┐"]);
			expect(wrapTextWithAnsi("x abc│def", 6)).toEqual(["x", "abc│de", "f"]);
			segment.mockClear();
			expect(truncateToWidth("A│가", 3, "…", true)).toBe("A│\x1b[0m…\x1b[0m");
			expect(truncateToWidth("\x1b[90m│\x1b[39m \x1b[37m가나\x1b[39m", 3, "…", true))
				.toBe("\x1b[90m│\x1b[39m \x1b[0m…\x1b[0m");
			expect(segment).not.toHaveBeenCalled();
		} finally {
			segment.mockRestore();
		}
	});

	test("wraps simple lines without token grapheme segmentation", () => {
		const segmenter = getGraphemeSegmenter();
		const segment = spyOn(segmenter, "segment");
		try {
			expect(wrapTextWithAnsi("       ", 3)).toEqual([""]);
			expect(wrapTextWithAnsi("one   two     three  ", 6)).toEqual(["one", "two", "three"]);
			expect(wrapTextWithAnsi("averyveryverylongasciiword", 6)).toEqual(["averyv", "eryver", "ylonga", "sciiwo", "rd"]);
			expect(wrapTextWithAnsi("x abc│def", 6)).toEqual(["x", "abc│de", "f"]);
			expect(wrapTextWithAnsi("가나다라마바사", 6)).toEqual(["가나다", "라마바", "사"]);
			expect(segment).not.toHaveBeenCalled();
		} finally {
			segment.mockRestore();
		}
	});

	test("preserves empty and non-positive width behavior", () => {
		expect(visibleWidth("")).toBe(0);
		expect(wrapTextWithAnsi("", 0)).toEqual([""]);
		expect(truncateToWidth("한글", 0, "…", true)).toBe("");
		expect(truncateToWidth("漢字", -1, "…", true)).toBe("");
	});
});
