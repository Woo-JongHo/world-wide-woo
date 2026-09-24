#!/usr/bin/env bun
/**
 * STEP6: 선언·인터페이스·클래스 멤버 표의 `:`와 종결 `;` 열, 객체 행 표의 `{`·`:`·`,`·`}` 열을
 * AST 경계로 검사하고 --write로 최소 폭으로 맞춘다. 텍스트 검색과 달리 조건 타입 `:`, for 헤더 `;`,
 * 빈 문장, 한 줄 실행 블록(`{ 실행; }`), JSDoc·빈 줄로 끊긴 행은 애초에 행 후보가 아니므로 정렬되지 않는다.
 */
import {
	isArrayLiteralExpression,
	isBlock,
	isClassDeclaration,
	isIdentifier,
	isInterfaceDeclaration,
	isObjectLiteralExpression,
	isPropertyAssignment,
	isPropertyDeclaration,
	isPropertySignatureDeclaration,
	isSourceFile,
	isVariableStatement,
	type Node,
	type PropertyAssignment,
	type SourceFile,
} from "typescript/unstable/ast";
import { skipTrivia } from "typescript/unstable/ast/scanner";

import { displayWidth } from "../common/display-width.ts";
import { loadSourceFile } from "./load-source-file.ts";

interface Edit {
	readonly start : number;
	readonly end   : number;
	readonly text  : string;
}

interface TableGroup {
	readonly kind      : string;
	readonly startLine : number;
	readonly endLine   : number;
	readonly rowCount  : number;
	readonly axes      : readonly string[];
	readonly edits     : readonly Edit[];
}

interface StatementRow {
	readonly node       : Node;
	readonly nameEnd    : number;
	readonly colon      : number;
	readonly contentEnd : number;
	readonly semicolon  : number;
}

interface VariableRow {
	readonly node       : Node;
	readonly nameEnd    : number;
	readonly colon      : number | undefined;
	readonly equalsFrom : number;
	readonly equals     : number;
	readonly valueEnd   : number;
	readonly semicolon  : number;
}

interface ObjectRow {
	readonly node       : Node;
	readonly properties : readonly PropertyAssignment[];
}

interface CompressedMembers {
	readonly kind  : string;
	readonly line  : number;
	readonly count : number;
}

/** from과 토큰 사이가 공백일 때만 토큰 위치를 돌려준다. 주석·ASI가 있으면 undefined다. */
function whitespaceTokenAfter(source: SourceFile, from: number, token: string): number | undefined {
	const at = skipTrivia(source.text, from);
	return source.text[at] === token && /^[ \t]*$/u.test(source.text.slice(from, at)) ? at : undefined;
}

/** 같은 행의 앞 편집이 뒤 경계를 미는 양을 더해, 목표 열에 도달하는 데 필요한 공백 수를 계산한다. */
function padTo(source: SourceFile, position: number, target: number, shift: number): number {
	return target - displayColumn(source, position) - shift;
}

function displayColumn(source: SourceFile, position: number): number {
	const { line } = source.getLineAndCharacterOfPosition(position);
	return displayWidth(source.text.slice(source.getPositionOfLineAndCharacter(line, 0), position));
}

/** 행이 줄을 점유하는지 확인한다. 한 줄 실행 블록처럼 같은 줄에 다른 코드가 있으면 false다. */
function ownsItsLine(source: SourceFile, node: Node, restPattern: RegExp): boolean {
	const start = node.getStart(source);
	const startLine = source.getLineAndCharacterOfPosition(start).line;
	if (startLine !== source.getLineAndCharacterOfPosition(node.getEnd() - 1).line) return false;
	if (skipTrivia(source.text, source.getPositionOfLineAndCharacter(startLine, 0)) !== start) return false;
	const lineEnd = source.text.indexOf("\n", node.getEnd());
	const rest = source.text.slice(node.getEnd(), lineEnd < 0 ? source.text.length : lineEnd).replace(/\r$/u, "");
	return restPattern.test(rest);
}

