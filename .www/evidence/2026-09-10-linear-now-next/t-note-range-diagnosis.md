# T-note source range 진단

## 관찰

- 사용자 표면: `질문 요약 자동 생성 보류`
- 원인 메시지: `T-note source range must contain between 1 and 100 activities`
- 발생 guard: `src/core/domain/work/t-notes.ts`의 `MAX_ACTIVITIES = 100`
- 호출 경로: 완료 turn 자동 복구 → `scheduleAutomaticTNote` → `tnoteRequest` → `TNoteService.create` → `createTNotePacket`

## 재현

- 101개 activity를 `createTNotePacket`에 전달하면 같은 오류가 결정적으로 발생했다.
- 실제 Project Activity journal을 `completedTurnNoteScope`와 같은 조건으로 계산했을 때 100개를 넘는 완료 turn이 확인됐다.
  - 105개: `01a05bd8-4758-73d1-b6a9-b905e511f2b0`
  - 108개: `01a05be5-199a-7970-a7ef-0aa937b940f4`
  - 200개: `01a05c1c-d3c2-7ce1-8a67-8c5e7c88a2d0`
  - 397개: `01a05c58-2476-7373-a5ab-941caee3d524`
  - 310개: `01a05c70-4833-7e00-aab4-f4b41f8c410b`
  - 479개: `01a05ecc-d603-7a22-b06a-df88b3c0ca60`

## 판정

- 100개 제한 자체는 T-note packet 크기를 제한하는 보호 장치다.
- 자동 복구가 제한보다 큰 완료 turn을 사전 판정하거나 안전하게 축약하지 않고 그대로 생성기에 넘긴다.
- catch가 내부 영어 오류를 `actionResult.body`에 그대로 표시하여 사용자에게 구현 제한을 노출한다.
- 원본 journal과 대화는 보존되며 T-note 자동 생성만 보류된다.

## 수정 범위 후보

- 100개 초과 turn의 명시적 skip/상태 표현
- 의미 있는 bounded source projection 설계
- 내부 오류 대신 한국어 복구 안내 표시
- 100/101 경계와 재시작 reconciliation 회귀 테스트
