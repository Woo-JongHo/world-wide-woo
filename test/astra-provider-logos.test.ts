import { afterEach, beforeEach, expect, test } from "bun:test";
import { getCapabilities, getPngDimensions, setCapabilities, stripTerminalSequences, TuiAltScreen, visibleWidth, VStack, type Terminal } from "@earendil-works/pi-tui";
import { AstraHud } from "../src/adapters/inbound/tui/shell/astra-surface";
import { astraUsageLine } from "../src/adapters/inbound/tui/features/usage/astra-usage";
import { astraFixture } from "./fixtures/astra-snapshot";
import type { UsageSnapshot } from "../src/core/ports";

const usage: UsageSnapshot[] = ["openai-codex", "anthropic", "google", "zai"].map((provider) => ({
	provider: provider as UsageSnapshot["provider"], state: "ready", fetchedAt: 1,
	limits: [{ label: "7 days", remainingPercent: 79, status: "ok" }],
}));
let saved = getCapabilities();
beforeEach(() => { saved = getCapabilities(); setCapabilities({ ...saved, images: "kitty" }); });
afterEach(() => setCapabilities(saved));
const transmissions = (text: string) => [...text.matchAll(/\x1b_G(a=T[^;]*);([^\x1b]*)\x1b\\/gu)];

test("places all four downloaded PNG logos inside one HUD row", () => {
	const hud = new AstraHud(() => astraFixture(), () => usage);
	const rows = hud.render(200);
	expect(rows).toHaveLength(1);
	const images = transmissions(rows[0]!);
	expect(images).toHaveLength(4);
	expect(new Set(images.map(image => image[2])).size).toBe(4);
	for (const image of images) {
		expect(image[1]).toContain("C=1");
		expect(image[1]).toContain("c=2,r=1");
		expect(getPngDimensions(image[2]!)).toEqual({ widthPx: 32, heightPx: 32 });
	}
	expect(stripTerminalSequences(rows[0]!)).not.toMatch(/Codex|Claude|Gemini|Z\.AI|[\uE001-\uE004]/u);
	for (const width of [0, 1, 2, 10, 20, 40, 80, 120, 200]) {
		const output = hud.render(width);
		expect(output).toHaveLength(1);
		expect(visibleWidth(output[0]!)).toBeLessThanOrEqual(width);
		expect(output[0]).not.toMatch(/[\uE001-\uE004]/u);
	}
	expect(hud.render(200)).toEqual(rows);
});

test("keeps provider names on terminals without Kitty graphics", () => {
	for (const images of [null, "iterm2"] as const) {
		setCapabilities({ ...saved, images });
		const row = astraUsageLine(usage, 200, "gpt-6-astra", 1, true);
		expect(transmissions(row)).toHaveLength(0);
		for (const name of ["Codex", "Claude", "Gemini", "Z.AI"]) expect(row).toContain(name);
	}
});

class CaptureTerminal implements Terminal {
	columns = 200; rows = 8; output = ""; kittyProtocolActive = false;
	resize: () => void = () => {};
	start(_input: (data: string) => void, resize: () => void): void { this.resize = resize; }
	stop(): void {}
	async drainInput(): Promise<void> {}
	write(data: string): void { this.output += data; }
	moveBy(): void {} hideCursor(): void {} showCursor(): void {}
	clearLine(): void {} clearFromCursor(): void {} clearScreen(): void {} setTitle(): void {} setProgress(): void {}
}
const settle = () => new Promise(resolve => setTimeout(resolve, 30));

test("fullscreen host emits all logos, clears placements on resize and image data on stop", async () => {
	const terminal = new CaptureTerminal();
	const tui = new TuiAltScreen(terminal);
	let showUsage = true;
	const hud = new AstraHud(() => ({ ...astraFixture(), hud: { showUsage, showContext: true } }), () => usage);
	tui.setLayoutRoot(new VStack([
		{ component: { render: () => ["Chat"], invalidate() {} }, basis: 0, grow: 1 },
		{ component: hud, basis: 1, minSize: 1, maxSize: 1 },
	]));
	try {
		tui.start(); await settle();
		expect(transmissions(terminal.output)).toHaveLength(4);
		expect(terminal.output).toContain("Chat");
		terminal.output = "";
		terminal.columns = 100; terminal.resize(); await settle();
		expect(transmissions(terminal.output).length).toBeGreaterThan(0);
		expect(terminal.output).toContain("\x1b_Ga=d");
		terminal.output = "";
		showUsage = false; tui.requestRender(); await settle();
		expect(transmissions(terminal.output)).toHaveLength(0);
		expect(terminal.output).toContain("\x1b_Ga=d");
		terminal.output = "";
	} finally { tui.stop(); }
	expect(terminal.output).toContain("d=A");
});
