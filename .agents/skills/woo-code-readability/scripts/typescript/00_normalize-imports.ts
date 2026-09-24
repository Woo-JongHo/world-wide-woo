#!/usr/bin/env bun
import { readFileSync, writeFileSync } from "node:fs";
import { relative }                    from "node:path";

import { displayWidth } from "../common/display-width.ts";
import { repositoryFile } from "./load-source-file.ts";

interface ImportRow {
	readonly text  : string;
	readonly start : number;
	readonly end   : number;
	readonly block : number;
}

interface RenderedRow {
	readonly text  : string;
	readonly block : number;
}

interface ParsedImport {
	readonly head       : string;
	readonly before     : string;
	readonly entries    : readonly string[];
	readonly module     : string;
	readonly attributes : string | undefined;
	readonly terminator : string;
	readonly suffix     : string;
}

function lexicalMask(source: string): string {
	const chars = source.split("");
	let state: "code" | "single" | "double" | "template" | "line" | "block" = "code";
	let escaped = false;
	for (let index = 0; index < chars.length; index += 1) {
		const value = chars[index]!;
		const next = chars[index + 1];
		if (state === "code") {
			if (value === "/" && next === "/") { state = "line"; chars[index] = chars[index + 1] = " "; index += 1; continue; }
			if (value === "/" && next === "*") { state = "block"; chars[index] = chars[index + 1] = " "; index += 1; continue; }
			if (value === "'") { state = "single"; continue; }
			if (value === '"') { state = "double"; continue; }
			if (value === "`") { state = "template"; chars[index] = " "; continue; }
			continue;
		}
		if (state === "line") {
			if (value === "\n") state = "code";
			else chars[index] = " ";
			continue;
		}
		if (state === "block") {
			if (value === "*" && next === "/") { chars[index] = chars[index + 1] = " "; index += 1; state = "code"; }
			else if (value !== "\n") chars[index] = " ";
			continue;
		}
		if (state === "template") {
			if (value === "`" && !escaped) { chars[index] = " "; state = "code"; }
			else if (value !== "\n") chars[index] = " ";
			escaped = value === "\\" && !escaped;
			if (value !== "\\") escaped = false;
			continue;
		}
		const quote = state === "single" ? "'" : '"';
		if (value === quote && !escaped) state = "code";
		else if (value !== "\n") chars[index] = " ";
		escaped = value === "\\" && !escaped;
		if (value !== "\\") escaped = false;
	}
	const mask = chars.join("");
	if (mask.length !== source.length) throw new Error("lexical mask length changed");
	return mask;
}

