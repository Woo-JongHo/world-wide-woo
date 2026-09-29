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
source_revision: worktree:8486a759746ab2e0748beb1ab9fdd4d250fa6b27:dirty
spec_ids: []
status: active
tags:
  - www/spec
  - domain/chat
  - capability/render-health
  - status/partial
test_ids: []
updated_at: 2026-09-28T00:00:00+09:00
---

# Render Health monitoring — 느린 채팅 프레임을 지속 관측한다

## 1. Intent

사용자는 느린 terminal frame의 원인을 Monitor에서 진단할 수 있어야 하며, 일상 입력의 하단 HUD는 provider·context·runtime 상태에 집중해야 한다.

## 2. Scope

Render Health 계산과 Monitor 상세 표시, terminal-write 관측을 포함한다. 하단 HUD의 Render p95 상시 표시는 제외한다.

## 3. Desired Behavior

Monitor는 관측된 render latency p50·p95·p99, slow frame과 계층 성능을 표시한다. HUD는 기존 quota·context·cache·runtime 구조를 유지하지만 Render 문자열은 표시하지 않는다.

## 4. Domain Contract

INV-RENDER-006: Render Health 원천은 live LayerPerformanceSnapshot이다. INV-RENDER-007: 측정은 Monitor 진단에 투영된다. INV-RENDER-008: HUD는 Render Health를 중복 표시하지 않는다. INV-RENDER-009: 미관측 값을 0으로 만들지 않는다.

## 5. State Model

Render telemetry는 unobserved와 observed 상태를 유지한다. 표시 위치 변경은 측정 lifecycle이나 bounded window를 바꾸지 않는다.

## 6. Data & Runtime Flow

render schedule → terminal-write completed → LayerPerformanceRecorder snapshot → Monitor Render Health section으로 흐른다. HUD projection은 이 snapshot을 입력으로 받지 않는다.

## 7. Identity & Persistence Contract

기존 frameId와 bounded telemetry window를 유지하며 표시 위치 변경으로 새 identity나 영속 상태를 만들지 않는다.

## 8. Integration Contract

workbench-shell은 frame 관측을 유지하고 WwwMonitorView가 상세 진단을 읽는다. WwwHud는 provider·context·cache·runtime 정보만 조립한다.

## 9. Failure & Recovery Contract

performance snapshot이 없으면 Monitor는 미관측을 표시한다. HUD는 관측 여부와 무관하게 Render 문자열을 만들지 않는다. 측정 실패는 기존 trace failure 경로를 따른다.

## 10. Acceptance Contract

AC-RENDER-007: Monitor에서 관측된 Render Health를 읽을 수 있다. AC-RENDER-008: HUD에는 Render 문자열이 없다. AC-RENDER-009: HUD의 다른 quota·context·cache·runtime 정보는 유지된다. 자동 회귀는 PASS이고 실제 TUI 시각 수락은 남아 partial이다.

## 11. Verification Strategy

www-ui.test.ts로 관측값이 있어도 HUD Render가 없고 기존 summary가 남는지 검증한다. monitoring·shell·architecture 회귀와 실제 TUI 시각 확인을 함께 적용한다.

## 12. Implementation Map

layer-performance.ts가 측정을, www-monitor-view.ts가 상세 표시를, www-surface.ts의 WwwHud가 Render 비노출과 기존 HUD 요약을 소유한다.

## 13. Current State & Gaps

HUD Render segment가 제거되고 Monitor 측정 경로는 유지됐다. 관련 회귀 166개와 타입·아키텍처 검사가 통과했다. 실제 TUI 시각 수락과 Vault 게시 read-back은 남아 있다.

## 14. Decisions & Evidence

DEC-RENDER-HEALTH-003 superseded: HUD에서 live Render p95를 상시 표시하지 않는다. DEC-RENDER-HEALTH-005 approved: Render Health는 Monitor의 상세 진단으로 유지하고 HUD는 기존 구조에서 Render 조각만 제거한다. 사용자 결정, Figma 142:3890 대조, 관련 회귀와 독립 Claude Sonnet 5 리뷰가 근거다.

## Change Log

2026-09-27 HUD live Render p95 표시 계약을 추가했다. 2026-09-28 최신 사용자 결정에 따라 Render Health를 Monitor-only로 바꾸고 HUD 표시 계약을 제거했다.
