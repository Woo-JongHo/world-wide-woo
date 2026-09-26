import type { LinearProjectDashboard } from "@/core/domain/work/linear-dashboard";

/**
 * 연결된 Native thread 안에서만 실행하는 외부 Linear 프로젝트 조회다.
 *
 * 이 Port는 새 성공 snapshot만 반환한다. 실패를 stale/unavailable로 바꾸고 마지막 성공
 * 값을 보존하는 판단은 Core Workbench가 소유한다.
 */
export interface LinearProjectDashboardReader {
	refresh(threadId: string): Promise<LinearProjectDashboard>;
}
