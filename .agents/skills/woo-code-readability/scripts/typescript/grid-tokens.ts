/**
 * 토큰(., ,, :, {}, (), ;)이 어떤 AST 역할일 때만 "경계"로 인정되는지 판정한다.
 * 텍스트 indexOf 대신 AST 노드 경계 + skipTrivia로 위치를 찾아 문자열·주석·삼항연산자 안의
 * 동일 문자와 충돌하지 않는다. 판정 자체가 그룹핑을 대신하지는 않는다 — 그룹핑은
 * 01_group-regions.ts가 같은 SyntaxKind의 형제 행을 묶는 방식으로 이미 역할을 분리한다.
 */
import {
	isArrayLiteralExpression,
	isBlock,
	isCallExpression,
	isConditionalExpression,
	isExpressionStatement,
	isObjectLiteralExpression,
	isParameterDeclaration,
	isPropertyAssignment,
	isPropertyDeclaration,
	isPropertySignatureDeclaration,
	isVariableStatement,
	type Node,
	type SourceFile,
} from "typescript/unstable/ast";
import { skipTrivia } from "typescript/unstable/ast/scanner";

export type BoundaryRole =
	| "type-annotation-colon"
	| "object-literal-colon"
	| "ternary-colon"
	| "call-arg-comma"
	| "array-comma"
	| "object-comma"
	| "statement-semicolon"
	| "block-brace"
	| "object-literal-brace"
	| "array-bracket"
	| "call-paren";

export interface Boundary {
	readonly role  : BoundaryRole;
	readonly start : number;
	readonly end   : number;
}

function tokenAt(role: BoundaryRole, start: number, length = 1): Boundary {
	return { role, start, end: start + length };
}

function charTokenAt(role: BoundaryRole, source: SourceFile, position: number, char: string): Boundary | undefined {
	return source.text[position] === char ? tokenAt(role, position) : undefined;
}

/** 삼항연산자 `:`와 속성/매개변수/객체 리터럴 `:`를 서로 다른 role로 반환한다. 같은 role끼리만 같은 표로 묶는다. */
export function colonOf(node: Node, source: SourceFile): Boundary | undefined {
	if (isConditionalExpression(node)) {
		return tokenAt("ternary-colon", node.colonToken.getStart(source), node.colonToken.getEnd() - node.colonToken.getStart(source));
	}
	if (isParameterDeclaration(node)) {
		const gapStart = (node.questionToken ?? node.name).getEnd();
		return charTokenAt("type-annotation-colon", source, skipTrivia(source.text, gapStart), ":");
	}
	if (isPropertySignatureDeclaration(node) || isPropertyDeclaration(node)) {
		const gapStart = (node.postfixToken ?? node.name).getEnd();
		return charTokenAt("type-annotation-colon", source, skipTrivia(source.text, gapStart), ":");
	}
	if (isPropertyAssignment(node)) {
		const gapStart = (node.postfixToken ?? node.name).getEnd();
		return charTokenAt("object-literal-colon", source, skipTrivia(source.text, gapStart), ":");
	}
	return undefined;
}

/** 종결 `;`. ASI로 세미콜론이 없는 문장은 undefined를 돌려줘 정렬 대상에서 빠진다. */
export function semicolonOf(node: Node, source: SourceFile): Boundary | undefined {
	if (isExpressionStatement(node)) {
		return charTokenAt("statement-semicolon", source, skipTrivia(source.text, node.expression.getEnd()), ";");
	}
	if (isVariableStatement(node)) {
		return charTokenAt("statement-semicolon", source, skipTrivia(source.text, node.declarationList.getEnd()), ";");
	}
	return undefined;
}

/** 함수 인자·배열 원소·객체 속성 사이의 `,`. 컨테이너 종류별로 role이 갈린다. */
export function commasOf(node: Node, source: SourceFile): readonly Boundary[] {
	const [role, items] = isCallExpression(node) ? (["call-arg-comma", node.arguments] as const)
		: isArrayLiteralExpression(node) ? (["array-comma", node.elements] as const)
		: isObjectLiteralExpression(node) ? (["object-comma", node.properties] as const)
		: (["array-comma", []] as const);
	const boundaries: Boundary[] = [];
	for (let index = 0; index < items.length - 1; index += 1) {
		const boundary = charTokenAt(role, source, skipTrivia(source.text, items[index].getEnd()), ",");
		if (boundary) boundaries.push(boundary);
	}
	return boundaries;
}

/** 같은 셀을 감싸는 여닫는 경계 쌍. block/object literal/array literal은 노드 자체의 시작·끝이 곧 토큰이다. */
export function bracketsOf(node: Node, source: SourceFile): { readonly open: Boundary; readonly close: Boundary } | undefined {
	if (isBlock(node)) return pairAt("block-brace", source, node);
	if (isObjectLiteralExpression(node)) return pairAt("object-literal-brace", source, node);
	if (isArrayLiteralExpression(node)) return pairAt("array-bracket", source, node);
	if (isCallExpression(node)) {
		const open  = charTokenAt("call-paren", source, skipTrivia(source.text, node.expression.getEnd()), "(");
		const close = charTokenAt("call-paren", source, node.getEnd() - 1, ")");
		return open && close ? { open, close } : undefined;
	}
	return undefined;
}

function pairAt(role: BoundaryRole, source: SourceFile, node: Node): { readonly open: Boundary; readonly close: Boundary } {
	return { open: tokenAt(role, node.getStart(source)), close: tokenAt(role, node.getEnd() - 1) };
}

/**
 * 실제로 존재하는 경계 축 이름만 모은다. 그룹 리포트용 요약이며 그룹핑 기준 자체는 아니다.
 * `:`·`;`는 행(row) 자신의 경계이고, `,`는 행들을 담은 컨테이너(container)의 경계다 — 배열 원소나
 * 호출 인자처럼 행 자체엔 콤마가 없고 그 행들을 감싼 노드에만 콤마가 있기 때문에 둘을 따로 본다.
 */
export function boundaryAxesOf(container: Node, row: Node, source: SourceFile): readonly BoundaryRole[] {
	const axes: BoundaryRole[] = [];
	const colon = colonOf(row, source);
	if (colon) axes.push(colon.role);
	const semicolon = semicolonOf(row, source);
	if (semicolon) axes.push(semicolon.role);
	const commas = commasOf(container, source);
	if (commas.length > 0) axes.push(commas[0].role);
	return axes;
}
