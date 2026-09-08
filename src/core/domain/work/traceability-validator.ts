import {
	isRepositoryPathReference,
	parseWorkTraceabilityManifest,
	type WorkTraceabilityManifest,
} from "./traceability.js";

export interface WorkTraceabilityPathProbe {
	exists(repoRelativePath: string): Promise<boolean>;
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