function statementRowOf(source: SourceFile, node: Node): StatementRow | undefined {
	let nameEnd: number | undefined;
	let contentEnd: number | undefined;
	if (isPropertySignatureDeclaration(node)) {
		if (!node.type) return undefined;
		nameEnd    = (node.postfixToken ?? node.name).getEnd();
		contentEnd = node.type.getEnd();
	} else if (isPropertyDeclaration(node)) {
		if (!node.type && !node.initializer) return undefined;
		nameEnd    = (node.postfixToken ?? node.name).getEnd();
		contentEnd = (node.initializer ?? node.type ?? node.name).getEnd();
	} else return undefined;
	if (!ownsItsLine(source, node, /^[ \t]*(?:\/\/.*)?$/u)) return undefined;
	const colon = whitespaceTokenAfter(source, nameEnd, ":");
	const semicolon = whitespaceTokenAfter(source, contentEnd, ";");
	if (colon === undefined || semicolon === undefined) return undefined;
	return { node, nameEnd, colon, contentEnd, semicolon };
}

function variableRowOf(source: SourceFile, node: Node): VariableRow | undefined {
	if (!isVariableStatement(node) || !ownsItsLine(source, node, /^[ \t]*(?:\/\/.*)?$/u)) return undefined;
	const start = node.getStart(source);
	const { line } = source.getLineAndCharacterOfPosition(start);
	const lineStart = source.getPositionOfLineAndCharacter(line, 0);
	if (displayWidth(source.text.slice(lineStart, node.getEnd())) > 120) return undefined;
	const declaration = node.declarationList.declarations[0];
	if (!declaration || node.declarationList.declarations.length !== 1 || !isIdentifier(declaration.name) || !declaration.initializer) return undefined;
	const nameEnd = declaration.name.getEnd();
	const colon = declaration.type ? whitespaceTokenAfter(source, nameEnd, ":") : undefined;
	if (declaration.type && colon === undefined) return undefined;
	const equalsFrom = (declaration.type ?? declaration.name).getEnd();
	const equals = whitespaceTokenAfter(source, equalsFrom, "=");
	const semicolon = whitespaceTokenAfter(source, declaration.initializer.getEnd(), ";");
	if (equals === undefined || semicolon === undefined) return undefined;
	return { node, nameEnd, colon, equalsFrom, equals, valueEnd: declaration.initializer.getEnd(), semicolon };
}

function objectRowOf(source: SourceFile, node: Node): ObjectRow | undefined {
	if (!isObjectLiteralExpression(node)) return undefined;
	if (!ownsItsLine(source, node, /^[ \t]*,?[ \t]*(?:\/\/.*)?$/u)) return undefined;
	const properties = [...node.properties];
	if (properties.length === 0 || !properties.every(isPropertyAssignment)) return undefined;
	for (let index = 0; index < properties.length; index += 1) {
		const property = properties[index]!;
		const nameEnd = (property.postfixToken ?? property.name).getEnd();
		if (whitespaceTokenAfter(source, nameEnd, ":") === undefined) return undefined;
		if (whitespaceTokenAfter(source, property.initializer.getEnd(), index + 1 < properties.length ? "," : "}") === undefined) return undefined;
	}
	return { node, properties };
}

/** 형제 중 같은 역할의 연속 행만 묶는다. 빈 줄·주석·다른 구문이 사이에 있으면 표가 끊긴다. */
function runsOf<T>(source: SourceFile, siblings: readonly Node[], rowOf: (source: SourceFile, node: Node) => T | undefined, gapPattern: RegExp): readonly (readonly T[])[] {
	const runs: T[][] = [];
	let current: T[] = [];
	let previousEnd: number | undefined;
	for (const sibling of siblings) {
		const row = rowOf(source, sibling);
		const gap = previousEnd === undefined || row === undefined ? undefined : source.text.slice(previousEnd, sibling.getStart(source));
		if (row && (previousEnd === undefined || gapPattern.test(gap ?? ""))) {
			current.push(row);
		} else {
			if (current.length > 0) runs.push(current);
			current = row ? [row] : [];
		}
		previousEnd = sibling.getEnd();
	}
	if (current.length > 0) runs.push(current);
	return runs.filter(run => run.length > 0);
}

