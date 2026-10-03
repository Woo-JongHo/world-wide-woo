import * as before from "./before";
import * as after from "../../../../src/adapters/inbound/tui/features/tnote/view/operation-report-view";
import { across, runGolden } from "../golden-lib";

const model = (role: string, model: string | null) => ({ role, provider: model ? "openai" : null, model, effort: model ? "high" : null });
const base: any = {
	title: "게시 결과", status: "partial", purposeAndApproach: "목적\n접근", delaysAndBlocks: "", strengths: "잘됨", selfAssessment: "부분 성공",
	activities: [{ description: "Linear 게시", status: "success" }, { description: "CHANGE src/a.ts", status: null }, { description: "│ @@ -3,2 +3,2 @@", status: null }, { description: "│ -old", status: null }, { description: "│ +new", status: null }],
	results: [{ target: "Linear", action: "Comment 게시", status: "success" }, { target: "Obsidian", action: "계약 검증", status: "failed" }],
	blocking: [{ target: "Obsidian", reason: "schema v2 오류", status: "failed" }],
	nextApproach: ["계약 먼저", "그다음 게시"],
	changes: [{ area: "코드", status: "none", detail: "변경 없음" }, { area: "Linear", status: "success", detail: "Comment 게시 성공 아주 긴 설명이 붙어 줄바꿈이 필요한 경우" }],
	evidence: [{ type: "Commit", value: "abc1234" }, { type: "Receipt", value: "4ab672bd" }],
	files: [{ path: "src/a.ts", status: "success", added: 3, deleted: 1, summary: "" }, { path: "docs/very/long/path/to/a/file/name.md", status: "partial", added: null, deleted: null, summary: "요약 설명" }],
	source: ["Receipt 4ab672bd"],
	models: [model("Primary", "gpt-6"), model("Reviewer", null)],
	durationMs: 125_000,
	tokens: { input: 1200, output: 300, total: 1500 },
	comparison: { totalTokens: 1000, basis: "직전 실행" },
	tests: { status: "success", total: 10, passed: 9, failed: 1, skipped: 0, durationMs: 3200, checks: [{ status: "success", command: "bun test", durationMs: 3200 }] },
};
const reports = [
	base,
	{ ...base, status: "success", files: [], models: [], comparison: null, tokens: { input: null, output: null, total: null }, results: [], changes: [], evidence: [], blocking: [] },
	{ ...base, models: [model("Primary", null)], tokens: { input: 5, output: 0, total: 5 }, comparison: { totalTokens: null, basis: "없음" } },
];
runGolden("operation-report-view", across(reports, [1, 10, 44, 59, 60, 72, 89, 90, 100, 140]).map(({ input, width, label }) => ({
	label,
	before: () => before.renderOperationReport(input, width),
	after : () => after.renderOperationReport(input, width),
})));
