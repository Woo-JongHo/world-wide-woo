#!/usr/bin/env bun

import { existsSync, realpathSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";

interface Diagnostic {
	file    : string;
	line    : number;
	column  : number;
	code    : string;
	message : string;
}

interface Options {
	maxErrors : number;
	top       : number;
	file      : string | null;
}

function naturalNumber(name: string, value: string): number {
	if (!/^\d+$/u.test(value)) throw new Error(`${name}에는 0 이상의 정수를 지정해야 합니다: ${value}`);
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed)) throw new Error(`${name}에는 안전한 정수를 지정해야 합니다: ${value}`);
	return parsed;
}

function repositoryPath(root: string, value: string): string {
	const absolute = resolve(root, value);
	const path     = relative(root, absolute).replaceAll("\\", "/");
	if (!path || path === ".." || path.startsWith("../")) throw new Error(`--file은 저장소 안의 파일이어야 합니다: ${value}`);
	if (!existsSync(absolute) || !statSync(absolute).isFile()) throw new Error(`--file 대상이 실제 파일이 아닙니다: ${value}`);
	const physical = relative(realpathSync(root), realpathSync(absolute)).replaceAll("\\", "/");
	if (physical === ".." || physical.startsWith("../")) throw new Error(`--file의 실제 대상이 저장소 밖에 있습니다: ${value}`);
	return path;
}

function options(root: string): Options {
	const values = new Map<string, string>();
	for (let index = 2; index < process.argv.length; index += 2) {
		const name  = process.argv[index];
		const value = process.argv[index + 1];
		if (name !== "--max-errors" && name !== "--top" && name !== "--file") throw new Error(`알 수 없는 옵션: ${name ?? ""}`);
		if (values.has(name)) throw new Error(`중복 옵션: ${name}`);
		if (!value || value.startsWith("--")) throw new Error(`${name} 값이 필요합니다.`);
		values.set(name, value);
	}
	return {
		maxErrors : naturalNumber("--max-errors", values.get("--max-errors") ?? "0"),
		top       : naturalNumber("--top", values.get("--top") ?? "20"),
		file      : values.has("--file") ? repositoryPath(root, values.get("--file") ?? "") : null,
	};
}

function diagnostic(match: RegExpMatchArray): Diagnostic {
	const file    = match[1];
	const line    = match[2];
	const column  = match[3];
	const code    = match[4];
	const message = match[5];
	if (!file || !line || !column || !code || !message) throw new Error(`TypeScript 진단을 해석할 수 없습니다: ${match[0]}`);
	return {
		file    : file.replaceAll("\\", "/").replace(/^\.\//u, ""),
		line    : Number(line),
		column  : Number(column),
		code,
		message,
	};
}

function errorMessage(value: unknown): string {
	return value instanceof Error ? value.message : String(value);
}

function runTypeScript(root: string, binary: string) {
	try {
		return Bun.spawnSync(
			[binary, "--noEmit", "--exactOptionalPropertyTypes", "--pretty", "false"],
			{ cwd: root, stdout: "pipe", stderr: "pipe" },
		);
	} catch (error) {
		console.error(`TypeScript 실행 실패: ${errorMessage(error)}`);
		process.exit(2);
	}
}

function compareText(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}

const root               = process.cwd();
const binary             = resolve(root, "node_modules/.bin/tsc");
const { maxErrors, top, file } = options(root);
const result             = runTypeScript(root, binary);
const decoder     = new TextDecoder();
const output      = [decoder.decode(result.stdout), decoder.decode(result.stderr)].filter(Boolean).join("\n");
const pattern     = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.+)$/gmu;
const diagnostics = [...output.matchAll(pattern)].map(diagnostic);

if (result.exitCode !== 0 && diagnostics.length === 0) {
	console.error(output.trim() || `TypeScript 실행 실패: exit ${result.exitCode}`);
	process.exit(2);
}

const byFile = new Map<string, number>();
const byCode = new Map<string, number>();
for (const diagnostic of diagnostics) {
	byFile.set(diagnostic.file, (byFile.get(diagnostic.file) ?? 0) + 1);
	byCode.set(diagnostic.code, (byCode.get(diagnostic.code) ?? 0) + 1);
}

const files = [...byFile]
	.sort((left, right) => right[1] - left[1] || compareText(left[0], right[0]));
const codes = [...byCode]
	.sort((left, right) => right[1] - left[1] || compareText(left[0], right[0]));
const status = diagnostics.length <= maxErrors ? "PASS" : "FAIL";

console.log(`${status} exactOptionalPropertyTypes errors=${diagnostics.length} max=${maxErrors} files=${byFile.size}`);
for (const [file, count] of files.slice(0, top)) console.log(`${String(count).padStart(3)}  ${file}`);
if (codes.length > 0) console.log(`codes  ${codes.map(([code, count]) => `${code}=${count}`).join(" ")}`);

if (file) {
	const selected = diagnostics.filter(diagnostic => diagnostic.file === file);
	console.log(`target errors=${selected.length} file=${file}`);
	for (const diagnostic of selected) {
		console.log(`  ${diagnostic.file}(${diagnostic.line},${diagnostic.column}) ${diagnostic.code} ${diagnostic.message}`);
	}
}

if (diagnostics.length > maxErrors) process.exitCode = 1;