function importRows(source: string, file: string): readonly ImportRow[] {
	void file;
	const mask = lexicalMask(source);
	const pattern = /^import[ \t]+(?!["'])(?:type[ \t]+)?[^"'=();]+?[ \t]+from[ \t]+["'][^"'\n]*["'](?:[ \t]+(?:with|assert)[ \t]*\{[^{}\n]*\})?;?[ \t]*\r?$/gmu;
	const ranges = [...mask.matchAll(pattern)].map(match => {
		const matchedEnd = match.index + match[0].length;
		return { start: match.index, end: mask[matchedEnd - 1] === "\r" ? matchedEnd - 1 : matchedEnd };
	});
	let block = 0;
	return ranges.map((range, index) => {
		if (index > 0) {
			const previous = ranges[index - 1]!;
			const gap = source.slice(previous.end, range.start);
			if (/\n[ \t]*\n/u.test(gap) || /\S/u.test(gap.replace(/;/u, ""))) block += 1;
		}
		return { text: source.slice(range.start, range.end), start: range.start, end: range.end, block };
	});
}

function commentIndex(value: string): number {
	let quote: "'" | '"' | "`" | undefined;
	let escaped = false;
	for (let index = 0; index < value.length; index += 1) {
		const current = value[index]!;
		if (!quote && current === "/" && (value[index + 1] === "/" || value[index + 1] === "*")) return index;
		if (!quote && (current === "'" || current === '"' || current === "`")) quote = current;
		else if (quote && current === quote && !escaped) quote = undefined;
		escaped = current === "\\" && !escaped;
		if (current !== "\\") escaped = false;
	}
	return -1;
}

function hasComment(value: string): boolean {
	return commentIndex(value) >= 0;
}

function splitNamedImport(row: string, file: string): readonly string[] {
	if (/^import\s+type\b/u.test(row)) return [row];
	if (hasComment(row) && /\btype\s+[A-Za-z_$]/u.test(row)) throw new Error(`주석이 있는 import는 자동 수정하지 않습니다: ${file}`);
	const match = /^import\s+([^"']*?)\s+from\s+(["'][^"']+["']);?$/su.exec(row);
	if (!match) return [row];
	const clause = match[1] ?? "";
	const open = clause.indexOf("{");
	const close = clause.lastIndexOf("}");
	if (open < 0 || close < open) return [row];
	const before = clause.slice(0, open).replace(/,\s*$/u, "").trim();
	const entries = clause.slice(open + 1, close).split(",").map(value => value.trim()).filter(Boolean);
	if (entries.some(value => /^type\s+as\s+[A-Za-z_$][\w$]*$/u.test(value))) return [row];
	const types = entries.filter(value => /^type\s+/u.test(value));
	if (types.length === 0) return [row];
	if (hasComment(row)) throw new Error(`주석이 있는 혼합 import는 자동 수정하지 않습니다: ${file}`);
	const values = entries.filter(value => !/^type\s+/u.test(value));
	const module = match[2];
	const terminator = /;\s*$/u.test(row) ? ";" : "";
	const result: string[] = [];
	if (before || values.length > 0) {
		const named = values.length > 0 ? `{ ${values.join(", ")} }` : "";
		const valueClause = [before, named].filter(Boolean).join(", ");
		result.push(`import ${valueClause} from ${module}${terminator}`);
	}
	result.push(`import type { ${types.map(value => value.replace(/^type\s+/u, "")).join(", ")} } from ${module}${terminator}`);
	return result;
}

/** named 절을 문법 경계로 분해한다. 문장을 완결하지 못하는 주석·비정형 절은 undefined다. */
function parseImportRow(row: string): ParsedImport | undefined {
	const at = commentIndex(row);
	const core = at < 0 ? row : row.slice(0, at).trimEnd();
	const suffix = at < 0 ? "" : row.slice(at);
	const match = /^(import(?:[ \t]+type)?)[ \t]+([^{}'"]*?)\{([^{}]*)\}[ \t\r\n]*from[ \t]+(["'][^"'\n]+["'])([ \t]+(?:with|assert)[ \t\r\n]*\{[^{}]*\})?[ \t\r\n]*(;?)[ \t]*$/su.exec(core);
	if (!match) return undefined;
	const before = (match[2] ?? "").replace(/[ \t]+$/u, "").length > 0 ? `${(match[2] ?? "").replace(/[ \t]+$/u, "")} ` : "";
	return {
		head        : `${match[1]} `,
		before,
		entries     : (match[3] ?? "").split(",").map(value => value.trim()).filter(Boolean),
		module      : match[4] ?? "",
		attributes  : (match[5] ?? "").replace(/[ \t\r\n]+$/u, "") || undefined,
		terminator  : (match[6] ?? "") === ";" ? ";" : "",
		suffix,
	};
}

function renderImportRow(row: string, file: string, newline: string): string {
	const parsed = parseImportRow(row);
	if (!parsed) {
		if (hasComment(row)) throw new Error(`주석이 있는 import는 자동 수정하지 않습니다: ${file}`);
		return row;
	}
	if (parsed.entries.some(value => /[\/\n]/u.test(value))) throw new Error(`주석이 있는 import는 자동 수정하지 않습니다: ${file}`);
	const oneLine = `${parsed.head}${parsed.before}{ ${parsed.entries.join(", ")} } from ${parsed.module}${parsed.attributes ? ` ${parsed.attributes}` : ""}${parsed.terminator}`;
	if (parsed.attributes && oneLine !== row) throw new Error(`attributes가 있는 import는 자동 수정하지 않습니다: ${file}`);
	const suffix = parsed.suffix.length > 0 ? ` ${parsed.suffix}` : "";
	if (parsed.entries.length <= 1 || displayWidth(oneLine) <= 120) return `${oneLine}${suffix}`;
	if (parsed.attributes) throw new Error(`attributes가 있는 긴 import는 자동 수정하지 않습니다: ${file}`);
	const lines = parsed.entries.map(value => `\t${value},`);
	return `${parsed.head}${parsed.before}{${newline}${lines.join(newline)}${newline}} from ${parsed.module}${parsed.terminator}${suffix}`;
}

function fromSpan(row: string): { index: number; width: number } | undefined {
	if (row.includes("\n")) return undefined;
	const match = /\s+from\s+(?=["'])/u.exec(row);
	return match ? { index: match.index, width: /^\s+/u.exec(match[0])![0].length } : undefined;
}

function alignFrom(rows: readonly RenderedRow[]): readonly RenderedRow[] {
	const columns = new Map<number, number>();
	for (const row of rows) columns.set(row.block, Math.max(columns.get(row.block) ?? 0, fromSpan(row.text)?.index ?? 0));
	return rows.map(row => {
		const span = fromSpan(row.text);
		if (!span) return row;
		const column = columns.get(row.block) ?? span.index;
		return { ...row, text: `${row.text.slice(0, span.index)}${" ".repeat(column - span.index + 1)}${row.text.slice(span.index + span.width)}` };
	});
}

function normalizeOnce(source: string, file: string): string {
	const rows = importRows(source, file);
	if (rows.length === 0) return source;
	const newline = source.includes("\r\n") ? "\r\n" : "\n";
	const terminators = new Map<number, Set<boolean>>();
	for (const row of rows) {
		const styles = terminators.get(row.block) ?? new Set<boolean>();
		styles.add(/;[ \t]*$/u.test(row.text));
		terminators.set(row.block, styles);
	}
	for (const styles of terminators.values()) {
		if (styles.size > 1) throw new Error(`같은 import 블록의 종결자 스타일이 섞여 있습니다: ${file}`);
	}
	for (const row of rows) if (/\s(?:with|assert)\s*\{/u.test(row.text) && /\btype\s+[A-Za-z_$]/u.test(row.text)) throw new Error(`attributes가 있는 혼합 import는 자동 수정하지 않습니다: ${file}`);
	const split = rows.map(row => splitNamedImport(row.text, file).map(text => ({ text, block: row.block })));
	const aligned = alignFrom(split.flat().map(row => ({ ...row, text: renderImportRow(row.text, file, newline) })));
	let offset = 0;
	const replacements = rows.map((row, index) => {
		const count = split[index]!.length;
		const text = aligned.slice(offset, offset + count).map(value => value.text).join(newline);
		offset += count;
		return { ...row, text };
	});
	let result = source;
	for (const replacement of replacements.toReversed()) result = `${result.slice(0, replacement.start)}${replacement.text}${result.slice(replacement.end)}`;
	return result;
}

function normalize(source: string, file: string): string {
	const first = normalizeOnce(source, file);
	return normalizeOnce(first, file);
}

function targetArguments(root: string): readonly string[] {
	const values = process.argv.slice(2).filter(value => value !== "--write");
	if (values.length === 0) throw new Error("usage: 00_normalize-imports.ts [--write] <TypeScript file>...");
	return values.map(value => repositoryFile(root, value).absolute);
}

const root = process.cwd();
const write = process.argv.includes("--write");
const targets = targetArguments(root);
let changed = 0;
let errors = 0;
for (const absolute of targets) {
	try {
		const before = readFileSync(absolute, "utf8");
		const after = normalize(before, absolute);
		if (after === before) continue;
		changed += 1;
		console.log(`${write ? "fixed" : "invalid"} ${relative(root, absolute)}`);
		if (write) writeFileSync(absolute, after);
	} catch (error) {
		errors += 1;
		console.error(`error ${relative(root, absolute)}: ${error instanceof Error ? error.message : String(error)}`);
	}
}
console.log(`import-declarations files=${targets.length} changed=${changed} errors=${errors}`);
if (errors > 0 || (!write && changed > 0)) process.exit(1);
