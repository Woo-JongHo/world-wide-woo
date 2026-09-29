## 변경

- Chat 우측을 대기·실행 상태 모두 PLAN·PROGRESS 중심의 압축 rail로 고정하고 상세 trace는 Monitor에 남겼다.
- 7개 STAGE 상태를 입력창 위 한 줄 HUD로 옮기고 좁은 폭에서는 약어 또는 현재 단계만 표시한다.
- 실행 전에도 마지막 Native 계획을 같은 rail에 표시하고 계획이 없으면 '계획 미보고'로 표시한다.

## 영향

- 사용자가 현재 계획과 진행을 먼저 읽고, 전체 단계 위치는 HUD에서 가볍게 확인할 수 있다.
- 미관측 작업 비율과 단계별 소요시간을 추정하지 않는다.

## 분류

Improvement · Validation

## 검증

- bunx tsc --noEmit: 통과.
- 사이드바 수정 후 관련 선택 테스트 24개 통과, bun run check 및 git diff --check 통과.
- 전체 www-ui 테스트는 기존 Welcome 문구 기대값 불일치 1건으로 실패했다.

## 연결

- Primary Linear: WOO-700 · STAGE·PLAN·PROGRESS 표시
- Related Linear: WOO-680 · Layout
- Evidence: .www/evidence/2026-09-28-chat-plan-progress-hud
- Branch: dev · HEAD 8486a759746ab2e0748beb1ab9fdd4d250fa6b27 · uncommitted
