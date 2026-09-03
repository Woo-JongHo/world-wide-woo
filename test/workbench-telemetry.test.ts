import { describe, expect, test } from "bun:test";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
import {
	formatWorkbenchTelemetry,
	parseGitTelemetry,
} from "../src/presentation/tui/workbench-telemetry";

describe("workbench telemetry rail", () => {
	test("renders only Git state and project path; Context belongs to the usage strip", () => {
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

		expect(output).toContain("⑂ main ?2");
		expect(output).toContain("📁 ~/woo/00_project/99_www");
		expect(output).not.toContain("Context");
		expect(output).not.toContain("GPT-5.6-Sol");
	});

	test("uses explicit unknown markers before Git arrives", () => {
		const output = stripTerminalSequences(formatWorkbenchTelemetry({
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
