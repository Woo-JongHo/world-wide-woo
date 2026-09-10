+# WOO-907 Sonnet 5 독립 리뷰

검토 대상: WOO-907 관련 변경
검토 방식: Claude Sonnet 5, 읽기 전용
결과: findings 있음

## Findings

1. High — Linear 미설정·비-Codex 세션에서도 EMPTY 상태가 unavailable로 노출되어 환영 화면 대신 실패 Dashboard가 나타난다.
   - project-workbench.ts는 옵션이 없어도 EMPTY_LINEAR_PROJECT_DASHBOARD를 snapshot에 싣는다.
   - workbench-views.ts의 unavailable 분기가 welcome보다 먼저 반환한다.
   - 연결 안 됨과 연결됐으나 실패를 구분해야 한다.

2. Medium — 첫 메시지 후 메인 Chat만 전환되고 Todo/Tracer는 Plan이 생기기 전까지 Linear Update·일정을 계속 표시한다.
   - active turn의 계획 대기·공개 실행 없음 상태를 가린다.
   - side panel도 입장 전용 조건으로 게이트해야 한다.

3. Medium — refresh promise가 reject되면 이전 성공 snapshot을 버리고 unavailable로 초기화한다.
   - 마지막 성공 값이 있으면 stale과 error로 보존해야 한다.

4. Medium — ready 중 선제 startThread와 close의 경쟁에서 closed 확인이 없다.
   - startThread/acquire/bind 사이의 종료 안전성을 보강할 필요가 있다.
   - 선제 thread 생성의 비용·리스 정책은 더 넓은 제품 결정이다.

5. Low — sendChat의 linearDashboard refresh 분기는 초기 ready가 thread를 항상 만든다는 전제에서는 도달 불가능하다.

6. Low — 미설정, side panel 전환, catch stale, 실제 thread id 전달 테스트가 없다.

원문 판정: 요구의 큰 골격은 구현되어 있으나 위 문제를 수정해야 한다.

