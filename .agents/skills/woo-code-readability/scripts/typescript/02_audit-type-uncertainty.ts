#!/usr/bin/env bun

import { existsSync, realpathSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";

import { API } from "typescript/unstable/async";
import {
	SyntaxKind,
	isAsExpression,
	isIdentifier,
	isJSDocOptionalType,
	isMethodDeclaration,
	isMethodSignatureDeclaration,
	isNamedTupleMember,
	isNonNullExpression,
	isOptionalTypeNode,
	isParameterDeclaration,
	isPropertyDeclaration,
	isPropertySignatureDeclaration,
	isTypeAssertion,
	isVariableDeclaration,
	type Node,
	type PropertyDeclaration,
	type PropertySignatureDeclaration,
	type SourceFile,
} from "typescript/unstable/ast";

type FindingKind =
	| "optional-property"
	| "optional-parameter"
	| "optional-method"
	| "optional-tuple-element"
	| "optional-type"
	| "null"
	| "undefined"
	| "non-null-assertion"
	| "definite-assignment"
	| "as-assertion"
	| "angle-bracket-assertion";

interface Finding {
	kind   : FindingKind;
	line   : number;
	column : number;
	text   : string;
}

function compareText(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}

function targetArgument(): string {
	if (process.argv.length !== 4 || process.argv[2] !== "--file" || !process.argv[3] || process.argv[3].startsWith("--")) {
		throw new Error("usage: 02_audit-type-uncertainty.ts --file <repository TypeScript file>");
	}
	return process.argv[3];
}

function repositoryFile(root: string, value: string): { absolute: string; relative: string } {
	const absolute = resolve(root, value);
	const path     = relative(root, absolute).replaceAll("\\", "/");
	if (!path || path === ".." || path.startsWith("../")) throw new Error(`--file은 저장소 안의 파일이어야 합니다: ${value}`);
	if (!existsSync(absolute) || !statSync(absolute).isFile()) throw new Error(`--file 대상이 실제 파일이 아닙니다: ${value}`);
	const physical = relative(realpathSync(root), realpathSync(absolute)).replaceAll("\\", "/");
	if (physical === ".." || physical.startsWith("../")) throw new Error(`--file의 실제 대상이 저장소 밖에 있습니다: ${value}`);
	if (!/\.[cm]?[jt]sx?$/u.test(path)) throw new Error(`--file은 JavaScript 또는 TypeScript 파일이어야 합니다: ${value}`);
	return { absolute, relative: path };
}

function excerpt(node: Node, source: SourceFile): string {
	const value = node.getText(source).replace(/\s+/gu, " ").trim();
	return value.length <= 120 ? value : `${value.slice(0, 117)}...`;
}

function errorMessage(value: unknown): string {
	return value instanceof Error ? value.message : String(value);
}

async function main(): Promise<void> {
	const root   = process.cwd();
	const target = repositoryFile(root, targetArgument());
	const api    = new API({ cwd: root });
	const state  = await api.updateSnapshot({ openFiles: [target.absolute] });
	const project = await state.getDefaultProjectForFile(target.absolute);
	if (!project) throw new Error(`TypeScript project를 찾을 수 없습니다: ${target.relative}`);
	const loaded = await project.program.getSourceFile(target.absolute);
	if (!loaded) throw new Error(`TypeScript source AST를 읽을 수 없습니다: ${target.relative}`);
	const source: SourceFile = loaded;
	const found = new Map<string, Finding>();
	const visited = new Set<string>();

	function add(kind: FindingKind, position: number, owner: Node): void {
		const location = source.getLineAndCharacterOfPosition(position);
		const finding  = {
			kind,
			line   : location.line + 1,
			column : location.character + 1,
			text   : excerpt(owner, source),
		};
		found.set(`${position}:${kind}`, finding);
	}

	function addToken(kind: FindingKind, token: Node | undefined, owner: Node): void {
		if (token) add(kind, token.getStart(source), owner);
	}

	function addPostfix(node: PropertyDeclaration | PropertySignatureDeclaration): void {
		if (node.postfixToken?.kind === SyntaxKind.QuestionToken) addToken("optional-property", node.postfixToken, node);
		if (node.postfixToken?.kind === SyntaxKind.ExclamationToken) addToken("definite-assignment", node.postfixToken, node);
	}

	function visit(node: Node): void {
		const identity = `${node.kind}:${node.pos}:${node.end}`;
		if (visited.has(identity)) return;
		visited.add(identity);

		if (isPropertySignatureDeclaration(node) || isPropertyDeclaration(node)) addPostfix(node);
		if (isParameterDeclaration(node)) addToken("optional-parameter", node.questionToken, node);
		if (isMethodSignatureDeclaration(node) || isMethodDeclaration(node)) {
			if (node.postfixToken?.kind === SyntaxKind.QuestionToken) addToken("optional-method", node.postfixToken, node);
		}
		if (isNamedTupleMember(node)) addToken("optional-tuple-element", node.questionToken, node);
		if (isOptionalTypeNode(node) || isJSDocOptionalType(node)) add("optional-type", node.getEnd() - 1, node);
		if (isVariableDeclaration(node)) addToken("definite-assignment", node.exclamationToken, node);

		if (node.kind === SyntaxKind.NullKeyword) add("null", node.getStart(source), node);
		if (node.kind === SyntaxKind.UndefinedKeyword || isIdentifier(node) && node.text === "undefined") {
			add("undefined", node.getStart(source), node);
		}
		if (isNonNullExpression(node)) add("non-null-assertion", node.expression.getEnd(), node);
		if (isAsExpression(node)) {
			const between = source.text.slice(node.expression.getEnd(), node.type.getStart(source));
			const offset  = /\bas\b/u.exec(between)?.index;
			add("as-assertion", offset === undefined ? node.getStart(source) : node.expression.getEnd() + offset, node);
		}
		if (isTypeAssertion(node)) add("angle-bracket-assertion", node.getStart(source), node);

		for (const document of node.jsDoc ?? []) visit(document);
		node.forEachChild(child => {
			visit(child);
			return undefined;
		});
	}

	visit(source);

	const findings = [...found.values()].sort((left, right) =>
		left.line - right.line || left.column - right.column || compareText(left.kind, right.kind),
	);
	const byKind = new Map<FindingKind, number>();
	for (const finding of findings) byKind.set(finding.kind, (byKind.get(finding.kind) ?? 0) + 1);

	console.log(`type-uncertainty findings=${findings.length} file=${target.relative}`);
	if (byKind.size > 0) {
		const summary = [...byKind]
			.sort(([left], [right]) => compareText(left, right))
			.map(([kind, count]) => `${kind}=${count}`)
			.join(" ");
		console.log(`kinds  ${summary}`);
	}
	for (const finding of findings) {
		console.log(`  ${String(finding.line).padStart(4)}:${String(finding.column).padEnd(3)} ${finding.kind.padEnd(24)} ${finding.text}`);
	}
}

try {
	await main();
	process.exit(0);
} catch (error) {
	console.error(errorMessage(error));
	process.exit(1);
}
