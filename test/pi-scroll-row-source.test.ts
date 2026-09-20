import { describe, expect, test } from "bun:test";
import {
	HStack,
	ScrollView,
	TuiAltScreen,
	getScrollRowCount,
	readScrollRows,
	type Component,
	type ScrollContent,
	type ScrollRowSource,
	type Terminal,
} from "@earendil-works/pi-tui";
import { findAltScreenSearchMatches } from "@earendil-works/pi-tui/dist/alt-screen-search.js";
import {
	getScrollbarGeometry,
	getScrollViewBox,
	renderLayoutFrame,
} from "@earendil-works/pi-tui/dist/layout.js";
import { encodeKitty, registerKittyImageMetadata } from "@earendil-works/pi-tui/dist/terminal-image.js";

const PROMPT = "\x1b]133;A\x07";

class DenseRows implements Component {
	public constructor(protected readonly values: readonly string[]) {}
	public invalidate(): void {}
	public render(): string[] { return [...this.values]; }
}

class LazyRows extends DenseRows implements ScrollContent {
	public readonly requests: Array<{ start: number; count: number }> = [];
	public renderCalls = 0;
	public override render(): string[] {
		this.renderCalls += 1;
		return super.render();
	}
	public scrollRows(_width: number): ScrollRowSource {
		return {
			rowCount: this.values.length,
			rows: (start, count) => {
				this.requests.push({ start, count });
				return this.values.slice(start, start + count);
			},
		};
	}
}

class PreparingScrollView extends ScrollView {
	public prepareCalls: number[] = [];
	public override prepareLayout(contentWidth: number): void {
		this.prepareCalls.push(contentWidth);
	}
}

class CaptureTerminal implements Terminal {
	public columns = 30;
	public rows = 6;
	public output = "";
	public kittyProtocolActive = false;
	private inputHandler: (data: string) => void = () => {};
	public start(input: (data: string) => void): void { this.inputHandler = input; }
	public stop(): void {}
	public input(data: string): void { this.inputHandler(data); }
	public async drainInput(): Promise<void> {}
	public write(data: string): void { this.output += data; }
	public moveBy(): void {}
	public hideCursor(): void {}
	public showCursor(): void {}
	public clearLine(): void {}
	public clearFromCursor(): void {}
	public clearScreen(): void {}
	public setTitle(): void {}
	public setProgress(): void {}
}

function frameFor(content: Component, scroll: ScrollView, width = 24, height = 6) {
	const root = new HStack([{ component: scroll, basis: 0, grow: 1, minSize: 1 }]);
	return renderLayoutFrame(root, width, height, () => undefined);
}

