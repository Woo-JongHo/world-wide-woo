// Re-runnable parity evidence: the AST reorder tool reproduces the earlier results statement by statement.
// Run from the repository root: bun .www/evidence/2026-10-03-feature-template-types/parity-check.ts <python-mover-path>
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseFiles, plan, render } from "../../../scripts/reorder-sections";
import type { Command, Statement } from "../../../scripts/reorder-sections";

const repo   = process.cwd();
const python = process.argv[2];
const tmp    = mkdtempSync(join(tmpdir(), "parity-"));
// Whitespace and the readability checker's trailing import commas are layout, not content.
const code   = (statement: Statement) => statement.text.replace(/\s+/gu, "").replace(/,\}/gu, "}");

async function check(command: Command, evidence: string, reference: (path: string) => string): Promise<number> {
	const befores = [...new Bun.Glob(`.www/evidence/${evidence}/*/before/**/*.ts`).scanSync({ cwd: repo, dot: true })].filter(path => !path.includes("run1")).sort();
	const inputs  = befores.map((path, index) => { const file = `${command}-${index}.ts`; cpSync(join(repo, path), join(tmp, file)); return file; });
	const parsed  = await parseFiles(tmp, inputs);
	const outputs = inputs.map((file, index) => { const out = `${command}-${index}.out.ts`; const source = parsed.get(file)!; writeFileSync(join(tmp, out), render(source, plan(command, source.statements))); return out; });
	const refs    = befores.map((path, index) => { const ref = `${command}-${index}.ref.ts`; writeFileSync(join(tmp, ref), reference(path)); return ref; });
	const a = await parseFiles(tmp, outputs), b = await parseFiles(tmp, refs);
	let differences = 0;
	for (const [index, out] of outputs.entries()) {
		const left = a.get(out)!.statements.map(code), right = b.get(refs[index]!)!.statements.map(code);
		if (left.length !== right.length || left.some((value, at) => value !== right[at])) { differences++; console.log("DIFF", befores[index]); }
	}
	console.log(`${command}: ${outputs.length} files, statement differences ${differences}`);
	return differences;
}

function pythonMover(path: string): string {
	if (!python) throw new Error("pass the python mover path for the functions reference");
	const copy = join(tmp, "python.ts");
	cpSync(join(repo, path), copy);
	const run = Bun.spawnSync(["python3", python, copy]);
	if (run.exitCode !== 0) throw new Error(`python mover failed on ${path}: ${run.stderr.toString()}`);
	return readFileSync(copy, "utf8");
}

const total = await check("functions", "2026-10-03-feature-template", pythonMover)
	+ await check("types", "2026-10-03-feature-template-types", path => readFileSync(join(repo, path.replace(/^.*\/before\//u, "")), "utf8"));
process.exit(total ? 1 : 0);
