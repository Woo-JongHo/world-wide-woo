import type { ProjectActivity } from "@/core/domain/execution/project-activity.js" ;
import type { DiffFileKind    } from "@/core/domain/execution/file-diff.js"        ;
import      { diffStats       } from "@/core/domain/execution/file-diff.js"        ;
import      { asRecord        } from "@/core/domain/value/record.js"               ;

/** One file touched by a native `fileChange` item, ready for a CHANGE row and its diff body. */
export interface FileChange {
	readonly path     : string        ;
	readonly name     : string        ;
	readonly fileKind : DiffFileKind  ;
	readonly added    : number | null ;
	readonly removed  : number | null ;
	readonly diff     : string | null ;
}

/** Projects every path-bearing change of a file-change activity; other activities have none. */
export function projectFileChanges(activity: ProjectActivity | undefined): readonly FileChange[] {
	if (activity?.kind !== "file-change") return [];
	const item    = asRecord(asRecord(activity.payload.params)?.item) ;
	const changes = Array.isArray(item?.changes) ? item.changes : []  ;
	return changes.flatMap(value => {
		const change = asRecord(value)                                                          ;
		const path   = typeof change?.path === "string" ? change.path.replace(/\\/gu, "/") : "" ;
		if (!change || !path) return [];
		return [fileChange(path, fileKindOf(change.kind), typeof change.diff === "string" ? change.diff : null)];
	});
}

function fileChange(path: string, fileKind: DiffFileKind, diff: string | null): FileChange {
	const stats = diff === null ? null : diffStats(diff, fileKind);
	return Object.freeze({
		path,
		name    : path.split("/").at(-1) ?? path,
		fileKind,
		added   : stats?.added ?? null,
		removed : stats?.removed ?? null,
		diff,
	});
}

function fileKindOf(kind: unknown): DiffFileKind {
	const type = typeof kind === "string" ? kind : asRecord(kind)?.type;
	return type === "add" || type === "delete" ? type : "update";
}
