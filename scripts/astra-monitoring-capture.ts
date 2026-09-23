/** Offline visualization of the actual pi-tui layout rows; no provider or workspace writes. */
import chalk from "chalk";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { renderLayoutFrame } from "@earendil-works/pi-tui/dist/layout.js";
import { AstraWorkspace } from "../src/adapters/inbound/tui/shell/astra-surface";
import { WwwDashboardView } from "../src/adapters/inbound/tui/features/dashboard/entry-dashboard-view";
import { createAstraDemoState } from "../src/adapters/inbound/tui/features/demo/astra-demo";
import { astraFixture } from "../test/fixtures/astra-snapshot";
import { palette } from "../src/adapters/inbound/tui/foundation/theme/theme";

const width = 160;
const height = 38;
const output = resolve(process.argv[2] ?? ".www/scratchpad/monitoring-captures");
const demo = createAstraDemoState(astraFixture(), () => 0);
const escapeXml = (value: string): string => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

function svg(rows: readonly string[]): string {
	const elements = [`<rect width="100%" height="100%" fill="${palette.background}"/>`];
	for (const [row, line] of rows.entries()) {
		let foreground = palette.foreground;
		let background = palette.background;
		let column = 0;
		for (const token of line.split(/(\x1b\[[0-9;]*m)/u)) {
			if (token.startsWith("\x1b[")) {
				const codes = token.slice(2, -1).split(";").map(Number);
				for (let index = 0; index < codes.length; index++) {
					const code = codes[index];
					if (code === 0) { foreground = palette.foreground; background = palette.background; }
					if (code === 39) foreground = palette.foreground;
					if (code === 49) background = palette.background;
					if ((code === 38 || code === 48) && codes[index + 1] === 2) {
						const color = `rgb(${codes.slice(index + 2, index + 5).join(",")})`;
						if (code === 38) foreground = color; else background = color;
						index += 4;
					}
				}
				continue;
			}
			for (const character of stripTerminalSequences(token)) {
				const cells = visibleWidth(character);
				if (cells === 0) continue;
				const x = column * 9;
				const y = row * 18;
				elements.push(`<rect x="${x}" y="${y}" width="${cells * 9}" height="18" fill="${background}"/>`);
				if (character !== " ") elements.push(`<text x="${x}" y="${y + 14}" fill="${foreground}">${escapeXml(character)}</text>`);
				column += cells;
			}
		}
	}
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${width * 9}" height="${height * 18}" font-family="Menlo, monospace" font-size="13">${elements.join("")}</svg>`;
}

chalk.level = 3;
mkdirSync(output, { recursive: true });
for (const page of ["usage", "cache", "dashboard", "workflow"] as const) {
	const dashboard = new WwwDashboardView(() => demo.snapshot, () => true);
	const workspace = new AstraWorkspace(() => demo.snapshot, () => demo.usage, undefined, () => 0, false, null, dashboard, undefined, undefined, {}, undefined, () => true);
	workspace.show(page);
	const rows = renderLayoutFrame(workspace.component, width, height, () => {}).lines;
	writeFileSync(resolve(output, `${page}.ansi`), rows.join("\n"));
	writeFileSync(resolve(output, `${page}.svg`), svg(rows));
	console.log(`${page}: ${rows.length} rows, ${Math.max(...rows.map(visibleWidth))} columns`);
}
