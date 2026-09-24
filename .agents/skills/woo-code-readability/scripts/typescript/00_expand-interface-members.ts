#!/usr/bin/env bun
import { readFileSync, writeFileSync } from "node:fs";
import { relative }                    from "node:path";

import { isInterfaceDeclaration, type Node, type SourceFile } from "typescript/unstable/ast";

import { loadSourceFile, repositoryFile } from "./load-source-file.ts";

interface Edit {
	readonly start: number;
	readonly end  : number;
	readonly text : string;
}

function lineOf(source: SourceFile, position: number): number {
	return source.getLineAndCharacterOfPosition(position).line;
}

function indentationAt(source: SourceFile, position: number): string {
	const { line } = source.getLineAndCharacterOfPosition(position);
	const start = source.getPositionOfLineAndCharacter(line, 0);
	return /^[ \t]*/u.exec(source.text.slice(start, position))?.[0] ?? "";
}

function interfaceEdits(source: SourceFile): readonly Edit[] {
	const edits: Edit[] = [];
	const newline = source.text.includes("\r\n") ? "\r\n" : "\n";
	const visit = (node: Node): void => {
		if (isInterfaceDeclaration(node) && node.members.length > 0) {
			const first = node.members[0]!;
			const last = node.members.at(-1)!;
			const open = source.text.indexOf("{", node.name.getEnd());
			const close = node.getEnd() - 1;
			const baseIndent = indentationAt(source, node.getStart(source));
			const memberIndent = `${baseIndent}\t`;
			if (open < 0 || source.text[close] !== "}") throw new Error("interface 중괄호 경계를 찾을 수 없습니다.");
			if (lineOf(source, open) === lineOf(source, first.getStart(source))) {
				const gap = source.text.slice(open + 1, first.getStart(source));
				if (!/^[ \t]*$/u.test(gap)) throw new Error("interface 첫 멤버 앞 주석은 자동 분리하지 않습니다.");
				edits.push({ start: open + 1, end: first.getStart(source), text: `${newline}${memberIndent}` });
			}
			for (let index = 1; index < node.members.length; index += 1) {
				const previous = node.members[index - 1]!;
				const current = node.members[index]!;
				if (lineOf(source, previous.getStart(source)) !== lineOf(source, current.getStart(source))) continue;
				const gap = source.text.slice(previous.getEnd(), current.getStart(source));
				if (!/^[ \t]*$/u.test(gap)) throw new Error("같은 행 interface 멤버 사이 주석은 자동 분리하지 않습니다.");
				edits.push({ start: previous.getEnd(), end: current.getStart(source), text: `${newline}${memberIndent}` });
			}
			if (lineOf(source, last.getEnd() - 1) === lineOf(source, close)) {
				const gap = source.text.slice(last.getEnd(), close);
				if (!/^[ \t]*$/u.test(gap)) throw new Error("interface 마지막 멤버 뒤 주석은 자동 분리하지 않습니다.");
				edits.push({ start: last.getEnd(), end: close, text: `${newline}${baseIndent}` });
			}
		}
		node.forEachChild(child => { visit(child); return undefined; });
	};
	visit(source);
	return edits;
}

function applyEdits(source: string, edits: readonly Edit[]): string {
	let result = source;
	for (const edit of [...edits].sort((left, right) => right.start - left.start)) result = `${result.slice(0, edit.start)}${edit.text}${result.slice(edit.end)}`;
	return result;
}

const root = process.cwd();
const write = process.argv.includes("--write");
const targets = process.argv.slice(2).filter(value => value !== "--write");
if (targets.length === 0) throw new Error("usage: 00_expand-interface-members.ts [--write] <TypeScript file>...");
let changed = 0;
for (const target of targets) {
	const path = repositoryFile(root, target);
	const { source } = await loadSourceFile(root, path.relative);
	const edits = interfaceEdits(source);
	if (edits.length === 0) continue;
	changed += 1;
	console.log(`${write ? "fixed" : "invalid"} ${relative(root, path.absolute)} edits=${edits.length}`);
	if (write) writeFileSync(path.absolute, applyEdits(readFileSync(path.absolute, "utf8"), edits));
}
console.log(`interface-members files=${targets.length} changed=${changed}`);
if (!write && changed > 0) process.exit(1);
