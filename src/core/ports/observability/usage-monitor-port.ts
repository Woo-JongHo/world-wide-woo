export type UsageProviderId = "openai-codex" | "anthropic" | "google" | "zai"                 ;
export type UsageState      = "loading" | "ready" | "auth-required" | "unsupported" | "error" ;
export type UsageIssueKind  = "rate-limit" | "authentication" | "network" | "provider"        ;

export interface UsageIssue {
	kind: UsageIssueKind;
	retryAt?: number;
}

export interface UsageLimitSnapshot {
	label             : string                                     ;
	usedPercent?      : number                                     ;
	remainingPercent? : number                                     ;
	resetsAt?         : number                                     ;
	status            : "ok" | "warning" | "exhausted" | "unknown" ;
}

export interface UsageSnapshot {
	provider  : UsageProviderId      ;
	state     : UsageState           ;
	fetchedAt : number               ;
	limits    : UsageLimitSnapshot[] ;
	/** 마지막 성공 limits를 보존했지만 이번 refresh는 실패했음을 뜻한다. */
	stale?    : boolean              ;
	issue?    : UsageIssue           ;
}

/** `UsageService`가 실제 보유한 마지막 성공 snapshot 캐시의 읽기 전용 관측값이다. */
export interface UsageSnapshotCacheMetrics {
	readonly entries        : number        ;
	readonly hits           : number        ;
	readonly misses         : number        ;
	readonly evictions      : number        ;
	readonly lastAccessedAt : string | null ;
}

export interface UsageMonitor {
	/**
	 * 각 provider의 조회 시각과 실패를 담은 read model을 돌려준다. 구현은 마지막 성공
	 * limits를 `stale: true`로 보존할 수 있지만, `error`와 `stale`을 같은 상태로 취급하지 않는다.
	 */
	refresh     ()                                                                            : Promise<readonly UsageSnapshot[]>;
	startPolling(listener: (snapshots: readonly UsageSnapshot[]) => void, intervalMs?: number): () => void;
	cacheMetrics()                                                                            : UsageSnapshotCacheMetrics;
}
