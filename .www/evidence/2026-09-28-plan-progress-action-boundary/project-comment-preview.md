## 변경

- PLAN 항목마다 최신 세부 진행 한 건을 PROGRESS에 묶어 표시하고, 이전 항목의 진행도 같은 turn에서 유지했다.
- /bin/zsh 행동은 명령 입력을 별도 AI 프롬프트에 보내 해석한다. AI 결과 전에는 고정된 의미 문구를 표시하지 않고 원본 명령은 펼친 카드에서 볼 수 있다.
- 막힌 단계도 7개 단계 슬롯을 모두 표시하고, 사이드바 기본 폭을 46에서 48열로 넓혔다.
- Chat TEST는 검증 번호 대신 실제 명령을 표시하고, VERIFY 계획의 검증 종류·제목·목표와 관측된 실행 도구·테스트 파일별 결과를 보여 준다.
- 전체 회귀 출력이 잘려도 Bun 종료 요약이 관측되면 총계를 유지하고, 출력 파일을 재조회한 명령에서는 같은 turn의 로그 요약·실패 이름을 연결한다. 관측되지 않은 실패 이름은 만들지 않는다.
- Chat·PLAN·Monitor의 작업 내용 정리 중 대기 문구를 제거했다.

## 영향

- 반복 셸 호출이 PROGRESS 전체를 차지하지 않고 사용자가 PLAN 항목별 현재 세부 진행과 AI가 해석한 명령 행동을 각각 읽을 수 있다.

## 분류

Improvement · Validation

## 검증

- AI 행동 해석 등 관련 7개 테스트 파일 162 pass, 0 fail. TEST 설명·셸 레이아웃·나레이션 관련 4개 파일 63 pass, 0 fail.
- 회귀 요약 투영 관련 5개 테스트 파일 158 pass, 0 fail. bun run check와 git diff --check 통과. 전체 회귀 재실행은 기존 가독성 스킬 경로·대시보드 등 별도 실패가 남아 수락 근거로 사용하지 않는다.

## 연결

- Linear: WOO-700 (기존 로컬 결속; 원격 read-back 미실행)
- Code: src/core/application/orchestration/plan-activity-narration.ts, src/adapters/outbound/execution/pi-activity-narrator.ts, src/adapters/inbound/tui/features/chat/view/www-execution.ts, src/adapters/inbound/tui/shell/www-surface.ts
- Evidence: .www/evidence/2026-09-28-plan-progress-action-boundary
