import { describe, expect, test } from "bun:test";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
import {
	formatWorkbenchSessionTelemetry,
	formatWorkbenchTelemetry,
	parseGitTelemetry,
} from "../src/presentation/tui/workbench-telemetry";

describe("workbench telemetry rail", () => {
	test("renders the actual native model, effort, context, Git state, and project path", () => {
		const output = stripTerminalSequences(formatWorkbenchTelemetry({
			model: "gpt-5.6-sol",
			effort: "low",
			contextUsage: { usedTokens: 8_785, contextWindow: 258_400, percent: 3.4 },
			sessionUsage: {
				totalTokens: 25_840,
				unattributedTokens: 0,
				models: [{ model: "gpt-5.6-sol", effort: "low", turns: 1, totalTokens: 25_840 }],
			},
			git: { branch: "main", staged: 0, unstaged: 0, untracked: 2 },
			cwd: "/Users/tester/woo/00_project/99_www",
			home: "/Users/tester",
		}, 160));

		expect(output).not.toContain("GPT-5.6-Sol");
		expect(output).not.toContain("◑ low");
		expect(output).toContain("⑂ main ?2");
		expect(output).toContain("📁 ~/woo/00_project/99_www");

		const session = stripTerminalSequences(formatWorkbenchSessionTelemetry({
			model: "gpt-5.6-sol",
			effort: "low",
			contextUsage: { usedTokens: 8_785, contextWindow: 258_400, percent: 3.4 },
			sessionUsage: {
				totalTokens: 25_840,
				unattributedTokens: 0,
				models: [{ model: "gpt-5.6-sol", effort: "low", turns: 1, totalTokens: 25_840 }],
			},
			git: null,
			cwd: "/work/project",
			home: "/Users/tester",
		}, 160));
		expect(session).not.toContain("Sol·low 25.8k");
		expect(session).toContain("Context  97%");
		expect(session).not.toContain(":");
		expect(session).not.toMatch(/[▐▌▮█░]/u);
		expect(session).toContain("97%");
	});

	test("uses explicit unknown markers before native usage and Git arrive", () => {
		const output = stripTerminalSequences(formatWorkbenchTelemetry({
			model: "gpt-5.6-sol",
			effort: null,
			contextUsage: null,
			git: null,
			cwd: "/work/project",
			home: "/Users/tester",
		}, 100));

		expect(output).toContain("⑂ –");
	});

	test("normalizes an unborn Git branch without exposing the porcelain sentence", () => {
		expect(parseGitTelemetry("## No commits yet on main\n?? .www/\n")).toEqual({
			branch: "main",
			staged: 0,
			unstaged: 0,
			untracked: 1,
		});
	});
});
