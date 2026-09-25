/**
 * 표 행 종류 등록부. 각 종류는 컨테이너에서 연속 행을 감지하고(detect), 행마다 정렬 가능한
 * 경계(축) 위치를 돌려준다. 정렬 엔진(06_align-tables.ts)은 종류를 모른 채 축 열만 맞춘다.
 * 새 케이스 추가 절차: 01 어떤 종류인가 → 02 어떤 축이 없는가 → 03 이 파일에 종류·축을 등록하고
 * fixtures/table-kinds.ts에 행을 추가한 뒤 test/code-readability-tools.test.ts로 고정한다.
 */
import {
	isArrayLiteralExpression,
	isBlock,
	isAwaitExpression,
	isCallExpression,
	isCaseClause,
	isReturnStatement,
	isClassDeclaration,
	isEnumDeclaration,
	isExpressionStatement,
	isEnumMember,
	isIdentifier,
	isInterfaceDeclaration,
	isMethodDeclaration,
	isMethodSignatureDeclaration,
	isObjectLiteralExpression,
	type ObjectLiteralExpression,
	isPropertyAssignment,
	isPropertyDeclaration,
	isPropertySignatureDeclaration,
	isSourceFile,
	isSwitchStatement,
	isTypeAliasDeclaration,
	isTypeLiteralNode,
	isVariableStatement,
	type Node,
	type PropertyAssignment,
	type SourceFile,
	SyntaxKind,
} from "typescript/unstable/ast";
import { skipTrivia } from "typescript/unstable/ast/scanner";

import { displayWidth } from "../common/display-width.js";

export interface RowBoundary {
	readonly axis : string;
	readonly from : number;
	readonly at   : number;
	/** true면 기존 열 그대로 맞추는 삽입 축(`(`, `)`, `):`, `":`, `//`). false면 최소 한 칸 여백을 남기는 간격 축이다. */
	readonly insert? : boolean;
}

export type GapRule = "blank" | "comma";

export interface RowKind {
	readonly name       : string;
	readonly gap        : GapRule;
	readonly containers : (node: Node, seen: ReadonlySet<Node>) => readonly Node[] | undefined;
	readonly detect     : (source: SourceFile, node: Node) => readonly RowBoundary[] | undefined;
	/** 감지된 행 묶음에 따라 보고용 이름을 바꾼다(예: `=` 축을 정렬하는 declaration-equals). */
	readonly groupName? : (run: readonly DetectedRow[]) => string;
}

/** from과 토큰 사이가 공백일 때만 토큰 위치를 돌려준다. 주석·ASI가 있으면 undefined다. */
export function tokenAfter(source: SourceFile, from: number, token: string): number | undefined {
	const at = skipTrivia(source.text, from);
	return source.text[at] === token && /^[ \t]*$/u.test(source.text.slice(from, at)) ? at : undefined;
}

export function spacesOnly(source: SourceFile, from: number, to: number): boolean {
	return /^[ \t]*$/u.test(source.text.slice(from, to));
}

export function displayColumn(source: SourceFile, position: number): number {
	const { line } = source.getLineAndCharacterOfPosition(position);
	return displayWidth(source.text.slice(source.getPositionOfLineAndCharacter(line, 0), position));
}

/** 행이 줄을 점유하는지 확인한다. 한 줄 실행 블록처럼 같은 줄에 다른 코드가 있으면 false다. */
export function ownLineOf(source: SourceFile, node: Node, rest: RegExp): boolean {
	const start = node.getStart(source);
	const line = source.getLineAndCharacterOfPosition(start).line;
	if (line !== source.getLineAndCharacterOfPosition(node.getEnd() - 1).line) return false;
	if (skipTrivia(source.text, source.getPositionOfLineAndCharacter(line, 0)) !== start) return false;
	const lineEnd = source.text.indexOf("\n", node.getEnd());
	return rest.test(source.text.slice(node.getEnd(), lineEnd < 0 ? source.text.length : lineEnd).replace(/\r$/u, ""));
}

