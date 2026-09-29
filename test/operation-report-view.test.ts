import { describe, expect, test }               from "bun:test";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { projectOperationReport }               from "../src/adapters/inbound/tui/features/tnote/view-model/operation-report-view-model";
import { renderOperationReport }                from "../src/adapters/inbound/tui/features/tnote/view/operation-report-view";
import type { NoteFeatureProjection }           from "../src/core/application/orchestration/workbench-feature-reads";
import type { WorkbenchTNote }                  from "../src/core/domain/work/workbench";

const summary = [
	"REPORT: request-report-v3",
	"제목:",
	"게시 결과",
	"",
	"요청 목적·접근:",
	"승인된 변경을 게시하고 read-back으로 판정했습니다.",
	"",
	"주요 작업:",
	"Linear 게시\nObsidian 계약 검증",
	"",
	"장시간·차단 작업:",
	"Obsidian schema v2 계약 오류로 차단됨",
	"",
	"잘된 점:",
	"실패를 성공으로 처리하지 않았습니다.",
	"",
	"모델·토큰:",
	"Primary 모델은 관측 없음.",
	"",
	"업무 자체평가:",
	"Linear 성공, Obsidian 실패로 전체 요청은 부분 성공입니다.",
	"",
	"다음 유사 요청:",
	"대상 계약 검증을 적용 전에 실행합니다.",
	"",
	"변경 상태:",
	"코드 변경 없음\nLinear Comment 게시 성공\nObsidian 게시 실패",
	"",
	"Commit·Evidence:",
	"Linear Comment 9112898e-5e3d-40a7-b341-901513386512\nReceipt 4ab672bd",
	"",
	"Test:",
	"Total 1/2\n01. bun test test/a.test.ts : 1.2s · passed\n02. bun test test/b.test.ts : 0.4s · failed",
].join("\n");

const note: WorkbenchTNote = {
	id                : "note-1",
	title             : "게시 결과",
	summary,
	sourceActivityIds : ["a1", "a2"],
	completion        : { threadId: "thread-1", turnId: "turn-1", number: 1, terminalActivityId: "a2" },
	updatedAt         : "2026-09-26T00:00:00.000Z",
	provenance        : { provider: "openai-codex", model: "gpt-5.6-luna", version: "gpt-5.6-luna" },
	format            : "request-report-v3",
};

function projection(): NoteFeatureProjection {
	return {
		projectId : "project-1",
		threadId  : "thread-1",
		notes     : [note],
		read      : { status: "ready", error: null },
		runtime: {
			turnId       : "turn-1",
			primaryModel : null,
			effort       : null,
			durationMs   : 308_000,
			totalTokens  : 21_070_149,
			files        : [],
			receipt      : null,
			verification : [],
		},
	};
}

function reportWithTest(test: string): WorkbenchTNote {
	return { ...note, summary: summary.replace(/Test:\n[\s\S]*$/u, `Test:\n${test}`) };
}

