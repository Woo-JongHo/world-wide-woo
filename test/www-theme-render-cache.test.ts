import { describe, expect, test } from "bun:test";
import chalk                      from "chalk";
import { WwwTranscriptView }      from "../src/adapters/inbound/tui/features/chat/view/www-execution";
import {
	getActiveTuiTheme,
	setActiveTuiTheme,
	tuiBackgroundResetSequence,
	tuiBackgroundSequence,
} from "../src/adapters/inbound/tui/foundation/theme/theme";
import { wwwFixture }             from "./fixtures/www-snapshot";

describe("Www theme render cache boundary", () => {
	test("repaints cached transcript rows after a theme change", () => {
		const level = chalk.level;
		const previous = getActiveTuiTheme();
		chalk.level = 3;
		try {
			const snapshot = wwwFixture("ready");
			const view = new WwwTranscriptView(snapshot);
			setActiveTuiTheme("gruvbox");
			const gruvbox = view.render(80).join("\n");
			setActiveTuiTheme("tokyo-night");
			const tokyoNight = view.render(80).join("\n");
			expect(tokyoNight).not.toBe(gruvbox);
		} finally {
			chalk.level = level;
			setActiveTuiTheme(previous);
		}
	});
	test("uses the selected Figma palette for the CMUX canvas and restores the profile", () => {
		const previous = getActiveTuiTheme();
		try {
			setActiveTuiTheme("gruvbox");
			expect(tuiBackgroundSequence()).toBe("\u001B]11;#1d2021\u0007");
			setActiveTuiTheme("tokyo-night");
			expect(tuiBackgroundSequence()).toBe("\u001B]11;#1a1b26\u0007");
			expect(tuiBackgroundResetSequence()).toBe("\u001B]111\u0007");
		} finally {
			setActiveTuiTheme(previous);
		}
	});
});
