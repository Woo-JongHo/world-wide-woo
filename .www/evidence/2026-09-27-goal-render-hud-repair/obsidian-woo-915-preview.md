---
acceptance: partial
capability: Render Health monitoring
code_ids:
  - Code-001
  - Code-003
decision_ids: []
document_id: ba1d238c-6979-42bb-9fb1-c0de7e6a7c6a
domain: Chat
exception_ids: []
linear: WOO-915
parent: null
record_type: detailed-canonical
related: []
schema_version: 2
source_revision: worktree:495f61c0f3d5e3c9c6d58340d315c06b4ad70cc0:dirty
spec_ids: []
status: active
tags:
  - www/spec
  - domain/chat
  - capability/render-health
  - status/partial
test_ids: []
updated_at: 2026-09-27T15:48:09+09:00
---

# Render Health monitoring — 느린 채팅 프레임을 지속 관측한다

## 1. Intent

사용자는 실제 terminal frame 측정이 생긴 직후 HUD에서 Render p95를 읽어야 하며, 다음 입력이나 주기 갱신을 기다려서는 안 된다.

## 2. Scope

live layer performance snapshot의 HUD 전달, 관측값의 조건부 표시, terminal-write 완료 뒤 단일 repaint, 저빈도 전체 상태 시계 조정을 포함한다. telemetry 산식과 100ms slow 정의 변경은 제외한다.

## 3. Desired Behavior

HUD는 관측된 render latency p95를 Render p95 Nms로 표시하고 미관측 상태에서는 숨긴다. terminal-write 측정 완료 직후 trace가 있던 frame에 한해 후속 repaint를 한 번 예약한다. 정기 전체 repaint는 1초 간격이며 빠른 Native activity 경로는 유지한다.

## 4. Domain Contract

INV-RENDER-006: HUD 값은 live LayerPerformanceSnapshot에서 읽는다. INV-RENDER-007: 측정을 만든 terminal-write frame은 자기 측정값을 표시하기 위한 후속 repaint를 최대 한 번 만든다. INV-RENDER-008: 후속 repaint는 새 trace를 만들지 않아 순환하지 않는다. INV-RENDER-009: 미관측 p95를 0으로 표시하지 않는다.

## 5. State Model

p95는 unobserved에서 observed로 전이한다. traced frame 완료 뒤 repaint pending이 되고 다음 frame 완료 시 idle로 돌아간다. trace 없는 후속 frame은 다시 repaint를 예약하지 않는다.

## 6. Data & Runtime Flow

render schedule → terminal-write completed → LayerPerformanceRecorder snapshot → 후속 repaint 예약 → WwwHud performance callback → Render p95 표시로 흐른다.

## 7. Identity & Persistence Contract

후속 repaint는 완료된 traced frame의 존재만 사용하며 별도 frame identity나 영속 상태를 만들지 않는다. telemetry bounded window와 기존 frameId 계약을 유지한다.

## 8. Integration Contract

workbench-shell은 live snapshot 공급과 repaint 예약을 소유하고 WwwHud는 표시·색상·폭 우선순위만 소유한다. 호환 경로에서는 performance callback이 없어도 HUD가 동작한다.

## 9. Failure & Recovery Contract

performance callback이 없거나 값이 null이면 Render p95를 숨긴다. terminal write 실패는 기존 error 경로를 따르며 성공 latency로 표시하지 않는다. repaint 요청이 합쳐져도 다음 정상 frame에서 최신 snapshot을 읽는다.

## 10. Acceptance Contract

AC-RENDER-007: 실제 shell에서 측정 뒤 별도 사용자 입력 없이 Render p95가 나타난다. AC-RENDER-008: 미관측 HUD에는 Render p95가 없다. AC-RENDER-009: 후속 repaint가 무한 루프를 만들지 않는다. AC-RENDER-010: 1초 상태 시계와 별개로 Native activity는 즉시 갱신된다. 자동 회귀는 PASS이고 실제 장시간 사용 수락은 남아 partial이다.

## 11. Verification Strategy

www-ui.test.ts로 관측·미관측 표시를, tui-shell-characterization.test.ts로 실제 측정 뒤 후속 repaint 노출을, shell scheduler 회귀로 무한 repaint 부재를 검증한다. 타입·가독성·diff 검사를 함께 적용한다.

## 12. Implementation Map

src/adapters/inbound/tui/shell/workbench-shell.ts가 live snapshot과 후속 repaint를, src/adapters/inbound/tui/shell/www-surface.ts가 HUD 표시를, layer-performance.ts가 p95 계산을 소유한다.

## 13. Current State & Gaps

HUD live p95와 단일 후속 repaint, 1초 저빈도 시계가 구현됐고 관련 회귀 166개가 통과했다. 실제 사용자 환경의 깜빡임과 장시간 latency 상관 확인, 독립 provider 감사 판정은 남아 있다.

## 14. Decisions & Evidence

DEC-RENDER-HEALTH-003 approved: HUD는 Workbench snapshot 복사본이 아니라 live layer performance를 읽는다. DEC-RENDER-HEALTH-004 approved: terminal-write 측정은 완료 뒤에 생기므로 traced frame에만 단일 후속 repaint를 예약한다. DEC-TUI-CLOCK-001 approved: 전체 상태 시계는 1초로 낮추고 빠른 activity 경로는 분리 유지한다. 근거는 .www/evidence/2026-09-27-goal-render-hud-repair와 관련 shell 회귀다.

## Change Log

2026-09-27 HUD의 live Render p95 source, terminal-write 측정 뒤 단일 repaint, 1초 저빈도 상태 시계 계약을 추가했다.
