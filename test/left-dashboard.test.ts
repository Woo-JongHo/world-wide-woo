import { describe, expect, test } from "bun:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import type { SessionSnapshot } from "../src/application/session-runtime";
import { TranscriptView } from "../src/presentation/tui/dashboard-views";
import { gradientLines } from "../src/presentation/tui/theme";

const snapshot: SessionSnapshot = {
	id: "design-test",
	phase: "ready",
	turns: [],
	draft: "",
	error: null,
	auth: { configured: true, source: "OAuth", type: "oauth" },
	settings: { provider: "openai-codex", model: "gpt-5.4", effort: "ultra" },
	cwd: "/workspace/project",
	projectName: "project",
	projectRoot: "/workspace/project",
	activity: null,
	tools: [],
	narrations: [],
};

describe("WWW left welcome", () => {
	test.each([40, 100])("keeps product identity and live pills within %i columns", (width) => {
		const output = new TranscriptView(snapshot).render(width);
		expect(output.every((line) => visibleWidth(line) <= width)).toBe(true);
		expect(output.join("\n")).toContain("WWW · World Wide Woo");
		expect(output.join("\n")).toContain("openai-codex · gpt-5.4");
		expect(output.join("\n")).toContain("추론 최고");
		expect(output.join("\n")).toContain("인증됨 · OAuth");
	});

	test("gradient styling preserves landmark cell width", () => {
		const landmark = ["╭─╮   ╭─╮   ╭─╮", "╰─────────────╯"];
		const styled = gradientLines(landmark);
		expect(styled.map(visibleWidth)).toEqual(landmark.map(visibleWidth));
	});
});