describe("pi-tui lazy scroll row source", () => {
	test("renders an exact lazy viewport through the public layout seam without compatibility render", () => {
		const rows = Array.from({ length: 80 }, (_, index) => {
			if (index === 0) return "\x1b[31m한글🙂e\u0301\x1b[0m";
			if (index === 1) return "\x1b]8;;https://example.com\x07link\x1b]8;;\x07";
			return `row-${String(index).padStart(2, "0")}`;
		});
		const denseScroll = new ScrollView(new DenseRows(rows), { scrollbar: "always" });
		const lazyContent = new LazyRows(rows);
		const lazyScroll = new PreparingScrollView(lazyContent, { scrollbar: "always" });

		let dense = frameFor(new DenseRows(rows), denseScroll);
		let lazy = frameFor(lazyContent, lazyScroll);
		expect(lazy.lines).toEqual(dense.lines);
		expect(getScrollbarGeometry(getScrollViewBox(lazy, lazyScroll)!)).toEqual(
			getScrollbarGeometry(getScrollViewBox(dense, denseScroll)!),
		);
		expect(lazyContent.renderCalls).toBe(0);
		expect(lazyScroll.prepareCalls).toEqual([23]);
		expect(lazyContent.requests).toEqual([{ start: 0, count: 8 }]);

		denseScroll.scrollTo(40, { disableFollow: true });
		lazyScroll.scrollTo(40, { disableFollow: true });
		dense = frameFor(new DenseRows(rows), denseScroll);
		lazy = frameFor(lazyContent, lazyScroll);
		expect(lazy.lines).toEqual(dense.lines);
		expect(lazyScroll.scrollTop).toBe(denseScroll.scrollTop);
		expect(getScrollbarGeometry(getScrollViewBox(lazy, lazyScroll)!)).toEqual(
			getScrollbarGeometry(getScrollViewBox(dense, denseScroll)!),
		);
		expect(lazyContent.renderCalls).toBe(0);
		expect(lazyScroll.prepareCalls).toEqual([23, 23]);
		expect(lazyContent.requests).toEqual([
			{ start: 0, count: 8 },
			{ start: 38, count: 10 },
			{ start: 38, count: 2 },
		]);
	});

	test("keeps narrow and wide frames plus a clipped Kitty image boundary byte-identical", () => {
		const textRows = ["\x1b[32m한글🙂e\u0301\x1b[0m", "", "\x1b]8;;https://example.com\x07link\x1b]8;;\x07", "tail"];
		for (const width of [1, 40, 80, 120]) {
			const denseContent = new DenseRows(textRows);
			const lazyContent = new LazyRows(textRows);
			const denseScroll = new ScrollView(denseContent);
			const lazyScroll = new PreparingScrollView(lazyContent);
			expect(frameFor(lazyContent, lazyScroll, width, 3).lines).toEqual(
				frameFor(denseContent, denseScroll, width, 3).lines,
			);
			expect(lazyContent.renderCalls).toBe(0);
		}

		registerKittyImageMetadata({ imageId: 991, columns: 4, rows: 3, widthPx: 36, heightPx: 54 });
		const imageRows = [encodeKitty("aGVsbG8=", { imageId: 991, columns: 4, rows: 3 }), "", "", "after"];
		const denseContent = new DenseRows(imageRows);
		const lazyContent = new LazyRows(imageRows);
		const denseScroll = new ScrollView(denseContent);
		const lazyScroll = new PreparingScrollView(lazyContent);
		frameFor(denseContent, denseScroll, 20, 2);
		frameFor(lazyContent, lazyScroll, 20, 2);
		denseScroll.scrollTo(1, { disableFollow: true });
		lazyScroll.scrollTo(1, { disableFollow: true });
		const dense = frameFor(denseContent, denseScroll, 20, 2);
		const lazy = frameFor(lazyContent, lazyScroll, 20, 2);
		expect(lazy.lines).toEqual(dense.lines);
		expect(lazy.lines[0]).toContain("y=18");
		expect(lazy.lines[0]).toContain("r=2");
		expect(lazyContent.renderCalls).toBe(0);
	});

	test("normalizes invalid ranges and finds the same logical search matches in bounded chunks", () => {
		const rows = Array.from({ length: 600 }, (_, index) => index === 255 ? "alpha" : index === 256 ? "beta" : `row ${index}`);
		const requests: Array<{ start: number; count: number }> = [];
		const source: ScrollRowSource = {
			rowCount: rows.length,
			rows: (start, count) => {
				requests.push({ start, count });
				return rows.slice(start, start + count);
			},
		};
		expect(findAltScreenSearchMatches(source, "alpha beta")).toEqual(
			findAltScreenSearchMatches(rows, "alpha beta"),
		);
		expect(requests.length).toBeGreaterThan(1);
		expect(Math.max(...requests.map(request => request.count))).toBeLessThanOrEqual(256);
		expect(readScrollRows(source, -4, 3)).toEqual(rows.slice(0, 3));
		expect(readScrollRows(source, 599.8, 20)).toEqual([rows[599]]);
		expect(() => getScrollRowCount({ rowCount: Number.NaN, rows: () => ["bad"] } as ScrollRowSource)).toThrow("rowCount");
		expect(() => readScrollRows({ rowCount: 4, rows: () => null } as unknown as ScrollRowSource, 0, 4)).toThrow("rows");
		expect(() => readScrollRows({ rowCount: 4, rows: () => ["short"] } as ScrollRowSource, 0, 4)).toThrow("4 rows");
	});

	test("preserves dense follow, disable-follow, append, and viewport-resize state", () => {
		const rows = Array.from({ length: 30 }, (_, index) => `row-${index}`);
		const denseContent = new DenseRows(rows);
		const lazyContent = new LazyRows(rows);
		const denseScroll = new ScrollView(denseContent, { follow: "end", scrollbar: "always" });
		const lazyScroll = new PreparingScrollView(lazyContent, { follow: "end", scrollbar: "always" });
		const compare = (height: number) => {
			const dense = frameFor(denseContent, denseScroll, 24, height);
			const lazy = frameFor(lazyContent, lazyScroll, 24, height);
			expect(lazy.lines).toEqual(dense.lines);
			expect(lazyScroll.scrollTop).toBe(denseScroll.scrollTop);
			expect(lazyScroll.viewportHeight).toBe(denseScroll.viewportHeight);
			expect(lazyScroll.isFollowingEnd).toBe(denseScroll.isFollowingEnd);
		};

		compare(6);
		denseScroll.scrollBy(-4);
		lazyScroll.scrollBy(-4);
		rows.push("reader-does-not-follow-this-append");
		compare(6);
		expect(lazyScroll.isFollowingEnd).toBe(false);

		denseScroll.scrollToEnd();
		lazyScroll.scrollToEnd();
		rows.push("followed-append");
		compare(8);
		expect(lazyScroll.isFollowingEnd).toBe(true);

		denseScroll.scrollTo(denseScroll.scrollTop, { disableFollow: true });
		lazyScroll.scrollTo(lazyScroll.scrollTop, { disableFollow: true });
		rows.push("suppressed-at-end-append");
		const before = lazyScroll.scrollTop;
		compare(8);
		expect(lazyScroll.scrollTop).toBe(before);
		expect(lazyScroll.isFollowingEnd).toBe(false);
		expect(lazyContent.renderCalls).toBe(0);
	});

	test("keeps prompt navigation, full search, and selection-copy on the public alt-screen path", () => {
		const rows = Array.from({ length: 600 }, (_, index) => {
			if (index === 40 || index === 320) return `${PROMPT}prompt-${index}`;
			if (index === 510) return "needle 한글🙂";
			return `row-${String(index).padStart(3, "0")}`;
		});
		const content = new LazyRows(rows);
		const scroll = new PreparingScrollView(content, { primary: true, scrollbar: "always" });
		const terminal = new CaptureTerminal();
		let copied = "";
		const tui = new TuiAltScreen(terminal, false, undefined, {
			copySelection: async text => { copied = text; return true; },
		});
		tui.setLayoutRoot(new HStack([{ component: scroll, basis: 0, grow: 1, minSize: 1 }]));
		try {
			tui.start();
			tui.renderNow();
			terminal.input("\x1b[F");
			expect(tui.viewportTop).toBe(594);
			terminal.input("\x1b[1;5A");
			expect(tui.viewportTop).toBe(320);
			terminal.input("\x1b[H");
			expect(tui.viewportTop).toBe(0);
			terminal.input("\x1b[6~");
			expect(tui.viewportTop).toBe(2);
			terminal.input("\x1b[<65;1;1M");
			expect(tui.viewportTop).toBe(3);
			terminal.input("\x1b[H");
			tui.renderNow();
			terminal.input("\x1b[<0;30;1M");
			terminal.input("\x1b[<32;30;6M");
			terminal.input("\x1b[<0;30;6m");
			expect(tui.viewportTop).toBe(594);
			terminal.input("\x1b[H");
			content.requests.length = 0;
			terminal.input("\x1b[1;5B");
			expect(tui.viewportTop).toBe(40);
			expect(content.requests.every(request => request.count <= 256)).toBe(true);

			content.requests.length = 0;
			terminal.input("\x1b[70;6u");
			terminal.input("needle");
			tui.renderNow();
			expect(tui.viewportTop).toBe(508);
			expect(tui.viewportTop).toBeLessThanOrEqual(510);
			expect(tui.viewportTop + scroll.viewportHeight).toBeGreaterThan(510);
			expect(content.requests.length).toBeGreaterThan(1);
			expect(Math.max(...content.requests.map(request => request.count))).toBeLessThanOrEqual(256);

			terminal.input("\x1b");
			tui.renderNow();
			content.requests.length = 0;
			terminal.input("\x1b[<0;1;1M");
			terminal.input("\x1b[<32;21;3M");
			terminal.input("\x1b[<0;21;3m");
			expect(copied).toBe("row-508\nrow-509\nneedle 한글🙂");
			expect(Math.max(...content.requests.map(request => request.count))).toBeLessThanOrEqual(3);
		} finally {
			tui.stop({ preserveScreen: true });
		}
		expect(content.renderCalls).toBe(0);
	});

	test("a wheel event over a contained pane does not chain its remainder to the primary pane", () => {
		const primary = new ScrollView(new DenseRows(Array.from({ length: 40 }, (_, index) => `primary-${index}`)), {
			primary: true,
			overscroll: "chain",
		});
		const contained = new ScrollView(new DenseRows(["contained"]), { overscroll: "contain" });
		const terminal = new CaptureTerminal();
		const tui = new TuiAltScreen(terminal, false, undefined, { wheelScrollLines: 1 });
		tui.setLayoutRoot(new HStack([
			{ component: primary, basis: 15, minSize: 15, maxSize: 15 },
			{ component: contained, basis: 15, minSize: 15, maxSize: 15 },
		]));
		try {
			tui.start();
			tui.renderNow();
			primary.scrollTo(5, { disableFollow: true });
			terminal.input("\x1b[<65;25;2M");
			expect(contained.scrollTop).toBe(0);
			expect(primary.scrollTop).toBe(5);
		} finally {
			tui.stop({ preserveScreen: true });
		}
	});
});