describe("Operation Report", () => {
	test("renders a glanceable partial snapshot and structured observed facts", () => {
		const report = projectOperationReport(note, projection());
		const output = stripTerminalSequences(renderOperationReport(report, 100).join("\n"));

		expect(output).toContain("OUTPUT · OPERATION REPORT") ;
		expect(output).toContain("△ PARTIAL"                ) ;
		expect(output).toContain("5m 08s"                   ) ;
		expect(output).toContain("Primary Agent"            ) ;
		expect(output).toContain("UNKNOWN"                  ) ;
		expect(output).toContain("Detached Narrator"        ) ;
		expect(output).toContain("openai-codex"             ) ;
		expect(output).toContain("gpt-5.6-luna"             ) ;
		expect(output).toContain("21,070,149"               ) ;
		const modelHeader = output.split("\n").find(line => line.includes("ROLE") && line.includes("MODEL"));
		const primaryRow = output.split("\n").find(line => line.includes("Primary Agent"));
		expect(modelHeader)    .toContain("INPUT"         ) ;
		expect(modelHeader)    .toContain("OUTPUT"        ) ;
		expect(modelHeader)    .toContain("TOTAL"         ) ;
		expect(primaryRow )    .toContain("21,070,149"    ) ;
		expect(output     )    .toContain("Status"        ) ;
		expect(output     )    .toContain("✕ FAILED"      ) ;
		expect(output     )    .toContain("Total"         ) ;
		expect(output     )    .toContain("2"             ) ;
		expect(output     )    .toContain("Skipped      —") ;
		expect(output     ).not.toContain('"eventType"'   ) ;
	});

	test("switches comparison-shaped content to stacked rows at narrow width", () => {
		const report = projectOperationReport(note, projection()) ;
		const rows   = renderOperationReport(report, 44)          ;
		const output = stripTerminalSequences(rows.join("\n"))    ;

		expect(rows.every(row => visibleWidth(row) === 44)).toBe     (true           ) ;
		expect(output                                     ).toContain("결과"         ) ;
		expect(output                                     ).toContain("△ PARTIAL"    ) ;
		expect(output                                     ).toContain("Primary Agent") ;
		expect(output                                     ).toContain("  Model"      ) ;
		expect(output                                     ).toContain("UNKNOWN"      ) ;
	});

	test("keeps zero distinct from unknown and distinguishes unobserved tests", () => {
		const noObservation = reportWithTest("테스트 실행 관측 없음");
		const report = projectOperationReport(noObservation, {
			runtime: { ...projection().runtime!, totalTokens: 0 },
		});
		const output = stripTerminalSequences(renderOperationReport(report, 100).join("\n"));

		expect(output)    .toContain("Total"         ) ;
		expect(output)    .toContain("0"             ) ;
		expect(output)    .toContain("— NOT OBSERVED") ;
		expect(output).not.toContain("— NOT RUN"     ) ;
	});

	test("marks an explicitly skipped test run as not run", () => {
		const report = projectOperationReport(reportWithTest("NOT RUN · 요청 범위에서 테스트를 실행하지 않음"), projection());
		const output = stripTerminalSequences(renderOperationReport(report, 100).join("\n"));

		expect(output).toContain("— NOT RUN");
		expect(output).toContain("Total        —");
	});

	test("does not attach runtime facts from a different turn", () => {
		const report = projectOperationReport(note, {
			runtime: { ...projection().runtime!, turnId: "another-turn" },
		});
		const output = stripTerminalSequences(renderOperationReport(report, 100).join("\n"));

		expect(output)    .toContain("Primary Agent") ;
		expect(output)    .toContain("UNKNOWN"      ) ;
		expect(output).not.toContain("21,070,149"   ) ;
		expect(output).not.toContain("5m 08s"       ) ;
	});

	test("uses a compact comparison row at medium width", () => {
		const output = stripTerminalSequences(renderOperationReport(projectOperationReport(note, projection()), 72).join("\n"));

		expect(output).toContain("Duration  5m 08s  ← —  Δ —") ;
		expect(output).toContain("SOURCE"                    ) ;
		expect(output).toContain("Turn thread-1 / turn-1"    ) ;
	});

	test("renders receipt changes without inventing line statistics", () => {
		const runtime = {
			...projection().runtime!,
			files: [{ kind: "file", ref: "src/example.ts", summary: "renderer updated" }],
			receipt: { id: "receipt-1", digest: "digest-1", status: "completed" },
		};
		const output = stripTerminalSequences(renderOperationReport(projectOperationReport(note, { runtime }), 100).join("\n"));

		expect(output)    .toContain("11. 변경 파일"   ) ;
		expect(output)    .toContain("src/example.ts"  ) ;
		expect(output)    .toContain("renderer updated") ;
		expect(output)    .toContain("receipt-1"       ) ;
		expect(output)    .toContain("digest-1"        ) ;
		expect(output).not.toContain("+42"             ) ;
	});

	test("promotes observed CHANGE rows into aligned file statistics", () => {
		const changed = {
			...note,
			summary: summary.replace(
				"Linear 게시\nObsidian 계약 검증",
				"✓ CHANGE  project-workbench.ts                 +42  -41   done\n"
				+ "│ @@ -120,2 +120,2 @@\n"
				+ "│ -const state = oldValue;\n"
				+ "│ +const state = newValue;\n"
				+ "✓ CHANGE  project-workbench-recording.test.ts  +18   -3   done\n"
				+ "✓ CHANGE  workbench-shell.ts                    +7   -2   done\n"
				+ "✓ CHANGE  plan-activity-view.test.ts            +9   -1   done\n"
				+ "✓ CHECK   related tests                                   pass",
			),
		};
		const output = stripTerminalSequences(renderOperationReport(projectOperationReport(changed, projection()), 100).join("\n"));

		expect(output)    .toContain("project-workbench.ts"               ) ;
		expect(output)    .toContain("+42"                                ) ;
		expect(output)    .toContain("-41"                                ) ;
		expect(output)    .toContain("4 files"                            ) ;
		expect(output)    .toContain("+76"                                ) ;
		expect(output)    .toContain("-47"                                ) ;
		expect(output)    .toContain("✓ CHANGE  project-workbench.ts"     ) ;
		expect(output)    .toContain("OLD  NEW"                           ) ;
		expect(output)    .toContain(" 120      - const state = oldValue;") ;
		expect(output)    .toContain("      120 + const state = newValue;") ;
		expect(output).not.toMatch  (/\d{2}\s+·\s+│ [+-]/u                ) ;
		expect(output)    .toContain("✓ CHECK   related tests"            ) ;
		expect(output).not.toContain("01  ✓  ✓ CHANGE"                    ) ;
	});

	test("keeps a diff gutter on every wrapped visual row", () => {
		const changed = {
			...note,
			summary: summary.replace("Linear 게시\nObsidian 계약 검증", `✓ CHANGE  example.ts  +1  -0  done\n│ +${"긴 변경 내용 ".repeat(12)}`),
		};
		const output = stripTerminalSequences(renderOperationReport(projectOperationReport(changed, projection()), 42).join("\n"));
		const diffRows = output.split("\n").filter(line => line.includes("긴 변경 내용"));

		expect(diffRows.length                                      ).toBeGreaterThan(1           ) ;
		expect(diffRows[0]                                          ).toMatch        (/^\s+1 \+ /u) ;
		expect(diffRows.slice(1).every(line => /^\s+│ /u.test(line))).toBe           (true        ) ;
	});

	test("keeps renderer omission policy out of the operation report", () => {
		const changed = {
			...note,
			summary: summary.replace(
				"Linear 게시\nObsidian 계약 검증",
				"[공개 Source 일부 생략]  /Users/example/private/test/www-welcome-cache.test.ts\n✓ CHECK  related tests  pass",
			),
		};
		const output = stripTerminalSequences(renderOperationReport(projectOperationReport(changed, projection()), 100).join("\n"));

		expect(output).not.toContain("공개 Source 일부 생략"     ) ;
		expect(output).not.toContain("/Users/example/private"    ) ;
		expect(output)    .toContain("CHECK  related tests  pass") ;
	});

	test("renders observed input output totals and their ratio", () => {
		const measured = { ...note, summary: summary.replace("Primary 모델은 관측 없음.", "Input 1,200 Output 300 Total 1,500") };
		const output = stripTerminalSequences(renderOperationReport(projectOperationReport(measured, { runtime: { ...projection().runtime!, totalTokens: null } }), 100).join("\n"));

		expect(output).toContain("1,200"  ) ;
		expect(output).toContain("300"    ) ;
		expect(output).toContain("1,500"  ) ;
		expect(output).toContain("4.0 : 1") ;
	});

	test("compares total tokens only with an explicitly selected comparable report", () => {
		const current  = { ...note, summary: summary.replace("Primary 모델은 관측 없음.", "Total 1,500") }                      ;
		const previous = { ...note, id: "note-previous", summary: summary.replace("Primary 모델은 관측 없음.", "Total 1,000") } ;
		const report   = projectOperationReport(current, { previousNote: previous })                                            ;
		const output   = stripTerminalSequences(renderOperationReport(report, 100).join("\n"))                                  ;

		expect(output).toContain("Previous total") ;
		expect(output).toContain("1,000"         ) ;
		expect(output).toContain("+500"          ) ;
		expect(output).toContain("same title"    ) ;
	});

	test("renders explicit success and failed overall snapshots", () => {
		const success = { ...note, summary: summary.replace("Linear 성공, Obsidian 실패로 전체 요청은 부분 성공입니다.", "최종 판정 전체 요청 성공") };
		const failed  = { ...note, summary: summary.replace("Linear 성공, Obsidian 실패로 전체 요청은 부분 성공입니다.", "최종 판정 전체 요청 실패") };

		expect(stripTerminalSequences(renderOperationReport(projectOperationReport(success, {}), 100).join("\n"))).toContain("✓ SUCCESS");
		expect(stripTerminalSequences(renderOperationReport(projectOperationReport(failed, {}), 100).join("\n"))).toContain("✕ FAILED");
	});

	test("does not reverse negated failure language into a failed status", () => {
		const safe = { ...note, summary: summary.replace("코드 변경 없음", "Code 오류 없이 적용 완료") };
		const output = stripTerminalSequences(renderOperationReport(projectOperationReport(safe, projection()), 100).join("\n"));

		expect(output).toContain("Code 오류 없이 적용 완료");
		expect(output).not.toContain("Code         ✕ FAILED");
	});

	test("does not promote zero tests or negated positive words", () => {
		const noTests = reportWithTest("Total 0/0\n테스트 실행 관측 없음")                                                             ;
		const negated = { ...noTests, summary: noTests.summary.replace("코드 변경 없음", "GitHub 푸시 미적용\nDocument 결과 불일치") } ;
		const output  = stripTerminalSequences(renderOperationReport(projectOperationReport(negated, projection()), 100).join("\n"))   ;

		expect(output)    .toContain("— NOT OBSERVED"        ) ;
		expect(output).not.toContain("GitHub       ✓ SUCCESS") ;
		expect(output).not.toContain("Document     ✓ SUCCESS") ;
	});
});
