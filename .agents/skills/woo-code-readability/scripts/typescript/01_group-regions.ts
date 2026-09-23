#!/usr/bin/env bun
/**
 * STEP1: 대상 파일을 AST로 읽어 "같은 표로 묶을 수 있는 연속 행"을 찾는다.
 * 컨테이너(statements/members/properties/elements/arguments)마다 형제 노드를 SyntaxKind가
 * 같은 연속 구간으로 나누고, 그 안으로 재귀해 중첩 컨테이너도 같은 방식으로 나눈다.
 * 역할이 다른 행(예: 삼항연산자 `:`와 속성 `:`)은 SyntaxKind 자체가 달라 이 단계에서 이미 분리된다.
 */
import {
	SyntaxKind,
	isArrayLiteralExpression,
	isBlock,
	isCallExpression,
	isClassDeclaration,
	isInterfaceDeclaration,
	isObjectLiteralExpression,
	isSourceFile,
	type Node,
	type SourceFile as TsSourceFile,
} from "typescript/unstable/ast";

import { boundaryAxesOf } from "./grid-tokens.ts";
import { loadSourceFile } from "./load-source-file.ts";

interface RowContainer {
	readonly label : string;
	readonly rows  : readonly Node[];
}

interface Group {
	readonly containerLabel : string;
	readonly kind           : string;
	readonly rows           : readonly Node[];
	readonly startLine      : number;
	readonly endLine        : number;
	readonly axes           : readonly string[];
}

function rowContainersOf(node: Node): readonly RowContainer[] {
	if (isSourceFile(node)) return [{ label: "statements", rows: node.statements }];
	if (isBlock(node)) return [{ label: "statements", rows: node.statements }];
	if (isInterfaceDeclaration(node)) return [{ label: "members", rows: node.members }];
	if (isClassDeclaration(node)) return [{ label: "members", rows: node.members }];
	if (isObjectLiteralExpression(node)) return [{ label: "properties", rows: node.properties }];
	if (isArrayLiteralExpression(node)) return [{ label: "elements", rows: node.elements }];
	if (isCallExpression(node)) return [{ label: "arguments", rows: node.arguments }];
	return [];
}

function contiguousRuns(rows: readonly Node[]): readonly (readonly Node[])[] {
	const runs: Node[][] = [];
	for (const row of rows) {
		const current = runs.at(-1);
		const previous = current?.[0];
		if (current && previous && previous.kind === row.kind) current.push(row);
		else runs.push([row]);
	}
	return runs;
}

function lineOf(source: TsSourceFile, position: number): number {
	return source.getLineAndCharacterOfPosition(position).line + 1;
}

function collect(node: Node, source: TsSourceFile, minRows: number, groups: Group[]): void {
	for (const container of rowContainersOf(node)) {
		for (const run of contiguousRuns(container.rows)) {
			if (run.length >= minRows) {
				const first = run[0];
				const last  = run.at(-1) ?? first;
				groups.push({
					containerLabel : container.label,
					kind           : SyntaxKind[first.kind] ?? `Kind${first.kind}`,
					rows           : run,
					startLine      : lineOf(source, first.getStart(source)),
					endLine        : lineOf(source, last.getEnd()),
					axes           : boundaryAxesOf(node, first, source),
				});
			}
		}
	}
	node.forEachChild(child => { collect(child, source, minRows, groups); return undefined; });
}

function minRowsArgument(): number {
	const index = process.argv.indexOf("--min-rows");
	if (index < 0) return 2;
	const value = Number(process.argv[index + 1]);
	if (!Number.isInteger(value) || value < 2) throw new Error("--min-rows는 2 이상의 정수여야 합니다.");
	return value;
}

function targetArgument(): string {
	if (process.argv.length < 4 || process.argv[2] !== "--file" || !process.argv[3] || process.argv[3].startsWith("--")) {
		throw new Error("usage: 01_group-regions.ts --file <repository TypeScript file> [--min-rows 2]");
	}
	return process.argv[3];
}

function errorMessage(value: unknown): string {
	return value instanceof Error ? value.message : String(value);
}

async function main(): Promise<void> {
	const root    = process.cwd();
	const minRows = minRowsArgument();
	const { source, relative } = await loadSourceFile(root, targetArgument());

	const groups: Group[] = [];
	collect(source, source, minRows, groups);
	groups.sort((left, right) => left.startLine - right.startLine);

	console.log(`grid-regions file=${relative} groups=${groups.length} min-rows=${minRows}`);
	for (const group of groups) {
		const table = group.rows.length >= 3 ? "table" : "pair";
		const axes  = group.axes.length > 0 ? group.axes.join(",") : "-";
		const range = group.startLine === group.endLine ? `${group.startLine}` : `${group.startLine}-${group.endLine}`;
		console.log(`  ${range.padStart(9)}  ${group.containerLabel.padEnd(10)} ${group.kind.padEnd(24)} rows=${String(group.rows.length).padStart(2)}  ${table.padEnd(5)} axes=${axes}`);
	}
}

try {
	await main();
	process.exit(0);
} catch (error) {
	console.error(errorMessage(error));
	process.exit(1);
}
