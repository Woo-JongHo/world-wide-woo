import { API } from "typescript/unstable/async";
import {
	getLeadingCommentRanges,
	isCallExpression,
	isClassDeclaration,
	isClassStaticBlockDeclaration,
	isConstructorDeclaration,
	isEnumDeclaration,
	isExportAssignment,
	isExportDeclaration,
	isExpressionStatement,
	isFunctionDeclaration,
	isGetAccessorDeclaration,
	isImportDeclaration,
	isImportEqualsDeclaration,
	isInterfaceDeclaration,
	isMethodDeclaration,
	isModuleDeclaration,
	isNamespaceExportDeclaration,
	isPropertyDeclaration,
	isSetAccessorDeclaration,
	isTypeAliasDeclaration,
	isVariableStatement,
	type Node,
	type SourceFile,
} from "typescript/unstable/ast";
import { createVirtualFileSystem } from "typescript/unstable/fs";

export interface LinearAnnotationSource {
	readonly path: string;
	readonly source: string;
}

/**
 * Reads @linear markers only from real TypeScript comments attached to declarations or direct call statements.
 * @linear WOO-695
 */
export async function extractLinearIssueIds(source: string): Promise<readonly string[]> {
	const result = await extractLinearIssueIdsByPath([{ path: "input.ts", source }]);
	return result.get("input.ts") ?? Object.freeze([]);
}

/** Parses all supplied sources in one TypeScript compiler snapshot. */
export async function extractLinearIssueIdsByPath(
	sources: readonly LinearAnnotationSource[],
): Promise<ReadonlyMap<string, readonly string[]>> {
	if (new Set(sources.map(source => source.path)).size !== sources.length) {
		throw new Error("Duplicate TypeScript annotation source path");
	}
	if (sources.length === 0) return new Map();

	const virtualRoot = "/code-map-linear-annotations";
	const configPath = `${virtualRoot}/tsconfig.json`;
	const virtualFiles: Record<string, string> = {
		[configPath]: JSON.stringify({
			compilerOptions: { noLib: true },
			files: sources.map((_, index) => `source-${index}.ts`),
		}),
	};
	for (const [index, source] of sources.entries()) {
		virtualFiles[`${virtualRoot}/source-${index}.ts`] = source.source;
	}

	const api = new API({ cwd: virtualRoot, fs: createVirtualFileSystem(virtualFiles) });
	try {
		const snapshot = await api.updateSnapshot({ openProjects: [configPath] });
		const project = snapshot.getProject(configPath) ?? snapshot.getProjects()[0];
		if (!project) throw new Error("TypeScript annotation parser did not create a project");
		const result = new Map<string, readonly string[]>();
		for (const [index, source] of sources.entries()) {
			const file = await project.program.getSourceFile(`${virtualRoot}/source-${index}.ts`);
			if (!file) throw new Error(`TypeScript annotation parser omitted ${source.path}`);
			result.set(source.path, extractLinearIssueIdsFromSourceFile(file));
		}
		return result;
	} finally {
		await api.close();
	}
}

function idsInAnnotationComment(comment: string): readonly string[] {
	const ids = new Set<string>();
	for (const annotation of comment.matchAll(/@linear\s+([^\r\n*]+)/gu)) {
		for (const id of annotation[1]!.match(/WOO-\d+/gu) ?? []) ids.add(id);
	}
	return [...ids];
}

function extractLinearIssueIdsFromSourceFile(file: SourceFile): readonly string[] {
	const ids = new Set<string>();
	const visit = (node: Node): void => {
		if (isAnnotationTarget(node)) {
			for (const comment of getLeadingCommentRanges(file.text, node.getFullStart()) ?? []) {
				if (!isFullLineComment(file.text, comment.pos)) continue;
				for (const id of idsInAnnotationComment(file.text.slice(comment.pos, comment.end))) ids.add(id);
			}
		}
		node.forEachChild(child => { visit(child); });
	};
	file.forEachChild(node => { visit(node); });
	return Object.freeze([...ids]);
}

function isAnnotationTarget(node: Node): boolean {
	return isVariableStatement(node)
		|| isFunctionDeclaration(node)
		|| isClassDeclaration(node)
		|| isInterfaceDeclaration(node)
		|| isTypeAliasDeclaration(node)
		|| isEnumDeclaration(node)
		|| isModuleDeclaration(node)
		|| isImportDeclaration(node)
		|| isImportEqualsDeclaration(node)
		|| isExportDeclaration(node)
		|| isExportAssignment(node)
		|| isNamespaceExportDeclaration(node)
		|| isConstructorDeclaration(node)
		|| isMethodDeclaration(node)
		|| isGetAccessorDeclaration(node)
		|| isSetAccessorDeclaration(node)
		|| isPropertyDeclaration(node)
		|| isClassStaticBlockDeclaration(node)
		|| (isExpressionStatement(node) && isCallExpression(node.expression));
}

function isFullLineComment(source: string, start: number): boolean {
	const lineStart = Math.max(source.lastIndexOf("\n", start - 1), source.lastIndexOf("\r", start - 1)) + 1;
	return source.slice(lineStart, start).trim().length === 0;
}
