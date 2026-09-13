import { expect, test } from "bun:test";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
import { projectRequestTestWorkspace } from "../src/core/domain/observability/request-test-workspace";
import type { ProjectActivity } from "../src/core/domain/execution/project-activity";
import type { RequestRuntimeRecord } from "../src/core/domain/execution/request-runtime";
import { AstraTestView, projectAstraTestView, renderAstraTestView } from "../src/adapters/inbound/tui/features/test/astra-test-view";
import { astraFixture } from "./fixtures/astra-snapshot";

const activity = (id: string, sequence: number, command: string, exitCode: number): ProjectActivity => ({ schemaVersion: 1, id, projectId: "p", sequence, recordedAt: `2026-09-12T00:00:0${sequence}Z`, kind: "tool", phase: "completed", provider: "openai-codex", nativeRefs: { threadId: "t", turnId: "turn", itemId: id }, sourceDigest: `sha256:${"a".repeat(64)}`, payload: { method: "item/completed", params: { item: { type: "commandExecution", command, exitCode } } } });
function request(): RequestRuntimeRecord {
	const stages = ["UNDERSTAND", "DECOMPOSE", "GROUND", "DECIDE", "EXECUTE", "VERIFY", "DELIVER"].map((id, index) => ({ id, status: id === "VERIFY" ? "completed" : "skipped", goal: id, input: [], owner: "orchestrator", model: "gpt", agents: [], tools: [], output: id === "VERIFY" ? "사용자가 보는 모델 변경 흐름이 끊기지 않는지 확인" : "불필요", evidence: id === "VERIFY" ? [{ activityId: "e2e", sequence: 2, sourceDigest: `sha256:${"a".repeat(64)}`, itemId: "e2e", kind: "tool", status: "passed" }] : [], decision: null, skipReason: id === "VERIFY" ? null : "fixture", startedAt: null, completedAt: null, next: index < 6 ? ["UNDERSTAND", "DECOMPOSE", "GROUND", "DECIDE", "EXECUTE", "VERIFY", "DELIVER"][index + 1] : null, evidenceAfterSequence: 0, tasks: id === "VERIFY" ? [{ id: "real-flow", title: "실제 /model 명령으로 Astra 선택", status: "completed", dependsOn: [], verification: { kind: "black-box", purpose: "선택·저장·다음 실행의 모델이 일치함을 증명" } }] : [] })) as RequestRuntimeRecord["stages"];
	return { schemaVersion: 1, protocolVersion: 2, requestId: "request-1", threadId: "t", turnId: "turn", objective: "Astra 모델 변경을 고쳐줘", status: "completed", stages, attempt: 1, previousAttempts: [], deliveries: [], requiredDeliveries: [], events: [], startedAt: "2026-09-12T00:00:00Z", completedAt: null, issues: [], actions: [] };
}

test("projects tests as kind -> what -> goal and keeps evidence-backed outcomes separate from completed plans", () => {
	const projection = projectRequestTestWorkspace({ requests: [request()], activities: [activity("e2e", 2, "bun scripts/model-canary.ts --live", 0)] });
	const checks = projection.groups[0]!.checks;
	expect(checks[0]).toMatchObject({ kind: "black-box", title: "실제 /model 명령으로 Astra 선택", purpose: "선택·저장·다음 실행의 모델이 일치함을 증명", status: "unknown", evidenceActivityId: null });
	expect(checks[1]).toMatchObject({ kind: "black-box", status: "passed", evidenceActivityId: "e2e" });
});

test("renders a readable three-level black-box hierarchy with source on the goal line", () => {
	const snapshot = astraFixture("ready"); snapshot.requestRuntime = [request()]; snapshot.activities = [activity("e2e", 2, "bun scripts/model-canary.ts --live", 0)];
	const projection = projectAstraTestView(snapshot);
	const output = stripTerminalSequences(new AstraTestView(() => projection).render(80).join("\n"));
	expect(output).toContain("블랙박스 테스트");
	expect(output).toContain("└─");
	expect(output).toContain("목표 · 선택·저장·다음 실행의 모델이 일치함을 증명");
	expect(output).toContain("/source e2e");
	expect(output.split("\n").every(line => line.length <= 80)).toBe(true);
});

test("keeps snapshot projection outside the render pass", () => {
	const snapshot = astraFixture("ready");
	snapshot.requestRuntime = [request()];
	const projection = projectAstraTestView(snapshot);
	snapshot.requestRuntime = [];
	expect(renderAstraTestView(projection, 80).join("\n")).toContain("Astra 모델 변경을 고쳐줘");
});

test("legacy sessions expose observed commands without inventing a verification purpose", () => {
	const user: ProjectActivity = { ...activity("question", 1, "", 0), kind: "message", payload: { role: "user", text: "기능 확인" } };
	const projection = projectRequestTestWorkspace({ activities: [user, activity("check", 2, "bun test test/example.test.ts", 0)] });
	expect(projection.groups[0]).toMatchObject({ question: "기능 확인", status: "passed" });
	expect(projection.groups[0]!.checks[0]).toMatchObject({ kind: "unit", purpose: "검증 목적이 Runtime에 기록되지 않았습니다." });
});
