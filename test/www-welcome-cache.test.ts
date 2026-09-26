import { describe, expect, test } from "bun:test";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
import { WwwTranscriptView }      from "../src/adapters/inbound/tui/features/chat/view/www-execution";
import { wwwFixture }             from "./fixtures/www-snapshot";

describe("Www welcome animation cache boundary", () => {
	test("repaints the welcome octopus after a timer tick", async () => {
		const noColor = process.env.NO_COLOR, reducedMotion = process.env.WWW_REDUCED_MOTION;
		delete process.env.NO_COLOR; delete process.env.WWW_REDUCED_MOTION;
		const snapshot = wwwFixture("loading");
		snapshot.chat       = []                                                     ;
		snapshot.activities = []                                                     ;
		snapshot.workFlow   = { ...snapshot.workFlow, steps: [], completedCount: 0 } ;
		const view = new WwwTranscriptView(snapshot);
		view.playWelcomeIntro(() => undefined);
		try {
			const first = stripTerminalSequences(view.render(80).join("\n"));
			await Bun.sleep(100);
			const afterTick = stripTerminalSequences(view.render(80).join("\n"));
			expect(afterTick).not.toBe(first);
		} finally {
			view.dispose();
			if (noColor === undefined) delete process.env.NO_COLOR; else process.env.NO_COLOR = noColor;
			if (reducedMotion === undefined) delete process.env.WWW_REDUCED_MOTION; else process.env.WWW_REDUCED_MOTION = reducedMotion;
		}
	});
});
