## 변경

- stage 종료 절대시각에서 요청 기준 offset을 빼던 단위 혼용을 절대시각끼리의 duration 계산으로 교정했다.
- 요청·stage·tool 시각의 비유한 값을 거르고 waterfall 좌표와 bar 길이를 viewport plot 폭으로 제한했다.
- 완료된 요청 안에 종료되지 않은 stage가 남아 현재 시각이 크게 벌어진 경우를 OOM 재현 회귀로 고정했다.

## 영향

- Monitor 진입 시 String.repeat가 수천억 칸을 할당해 TUI가 종료되는 문제를 막는다.
- 불일치하거나 창 밖인 관측 시각도 화면 폭 안에서 안전하게 표시된다.

## 분류

Fix · Validation

## 검증

- 수정 전 재현 테스트가 www-monitor-view.ts:131의 RangeError: Out of memory로 실패함을 확인했다.
- 수정 후 telemetry·UI·architecture 102개 테스트와 5796개 assertion이 통과했다.
- tsc --noEmit과 변경 파일의 TODO·test.skip·test.only 검사가 통과했다.
- Claude Sonnet 읽기 전용 리뷰는 두 차례 모두 출력 없이 Execution error로 끝나 미실행 blocker다.
- 프로젝트 woo-code-readability 스킬과 전용 검사 스크립트는 지정 경로에 없어 실행하지 못했다.

## 연결

- Linear: WOO-675 · UUID 28bc3ec6-f98d-421e-9398-8721f5c50724
- Code: src/adapters/inbound/tui/features/monitoring/view/www-monitor-view.ts
- Test: test/www-telemetry-duration.test.ts
- Evidence: .www/evidence/2026-09-28-monitor-waterfall-oom
- Branch: dev · HEAD 8486a759746ab2e0748beb1ab9fdd4d250fa6b27 · uncommitted
