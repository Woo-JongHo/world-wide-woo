import * as before from "./before";
import * as after from "../../../../src/adapters/inbound/tui/features/test/view/www-test-view";
import { runGolden } from "../golden-lib";

const suite = (name: string, fail: number, failures: any[] = []) => ({ name, pass: 3, fail, skip: 0, durationMs: 120, failures });
const run = (id: string, sequence: number, command: string, status: string, extra: object = {}): any => ({
	id, turnId: "t1", command, executedCommand: command, status, exitCode: status === "failed" ? 1 : 0, durationMs: 1500 + sequence, pass: 9, fail: status === "failed" ? 1 : 0, skip: 1,
	suites: [suite("test/a.test.ts", 0), suite("test/b.test.ts with a very long suite name that wraps", status === "failed" ? 1 : 0, status === "failed" ? [{ name: "renders x", rawError: "Expected 1\nReceived 2\n\nat a.ts:3" }] : [])],
	failureNames: [], totalsSource: "command-output", outputTruncated: false, sequence, ...extra,
});
const workspaces: any[] = [
	{ runs: [] },
	{ runs: [run("r1", 1, "bun test", "passed")] },
	{ runs: [run("r1", 1, "bun test", "failed"), run("r2", 2, "tsc --noEmit", "passed"), run("r3", 3, "bun test", "passed", { outputTruncated: true, totalsSource: "unobserved" })] },
	{ runs: Array.from({ length: 12 }, (_, i) => run(`r${i}`, i, i % 2 ? "bun test" : "bun run check", i % 3 ? "passed" : "failed", i === 11 ? { totalsSource: "log-readback", pass: null, fail: null, skip: null, status: "running" } : {})) },
	{ runs: [run("r1", 1, "bun test", "passed", { suites: Array.from({ length: 11 }, (_, i) => suite(`s${i}`, i % 5 === 0 ? 1 : 0, [{ name: "f", rawError: "" }])) })] },
];
const narrations: any[] = [{ id: "t1:r1", summary: "타입과 테스트를 확인합니다." }];
runGolden("www-test-view", workspaces.flatMap((workspace, i) => [null, "r0", "r1", "missing"].flatMap(selected => (["ko", "en"] as const).flatMap(language => [10, 40, 100].map(width => ({
	label : `#${i} selected=${selected} ${language} width=${width}`,
	before: () => before.renderWwwTestView(workspace, width, selected, language, narrations),
	after : () => after.renderWwwTestView(workspace, width, selected, language, narrations),
}))))));
