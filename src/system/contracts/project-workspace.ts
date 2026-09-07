export interface ProjectWorkspace {
	name: string;
	root: string;
	directory: string;
	sessionsDirectory: string;
	draftsDirectory: string;
	runtimeDirectory: string;
	todosDirectory: string;
	vaultDirectory: string;
	canonicalTodoPath: string;
	legacyTodoPath: string;
	manifestPath: string;
}

export interface SessionLease {
	release(): Promise<void>;
}
