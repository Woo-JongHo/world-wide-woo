import { expect, test }                  from "bun:test";
import { stripTerminalSequences }         from "@earendil-works/pi-tui";
import { WwwPlanView }                     from "../src/adapters/inbound/tui/features/plan/view/www-plan-view";
import { requestRuntimeRows }               from "../src/adapters/inbound/tui/features/monitoring/view/request-runtime-view";
import { projectPlanFeature }              from "../src/core/application/orchestration/workbench-feature-reads";
import { wwwFixture }                      from "./fixtures/www-snapshot";

test("긴 PLAN 단계는 두 줄에서 자르지 않고 끝까지 표시한다", () => {
	const snapshot = wwwFixture("working");
	const title = "원인을 조사하고 단계 간 연결을 확인한 뒤 마지막 회귀 검증 결과까지 빠짐없이 읽는다";
	snapshot.workFlow = { ...snapshot.workFlow, steps: [{ ...snapshot.workFlow.steps[0]!, title }] };
	const output = stripTerminalSequences(new WwwPlanView(() => projectPlanFeature(snapshot)).render(28).join("\n"));
	const unwrapped = output.replace(/\s+/gu, "");
	expect(unwrapped).toContain("마지막회귀검증결과까지빠짐없이읽는다");
	expect(output).not.toContain("…");
});

test("protocol v2 실행 중에도 Native PLAN 단계가 표시된다", () => {
	const snapshot = wwwFixture("working");
	snapshot.requestRuntime = [{
		schemaVersion: 1, protocolVersion: 2, requestId: "request-plan", threadId: snapshot.threadId,
		turnId: snapshot.activeTurnId, objective: "계획을 표시한다", status: "running", attempt: 1,
		previousAttempts: [], deliveries: [], requiredDeliveries: [], events: [], startedAt: null,
		completedAt: null, issues: [], actions: [], stages: [{ id: "WORK", status: "running", tasks: [] }],
	}] as never;
	const view = new WwwPlanView(() => projectPlanFeature(snapshot), false, Date.now, false, {
		motionActive: () => false,
		rows: requestRuntimeRows,
	});
	const output = stripTerminalSequences(view.render(80).join("\n"));
	expect(output).toContain("PLAN");
	expect(output.match(/PLAN/gu)).toHaveLength(1);
	expect(output).toContain("세션과 이벤트 결합 지점 확인");
});
