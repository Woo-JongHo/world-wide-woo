#!/usr/bin/env bun

import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const DEFAULT_STORIES = [
	"ST-011-06",
	"ST-011-07",
	"ST-011-08",
	"ST-011-09",
	"ST-011-10",
	"ST-011-11",
	"ST-011-12",
	"ST-011-13",
] as const;

type Options = {
	repo: string;
	evidenceDir: string;
	base: string | null;
	stories: string[];
	platformCheck: boolean;
};

type ProductScope = {
	scope: string;
	base: string;
	files: string[];
};

function parseArgs(argv: string[]): Options {
	const options: Options = {
		repo: process.cwd(),
		evidenceDir: ".omo/evidence",
		base: null,
		stories: [],
		platformCheck: false,
	};

	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (argument === "--platform-check") {
			options.platformCheck = true;
		} else if (argument === "--repo") {
			options.repo = argv[++index] ?? options.repo;
		} else if (argument === "--evidence-dir") {
			options.evidenceDir = argv[++index] ?? options.evidenceDir;
		} else if (argument === "--base") {
			options.base = argv[++index] ?? options.base;
		} else if (argument === "--story") {
			const story = argv[++index];
			if (story) options.stories.push(story);
		} else if (argument === "--help" || argument === "-h") {
			printHelp();
			process.exit(0);
		} else {
			throw new Error(`알 수 없는 인자: ${argument}`);
		}
	}

	if (options.stories.length === 0) options.stories = [...DEFAULT_STORIES];
	options.repo = resolve(options.repo);
	options.evidenceDir = resolve(options.repo, options.evidenceDir);
	return options;
}

function printHelp(): void {
	console.log(`사용법:
	  bun scripts/release-gate.ts [--repo DIR] [--base REF] [--evidence-dir DIR] [--story ST-ID ...]
	  bun scripts/release-gate.ts --platform-check

기본 범위: HEAD^..worktree + untracked 파일
부모가 없는 initial/shallow HEAD: 전체 tracked + untracked 파일
여러 커밋을 포함한 release: --base <last-release-tag>를 지정하세요.

옵션:
  --repo DIR          검사할 Git 저장소 (기본: 현재 디렉터리)
  --base REF          REF 이후 worktree + untracked 범위를 검사
  --evidence-dir DIR  Story evidence 디렉터리 (기본: .omo/evidence)
  --story ST-ID       검사할 Story ID (반복 가능)
  --platform-check    현재 OS의 플랫폼 진입점만 검사

기본 실행은 resolved scope의 product 파일과 Story evidence를 모두 검사합니다.
--platform-check는 현재 OS에서 path/process/CRLF/file-lock 진입점만 실행합니다.`);
}

function gitList(repo: string, args: string[]): string[] {
	try {
		const output = execFileSync("git", args, { cwd: repo, encoding: "utf8" });
		return output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
	} catch (error) {
		throw new Error(`git ${args.join(" ")} 실행 실패: ${String(error)}`);
	}
}

