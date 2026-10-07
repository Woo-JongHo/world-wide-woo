# PLAN·PROGRESS·TEST 재점검과 Git Bash 해석 누락

## 문제와 수정

일반 Shell 실행은 action narration 스케줄러에 전달되지 않았고, 단순 명령의 고정 설명은 모델 해석 완료로 처리돼 AI 호출을 생략했다. Chat 카드 역시 toolActions를 읽지 않았으며 AI 응답만 바뀌는 snapshot은 durable 캐시 갱신 기준에서 빠져 있었다. 원본 tool command는 표시됐지만 요청 목적과 연결되는 AI 해석은 빠졌다.

명령 시작부터 최신20 item을 해석 큐에 보내며 명령 설명을 먼저 표시하고 모델 설명·이유가 도착하면 교체한다. 실행 status와 해석 status/source를 분리했고 모델 실패에서는 명령 설명을 보존한다. 실제 thread·turn·item identity에 맞는 카드에만 붙인다. 같은 item의 완료와 이전 lifecycle 재생은 새 해석 호출을 만들지 않는다. Native 명령 출력과 private reasoning은 해석 입력에서 제외한다.

Chat 캐시는 toolActions를 revision과 immutable proof에 포함한다. 해석만 바뀌면 바뀐 설명 블록만 다시 계산하고 실행 카드의 원문을 유지한다. 선택 이유는 모델 해석으로 명시한다.

## 현재 수락

PLAN은 모든 요청의 목록 강제 생성이 아니라 필요 여부 판단 후 Native checklist를 받는 현재 계약이다. 필요한데 checklist가 없으면 대기로 표시한다. 항상 목록을 원한다는 기존 사용자 기대와의 정책 차이는 남아 있다. PROGRESS의 작업 중 표시 누락과 빈 WORK 요약 fallback은 앞 작업에서 보완했고 실제 Workspace 회귀를 이번에도 통과했다. TEST는 코드 변경 없는 검증도 표시하며 완료 관측과 테스트 이름에 결박된 목적·이유를 표시한다. 단위·통합·E2E 유형 메타데이터 계약은 아직 없다. Redirect 출력에서 테스트 이름이 관측되지 않으면 해석이 유예된다. 전체 기능 수락은 HOLD다.

## 검증

단위 재현과 FakeNative→ProjectWorkbench→실제 Chat 렌더 통합, narration-only immutable cache 갱신·실패·다른 turn 경계 검증을 수행했다. 독립 실제 PiActivityNarrator에 synthetic 목표·명령을 보내4.37초에 what/why를 받았다. 이는 사용자 실행 세션의 화면 수락과 분리된 검증이다.

관련103개 실행은100 pass·3 fail이며 전체 PASS가 아니다. 이전 narration 모듈과 이전 recording 테스트를 remap한 source replay는34 pass·4 fail이고, 현재3실패는 모두 기존 실패다. 새 실패 이름은 없다. Cache확대 검사는6 fail이고 변경 전 source replay도 같은6이 실패한다. 새 기능 집중43개는 모두 통과했다. 실행 수치·해시는 evidence JSON과 로그에 보존한다. Memory Terminal benchmark는 warm2.83ms,long draft20.12ms이며 cold192ms/new width139ms를 포함해 첫 표시 비용은 별도 잔여다.

Obsidian WHY·표시 출처 개정 후보는 같은 WOO-679 capability로 준비한다. 기존 문서 document_id 부재로 게시 게이트는 차단된다. 기존 원문을 덮어쓰거나 새 UUID를 임의로 발급하지 않는다.

[증거](../../.www/evidence/2026-10-07-shell-narration/)

## 독립 감사

Sonnet 5는 직전 같은 작업 세션의 한도 응답을 재사용해 미실행으로 기록했다. 이번 Opus 최종 감사도 실제 호출 뒤 세션 한도 응답 exit1로 미실행이다. 하위 모델로 대체하지 않았다. 코드와 테스트 근거는 보존하지만 독립 감사 수락은 blocker다.
