#!/usr/bin/env bun

import { readdir, readFile, stat } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import {
	findWorkReference,
	parseWorkTraceabilityManifest,
	referenceKey,
	relatedWorkLinks,
	type WorkReference,
	type WorkTraceabilityManifest,
} from "../src/core/domain/work/traceability.js";
import {
	extractLinearIssueIdsByPath,
	validateLinearAnnotations,
	validateWorkTraceabilityManifest,
	type LinearAnnotation,
} from "../src/core/domain/work/traceability-validator.js";

interface Options {
	readonly check: boolean;
	readonly json: boolean;
	readonly manifestPath: string;
	readonly query?: string;
}

interface Connection {
	readonly direction: "from" | "to";
	readonly relation: string;
	readonly reference: WorkReference;
}

function parseArgs(argv: readonly string[], repoRoot: string): Options {
	let check = false;
	let json = false;
	let manifestPath = resolve(repoRoot, ".www/control-ledger/traceability.json");
	let query: string | undefined;
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index]!;
		if (argument === "--check") check = true;
		else if (argument === "--json") json = true;
		else if (argument === "--manifest") {
			const value = argv[++index];
			if (!value) throw new Error("--manifest 뒤에 경로를 지정해야 합니다");
			manifestPath = resolve(repoRoot, value);
		} else if (argument === "--help" || argument === "-h") {
			printHelp();
			return { check: false, json, manifestPath };
		} else if (argument.startsWith("--")) throw new Error(`알 수 없는 옵션: ${argument}`);
		else if (query) throw new Error("조회 대상은 하나만 지정할 수 있습니다");
		else query = argument;
	}
	if (check && query) throw new Error("--check와 조회 대상을 함께 지정할 수 없습니다");
	if (!check && !query && !argv.includes("--help") && !argv.includes("-h")) throw new Error("조회 대상 또는 --check를 지정해야 합니다");
	return { check, json, manifestPath, query };
}

function printHelp(): void {
	console.log(`사용법:
  bun scripts/code-map.ts WOO-690
  bun scripts/code-map.ts src/core/application/project-workbench.ts
  bun scripts/code-map.ts <Linear UUID-or-URL> --json
  bun scripts/code-map.ts --check [--json]

코드 맵은 식별자, 관계, 저장소 위치만 반환합니다. Linear 상태나 수락 여부는 판정하지 않습니다.`);
}

async function readManifest(path: string): Promise<WorkTraceabilityManifest> {
	return parseWorkTraceabilityManifest(JSON.parse(await readFile(path, "utf8")));
}

function connectionFor(reference: WorkReference, link: WorkTraceabilityManifest["links"][number]): Connection {
	const from = referenceKey(link.from) === referenceKey(reference);
	return { direction: from ? "from" : "to", relation: link.relation, reference: from ? link.to : link.from };
}

async function collectTypeScriptFiles(repoRoot: string, directory: "src" | "scripts" | "test"): Promise<string[]> {
	const root = resolve(repoRoot, directory);
	const files: string[] = [];
	async function visit(path: string): Promise<void> {
		for (const entry of await readdir(path, { withFileTypes: true })) {
			const child = resolve(path, entry.name);
			if (entry.isDirectory()) await visit(child);
			else if (entry.isFile() && entry.name.endsWith(".ts")) files.push(relative(repoRoot, child).split(sep).join("/"));
		}
	}
	await visit(root);
	return files;
}

async function collectAnnotations(repoRoot: string): Promise<LinearAnnotation[]> {
	const paths = (await Promise.all([
		collectTypeScriptFiles(repoRoot, "src"),
		collectTypeScriptFiles(repoRoot, "scripts"),
		collectTypeScriptFiles(repoRoot, "test"),
	])).flat();
	const sources = await Promise.all(paths.sort().map(async path => ({
		path,
		source: await readFile(resolve(repoRoot, path), "utf8"),
	})));
	const issueIdsByPath = await extractLinearIssueIdsByPath(sources);
	const annotations: LinearAnnotation[] = [];
	for (const path of paths.sort()) {
		const issueIds = issueIdsByPath.get(path) ?? [];
		if (issueIds.length === 0) continue;
		annotations.push({ path, kind: path.startsWith("test/") ? "test" : "code", issueIds });
	}
	return annotations;
}

async function pathExistsInside(repoRoot: string, repoRelativePath: string): Promise<boolean> {
	const absolute = resolve(repoRoot, repoRelativePath);
	const prefix = repoRoot.endsWith(sep) ? repoRoot : `${repoRoot}${sep}`;
	if (absolute !== repoRoot && !absolute.startsWith(prefix)) return false;
	return stat(absolute).then(value => value.isFile(), () => false);
}

/** @linear WOO-695 */
export async function runCodeMap(argv: readonly string[], repoRoot = resolve(import.meta.dir, "..")): Promise<number> {
	const options = parseArgs(argv, repoRoot);
	if (!options.check && !options.query) return 0;
	const manifest = await readManifest(options.manifestPath);

	if (options.check) {
		await validateWorkTraceabilityManifest(manifest, { exists: path => pathExistsInside(repoRoot, path) });
		const annotationSummary = validateLinearAnnotations(manifest, await collectAnnotations(repoRoot), { requireCodeDeclaration: true });
		const unlinkedIssues = manifest.references
			.filter(reference => reference.kind === "linear-issue" && relatedWorkLinks(manifest, reference).length === 0)
			.map(reference => reference.id);
		const result = {
			ok: true,
			validation: "offline",
			references: manifest.references.length,
			links: manifest.links.length,
			annotations: annotationSummary,
			unlinkedIssues,
		};
		if (options.json) console.log(JSON.stringify(result, null, 2));
		else {
			console.log(`코드 맵 검사 통과 (오프라인): 참조 ${result.references}개, 연결 ${result.links}개`);
			console.log(`@linear 선언: 전체 ${annotationSummary.declarations}개, 제품 코드 ${annotationSummary.codeDeclarations}개`);
			console.log(`미연결 이슈: ${unlinkedIssues.length === 0 ? "없음" : unlinkedIssues.join(", ")}`);
		}
		return 0;
	}

	const reference = findWorkReference(manifest, options.query!);
	if (!reference) throw new Error(`등록되지 않은 조회 대상: ${options.query}`);
	const connections = relatedWorkLinks(manifest, reference).map(link => connectionFor(reference, link));
	const result = { reference, connected: connections.length > 0, connections };
	if (options.json) console.log(JSON.stringify(result, null, 2));
	else {
		console.log(referenceKey(reference));
		if (reference.kind === "linear-issue") {
			console.log(`  uuid ${reference.uuid}`);
			console.log(`  url ${reference.url}`);
		}
		if (connections.length === 0) console.log("  현재 스냅샷 연결 없음");
		for (const connection of connections) {
			const arrow = connection.direction === "from" ? "->" : "<-";
			console.log(`  ${arrow} ${connection.relation} ${referenceKey(connection.reference)}`);
		}
	}
	return 0;
}

if (import.meta.main) {
	runCodeMap(process.argv.slice(2)).then(
		code => { process.exitCode = code; },
		error => {
			console.error(error instanceof Error ? error.message : String(error));
			process.exitCode = 1;
		},
	);
}