const LINE_REST  = /^[ \t]*(?:\/\/.*)?$/u;
const COMMA_REST = /^[ \t]*,?[ \t]*(?:\/\/.*)?$/u;
/** 객체 행의 닫는 `}` 뒤 꼬리: `)`, `;`, `,`, `as const`, `satisfies X`까지 허용한다. */
const CLOSER_REST = /^[ \t]*(?:(?:as const|satisfies [A-Za-z_$][\w$.<>[\]"']*)?[ \t]*(?:\)|;|,))?[ \t]*(?:\/\/.*)?$/u;
/** 닫는 `}` 뒤 꼬리(`as const`/`satisfies`/`)`/`;`/`,`)의 시작 위치를 돌려준다. 꼬리가 없으면 undefined다. */
function closerTail(source: SourceFile, node: Node): number | undefined {
	const lineEnd = source.text.indexOf("\n", node.getEnd());
	const rest = source.text.slice(node.getEnd(), lineEnd < 0 ? source.text.length : lineEnd).replace(/\r$/u, "");
	const match = /^[ \t]*((?:as const|satisfies [A-Za-z_$][\w$.<>[\]"']*)[ \t]*)?(\)|;|,)/u.exec(rest);
	if (!match) return undefined;
	const tailLength = (match[1]?.length ?? 0) + (match[2]?.length ?? 0);
	return node.getEnd() + match[0].length - tailLength;
}

/** 종결자 뒤 같은 줄의 우측 `//` 설명을 comment 축 경계로 돌려준다. */
function trailingComment(source: SourceFile, after: number): RowBoundary | undefined {
	const lineEnd = source.text.indexOf("\n", after);
	const rest = source.text.slice(after, lineEnd < 0 ? source.text.length : lineEnd);
	const match = /^[ \t]+(\/\/.*)$/u.exec(rest);
	if (!match) return undefined;
	const at = after + match.index! + match[0].indexOf("//");
	return { axis: "comment", from: at, at, insert: true };
}

function detectDeclaration(source: SourceFile, node: Node): readonly RowBoundary[] | undefined {
	if (!isVariableStatement(node)) return undefined;
	const declarations = node.declarationList.declarations;
	if (declarations.length !== 1) return undefined;
	const declaration = declarations[0]!;
	if (!isIdentifier(declaration.name)) return undefined;
	if (!ownLineOf(source, node, LINE_REST)) return undefined;
	const nameEnd = declaration.name.getEnd();
	const boundaries: RowBoundary[] = [];
	const colon = tokenAfter(source, nameEnd, ":");
	if (colon) boundaries.push({ axis: "colon", from: nameEnd, at: colon });
	const equalsAnchor = declaration.type ? declaration.type.getEnd() : nameEnd;
	const equals = tokenAfter(source, equalsAnchor, "=");
	if (equals) boundaries.push({ axis: "equals", from: equalsAnchor, at: equals });
	if (!colon && !equals) return undefined;
	const contentEnd = node.declarationList.getEnd();
	const semicolon = tokenAfter(source, contentEnd, ";");
	if (!semicolon) return undefined;
	boundaries.push({ axis: "semicolon", from: contentEnd, at: semicolon });
	const comment = trailingComment(source, semicolon + 1);
	if (comment) boundaries.push(comment);
	return boundaries;
}

function detectTypeAlias(source: SourceFile, node: Node): readonly RowBoundary[] | undefined {
	if (!isTypeAliasDeclaration(node)) return undefined;
	if (!ownLineOf(source, node, LINE_REST)) return undefined;
	const anchor = node.typeParameters ? (node.typeParameters as unknown as { readonly end: number }).end : node.name.getEnd();
	const equals = tokenAfter(source, anchor, "=");
	if (!equals) return undefined;
	const semicolon = tokenAfter(source, node.type.getEnd(), ";");
	if (!semicolon) return undefined;
	const boundaries: RowBoundary[] = [
		{ axis: "equals"   , from: anchor, at: equals },
		{ axis: "semicolon", from: node.type.getEnd(), at: semicolon },
	];
	const comment = trailingComment(source, semicolon + 1);
	if (comment) boundaries.push(comment);
	return boundaries;
}

function detectMember(source: SourceFile, node: Node): readonly RowBoundary[] | undefined {
	if (!isPropertySignatureDeclaration(node) && !isPropertyDeclaration(node)) return undefined;
	if (!ownLineOf(source, node, LINE_REST)) return undefined;
	const nameEnd = (node.postfixToken ?? node.name).getEnd();
	const boundaries: RowBoundary[] = [];
	const colon = tokenAfter(source, nameEnd, ":");
	if (colon) boundaries.push({ axis: "colon", from: nameEnd, at: colon });
	const equalsAnchor = node.type ? node.type.getEnd() : nameEnd;
	const equals = isPropertyDeclaration(node) && node.initializer ? tokenAfter(source, equalsAnchor, "=") : undefined;
	if (equals) boundaries.push({ axis: "equals", from: equalsAnchor, at: equals });
	const contentEnd = (node.initializer ?? node.type)?.getEnd() ?? nameEnd;
	const semicolon = tokenAfter(source, contentEnd, ";");
	if (!semicolon) return undefined;
	boundaries.push({ axis: "semicolon", from: contentEnd, at: semicolon });
	const comment = trailingComment(source, semicolon + 1);
	if (comment) boundaries.push(comment);
	return boundaries;
}

function detectMethod(source: SourceFile, node: Node): readonly RowBoundary[] | undefined {
	if (!isMethodSignatureDeclaration(node) && !isMethodDeclaration(node)) return undefined;
	if (!ownLineOf(source, node, LINE_REST)) return undefined;
	const nameEnd = node.name.getEnd();
	const open = tokenAfter(source, nameEnd, "(");
	if (!open) return undefined;
	const parameters = node.parameters;
	const hasParameters = parameters.length > 0;
	const closeAnchor = hasParameters ? parameters.at(-1)!.getEnd() : open + 1;
	const close = tokenAfter(source, closeAnchor, ")");
	if (!close) return undefined;
	const boundaries: RowBoundary[] = [{ axis: "open-paren", from: open, at: open, insert: true }];
	// 빈 매개변수는 ()로 붙여 쓴다 — 닫는 괄호를 표 폭에 맞추지 않고 여백은 괄호 밖에 둔다.
	if (hasParameters) boundaries.push({ axis: "close-paren", from: close, at: close, insert: true });
	const typeColon = node.type ? tokenAfter(source, close + 1, ":") : undefined;
	// 반환 타입 `:`는 기존 관습인 `):`를 보존하도록 삽입 축(from==at)으로 맞춘다.
	if (typeColon) boundaries.push({ axis: "colon", from: typeColon, at: typeColon, insert: true });
	const commentAnchor = node.type ? node.type.getEnd() : node.getEnd();
	const comment = trailingComment(source, commentAnchor);
	if (comment) boundaries.push(comment);
	return boundaries;
}

function detectEnumMember(source: SourceFile, node: Node): readonly RowBoundary[] | undefined {
	if (!isEnumMember(node)) return undefined;
	if (!ownLineOf(source, node, COMMA_REST)) return undefined;
	const nameEnd = node.name.getEnd();
	const boundaries: RowBoundary[] = [];
	const equals = node.initializer ? tokenAfter(source, nameEnd, "=") : undefined;
	if (equals) boundaries.push({ axis: "equals", from: nameEnd, at: equals });
	const valueEnd = node.initializer ? node.initializer.getEnd() : nameEnd;
	const comma = tokenAfter(source, valueEnd, ",");
	if (!comma) return undefined;
	boundaries.push({ axis: "comma", from: valueEnd, at: comma });
	const comment = trailingComment(source, comma + 1);
	if (comment) boundaries.push(comment);
	return boundaries;
}

/** 구문 안에서 가장 바깥쪽 호출 식을 찾는다(await를 벗겨 첫 CallExpression을 노린다). */
function firstCallOf(node: Node): Node | undefined {
	let found: Node | undefined;
	const visit = (current: Node): void => {
		if (found) return;
		const unwrapped = isAwaitExpression(current) ? current.expression : current;
		if (isCallExpression(unwrapped)) { found = unwrapped; return; }
		unwrapped.forEachChild(child => visit(child));
	};
	visit(node);
	return found;
}

/** 괄호를 벗겨 실제 식을 노린다. */
function unwrapExpression(node: Node): Node {
	let current = node;
	while (syntaxKindName(current) === "ParenthesizedExpression") current = (current as unknown as { expression: Node }).expression;
	return current;
}

function detectAssignments(source: SourceFile, node: Node): readonly RowBoundary[] | undefined {
	if (!isExpressionStatement(node)) return undefined;
	if (!ownLineOf(source, node, LINE_REST)) return undefined;
	const expression = unwrapExpression(node.expression);
	if (syntaxKindName(expression) !== "BinaryExpression") return undefined;
	const binary = expression as unknown as { operatorToken: Node; left: Node; right: Node };
	if (source.text.slice(binary.operatorToken.getStart(source), binary.operatorToken.getEnd()) !== "=") return undefined;
	const boundaries: RowBoundary[] = [];
	const equals = tokenAfter(source, binary.left.getEnd(), "=");
	if (equals === undefined) return undefined;
	boundaries.push({ axis: "equals", from: binary.left.getEnd(), at: equals });
	const semicolon = tokenAfter(source, binary.right.getEnd(), ";");
	if (!semicolon) return undefined;
	boundaries.push({ axis: "semicolon", from: binary.right.getEnd(), at: semicolon });
	const comment = trailingComment(source, semicolon + 1);
	if (comment) boundaries.push(comment);
	return boundaries;
}

function detectCaseClause(source: SourceFile, node: Node): readonly RowBoundary[] | undefined {
	if (!isCaseClause(node)) return undefined;
	if (!ownLineOf(source, node, LINE_REST)) return undefined;
	const colon = tokenAfter(source, node.expression.getEnd(), ":");
	if (!colon) return undefined;
	// 라벨 `:`는 `case "a":` 관습을 보존하도록 삽입 축(from==at)으로 맞춘다.
	const boundaries: RowBoundary[] = [{ axis: "case-colon", from: colon, at: colon, insert: true }];
	const statements = node.statements;
	if (statements.length > 0) {
		const call = firstCallOf(statements[0]!);
		if (call) {
			const paren = tokenAfter(source, call.expression.getEnd(), "(");
			if (paren !== undefined) boundaries.push({ axis: "call-paren", from: paren, at: paren, insert: true });
		}
		const last = statements.at(-1)!;
		if (isReturnStatement(last) && last.expression === undefined) {
			boundaries.push({ axis: "return-tail", from: last.getStart(source), at: last.getStart(source), insert: true });
		}
	}
	return boundaries;
}


/** `x as const`·괄호·non-null을 벗겨 안의 객체 리터럴을 돌려준다. 객체가 아니면 undefined다. */
function objectLiteralOf(node: Node): ObjectLiteralExpression | undefined {
	let current = node;
	for (;;) {
		const name = syntaxKindName(current);
		if (name === "AsExpression" || name === "ParenthesizedExpression" || name === "NonNullExpression") {
			current = (current as unknown as { expression: Node }).expression;
			continue;
		}
		return isObjectLiteralExpression(current) ? current : undefined;
	}
}

function detectObjectRow(source: SourceFile, node: Node): readonly RowBoundary[] | undefined {
	if (!isObjectLiteralExpression(node) && objectLiteralOf(node) === undefined) return undefined;
	if (!ownLineOf(source, node, CLOSER_REST)) return undefined;
	const obj = objectLiteralOf(node)!;
	const properties = [...obj.properties];
	if (properties.length === 0 || !properties.every(isPropertyAssignment)) return undefined;
	const boundaries: RowBoundary[] = [];
	for (let index = 0; index < properties.length; index += 1) {
		const property = properties[index]! as PropertyAssignment;
		const nameEnd = (property.postfixToken ?? property.name).getEnd();
		const colon = tokenAfter(source, nameEnd, ":");
		if (!colon) return undefined;
		boundaries.push({ axis: `colon${index + 1}`, from: nameEnd, at: colon });
		if (spacesOnly(source, colon + 1, property.initializer.getStart())) {
			boundaries.push({ axis: `value${index + 1}`, from: colon + 1, at: property.initializer.getStart() });
		}
		const last = index === properties.length - 1;
		const boundaryAnchor = property.initializer.getEnd();
		const boundary = tokenAfter(source, boundaryAnchor, last ? "}" : ",");
		if (!boundary) return undefined;
		boundaries.push({ axis: last ? "close-brace" : `comma${index + 1}`, from: boundaryAnchor, at: boundary });
	}
	const tail = closerTail(source, node);
	if (tail !== undefined) boundaries.push({ axis: "tail", from: node.getEnd(), at: tail, insert: true });
	return boundaries;
}

function detectRegistrationRow(source: SourceFile, node: Node): readonly RowBoundary[] | undefined {
	if (!isPropertyAssignment(node)) return undefined;
	if (!ownLineOf(source, node, COMMA_REST)) return undefined;
	const nameEnd = (node.postfixToken ?? node.name).getEnd();
	const colon = tokenAfter(source, nameEnd, ":");
	if (!colon) return undefined;
	const boundaries: RowBoundary[] = [{ axis: "colon", from: nameEnd, at: colon }];
	if (spacesOnly(source, colon + 1, node.initializer.getStart())) {
		boundaries.push({ axis: "value", from: colon + 1, at: node.initializer.getStart() });
	}
	return boundaries;
}

/**
 * 종류 우선순위. 같은 노드를 둘 이상의 종류가 점유하지 않도록 노드 문법이 서로 겹치지 않는
 * 순서로 두고, 배열 원소 객체는 object-rows가 선점하면 registration이 seen으로 물린다.
 */
export const ROW_KINDS: readonly RowKind[] = [
	{
		name       : "declaration",
		gap        : "blank",
		containers : node => (isSourceFile(node) || isBlock(node)) ? node.statements : undefined,
		detect     : detectDeclaration,
		groupName  : run => run.some(row => row.boundaries.some(boundary => boundary.axis === "equals")) ? "declaration-equals" : "declaration",
	},
	{
		name       : "type-alias",
		gap        : "blank",
		containers : node => (isSourceFile(node) || isBlock(node)) ? node.statements : undefined,
		detect     : detectTypeAlias,
	},
	{
		name       : "type-members",
		gap        : "blank",
		containers : node => isTypeLiteralNode(node) ? node.members : undefined,
		detect     : detectMember,
	},
	{
		name       : "method-signature",
		gap        : "blank",
		containers : node => isInterfaceDeclaration(node) ? node.members : undefined,
		detect     : detectMethod,
	},
	{
		name       : "interface-members",
		gap        : "blank",
		containers : node => isInterfaceDeclaration(node) ? node.members : undefined,
		detect     : detectMember,
	},
	{
		name       : "class-method",
		gap        : "blank",
		containers : node => isClassDeclaration(node) ? node.members : undefined,
		detect     : detectMethod,
	},
	{
		name       : "class-members",
		gap        : "blank",
		containers : node => isClassDeclaration(node) ? node.members : undefined,
		detect     : detectMember,
	},
	{
		name       : "assignments",
		gap        : "blank",
		containers : node => (isSourceFile(node) || isBlock(node)) ? node.statements : undefined,
		detect     : detectAssignments,
	},
	{
		name       : "enum-member",
		gap        : "comma",
		containers : node => isEnumDeclaration(node) ? node.members : undefined,
		detect     : detectEnumMember,
	},
	{
		name       : "case-clause",
		gap        : "blank",
		containers : node => isSwitchStatement(node) ? node.caseBlock.clauses : undefined,
		detect     : detectCaseClause,
	},
	{
		name       : "object-rows",
		gap        : "comma",
		containers : node => {
			if (!isArrayLiteralExpression(node)) return undefined;
			if (!node.elements.every(element => objectLiteralOf(element) !== undefined)) return undefined;
			return node.elements;
		},
		detect     : detectObjectRow,
	},
	{
		name       : "registration",
		gap        : "comma",
		containers : (node, seen) => {
			if (!isObjectLiteralExpression(node) || seen.has(node)) return undefined;
			return node.properties;
		},
		detect     : detectRegistrationRow,
	},
];

/** 축 이름이 어떤 문법 경계인지 사람이 읽는 설명. 새 축을 등록하면 함께 채운다. */
export const AXIS_NOTES: Readonly<Record<string, string>> = {
	"colon"       : "이름·식별자 뒤 타입 또는 실행식 구분 `:`",
	"equals"      : "선언·별칭·enum 멤버의 `=`",
	"semicolon"   : "문장 종결 `;`",
	"comma"       : "행 구분 `,`",
	"comment"     : "우측 `//` 설명 시작 열",
	"open-paren"  : "매개변수 여는 `(` (이름 폭 이후)",
	"close-paren" : "매개변수 닫는 `)` (내부 최소 폭 이후)",
	"case-colon"  : "case 라벨의 `:`",
	"call-paren"  : "case 행 첫 호출의 여는 `(`",
	"return-tail" : "case 행 끝 bare `return;`의 시작 열",
	"value"       : "등록 객체 실행식 시작 열",
	"close-brace" : "객체 행 닫는 `}`",
	"tail"        : "객체 행 `}` 뒤 꼬리(`,` `;` `)` `as const`)",
};

export function syntaxKindName(node: Node): string {
	return SyntaxKind[node.kind] ?? `Kind${String(node.kind)}`;
}

/**
 * 종류별 축 계약 — 코드를 쓰는 시점(프롬프트·문서 예시)과 검사하는 시점(06_align-tables)이
 * 함께 보는 단일 기준이다. gap은 최소 한 칸 여백을 남기는 축, insert는 기존 관습(`):`,
 * `":`, `//`)을 보존하며 열만 맞추는 축이다. `{i}`는 객체 행의 속성 위치별 축이다.
 */
export const KIND_AXES: Readonly<Record<string, { readonly gap: readonly string[]; readonly insert: readonly string[] }>> = {
	"declaration"       : { gap: ["colon", "semicolon"], insert: ["comment"] },
	"declaration-equals": { gap: ["colon", "equals", "semicolon"], insert: ["comment"] },
	"type-alias"        : { gap: ["equals", "semicolon"], insert: ["comment"] },
	"method-signature"  : { gap: [], insert: ["open-paren", "close-paren", "colon", "comment"] },
	"class-method"      : { gap: [], insert: ["open-paren", "close-paren", "colon", "comment"] },
	"interface-members" : { gap: ["colon", "equals", "semicolon"], insert: ["comment"] },
	"type-members"      : { gap: ["colon", "equals", "semicolon"], insert: ["comment"] },
	"class-members"     : { gap: ["colon", "equals", "semicolon"], insert: ["comment"] },
	"enum-member"       : { gap: ["equals", "comma"], insert: ["comment"] },
	"case-clause"       : { gap: [], insert: ["case-colon", "call-paren", "return-tail"] },
	"assignments"       : { gap: ["equals", "semicolon"], insert: ["comment"] },
	"object-rows"       : { gap: ["colon{i}", "value{i}", "comma{i}"], insert: ["close-brace", "tail"] },
	"registration"      : { gap: ["colon", "value"], insert: [] },
};

export interface DetectedRow {
	readonly node       : Node;
	readonly boundaries : readonly RowBoundary[];
}

/** 컨테이너 형제 중 같은 종류의 연속 행만 묶는다. 빈 줄·주석·다른 구문이 사이에 있으면 표가 끊긴다. */
export function runsOf(source: SourceFile, siblings: readonly Node[], kind: RowKind): readonly (readonly DetectedRow[])[] {
	const commaGap = kind.gap === "comma";
	const runs: DetectedRow[][] = [];
	let current: DetectedRow[] = [];
	let previousEnd: number | undefined;
	for (const sibling of siblings) {
		const boundaries = kind.detect(source, sibling);
		const gap = previousEnd === undefined || boundaries === undefined ? undefined : source.text.slice(previousEnd, sibling.getStart(source));
		const continues = boundaries !== undefined && (previousEnd === undefined || (commaGap ? /^[ \t]*,?[ \t]*\r?\n[ \t]*$/u : /^[ \t]*\r?\n[ \t]*$/u).test(gap ?? ""));
		if (continues) current.push({ node: sibling, boundaries });
		else {
			if (current.length > 0) runs.push(current);
			current = boundaries ? [{ node: sibling, boundaries }] : [];
		}
		previousEnd = sibling.getEnd();
	}
	if (current.length > 0) runs.push(current);
	return runs.filter(run => run.length > 0);
}
