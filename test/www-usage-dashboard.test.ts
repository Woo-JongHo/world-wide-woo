import { describe, expect, test }               from "bun:test";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { WwwUsageView }                         from "../src/adapters/inbound/tui/features/usage/view/www-usage-view";
import { wwwFixture }                           from "./fixtures/www-snapshot";

describe("WwwUsageView routing dashboard", () => {
	test("projects observed model, stage, role, effort, and recent routing without inventing history", () => {
		const snapshot = wwwFixture();
		snapshot.sessionUsage = {
			totalTokens         : 53_400_000,
			observedTotalTokens : 53_400_000,
			unattributedTokens  : 0,
			models              : [
				{ model: "gpt-5.6-luna", effort: "high", interactiveRootTurns: 20, interactiveTokens: 4_800_000, detachedInvocations: 1, detachedTokens: 100_000, totalTokens: 4_900_000 },
				{ model: "gpt-5.6-sol", effort: "low", interactiveRootTurns: 180, interactiveTokens: 41_000_000, detachedInvocations: 4, detachedTokens: 600_000, totalTokens: 41_600_000 },
			],
			observationCoverage : { interactive: true, detached: true },
		};
		snapshot.requestRuntime = [{
			schemaVersion: 1, protocolVersion: 1, requestId: "request-1", threadId: "thread-1", turnId: "turn-1", objective: "usage", status: "completed", attempt: 1,
			stages: [
				{ id: "UNDERSTAND", status: "completed", goal: "", input: [], owner: "orchestrator", model: "gpt-5.6-luna", agents: [], tools: [], output: "ok", evidence: [], decision: null, skipReason: null, startedAt: "2026-09-27T10:00:00.000Z", completedAt: "2026-09-27T10:00:08.000Z", next: "DECOMPOSE", evidenceAfterSequence: 0, tasks: [] },
				{ id: "EXECUTE", status: "completed", goal: "", input: [], owner: "orchestrator", model: "gpt-5.6-sol", agents: [], tools: [], output: "ok", evidence: [], decision: null, skipReason: null, startedAt: "2026-09-27T10:01:00.000Z", completedAt: "2026-09-27T10:02:54.000Z", next: "VERIFY", evidenceAfterSequence: 0, tasks: [] },
			],
			previousAttempts: [], deliveries: [], requiredDeliveries: [], events: [], completedAt: "2026-09-27T10:03:00.000Z", startedAt: "2026-09-27T10:00:00.000Z", issues: [], actions: [],
		}];

		const rows = new WwwUsageView(() => snapshot, () => []).render(130);
		const text = rows.map(stripTerminalSequences).join("\n");

		for (const label of ["53.4M", "MODEL SHARE", "STAGE DISTRIBUTION", "MODEL × ROLE", "SELECTED", "RECENT ROUTING", "Sol", "Luna", "EXE", "BUILD", "THINK", "1m 54s"]) expect(text).toContain(label);
		expect(text                                       ).toContain("SELECTED · Sol"                               ) ;
		expect(text                                       ).toContain("·"                                            ) ;
		expect(text                                       ).toContain("일별 token history 저장 계약이 아직 없습니다.") ;
		expect(rows.every(row => visibleWidth(row) <= 130)).toBe     (true                                           ) ;
	});

	test.each([48, 80, 130])("keeps the dashboard bounded at %i columns", width => {
		const rows = new WwwUsageView(() => wwwFixture(), () => []).render(width);
		const text = rows.map(stripTerminalSequences).join("\n");
		expect(text                                         ).toContain("MODEL SHARE") ;
		expect(text                                         ).toContain("미관측"     ) ;
		expect(rows.every(row => visibleWidth(row) <= width)).toBe     (true         ) ;
	});
});
