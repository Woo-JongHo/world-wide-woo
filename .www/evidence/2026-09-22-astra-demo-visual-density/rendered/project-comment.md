## 변경

- Chat 실행 heading에 Stages 완료 수를 상시 표시해 80열에서도 현재 7-stage 진행을 확인할 수 있게 했다.
- 구독 HUD의 Provider segment 폭 제한을 제거하고 전체 segment를 고유 배경색으로 채웠다. Codex는 흰색, Claude는 주황, Google은 청록, Z.AI는 자홍을 사용한다.
- Demo fixture에 Queue·승인 대기·Todo 완료/진행/차단·Note·성공/진행/실패 Agent·파일 변경·실패 Activity와 네 Provider의 7일/5시간 quota를 추가했다.
- Dashboard·Usage·Context·Cache·Workflow 오른쪽 rail의 핵심 상태값과 정상·경고·실패 신호에 서로 다른 semantic color를 적용했다.

## 영향

- Demo가 단순 페이지 목록이 아니라 주요 Workbench 상태와 예외를 한 번에 검토하는 기능 카탈로그 역할을 한다.
- 좁은 화면에서도 Stages를 잃지 않고, 넓은 화면에서는 Provider bar와 오른쪽 rail의 시각적 우선순위가 분명해진다.

## 분류

Improvement · Validation

## 검증

- Astra shell·UI·preview·Usage·Dashboard 대상 89 tests, 0 fail, 2,539 assertions를 확인했다.
- Demo 통합 테스트가 80×24 Stages, Queue 2건, 승인 대기, Note 2건, 실패 Agent, Plan Next 2건과 7개 화면 순환을 검증한다.
- Provider HUD 테스트가 넓어진 segment 간격, 네 개 이상의 full-color background, Codex/Claude 색상 token을 검증한다.
- TypeScript와 대상 diff 검사가 통과했고 test.skip·test.only와 새 TODO 자리표시가 없음을 확인했다.

## 연결

- Linear issue: WOO-913
- Figma: Q7kGUdqiaQRJI8CZlPMRX7 section 50:609
- Evidence: .www/evidence/2026-09-22-astra-demo-visual-density
- Branch: ui/workbench-visual-polish
