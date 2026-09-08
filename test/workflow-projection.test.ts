import { expect, test } from "bun:test";
import { createExecutionRun } from "../src/core/runtime/execution-run";
import { projectWorkFlow, projectWorkFlowFromExecutionRun } from "../src/core/domain/work/workflow-projection";

const hash = { sha256Hex: (input: Uint8Array) => String(input.length).padStart(64, "0") };

test("execution-run workflow adapter preserves the empty workflow projection contract", () => {
	const run = createExecutionRun({ runId: "thread:turn", threadId: "thread", turnId: "turn", hash });
	expect(projectWorkFlowFromExecutionRun(run)).toEqual(projectWorkFlow([]));
});
