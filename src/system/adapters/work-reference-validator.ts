import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { isRepositoryPathReference, type WorkTraceabilityManifest } from "../contracts/work/traceability.js";

/** Repository-backed work references are checked before any Map projection is accepted. */
export async function assertRepositoryReferencesExist(manifest: WorkTraceabilityManifest, projectRoot: string): Promise<void> {
	const root = await realpath(projectRoot);
	for (const reference of manifest.references.filter(isRepositoryPathReference)) {
		const candidate = await realpath(resolve(root, reference.id)).catch(() => undefined);
		if (!candidate) throw new Error(`Missing repository work reference: ${reference.kind}:${reference.id}`);
		const local = relative(root, candidate);
		if (local === ".." || local.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(local)) {
			throw new Error(`Repository work reference escapes project root: ${reference.kind}:${reference.id}`);
		}
		if (!(await stat(candidate)).isFile()) throw new Error(`Repository work reference is not a file: ${reference.kind}:${reference.id}`);
	}
}
