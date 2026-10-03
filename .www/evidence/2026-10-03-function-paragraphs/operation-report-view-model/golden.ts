import * as before from "./before";
import * as after from "../../../../src/adapters/inbound/tui/features/tnote/view-model/operation-report-view-model";
import { runGolden } from "../golden-lib";

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
const note: any = {
	id: "note-1", title: "게시 결과", summary, sourceActivityIds: ["a1"],
	completion: { threadId: "thread-1", turnId: "turn-1", number: 1, terminalActivityId: "a2" },
	updatedAt: "2026-09-26T00:00:00.000Z", provenance: { provider: "openai-codex", model: "gpt-5.6-luna", version: "v" }, format: "request-report-v3",
};
const runtime = (overrides: object = {}): any => ({ turnId: "turn-1", primaryModel: "gpt-6", effort: "high", durationMs: 308_000, totalTokens: 21_070_149, files: [], receipt: null, verification: [], ...overrides });
const notes = [
	note,
	{ ...note, provenance: undefined },
	{ ...note, summary: summary.replace(/Test:\n[\s\S]*$/u, "Test:\nNOT RUN · 미실행") },
	{ ...note, summary: summary.replace(/Test:\n[\s\S]*$/u, "") },
	{ ...note, summary: "보고서 형식이 아닌 요약" },
];
const projections = [
	{},
	{ runtime: runtime() },
	{ runtime: runtime({ receipt: { id: "r-1", digest: "d-1", status: "succeeded" } }) },
	{ runtime: runtime({ verification: [{ command: "bun test", status: "passed" }, { command: "tsc", status: "failed" }] }) },
	{ runtime: runtime({ verification: [{ command: "bun test", status: "skipped" }], files: [{ kind: "edit", ref: "src/a.ts", summary: "a" }] }) },
	{ runtime: runtime({ turnId: "other" }) },
	{ previousNote: note },
];
runGolden("operation-report-view-model", notes.flatMap((n, i) => projections.map((p, j) => ({
	label : `note#${i} projection#${j}`,
	before: () => before.projectOperationReport(n, p as any),
	after : () => after.projectOperationReport(n, p as any),
}))));
