import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import type { ProjectActivity } from "../src/domain/project-activity";
import { projectWorkFlow, type DplanHash } from "../src/domain/work-steps";
import {
	executionLineTone,
	ObservationCard,
	projectNativePathText,
	WorkStepCard,
} from "../src/presentation/tui/work-step-card";
import { BashResultCard } from "../src/presentation/tui/result-cards";

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

function structuredToolActivity(output: string, path = "result.json"): ProjectActivity {
	return {
		schemaVersion: 1,
		id: "structured-tool-highlight",
		projectId: "sample-project",
		sequence: 4,
		recordedAt: "2026-09-01T00:00:00.000Z",
		kind: "tool",
		phase: "completed",
		provider: "openai-codex",
		nativeRefs: { threadId: THREAD, turnId: TURN, itemId: "structured-tool-1" },
		sourceDigest: `sha256:${"4".padStart(64, "0")}`,
		payload: {
			method: "item/completed",
			params: { item: { type: "mcpToolCall", path, output } },
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

	test("shortens repeated native paths at the presentation boundary without conflating external paths", () => {
		const project = `${homedir()}/very-long-project`;
		const outside = `${homedir()}/other-project/src/app.ts`;
		const activity = commandActivity(
			`${project}/src/app.ts\n${outside}`,
		);
		const item = (activity.payload.params as { item: Record<string, unknown> }).item;
		item.cwd = project;
		item.command = `bun test ${project}/test/work-step-card-highlight.test.ts`;
		const rendered = stripTerminalSequences(new WorkStepCard({
			stepNumber: 1,
			activity,
			narration: {
				what: `검증 ${project}/src/app.ts`,
				why: `결과 ${project}/src/app.ts를 확인합니다.`,
				inputSummary: [`command: bun test ${project}/test/work-step-card-highlight.test.ts`],
				source: "model",
			},
		}).render(120).join("\n"));

		expect(rendered).toContain("$PROJECT/src/app.ts");
		expect(rendered).toContain("$PROJECT/test/work-step-card-highlight.test.ts");
		expect(rendered).toContain("~/other-project/src/app.ts");
		expect(rendered).not.toContain(project);
		expect(item.command).toBe(`bun test ${project}/test/work-step-card-highlight.test.ts`);
		expect(item.aggregatedOutput).toBe(`${project}/src/app.ts\n${outside}`);
		expect(rendered.split("\n").every((line) => visibleWidth(line) === 120)).toBe(true);
	});

	test("projects project, home, sibling, outside, false-prefix, and Windows paths on component boundaries", () => {
		const home = "/Users/ada";
		const project = "/Users/ada/woo/www";
		const windowsHome = "C:\\Users\\ada";
		const windowsProject = "C:\\Users\\ada\\woo\\www";
		const cases = [
			{ value: `${project}/src/app.ts`, cwd: project, home, expected: "$PROJECT/src/app.ts" },
			{ value: `${home}/notes/todo.md`, cwd: project, home, expected: "~/notes/todo.md" },
			{ value: `${home}/woo/www-issue-23/src/app.ts`, cwd: project, home, expected: "~/woo/www-issue-23/src/app.ts" },
			{ value: "/tmp/outside.txt", cwd: project, home, expected: "/tmp/outside.txt" },
			{ value: `${project}-backup/src/app.ts`, cwd: project, home, expected: "~/woo/www-backup/src/app.ts" },
			{ value: `${windowsProject}\\src\\app.ts`, cwd: windowsProject, home: windowsHome, expected: "$PROJECT\\src\\app.ts" },
		] as const;

		for (const path of cases) {
			expect(projectNativePathText(path.value, path.cwd, path.home)).toBe(path.expected);
		}
	});

	test("uses the same path projection at the Bash result-card boundary without mutating its snapshot", () => {
		const project = `${homedir()}/very-long-project`;
		const snapshot = {
			id: "path-projection",
			shell: "bash" as const,
			command: `bun test ${project}/test/work-step-card-highlight.test.ts`,
			cwd: project,
			status: "passed" as const,
			stdout: `${project}/src/app.ts`,
			stderr: "",
			startedAt: undefined,
			durationMs: undefined,
			exitCode: 0,
		};
		const text = stripTerminalSequences(new BashResultCard(snapshot).render(120).join("\n"));

		expect(text).toContain("$PROJECT/test/work-step-card-highlight.test.ts");
		expect(text).toContain("$PROJECT/src/app.ts");
		expect(snapshot.command).toBe(`bun test ${project}/test/work-step-card-highlight.test.ts`);
		expect(snapshot.stdout).toBe(`${project}/src/app.ts`);
	});

	test("projects file-change and read what paths without narration while preserving raw activities", () => {
		const project = `${homedir()}/very-long-project`;
		const file = `${project}/src/app.ts`;
		const fileChange = fileChangeActivity();
		const fileItem = (fileChange.payload.params as { item: Record<string, unknown> }).item;
		fileItem.cwd = project;
		fileItem.path = file;
		const read = toolActivity();
		const readItem = (read.payload.params as { item: Record<string, unknown> }).item;
		readItem.type = "readFile";
		delete readItem.query;
		readItem.cwd = project;
		readItem.path = file;

		const fileText = stripTerminalSequences(new WorkStepCard({ stepNumber: 1, activity: fileChange }).render(120).join("\n"));
		const readText = stripTerminalSequences(new WorkStepCard({ stepNumber: 2, activity: read }).render(120).join("\n"));

		expect(fileText).toContain("파일 변경 · $PROJECT/src/app.ts");
		expect(readText).toContain("파일 확인 · $PROJECT/src/app.ts");
		expect(fileItem.path).toBe(file);
		expect(readItem.path).toBe(file);
	});

	test("leaves short relative paths unchanged", () => {
		const rendered = stripTerminalSequences(new WorkStepCard({
			stepNumber: 1,
			activity: commandActivity("src/app.ts"),
		}).render(120).join("\n"));

		expect(rendered).toContain("bun test --filter 'work step'");
		expect(rendered).toContain("src/app.ts");
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

	test("pretty prints and highlights native structured tool output like generic tools", () => {
		const rendered = new WorkStepCard({
			stepNumber: 1,
			activity: structuredToolActivity('{"outer":{"answer":42}}'),
		}).render(100).join("\n");

		expect(rendered).toContain("\u001b[38;2;");
		expect(stripTerminalSequences(rendered)).toContain('"answer": 42');
		expect(stripTerminalSequences(new WorkStepCard({
			stepNumber: 1,
			activity: structuredToolActivity("service:\n  enabled: true", "config.yaml"),
		}).render(100).join("\n"))).toContain("enabled: true");
		const markdown = new WorkStepCard({
			stepNumber: 1,
			activity: structuredToolActivity("# Heading\n\n**bold**", "result.md"),
		}).render(100).join("\n");
		expect(markdown).toContain("\u001b[38;2;");
		expect(stripTerminalSequences(markdown)).toContain("# Heading");
		for (const output of ["{invalid", "x".repeat(2_500)]) {
			const fallback = stripTerminalSequences(new WorkStepCard({
				stepNumber: 1,
				activity: structuredToolActivity(output),
			}).render(100).join("\n"));
			expect(fallback).toContain(output === "{invalid" ? "{invalid" : "… 이전 출력");
		}
	});

	test("unwraps the Codex mcpToolCall arguments and result envelope before rendering", () => {
		const base = structuredToolActivity("", "ignored.txt");
		const activity = { ...base, payload: { ...base.payload, params: {
			item: {
				type: "mcpToolCall",
				server: "filesystem",
				tool: "read_file",
				arguments: { path: "report.json", authorization: "Bearer secret-value" },
				result: {
					content: [{ type: "text", text: "{\"fallback\":true}" }],
					structuredContent: { answer: 42, api_key: "secret-value" },
				},
			},
		} } };

		const rendered = new WorkStepCard({ stepNumber: 1, activity }).render(100).join("\n");
		const text = stripTerminalSequences(rendered);
		expect(rendered).toContain("\u001b[38;2;");
		expect(text).toContain('args: {"path":"report.json"}');
		expect(text).toContain('"answer": 42');
		expect(text).not.toContain("structuredContent");
		expect(text).not.toContain("fallback");
		expect(text).not.toContain("secret-value");
	});

	test("renders text from a Codex mcpToolCall result.content envelope", () => {
		const base = structuredToolActivity("", "ignored.txt");
		const activity = { ...base, payload: { ...base.payload, params: {
			item: {
				type: "mcpToolCall",
				arguments: { path: "config.yaml" },
				result: { content: [{ type: "text", text: "service:\n  enabled: true" }] },
			},
		} } };

		const rendered = new WorkStepCard({
			stepNumber: 1,
			activity,
		}).render(100).join("\n");
		const text = stripTerminalSequences(rendered);
		expect(rendered).toContain("\u001b[38;2;");
		expect(text).toContain("enabled: true");
		expect(text).not.toContain('"content":');
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
