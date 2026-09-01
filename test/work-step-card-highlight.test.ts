import { describe, expect, test } from "bun:test";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import type { ProjectActivity } from "../src/domain/project-activity";
import {
	executionLineTone,
	WorkStepCard,
} from "../src/presentation/tui/work-step-card";

function commandActivity(output: string): ProjectActivity {
	return {
		schemaVersion: 1,
		id: "command-highlight",
		projectId: "sample-project",
		sequence: 1,
		recordedAt: "2026-09-01T00:00:00.000Z",
		kind: "tool",
		phase: "completed",
		provider: "openai-codex",
		nativeRefs: { itemId: "command-1" },
		sourceDigest: `sha256:${"a".repeat(64)}`,
		payload: {
			method: "item/completed",
			params: {
				item: {
					type: "commandExecution",
					command: "bun test --filter 'work step'",
					cwd: "/workspace/sample",
					aggregatedOutput: output,
					exitCode: 0,
				},
			},
		},
	};
}

describe("WorkStepCard executor highlighting", () => {
	test("classifies execution output by semantic meaning", () => {
		expect(executionLineTone("12 pass", "output")).toBe("success");
		expect(executionLineTone("1 fail", "output")).toBe("error");
		expect(executionLineTone("stderr: permission denied", "output")).toBe("error");
		expect(executionLineTone("+added line", "output")).toBe("diff-added");
		expect(executionLineTone("command: bun test", "input")).toBe("command");
	});

	test("connects native Bash highlighting without changing public text", () => {
		const rendered = new WorkStepCard({
			stepNumber: 1,
			activity: commandActivity("12 pass\n1 fail"),
		}).render(80).join("\n");

		expect(rendered).toContain("\u001b[38;2;");
		expect(stripTerminalSequences(rendered)).toContain("command: bun test --filter 'work step'");
		expect(rendered.split("\n").every((line) => visibleWidth(line) === 80)).toBe(true);
	});
});
