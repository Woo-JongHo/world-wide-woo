import      { expect, test           } from "bun:test"                                               ;
import      { stripTerminalSequences } from "@earendil-works/pi-tui"                                 ;
import chalk                      from "chalk";
import      { a                      } from "../src/adapters/inbound/tui/foundation/theme/www-theme" ;

test("semantic ink survives truecolor, 256-color, and colorless terminals", () => {
	const previousLevel = chalk.level                                             ;
	const inks          = [a.request, a.response, a.tool, a.plan, a.note, a.info] ;
	try {
		for (const level of [3, 2, 0] as const) {
			chalk.level = level;
			const rows = inks.map(ink => ink("status"));
			expect(rows.map(stripTerminalSequences)).toEqual(Array(inks.length).fill("status"));
			if (level === 3) {
				expect(rows.every(row => /^\x1b\[38;2;\d+;\d+;\d+mstatus\x1b\[39m$/u.test(row))).toBe(true);
				expect(new Set(rows).size).toBe(inks.length);
			} else if (level === 2) {
				expect(rows.every(row => /^\x1b\[38;5;\d+mstatus\x1b\[39m$/u.test(row))).toBe(true);
				expect(new Set(rows).size).toBe(inks.length);
			} else {
				expect(rows).toEqual(Array(inks.length).fill("status"));
			}
		}
	} finally {
		chalk.level = previousLevel;
	}
});