function statementGroup(source: SourceFile, kind: string, rows: readonly StatementRow[]): TableGroup {
	const colonTarget = Math.max(...rows.map(row => displayColumn(source, row.nameEnd))) + 1;
	const colonShifts = rows.map(row => {
		const colonPad = padTo(source, row.nameEnd, colonTarget, 0);
		return colonPad - (row.colon - row.nameEnd);
	});
	const semicolonTarget = Math.max(...rows.map((row, index) => displayColumn(source, row.contentEnd) + colonShifts[index]!)) + 1;
	const edits: Edit[] = [];
	for (const [index, row] of rows.entries()) {
		const colonPad     = padTo(source, row.nameEnd, colonTarget, 0);
		const semicolonPad = padTo(source, row.contentEnd, semicolonTarget, colonShifts[index]!);
		if (displayColumn(source, row.colon) !== colonTarget) edits.push({ start: row.nameEnd, end: row.colon, text: " ".repeat(colonPad) });
		if (displayColumn(source, row.semicolon) !== semicolonTarget) edits.push({ start: row.contentEnd, end: row.semicolon, text: " ".repeat(semicolonPad) });
	}
	const first = rows[0]!;
	const last  = rows.at(-1)!;
	return {
		kind,
		startLine : source.getLineAndCharacterOfPosition(first.node.getStart(source)).line + 1,
		endLine   : source.getLineAndCharacterOfPosition(last.node.getEnd() - 1).line + 1,
		rowCount  : rows.length,
		axes      : [`colon=${colonTarget}`, `semicolon=${semicolonTarget}`],
		edits,
	};
}

function variableGroup(source: SourceFile, rows: readonly VariableRow[]): TableGroup {
	const typed = rows.filter(row => row.colon !== undefined);
	const colonTarget = typed.length > 0 ? Math.max(...typed.map(row => displayColumn(source, row.nameEnd))) + 1 : undefined;
	const colonShifts = rows.map(row => row.colon === undefined || colonTarget === undefined ? 0 : colonTarget - displayColumn(source, row.nameEnd) - (row.colon - row.nameEnd));
	const equalsTarget = Math.max(...rows.map((row, index) => displayColumn(source, row.equalsFrom) + colonShifts[index]!)) + 1;
	const equalsShifts = rows.map((row, index) => colonShifts[index]! + equalsTarget - displayColumn(source, row.equalsFrom) - colonShifts[index]! - (row.equals - row.equalsFrom));
	const semicolonTarget = Math.max(...rows.map((row, index) => displayColumn(source, row.valueEnd) + equalsShifts[index]!)) + 1;
	const edits: Edit[] = [];
	for (const [index, row] of rows.entries()) {
		const colonPad = colonTarget === undefined ? 0 : colonTarget - displayColumn(source, row.nameEnd);
		const equalsPad = equalsTarget - displayColumn(source, row.equalsFrom) - colonShifts[index]!;
		const semicolonPad = semicolonTarget - displayColumn(source, row.valueEnd) - equalsShifts[index]!;
		if (row.colon !== undefined && displayColumn(source, row.colon) !== colonTarget) edits.push({ start: row.nameEnd, end: row.colon, text: " ".repeat(colonPad) });
		if (displayColumn(source, row.equals) + colonShifts[index]! !== equalsTarget) edits.push({ start: row.equalsFrom, end: row.equals, text: " ".repeat(equalsPad) });
		if (displayColumn(source, row.semicolon) + equalsShifts[index]! !== semicolonTarget) edits.push({ start: row.valueEnd, end: row.semicolon, text: " ".repeat(semicolonPad) });
	}
	const first = rows[0]!;
	const last = rows.at(-1)!;
	return {
		kind      : "declaration-equals",
		startLine : source.getLineAndCharacterOfPosition(first.node.getStart(source)).line + 1,
		endLine   : source.getLineAndCharacterOfPosition(last.node.getEnd() - 1).line + 1,
		rowCount  : rows.length,
		axes      : [...(colonTarget === undefined ? [] : [`colon=${colonTarget}`]), `equals=${equalsTarget}`, `semicolon=${semicolonTarget}`],
		edits,
	};
}

