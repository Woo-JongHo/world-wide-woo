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
			throw new Error(`Missing repository traceability target: ${reference.id}`);
		}
	}
	return manifest;
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
			if (!issue) throw new Error(`Unregistered ${id}: ${annotation.path}`);
			if (!relatedWorkReferences(manifest, issue).some(reference =>
				referenceKey(reference) === referenceKey(pathReference)
			)) throw new Error(`Unlinked ${id}: ${annotation.path}`);
			declaredIssues.add(id);
		}
	}

	if (options.requireCodeDeclaration && codeDeclarations === 0) {
		throw new Error("No @linear declaration exists in production code");
	}
	return Object.freeze({
		declarations,
		codeDeclarations,
		issueIds: Object.freeze([...declaredIssues].sort()),
	});
}
