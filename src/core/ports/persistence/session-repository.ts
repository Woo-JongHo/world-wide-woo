import type { SessionEvent, SessionEventInput } from "@/core/domain/execution/session-events";

export interface SessionRepository {
	append(sessionId: string, input: SessionEventInput): Promise<SessionEvent>;
	readAll(sessionId: string): Promise<SessionEvent[]>;
}

/** 레거시 SessionRuntime 보관소에서 최근 변경된 세션을 식별한다. */
export interface RecentSessionSummary {
	/** 재개할 SessionRuntime의 ID다. */
	id: string;
	/** 세션 보관 파일의 마지막 수정 시각(ISO 8601)이다. */
	updatedAt: string;
}
