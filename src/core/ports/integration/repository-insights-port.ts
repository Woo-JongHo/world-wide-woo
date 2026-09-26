import type { CommitSummary, IssueState, IssueSummary, RepositorySnapshot } from "@/core/domain/development/repository";

export interface RepositoryInsights {
	/** 각 호출은 현재 외부 원천의 결과다. 실패와 이전 결과의 보존은 소비자 정책이 결정한다. */
	snapshot     ()                                   : Promise<RepositorySnapshot>;
	recentCommits(limit?: number                     ): Promise<readonly CommitSummary[]>;
	issues       (state?: IssueState, limit?: number ): Promise<readonly IssueSummary[]>;
}