function objectGroup(source: SourceFile, rows: readonly ObjectRow[]): TableGroup | undefined {
	const width = rows[0]!.properties.length;
	if (!rows.every(row => row.properties.length === width)) return undefined;
	const openColumns = rows.map(row => displayColumn(source, row.node.getStart(source)));
	if (new Set(openColumns).size !== 1) return undefined;
	const edits: Edit[] = [];
	const axes: string[] = [];
	const shifts = new Map<readonly Node[], number>();
	for (let index = 0; index < width; index += 1) {
		const priors   = rows.map(row => shifts.get(row.properties) ?? 0);
		const nameEnds = rows.map(row => (row.properties[index]!.postfixToken ?? row.properties[index]!.name).getEnd());
		const colons   = rows.map(row => whitespaceTokenAfter(source, (row.properties[index]!.postfixToken ?? row.properties[index]!.name).getEnd(), ":")!);
		const colonTarget = Math.max(...nameEnds.map((end, rowIndex) => displayColumn(source, end) + priors[rowIndex]!)) + 1;
		const colonShifts = nameEnds.map((end, rowIndex) => colonTarget - displayColumn(source, end) - (colons[rowIndex]! - end));
		const valueEnds = rows.map(row => row.properties[index]!.initializer.getEnd());
		const valueTarget = Math.max(...valueEnds.map((end, rowIndex) => displayColumn(source, end) + colonShifts[rowIndex]!)) + 1;
		axes.push(`colon${index + 1}=${colonTarget}`, `value${index + 1}=${valueTarget}`);
		for (const [rowIndex, row] of rows.entries()) {
			const property = row.properties[index]!;
			const nameEnd = (property.postfixToken ?? property.name).getEnd();
			const valueEnd = property.initializer.getEnd();
			const colonPad = colonTarget - displayColumn(source, nameEnd) - priors[rowIndex]!;
			const colon = colons[rowIndex]!;
			const boundary = whitespaceTokenAfter(source, valueEnd, index + 1 < width ? "," : "}")!;
			const afterColon = colonShifts[rowIndex]!;
			const valuePad = valueTarget - displayColumn(source, valueEnd) - afterColon;
			shifts.set(row.properties, afterColon + valuePad - (boundary - valueEnd));
			if (displayColumn(source, colon) !== colonTarget) edits.push({ start: nameEnd, end: colon, text: " ".repeat(colonPad) });
			if (displayColumn(source, boundary) !== valueTarget) edits.push({ start: valueEnd, end: boundary, text: " ".repeat(valuePad) });
		}
	}
	const first = rows[0]!;
	const last  = rows.at(-1)!;
	return {
		kind      : "object-rows",
		startLine : source.getLineAndCharacterOfPosition(first.node.getStart(source)).line + 1,
		endLine   : source.getLineAndCharacterOfPosition(last.node.getEnd() - 1).line + 1,
		rowCount  : rows.length,
		axes      : [`open-brace=${openColumns[0]}`, ...axes],
		edits,
	};
}

