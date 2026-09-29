import { expect, test } from "bun:test";
import { OutputLanguageController } from "../src/core/application/orchestration/output-language-controller";
import { OutputLanguageSelection } from "../src/core/domain/execution/output-language";

test("rapid language toggles preserve the final selection on screen and disk", async () => {
	const selection = new OutputLanguageSelection();
	const saved: string[] = [];
	const changed: string[] = [];
	let release: (() => void) | undefined;
	let started: (() => void) | undefined;
	const firstStarted = new Promise<void>(resolve => { started = resolve; });
	const firstWrite = new Promise<void>(resolve => { release = resolve; });
	const controller = new OutputLanguageController(selection, async language => {
		if (language === "en") { started?.(); await firstWrite; }
		saved.push(language);
	}, language => changed.push(language));
	const first = controller.cycle();
	await firstStarted;
	const second = controller.cycle();
	release?.();
	await Promise.all([first, second]);
	expect(selection.get()).toBe("ko");
	expect(saved).toEqual(["en", "ko"]);
	expect(changed).toEqual(["en", "ko"]);
});

test("a failed save leaves the displayed language unchanged and permits retry", async () => {
	const selection = new OutputLanguageSelection();
	let attempts = 0;
	const controller = new OutputLanguageController(selection, async () => {
		if (++attempts === 1) throw new Error("disk unavailable");
	}, () => undefined);
	await expect(controller.select("en")).rejects.toThrow("disk unavailable");
	expect(selection.get()).toBe("ko");
	await controller.select("en");
	expect(selection.get()).toBe("en");
});
