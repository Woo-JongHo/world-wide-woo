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
import {
	isRepositoryPathReference,
	parseWorkTraceabilityManifest,
	referenceKey,
	relatedWorkReferences,
	type LinearIssueReference,
	type WorkTraceabilityManifest,
} from "./traceability.js";

export interface WorkTraceabilityPathProbe {
	exists(repoRelativePath: string): Promise<boolean>;
}

export interface LinearAnnotation {
	readonly path: string;
	readonly kind: "code" | "test";
	readonly issueIds: readonly string[];
}

export interface LinearAnnotationSummary {
	readonly declarations: number;
	readonly codeDeclarations: number;
	readonly issueIds: readonly string[];
}

/** Offline validation only. Remote Linear existence/read-back belongs to an explicit online adapter. */
export async function validateWorkTraceabilityManifest(
	value: unknown,
	paths: WorkTraceabilityPathProbe,
): Promise<WorkTraceabilityManifest> {
	const manifest = parseWorkTraceabilityManifest(value);
	for (const reference of manifest.references) {
		if (isRepositoryPathReference(reference) && !(await paths.exists(reference.id))) {
			throw new Error(`저장소 추적 대상이 없습니다: ${reference.id}`);
		}
	}
	return manifest;
}

export interface LinearAnnotationSource {
	readonly path: string;
	readonly source: string;
}

/** Reads @linear markers only from real TypeScript comments attached to declarations or direct call statements. */
export async function extractLinearIssueIds(source: string): Promise<readonly string[]> {
	const result = await extractLinearIssueIdsByPath([{ path: "input.ts", source }]);
	return result.get("input.ts") ?? Object.freeze([]);
}

/** Parses all supplied sources in one TypeScript compiler snapshot. */
export async function extractLinearIssueIdsByPath(
	sources: readonly LinearAnnotationSource[],
): Promise<ReadonlyMap<string, readonly string[]>> {
	if (new Set(sources.map(source => source.path)).size !== sources.length) {
		throw new Error("TypeScript annotation source 경로가 중복되었습니다");
	}
	if (sources.length === 0) return new Map();

	const virtualRoot = "/code-map-linear-annotations";
	const configPath = `${virtualRoot}/tsconfig.json`;
	const virtualFiles: Record<string, string> = {
		[configPath]: JSON.stringify({ compilerOptions: { noLib: true }, files: sources.map((_, index) => `source-${index}.ts`) }),
	};
	for (const [index, source] of sources.entries()) virtualFiles[`${virtualRoot}/source-${index}.ts`] = source.source;

	const api = new API({ cwd: virtualRoot, fs: createVirtualFileSystem(virtualFiles) });
	try {
		const snapshot = await api.updateSnapshot({ openProjects: [configPath] });
		const project = snapshot.getProject(configPath) ?? snapshot.getProjects()[0];
		if (!project) throw new Error("TypeScript annotation parser가 project를 만들지 못했습니다");
		const result = new Map<string, readonly string[]>();
		for (const [index, source] of sources.entries()) {
			const file = await project.program.getSourceFile(`${virtualRoot}/source-${index}.ts`);
			if (!file) throw new Error(`TypeScript annotation parser가 source를 반환하지 않았습니다: ${source.path}`);
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

/** @linear WOO-695 */
export function validateLinearAnnotations(
	manifest: WorkTraceabilityManifest,
	annotations: readonly LinearAnnotation[],
	options: { readonly requireCodeDeclaration?: boolean } = {},
): LinearAnnotationSummary {
	const issues = new Map(
		manifest.references
			.filter((reference): reference is LinearIssueReference => reference.kind === "linear-issue")
			.map(reference => [reference.id, reference]),
	);
	const declaredIssues = new Set<string>();
	let declarations = 0;
	let codeDeclarations = 0;

	for (const annotation of annotations) {
		const pathReference = { kind: annotation.kind, id: annotation.path } as const;
		for (const id of new Set(annotation.issueIds)) {
			declarations += 1;
			if (annotation.kind === "code") codeDeclarations += 1;
			const issue = issues.get(id);
			if (!issue) throw new Error(`등록되지 않은 ${id}입니다: ${annotation.path}`);
			if (!relatedWorkReferences(manifest, issue).some(reference => referenceKey(reference) === referenceKey(pathReference))) {
				throw new Error(`연결되지 않은 ${id}입니다: ${annotation.path}`);
			}
			declaredIssues.add(id);
		}
	}

	if (options.requireCodeDeclaration && codeDeclarations === 0) {
		throw new Error("제품 코드에 @linear 선언이 없습니다");
	}
	return Object.freeze({ declarations, codeDeclarations, issueIds: Object.freeze([...declaredIssues].sort()) });
}