function collect(node: Node, source: SourceFile, minRows: number, groups: TableGroup[], compressed: CompressedMembers[]): void {
	const statements = isSourceFile(node) || isBlock(node) ? node.statements : undefined;
	const members    = isInterfaceDeclaration(node) ? node.members : isClassDeclaration(node) ? node.members : undefined;
	const elements   = isArrayLiteralExpression(node) ? node.elements : undefined;
	if (statements) for (const run of runsOf(source, statements, statementRowOf, /^[ \t]*\r?\n[ \t]*$/u)) {
		if (run.length >= minRows) groups.push(statementGroup(source, "declarations", run));
	}
	if (statements) for (const run of runsOf(source, statements, variableRowOf, /^[ \t]*\r?\n[ \t]*$/u)) {
		if (run.length >= minRows) groups.push(variableGroup(source, run));
	}
	if (members) {
		const kind = isInterfaceDeclaration(node) ? "interface-members" : "class-members";
		const membersByLine = new Map<number, number>();
		for (const member of members) {
			const line = source.getLineAndCharacterOfPosition(member.getStart(source)).line + 1;
			membersByLine.set(line, (membersByLine.get(line) ?? 0) + 1);
		}
		for (const [line, count] of membersByLine) if (count > 1) compressed.push({ kind, line, count });
		for (const run of runsOf(source, members, statementRowOf, /^[ \t]*\r?\n[ \t]*$/u)) {
			if (run.length >= minRows) groups.push(statementGroup(source, kind, run));
		}
	}
	if (elements && elements.every(isObjectLiteralExpression)) for (const run of runsOf(source, elements, objectRowOf, /^[ \t]*,?[ \t]*\r?\n[ \t]*$/u)) {
		if (run.length >= minRows) {
			const group = objectGroup(source, run);
			if (group) groups.push(group);
		}
	}
	node.forEachChild(child => { collect(child, source, minRows, groups, compressed); return undefined; });
}

function applyEdits(source: string, edits: readonly Edit[]): string {
	let result = source;
	for (const edit of [...edits].sort((left, right) => right.start - left.start)) result = `${result.slice(0, edit.start)}${edit.text}${result.slice(edit.end)}`;
	return result;
}

interface Arguments {
	readonly file    : string;
	readonly write   : boolean;
	readonly minRows : number;
}

function parseArguments(): Arguments {
	const raw = process.argv.slice(2);
	const write = raw.includes("--write");
	const minRowsIndex = raw.indexOf("--min-rows");
	const minRows = minRowsIndex < 0 ? 3 : Number(raw[minRowsIndex + 1]);
	if (raw[0] !== "--file" || !raw[1] || (!Number.isInteger(minRows) || minRows < 3)) {
		throw new Error("usage: 06_align-tables.ts --file <repository TypeScript file> [--write] [--min-rows 3]");
	}
	return { file: raw[1], write, minRows };
}

function errorMessage(value: unknown): string {
	return value instanceof Error ? value.message : String(value);
}

async function main(): Promise<void> {
	const root = process.cwd();
	const { file, write, minRows } = parseArguments();
	const { source, relative } = await loadSourceFile(root, file);

	const groups: TableGroup[] = [];
	const compressed: CompressedMembers[] = [];
	collect(source, source, minRows, groups, compressed);
	groups.sort((left, right) => left.startLine - right.startLine);

	const misaligned = groups.filter(group => group.edits.length > 0);
	console.log(`align-tables file=${relative} groups=${groups.length} misaligned=${misaligned.length} compressed=${compressed.length}${write ? " write=true" : ""}`);
	for (const violation of compressed) console.log(`  ${String(violation.line).padStart(9)}  ${violation.kind.padEnd(18)} compressed-members=${violation.count}`);
	for (const group of groups) {
		const range = group.startLine === group.endLine ? `${group.startLine}` : `${group.startLine}-${group.endLine}`;
		console.log(`  ${range.padStart(9)}  ${group.kind.padEnd(18)} rows=${String(group.rowCount).padStart(2)}  ${group.axes.join(" ")}  edits=${group.edits.length}`);
	}
	if (write && misaligned.length > 0) {
		const edits = misaligned.flatMap(group => group.edits).sort((left, right) => left.start - right.start);
		for (let index = 1; index < edits.length; index += 1) {
			if (edits[index - 1]!.end > edits[index]!.start) throw new Error(`정렬 편집이 겹칩니다: ${relative}`);
		}
		await Bun.write(`${root}/${relative}`, applyEdits(source.text, edits));
	}
	if (compressed.length > 0 || (!write && misaligned.length > 0)) process.exit(1);
}

try {
	await main();
	process.exit(0);
} catch (error) {
	console.error(errorMessage(error));
	process.exit(1);
}
