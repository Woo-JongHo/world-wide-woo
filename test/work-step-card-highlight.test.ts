import { describe, expect, test } from "bun:test";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import type { ProjectActivity } from "../src/domain/project-activity";
import { projectWorkFlow, type DplanHash } from "../src/domain/work-steps";
import {
	executionLineTone,
	ObservationCard,
	WorkStepCard,
} from "../src/presentation/tui/work-step-card";

const THREAD = "thread-highlight";
const TURN = "turn-highlight";
const hash: DplanHash = {
	sha256Hex: (input) => new Bun.CryptoHasher("sha256").update(input).digest("hex"),
};

function commandActivity(output: string, sequence = 3): ProjectActivity {
	return {
		schemaVersion: 1,
		id: "command-highlight",
		projectId: "sample-project",
		sequence,
		recordedAt: "2026-09-01T00:00:00.000Z",
		kind: "tool",
		phase: "completed",
		provider: "openai-codex",
		nativeRefs: { threadId: THREAD, turnId: TURN, itemId: "command-1" },
		sourceDigest: `sha256:${String(sequence).padStart(64, "0")}`,
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

function fileChangeActivity(): ProjectActivity {
	return {
		schemaVersion: 1,
		id: "file-change-highlight",
		projectId: "sample-project",
		sequence: 3,
		recordedAt: "2026-09-01T00:00:00.000Z",
		kind: "file-change",
		phase: "completed",
		provider: "openai-codex",
		nativeRefs: { threadId: THREAD, turnId: TURN, itemId: "edit-1" },
		sourceDigest: `sha256:${"3".padStart(64, "0")}`,
		payload: {
			method: "item/completed",
			params: {
				item: {
					type: "fileChange",
					changes: [{ path: "src/app.ts", kind: "update", diff: "+ change" }],
				},
			},
		},
	};
}

function toolActivity(): ProjectActivity {
	return {
		schemaVersion: 1,
		id: "tool-highlight",
		projectId: "sample-project",
		sequence: 3,
		recordedAt: "2026-09-01T00:00:00.000Z",
		kind: "tool",
		phase: "completed",
		provider: "openai-codex",
		nativeRefs: { threadId: THREAD, turnId: TURN, itemId: "tool-1" },
		sourceDigest: `sha256:${"3".padStart(64, "0")}`,
		payload: {
			method: "item/completed",
			params: { item: { type: "webSearch", query: "UX" } },
		},
	};
}

function workflowActivities(output: string): readonly ProjectActivity[] {
	return [{
		schemaVersion: 1, id: "turn-highlight-start", projectId: "sample-project", sequence: 1,
		recordedAt: "2026-09-01T00:00:00.000Z", kind: "progress", phase: "completed", provider: "openai-codex",
		nativeRefs: { threadId: THREAD, turnId: TURN }, sourceDigest: `sha256:${"1".padStart(64, "0")}`,
		payload: { method: "turn/started" },
	}, {
		schemaVersion: 1, id: "turn-highlight-plan", projectId: "sample-project", sequence: 2,
		recordedAt: "2026-09-01T00:00:01.000Z", kind: "progress", phase: "completed", provider: "openai-codex",
		nativeRefs: { threadId: THREAD, turnId: TURN }, sourceDigest: `sha256:${"2".padStart(64, "0")}`,
		payload: { method: "turn/plan/updated", params: { plan: [{ step: "변경 결과 검증", status: "inProgress" }] } },
	}, commandActivity(output)];
}

function planInput(activities: readonly ProjectActivity[]) {
	const activity = activities[0]!;
	return { expectedThreadKey: activity.nativeRefs.threadId!, selectedTurnId: activity.nativeRefs.turnId!, hash };
}

describe("WorkStepCard executor highlighting", () => {
	test("labels an unplanned action as Bash, Edit, or Tool while keeping the Bash block", () => {
		const bash = stripTerminalSequences(new ObservationCard({
			activity: commandActivity("12 pass"),
			mode: "action",
		}).render(88).join("\n"));
		const edit = stripTerminalSequences(new ObservationCard({
			activity: fileChangeActivity(),
			mode: "action",
		}).render(88).join("\n"));
		const tool = stripTerminalSequences(new ObservationCard({
			activity: toolActivity(),
			mode: "action",
		}).render(88).join("\n"));

		expect(bash).toContain("✔ Bash · PASSED");
		expect(bash).toContain("│ $ bun test --filter 'work step'");
		expect(edit).toContain("✔ Edit · PASSED");
		expect(tool).toContain("✔ Tool · PASSED");
	});

	test("renders native command execution with a Gajae-style Bash frame", () => {
		const output = Array.from({ length: 16 }, (_, index) => `line ${index + 1}`).join("\n");
		const rendered = new WorkStepCard({
			stepNumber: 1,
			activity: commandActivity(output),
		}).render(88);
		const text = rendered.map((line) => stripTerminalSequences(line));

		expect(text[1]?.trimEnd()).toBe("명령 실행 · bun test --filter 'work step'");
		expect(text[2]?.trimEnd()).toBe("왜 하는지: 명령 결과를 확인해 다음 작업을 안전하게 진행합니다.");
		expect(text[3]).toStartWith("┌─── ✔ Bash ");
		expect(text.some((line) => line.includes("│ $ bun test --filter 'work step'"))).toBe(true);
		expect(text.some((line) => line.startsWith("├─── Output "))).toBe(true);
		expect(text.some((line) => line.includes("… (6 earlier lines, showing 10 of 16)"))).toBe(true);
		expect(text.some((line) => line.includes("⟦Exit: 0⟧"))).toBe(true);
		expect(text.at(-1)).toStartWith("└───");
		expect(rendered.every((line) => visibleWidth(line) === 88)).toBe(true);
	});

	test("keeps direct work and why text without a repeated what label", () => {
		const source = workflowActivities("line 1\nline 2");
		const input = planInput(source);
		const initial = projectWorkFlow(source, new Map(), input);
		const flow = projectWorkFlow(source, new Map([[initial.steps[0]!.id, {
			what: "검증 명령의 결과를 확인합니다.",
			why: "완료 상태를 신뢰할 수 있는지 판단하기 위해서입니다.",
			inputSummary: [],
			source: "model" as const,
		}]]), input);
		const rendered = stripTerminalSequences(new WorkStepCard({
			stepNumber: 7,
			activity: source.at(-1)!,
			narration: flow.steps[0]!.narration,
		}).render(88).join("\n"));

		expect(rendered).toContain("단계 7 · PASSED");
		expect(rendered).toContain("검증 명령의 결과를 확인합니다.");
		expect(rendered).not.toContain("무엇을 하고 있는지:");
		expect(rendered).toContain("왜 하는지: 완료 상태를 신뢰할 수 있는지 판단하기 위해서입니다.");
		expect(rendered).toContain("$ bun test --filter 'work step'");
		expect(rendered).toContain("line 1");
		const lines = rendered.split("\n").map((line) => line.trimEnd());
		const what = lines.indexOf("검증 명령의 결과를 확인합니다.");
		const why = lines.indexOf("왜 하는지: 완료 상태를 신뢰할 수 있는지 판단하기 위해서입니다.");
		const bash = lines.findIndex((line) => line.startsWith("┌─── ✔ Bash "));
		expect(what).toBe(bash - 2);
		expect(why).toBe(bash - 1);
	});

	test("classifies execution output by semantic meaning", () => {
		expect(executionLineTone("12 pass", "output")).toBe("success");
		expect(executionLineTone("1 fail", "output")).toBe("error");
		expect(executionLineTone("stderr: permission denied", "output")).toBe("error");
		expect(executionLineTone("+added line", "output")).toBe("diff-added");
		expect(executionLineTone(" M src/app.ts", "output")).toBe("git-modified");
		expect(executionLineTone("?? notes.md", "output")).toBe("git-untracked");
		expect(executionLineTone("diff --git a/src/app.ts b/src/app.ts", "output")).toBe("diff-header");
		expect(executionLineTone("@@ -1,2 +1,3 @@", "output")).toBe("diff-header");
		expect(executionLineTone("+++ b/src/app.ts", "output")).toBe("diff-added");
		expect(executionLineTone("command: bun test", "input")).toBe("command");
	});

	test("connects native Bash highlighting without changing public text", () => {
		const rendered = new WorkStepCard({
			stepNumber: 1,
			activity: commandActivity("12 pass\n1 fail"),
		}).render(80).join("\n");

		expect(rendered).toContain("\u001b[38;2;");
		expect(stripTerminalSequences(rendered)).toContain("$ bun test --filter 'work step'");
		expect(rendered.split("\n").every((line) => visibleWidth(line) === 80)).toBe(true);
	});

	test("keeps a semantic reason while narrator work is pending or has failed", () => {
		const source = workflowActivities("completed");
		const input = planInput(source);
		const initial = projectWorkFlow(source, new Map(), input);
		const flow = projectWorkFlow(source, new Map([[initial.steps[0]!.id, {
			what: "변경 결과 검증",
			why: "요청을 안전하게 처리하고 결과를 확인하기 위해서입니다.",
			inputSummary: [],
			source: "fallback",
		}]]), input);

		expect(flow.steps[0]?.narration).toMatchObject({
			what: "변경 결과 검증",
			why: "요청을 안전하게 처리하고 결과를 확인하기 위해서입니다.",
			source: "fallback",
		});
	});

	test("rejects inline commands and filename-only narrator text", () => {
		const source = workflowActivities("completed");
		const input = planInput(source);
		const initial = projectWorkFlow(source, new Map(), input);
		const narrated = projectWorkFlow(source, new Map([[initial.steps[0]!.id, {
			what: "먼저 `git status --short`를 실행합니다.",
			why: "work-steps.ts 변경을 검토하기 위해서입니다.",
			inputSummary: [],
			source: "model" as const,
		}]]), input);

		expect(narrated.steps[0]?.narration).toMatchObject({
			what: "작업을 진행합니다.",
			why: "요청을 안전하게 처리하고 결과를 확인하기 위해서입니다.",
		});
	});
});