function gitRefExists(repo: string, ref: string): boolean {
	try {
		execFileSync("git", ["rev-parse", "--verify", "--quiet", ref], { cwd: repo, stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}

function resolveProductScope(options: Options): ProductScope {
	const defaultBase = "HEAD^";
	const hasDefaultBase = gitRefExists(options.repo, defaultBase);
	const base = options.base ?? (hasDefaultBase ? defaultBase : null);
	const tracked = base
		? gitList(options.repo, ["diff", "--name-only", "--diff-filter=ACMRTUXB", base, "--"])
		: gitList(options.repo, ["ls-files"]);
	const untracked = gitList(options.repo, ["ls-files", "--others", "--exclude-standard"]);
	const files = [...new Set([...tracked, ...untracked])];
	const productFiles = files.filter((file) => {
		const product = file === "package.json" || file.startsWith("src/") || file.startsWith("scripts/") || file.startsWith("test/");
		const source = /\.(?:[cm]?js|tsx?|jsx?)$/i.test(file);
		return product && source && file !== "scripts/release-gate.ts";
	});
	return {
		scope: base ? `${base}..worktree+untracked` : "all-tracked+untracked",
		base: base ?? "<none:no-parent>",
		files: productFiles,
	};
}

async function scanProductFiles(options: Options, files: string[]): Promise<string[]> {
	const violations: string[] = [];
	const patterns: Array<[string, RegExp]> = [
		["TODO/FIXME marker", /(?:\/\/|\/\*|#)\s*(?:TODO|FIXME)\b|\bTODO\s*:/g],
		["skip/only test", /\.(?:skip|only)\s*\(/g],
		["NotImplemented", /NotImplemented|not implemented/gi],
		["placeholder", /placeholder/gi],
	];
	for (const file of files) {
		const absolute = resolve(options.repo, file);
		const source = await readFile(absolute, "utf8");
		for (const [label, pattern] of patterns) {
			pattern.lastIndex = 0;
			if (pattern.test(source)) violations.push(`${file}: ${label}`);
		}
	}
	return violations;
}

async function readEvidenceStatus(path: string): Promise<string | null> {
	try {
		const content = await readFile(path, "utf8");
		const jsonStatus = path.endsWith(".json")
			? (() => {
				try {
					const parsed = JSON.parse(content) as { status?: unknown };
					return typeof parsed.status === "string" ? parsed.status : null;
				} catch {
					return null;
				}
			})()
			: null;
		const lineStatus = content.match(/(?:status|result|판정)\s*[:=]\s*(PASS|BLOCKED|FAIL)\b/i)?.[1];
		return (jsonStatus ?? lineStatus)?.toUpperCase() ?? null;
	} catch {
		return null;
	}
}

async function verifyEvidence(options: Options): Promise<string[]> {
	const failures: string[] = [];
	for (const story of options.stories) {
		const candidates = [".md", ".json", ".txt"].map((extension) => join(options.evidenceDir, `${story}${extension}`));
		const path = candidates.find((candidate) => Bun.file(candidate).size > 0);
		if (!path) {
			failures.push(`${story}: evidence 파일 없음 (${options.evidenceDir})`);
			continue;
		}
		const status = await readEvidenceStatus(path);
		if (!status) failures.push(`${story}: evidence에 PASS/BLOCKED/FAIL 판정 없음 (${path})`);
		else if (status !== "PASS") failures.push(`${story}: ${status} (${path})`);
		else console.log(`evidence PASS ${story}: ${path}`);
	}
	return failures;
}

async function runPlatformChecks(): Promise<void> {
	const directory = await mkdtemp(join(tmpdir(), "www-release-gate-"));
	try {
		const nested = join(directory, "fixtures", "windows", "path-check.txt");
		await mkdir(resolve(directory, "fixtures", "windows"), { recursive: true });
		await Bun.write(nested, "path-ok\n");
		if ((await Bun.file(nested).text()) !== "path-ok\n") throw new Error("path write/read mismatch");

		const child = Bun.spawn([process.execPath, "-e", "process.stdout.write('process-ok')"], {
			stdout: "pipe",
			stderr: "pipe",
		});
		const exitCode = await child.exited;
		const output = await new Response(child.stdout).text();
		if (exitCode !== 0 || output !== "process-ok") throw new Error(`child process mismatch: ${exitCode}/${output}`);

		const crlfPath = join(directory, "crlf-fixture.md");
		const crlf = "# Title\r\n- [ ] Windows line\r\n";
		await writeFile(crlfPath, crlf, "utf8");
		const raw = await readFile(crlfPath, "utf8");
		if (!raw.includes("\r\n") || raw.replaceAll("\r\n", "\n").split("\n").length !== 3) throw new Error("CRLF normalization mismatch");

		const lockPath = join(directory, "lock-fixture.txt");
		await writeFile(lockPath, "lock-compatible", "utf8");
		const first = await open(lockPath, "r");
		const second = await open(lockPath, "r");
		await Promise.all([first.readFile("utf8"), second.readFile("utf8")]);
		await first.close();
		await second.close();
		const renamed = join(directory, "lock-fixture-renamed.txt");
		await rename(lockPath, renamed);
		if ((await readFile(renamed, "utf8")) !== "lock-compatible") throw new Error("rename after file close mismatch");

		console.log(`platform PASS ${process.platform}: path, process, CRLF, file-lock/rename`);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}

async function main(): Promise<void> {
	const options = parseArgs(process.argv.slice(2));
	if (options.platformCheck) {
		await runPlatformChecks();
		return;
	}

	const productScope = resolveProductScope(options);
	console.log(`release scope: scope=${productScope.scope}, base=${productScope.base}, product files=${productScope.files.length}`);
	if (productScope.files.length === 0) {
		console.warn("WARNING: resolved scope contains 0 product files; verify --base (for example, --base HEAD is a no-op without worktree changes)");
	}
	const violations = await scanProductFiles(options, productScope.files);
	const evidenceFailures = await verifyEvidence(options);
	if (violations.length > 0 || evidenceFailures.length > 0) {
		console.error("RELEASE BLOCKED");
		for (const failure of [...violations, ...evidenceFailures]) console.error(`- ${failure}`);
		process.exitCode = 1;
		return;
	}
	console.log(`RELEASE PASS: ${options.stories.length} stories, ${productScope.files.length} product files scanned`);
}

await main().catch((error: unknown) => {
	console.error(`RELEASE GATE ERROR: ${error instanceof Error ? error.message : String(error)}`);
	process.exitCode = 1;
});
