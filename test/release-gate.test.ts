import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

function git(root: string, args: string[]): void {
	execFileSync("git", args, { cwd: root, stdio: "ignore" });
}

async function runGate(root: string, args: string[] = []): Promise<{ exitCode: number; output: string }> {
	const script = resolve(import.meta.dir, "../scripts/release-gate.ts");
	const child = Bun.spawn([process.execPath, script, "--repo", root, "--story", "ST-TEST", ...args], { stdout: "pipe", stderr: "pipe" });
	const [exitCode, stdout, stderr] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);
	return { exitCode, output: `${stdout}${stderr}` };
}

describe("release gate hygiene", () => {
	test("blocks an untracked test.skip fixture", async () => {
		const root = await mkdtemp(join(tmpdir(), "www-release-gate-test-"));
		roots.push(root);
		git(root, ["init"]);
		await writeFile(join(root, "README.md"), "fixture\n");
		git(root, ["add", "README.md"]);
		git(root, ["-c", "user.name=fixture", "-c", "user.email=fixture@example.test", "commit", "-m", "baseline"]);
		await mkdir(join(root, ".www", "evidence"), { recursive: true });
		await writeFile(join(root, ".www", "evidence", "ST-TEST.md"), "Status: PASS\n");
		await mkdir(join(root, "test"));
		const skipped = "skip";
		await writeFile(join(root, "test", "hygiene-sentinel.test.ts"), `import { test } from "bun:test"; test.${skipped}("fixture", () => {});\n`);

		const { exitCode, output } = await runGate(root);
		expect(exitCode).toBe(1);
		expect(output).toContain("test/hygiene-sentinel.test.ts: skip/only test");
	});

	test("blocks a hygiene violation in the latest commit", async () => {
		const root = await mkdtemp(join(tmpdir(), "www-release-gate-test-"));
		roots.push(root);
		git(root, ["init"]);
		await writeFile(join(root, "README.md"), "fixture\n");
		git(root, ["add", "README.md"]);
		git(root, ["-c", "user.name=fixture", "-c", "user.email=fixture@example.test", "commit", "-m", "baseline"]);
		await mkdir(join(root, ".www", "evidence"), { recursive: true });
		await writeFile(join(root, ".www", "evidence", "ST-TEST.md"), "Status: PASS\n");
		await mkdir(join(root, "src"));
		await writeFile(join(root, "src", "committed.ts"), `// ${"TO" + "DO"}: remove sentinel\nexport const committed = true;\n`);
		git(root, ["add", "src/committed.ts"]);
		git(root, ["-c", "user.name=fixture", "-c", "user.email=fixture@example.test", "commit", "-m", "violation"]);

		const { exitCode, output } = await runGate(root);
		expect(exitCode).toBe(1);
		expect(output).toContain("release scope: scope=HEAD^..worktree+untracked, base=HEAD^, product files=1");
		expect(output).toContain("src/committed.ts: TODO/FIXME marker");

		const explicitHead = await runGate(root, ["--base", "HEAD"]);
		expect(explicitHead.exitCode).toBe(0);
		expect(explicitHead.output).toContain("release scope: scope=HEAD..worktree+untracked, base=HEAD, product files=0");
		expect(explicitHead.output).toContain("WARNING: resolved scope contains 0 product files");
		expect(explicitHead.output).toContain("RELEASE PASS");
	});

	test("scans the initial commit when no parent is available", async () => {
		const root = await mkdtemp(join(tmpdir(), "www-release-gate-test-"));
		roots.push(root);
		git(root, ["init"]);
		await mkdir(join(root, ".www", "evidence"), { recursive: true });
		await writeFile(join(root, ".www", "evidence", "ST-TEST.md"), "Status: PASS\n");
		await mkdir(join(root, "test"));
		const focused = "only";
		await writeFile(join(root, "test", "committed.test.ts"), `import { test } from "bun:test"; test.${focused}("fixture", () => {});\n`);
		git(root, ["add", "test/committed.test.ts"]);
		git(root, ["-c", "user.name=fixture", "-c", "user.email=fixture@example.test", "commit", "-m", "initial"]);

		const { exitCode, output } = await runGate(root);
		expect(exitCode).toBe(1);
		expect(output).toContain("release scope: scope=all-tracked+untracked, base=<none:no-parent>, product files=1");
		expect(output).toContain("test/committed.test.ts: skip/only test");
	});

	test("scans tracked files at a shallow history boundary", async () => {
		const source = await mkdtemp(join(tmpdir(), "www-release-gate-source-"));
		const shallow = await mkdtemp(join(tmpdir(), "www-release-gate-shallow-"));
		roots.push(source, shallow);
		git(source, ["init"]);
		await writeFile(join(source, "README.md"), "fixture\n");
		git(source, ["add", "README.md"]);
		git(source, ["-c", "user.name=fixture", "-c", "user.email=fixture@example.test", "commit", "-m", "baseline"]);
		await mkdir(join(source, "src"));
		await writeFile(join(source, "src", "committed.ts"), `// ${"FIX" + "ME"}: remove sentinel\nexport const committed = true;\n`);
		git(source, ["add", "src/committed.ts"]);
		git(source, ["-c", "user.name=fixture", "-c", "user.email=fixture@example.test", "commit", "-m", "violation"]);
		await rm(shallow, { recursive: true, force: true });
		execFileSync("git", ["clone", "--depth", "1", "--no-local", source, shallow], { stdio: "ignore" });
		await mkdir(join(shallow, ".www", "evidence"), { recursive: true });
		await writeFile(join(shallow, ".www", "evidence", "ST-TEST.md"), "Status: PASS\n");

		const { exitCode, output } = await runGate(shallow);
		expect(exitCode).toBe(1);
		expect(output).toContain("release scope: scope=all-tracked+untracked, base=<none:no-parent>, product files=1");
		expect(output).toContain("src/committed.ts: TODO/FIXME marker");
	});
});
