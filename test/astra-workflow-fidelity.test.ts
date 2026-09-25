import { expect, test }                         from "bun:test";
import { renderLayoutFrame }                    from "@earendil-works/pi-tui/dist/layout.js";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import chalk                                    from "chalk";
import { AstraWorkspace }                       from "../src/adapters/inbound/tui/shell/astra-surface";
import {
	AstraWorkflowRail,
	AstraWorkflowView,
} from "../src/adapters/inbound/tui/features/workflow/astra-workflow-view";
import { a }                                    from "../src/adapters/inbound/tui/foundation/theme/astra-theme";
import { REQUEST_STAGES }                       from "../src/core/domain/execution/request-runtime";
import type { RequestRuntimeRecord }            from "../src/core/domain/execution/request-runtime";
import { astraFixture }                         from "./fixtures/astra-snapshot";

test("Workflow 데모는 Figma 관계 트리와 두 열 실행 패널을 정렬하고 live에 샘플을 섞지 않는다", () => {
	const snapshot     = astraFixture("working")                                       ;
	const view         = new AstraWorkflowView(() => snapshot, () => true)             ;
	const rows         = view.render(130).map(stripTerminalSequences)                  ;
	const matrixHeader = rows.find(row => row.includes("Parallel execution pipeline")) ;
	expect(matrixHeader).toContain("Subagent state matrix");
	const queueHeader = rows.find(row => row.includes("Active work queue & retry counts"));
	expect(queueHeader).toContain("State change event log");
	const lanes = rows.filter(row => /LANE_[A-D]/u.test(row));
	expect(lanes).toHaveLength(4);
	expect(new Set(lanes.map(row => row.indexOf("█"))).size).toBe(1);
	const states = ["ACTIVE", "LOADED", "SYNC", "BLOCK"];
	expect(new Set(lanes.map((row, index) => row.indexOf(states[index] ?? ""))).size).toBe(1);
	expect(rows.join("\n")).toContain("RE-INDEX");
	expect(rows.findIndex(row => row.includes("commit-git-artifacts"))).toBeLessThan(32);
	for (const width of [28, 60, 90, 130, 180]) {
		expect(view.render(width).every(row => visibleWidth(row) <= width)).toBe(true);
		expect(new AstraWorkflowRail(() => snapshot, () => true).render(width).every(row => visibleWidth(row) <= width)).toBe(true);
	}
	const live = stripTerminalSequences(new AstraWorkflowView(() => snapshot).render(130).join("\n"));
	expect(live).not.toContain("02h 45m 12s");
	expect(live).not.toContain("parse-user-payload");
	expect(live).toContain("unavailable");
});

test("Workflow의 160열 첫 viewport에 7단계와 역할별 위임 상태가 함께 보인다", () => {
	const snapshot = astraFixture("working");
	const stageStatuses = ["completed", "completed", "completed", "running", "pending", "pending", "pending"] as const;
	const request: RequestRuntimeRecord = {
		schemaVersion: 1, protocolVersion: 2, requestId: "request-density", threadId: snapshot.threadId,
		turnId: snapshot.activeTurnId, objective: "첫 화면에서 Workflow 전체를 비교한다", status: "running", attempt: 1,
		previousAttempts: [], deliveries: [], requiredDeliveries: [], events: [], startedAt: "2026-09-22T00:00:00Z",
		completedAt: null, issues: [], actions: [],
		stages: REQUEST_STAGES.map((id, index) => ({
			id, status: stageStatuses[index]!, goal: `${id} 공개 근거`, input: [], owner: "orchestrator", model: null,
			agents: [], tools: [], output: null, evidence: [], decision: null, skipReason: null, startedAt: null,
			completedAt: null, next: null, evidenceAfterSequence: 0, tasks: [],
		})),
	};
	snapshot.requestRuntime = [request];
	snapshot.delegation = [{
		sourceThreadId: snapshot.threadId!, turnId: snapshot.activeTurnId!, activityIds: [], itemIds: [],
		tasks: [
			{ ref : "review"   , id : "agent-review"   , attempt : 1 , parentId : snapshot.threadId , parentRef : null , role : "reviewer"   , status : "running"   , task : "변경 검토" , model : "gpt-5.6-sol"    , reasoningEffort : "high"   , activities : [] , result : null        },
			{ ref : "research" , id : "agent-research" , attempt : 1 , parentId : snapshot.threadId , parentRef : null , role : "researcher" , status : "completed" , task : "근거 조사" , model : "gpt-5.6-terra"  , reasoningEffort : "medium" , activities : [] , result : "조사 완료" },
			{ ref : "audit"    , id : "agent-audit"    , attempt : 1 , parentId : snapshot.threadId , parentRef : null , role : "auditor"    , status : "failed"    , task : "최종 감사" , model : "claude-fable-5" , reasoningEffort : "high"   , activities : [] , result : "감사 실패" },
		],
	}];

	const workspace = new AstraWorkspace(() => snapshot, () => []);
	workspace.show("workflow");
	const rows = renderLayoutFrame(workspace.component, 160, 35, () => undefined).lines;
	const firstViewport = stripTerminalSequences(rows.join("\n"));
	for (const stage of REQUEST_STAGES)
		expect(firstViewport).toContain(stage);
	for (const comparison of ["reviewer", "running", "researcher", "completed", "auditor", "failed"])
		expect(firstViewport).toContain(comparison);
	for (const detail of ["gpt-5.6-sol", "high", "변경 검토", "조사 완료"])
		expect(firstViewport).toContain(detail);
	expect(firstViewport).toContain("unavailable");
	expect(rows).toHaveLength(35);
	expect(rows.every(row => visibleWidth(row) <= 160)).toBe(true);

	const level = chalk.level;
	chalk.level = 3;
	try {
		const colored = new AstraWorkflowView(() => snapshot).render(120);
		expect(colored.find(row => stripTerminalSequences(row).includes("7-stage pipeline"))).toContain(a.active("7-stage pipeline"));
		expect(colored.find(row => stripTerminalSequences(row).includes("Role status comparison"))).toContain(a.active("Role status comparison"));
		expect(colored.find(row => stripTerminalSequences(row).includes("researcher"))).toContain(a.success("researcher"));
	} finally { chalk.level = level; }

	const projection = snapshot.delegation[0]!;
	const template = projection.tasks[0]!;
	snapshot.delegation = [{
		...projection,
		tasks: [...projection.tasks, ...Array.from({ length: 5 }, (_, index) => ({
			...template, ref: `overflow-${index}`, id: `overflow-${index}`, role: `worker-${index}`,
		}))],
	}];
	const overflow = stripTerminalSequences(new AstraWorkflowView(() => snapshot).render(120).join("\n"));
	expect(overflow).toContain("… 1 delegated tasks hidden");
	snapshot.delegation = [{ ...projection, tasks: [{ ...template, status: "pending" }] }];
	const pending = stripTerminalSequences(new AstraWorkflowView(() => snapshot).render(120).join("\n"));
	expect(pending).toContain("0 active / 1");
	expect(pending).toContain("pending");
});
