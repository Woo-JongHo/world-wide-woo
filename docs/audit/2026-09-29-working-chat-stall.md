# Chat 갱신 중 Working 표시 지연

## 관측과 원인 범위

사용자가 Chat에 내용이 올라갈 때 Working도 끊긴다고 보고했다. 현재 cmux WWW 프로세스는 2026-09-29 06:00:23에 이 저장소에서 시작했다. 이전 Chat 캐시 수정은 05:54에 저장됐으므로 이전 변경을 읽지 않았다고 단정할 수 없다. 이번 shell 수정은 06:02 이후여서 현재 프로세스에서 반영 여부를 확인하지 않았다.

코드에서 확인한 두 비용:

1. Working/stage 애니메이션은 120ms 프레임인데 자체 타이머는 1초였다. 이벤트가 없을 때 프레임을 건너뛴다. 화면이 보이는 workbench에서 motion 활성 시 120ms, reduced motion은 1초로 맞췄다.
2. compact TEST 패널 캐시에 전체 snapshot revision이 포함돼 있었다. Chat draft가 바뀌어도 동일 테스트 출력이 다시 파싱된다. UI 렌더와 같은 JS 실행 흐름이어서 해당 동기 작업 동안 Working도 다음 프레임을 그릴 수 없다.

불변 테스트 입력 트리를 검증한 경우에만 activities/turn identity로 재사용한다. 변경된 관측은 재계산하며 mutable 입력은 기존 revision 무효화를 유지한다. 시간 기반 표시·상태 권위는 그대로다. terminal 상태 확인 중은 실제 조회가 아닌 미관측 fallback이므로 경과 시간만 표시하고 관측된 도구 수가 있을 때 덧붙인다.

## 재생 계측

28,077 byte 테스트 출력 40건, 동일 frozen 관측과 변경되는 draft/revision, compact sidebar 55열, 각 30회. 이전 캐시 조건만 Bun onLoad에서 공급해 비교했다. p95 14.90→1.65ms, p50 7.93→0.36ms. 합성 fixture이므로 실제 세션 기여 시간이나 Codex parity로 일반화하지 않는다. fixture 동결은 측정 밖이며 초기 파싱도 warm-up 밖이다.

## 검증과 남은 범위

TypeScript와 diff 검사, import 정규화·표 정렬을 실행했다. 변경 파일의 TODO 탐색은 기존 TODO 패널 문자열 한 건이며 구현 placeholder가 아니다. 별도 테스트 스위트는 실행하지 않았다. 기존 memory terminal frame benchmark 결과는 Evidence에 보관한다. 새 코드로 실행한 실제 CMux의 Chat 도착 시 프레임·이벤트 루프·terminal write 측정은 남아 있다. Claude 독립 리뷰와 Opus 감사는 앞선 인증 오류로 미실행이며 완료를 주장하지 않는다.

연결: WOO-915 (In Progress), .www/evidence/2026-09-29-working-chat-stall
