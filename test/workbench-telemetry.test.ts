import { describe, expect, test } from "bun:test";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
import {
	formatWorkbenchTelemetry,
	workbenchModelLabel,
} from "../src/adapters/inbound/tui/features/monitoring/view/workbench-telemetry";
import { parseGitTelemetry }      from "../src/adapters/outbound/git/git-telemetry-source";

describe("workbench telemetry rail", () => {
	test("uses readable provider and family casing for model labels", () => {
		expect(workbenchModelLabel("gpt-5.6-luna")).toBe("GPT-5.6-Luna");
		expect(workbenchModelLabel("gpt-5.6-sol")).toBe("GPT-5.6-Sol");
		expect(workbenchModelLabel("claude-sonnet-4-6")).toBe("Claude Sonnet 4.6");
		expect(workbenchModelLabel("claude-opus")).toBe("Claude Opus");
		expect(workbenchModelLabel("claude-fable")).toBe("Claude Fable");
	});

	test("renders only Git state and project path; Context belongs to the usage strip", () => {
		const output = stripTerminalSequences(formatWorkbenchTelemetry({
			git  : { branch: "main", staged: 0, unstaged: 0, untracked: 2 },
			cwd  : "/Users/tester/woo/00_project/99_www",
			home : "/Users/tester",
		}, 160));

		expect(output).toContain("⑂ main ?2");
		expect(output).toContain("📁 ~/woo/00_project/99_www");
		expect(output).not.toContain("Context");
		expect(output).not.toContain("GPT-5.6-Sol");
	});

	test("uses explicit unknown markers before Git arrives", () => {
		const output = stripTerminalSequences(formatWorkbenchTelemetry({
			git  : null,
			cwd  : "/work/project",
			home : "/Users/tester",
		}, 100));

		expect(output).toContain("⑂ –");
	});

	test("normalizes an unborn Git branch without exposing the porcelain sentence", () => {
		expect(parseGitTelemetry("## No commits yet on main\n?? .www/\n")).toEqual({
			branch    : "main",
			staged    : 0,
			unstaged  : 0,
			untracked : 1,
		});
	});
});
