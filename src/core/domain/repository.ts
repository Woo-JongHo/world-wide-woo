export type ChangedFileKind = "added" | "modified" | "deleted" | "renamed" | "untracked";

/** A path and its Git working-tree state, safe to render directly. */
export interface ChangedFile {
	path: string;
	kind: ChangedFileKind;
	staged: boolean;
	unstaged: boolean;
	untracked: boolean;
	previousPath?: string;
}

export interface CommitSummary {
	id: string;
	shortId: string;
	subject: string;
	author: string;
	authoredAt: string;
}

export type IssueState = "open" | "closed";

export interface IssueSummary {
	number: number;
	title: string;
	state: IssueState;
	labels: readonly string[];
	updatedAt: string;
	url: string;
}

export interface RepositorySnapshot {
	root: string;
	branch: string;
	upstream?: string;
	ahead: number;
	behind: number;
	changedFiles: readonly ChangedFile[];
	head?: CommitSummary;
}
