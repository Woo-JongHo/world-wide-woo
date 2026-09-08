export type RuntimeProvenanceState = "matched" | "mismatched" | "unverifiable";
export type RuntimeProvenanceReason =
	| "runtime-source-unavailable"
	| "workspace-source-unavailable"
	| "runtime-revision-unavailable"
	| "workspace-revision-unavailable"
	| "runtime-dirty-unavailable"
	| "workspace-dirty-unavailable"
	| "source-root"
	| "revision"
	| "dirty";

export interface RuntimeIdentity {
	readonly sourceRoot: string | null;
	readonly entrypoint: string | null;
	readonly revision: string | null;
	readonly dirty: boolean | null;
	readonly packageName: string | null;
	readonly packageVersion: string | null;
}

export interface RuntimeProvenance {
	readonly state: RuntimeProvenanceState;
	readonly reasons: readonly RuntimeProvenanceReason[];
	readonly runtime: RuntimeIdentity;
	readonly workspace: RuntimeIdentity;
}

/** Determines whether the process that produced evidence loaded the workspace being evaluated. */
export function assessRuntimeProvenance(runtime: RuntimeIdentity, workspace: RuntimeIdentity): RuntimeProvenance {
	const unavailable: RuntimeProvenanceReason[] = [];
	if (!runtime.sourceRoot) unavailable.push("runtime-source-unavailable");
	if (!workspace.sourceRoot) unavailable.push("workspace-source-unavailable");
	if (!runtime.revision) unavailable.push("runtime-revision-unavailable");
	if (!workspace.revision) unavailable.push("workspace-revision-unavailable");
	if (runtime.dirty === null) unavailable.push("runtime-dirty-unavailable");
	if (workspace.dirty === null) unavailable.push("workspace-dirty-unavailable");
	if (unavailable.length > 0) return Object.freeze({ state: "unverifiable", reasons: Object.freeze(unavailable), runtime, workspace });

	const reasons: RuntimeProvenanceReason[] = [];
	if (runtime.sourceRoot !== workspace.sourceRoot) reasons.push("source-root");
	if (runtime.revision !== workspace.revision) reasons.push("revision");
	if (runtime.dirty !== workspace.dirty) reasons.push("dirty");
	return Object.freeze({ state: reasons.length > 0 ? "mismatched" : "matched", reasons: Object.freeze(reasons), runtime, workspace });
}
