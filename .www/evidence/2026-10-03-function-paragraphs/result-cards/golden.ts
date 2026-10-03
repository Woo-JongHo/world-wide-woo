// Golden comparison: the HEAD version (before.ts) and the current result-cards.ts must render the same rows
// and read snapshot fields in the same order. Run from the repository root: bun <this file>. Exits 1 on any difference.
import * as head from "./before";
import * as next from "../../../../src/adapters/inbound/tui/features/chat/view/result-cards";

type Card = { render(width: number): string[] };
type Make = (module: typeof head, snapshot: any, max: number) => Card;

const cases: { name: string; make: Make; snapshots: any[] }[] = [
	{ name: "bash", make: (m, s, max) => new m.BashResultCard(s, max), snapshots: [
		{ command: "bun test", cwd: "/repo", status: "passed", stdout: "a\nb\nc", stderr: "warn\nerr", exitCode: 0, durationMs: 12 },
		{ command: "ls\nls -la", cwd: "/repo", status: "failed", stdout: "", stderr: "", exitCode: undefined, durationMs: undefined },
		{ command: "한글 명령 🙂", cwd: "/repo", status: "running", stdout: Array.from({ length: 30 }, (_, i) => `line ${i}`).join("\n"), stderr: "e", exitCode: 1, durationMs: undefined },
	] },
	{ name: "tool", make: (m, s, max) => new m.GenericToolResultCard(s, max), snapshots: [
		{ toolName: "github.search", status: "passed", input: "{\"q\":\"x\"}", output: "{\"items\":[1,2]}", durationMs: 5, error: undefined },
		{ toolName: "", status: "failed", input: "plain input", output: "", durationMs: undefined, error: "boom" },
		{ toolName: "t", status: "passed", input: "i", output: Array.from({ length: 20 }, (_, i) => `o${i}`).join("\n"), durationMs: undefined, error: undefined },
	] },
	{ name: "diff", make: (m, s, max) => new m.DiffResultCard(s, max), snapshots: [
		{ title: "src/a.ts", status: "passed", diff: "+add\n-del\n ctx\nplain", durationMs: 3, error: undefined },
		{ title: "", status: "failed", diff: Array.from({ length: 20 }, (_, i) => `+l${i}`).join("\n"), durationMs: undefined, error: "x" },
	] },
];

function run(module: typeof head, make: Make, snapshot: any, max: number, width: number): { rows: string[]; reads: string[] } {
	const reads: string[] = [];
	const traced = new Proxy({ ...snapshot }, { get: (target, key) => { reads.push(String(key)); return target[key as keyof typeof target]; } });
	return { rows: make(module, traced, max).render(width), reads };
}

let compared = 0;
const differences: string[] = [];
for (const { name, make, snapshots } of cases) {
	for (const [index, snapshot] of snapshots.entries()) {
		for (const width of [0, 1, 3, 4, 20, 60, 100]) {
			for (const max of [0, 1, 2, 12]) {
				compared++;
				const before = run(head, make, snapshot, max, width), after = run(next, make, snapshot, max, width);
				if (JSON.stringify(before.rows) !== JSON.stringify(after.rows)) differences.push(`${name}#${index} width=${width} max=${max} rows differ`);
				if (before.reads.join(",") !== after.reads.join(",")) differences.push(`${name}#${index} width=${width} max=${max} read order ${before.reads.join(",")} → ${after.reads.join(",")}`);
			}
		}
	}
}
console.log(`golden: ${compared} renders compared, ${differences.length} differences`);
for (const difference of differences.slice(0, 10)) console.log(`  ${difference}`);
process.exit(differences.length ? 1 : 0);
