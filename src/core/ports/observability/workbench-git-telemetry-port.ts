export interface WorkbenchGitTelemetry {
	readonly branch    : string | null ;
	readonly staged    : number        ;
	readonly unstaged  : number        ;
	readonly untracked : number        ;
}

export interface WorkbenchGitTelemetryReader {
	/**
	 * 현재 cwd의 새 Git 관측값만 반환한다. `null`은 Git 상태를 읽지 못했거나 알 수 없음을
	 * 뜻하며, 이 Port는 이전 값을 stale cache로 보존하지 않는다.
	 */
	read(cwd: string): Promise<WorkbenchGitTelemetry | null>;
}
