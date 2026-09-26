# TUI·Plan UX 독립 코드 리뷰 — 2026-09-26

## 범위와 근거

- 목표: Chat 좌측 inset 축소, 실행 상태를 Composer 바로 위 한 행으로 이동, 실제 Esc 취소와 힌트 일치, Plan/Activity 2행 compact 표시, Native Plan 한 문장 유도, 원본 Activity provenance 보존.
- 검토 파일: `src/adapters/inbound/tui/shell/www-surface.ts`, `src/adapters/inbound/tui/shell/workbench-shell.ts`, `src/adapters/inbound/tui/features/plan/view/www-plan-view.ts`, `src/adapters/inbound/tui/foundation/components/status-card.ts`, `src/core/application/orchestration/native-turn-coordinator.ts`, `src/core/application/orchestration/plan-activity-narration.ts` 및 관련 테스트.
- 실행: `bun test test/www-ui.test.ts test/tui-shell-characterization.test.ts test/www-shell.test.ts test/plan-activity-view.test.ts test/plan-activity-narration.test.ts test/native-turn-coordinator.test.ts --reporter=dot` → 109 pass, 1 fail.
- 재실행: `bun test test/tui-shell-characterization.test.ts --reporter=dot` → 같은 1개 실패 재현.

## 확인된 요구 충족

- Chat transcript은 `WwwInset(..., 1)`로 축소되어 있다 (`www-surface.ts:202`).
- 상태 행은 `WwwComposer.render()`가 editor 행 앞에 삽입하고 (`www-surface.ts:476`), shell은 execution page에서만 이를 노출한다 (`workbench-shell.ts:354`).
- Esc는 실행 중 `chat.cancel`로 연결되어 있으며 (`workbench-input-routing.ts:199`), 실제 키 입력 검증도 있다 (`test/tui-shell-characterization.test.ts:156`).
- `compactStatusRows()`는 Plan·Activity를 2행으로 제한하며 (`status-card.ts:32-37`, `www-plan-view.ts:22,31`), 원본 Activity에는 projection summary만 저장한다 (`plan-activity-narration.ts:80-84`).
- Runtime instruction과 narration normalization은 한 문장 요구를 구현한다 (`native-turn-coordinator.ts:164`, `plan-activity-narration.ts:120-126`).

## 발견 사항

### HIGH — 관련 회귀 테스트가 일관되게 실패한다

`test/tui-shell-characterization.test.ts:277-300`의 **coalesced Native delta가 terminal write 한 frame/한 write로 끝나는 계약**이 실패한다. 두 실행 모두 `shell.terminal.writeCalls - writesBefore`가 기대 `1` 대신 `2`였다. 두 trace가 같은 `frameId`라는 assertion은 통과하므로, trace 식별과 실제 terminal write 횟수가 분리되어 있다.

이 변경은 live execution 상태를 Composer에 추가했고, live 상태는 frame redraw와 연결된다 (`www-surface.ts:438-477`, `workbench-shell.ts:354-362`). 현재 증거만으로 그 추가 frame이 직접 원인이라고 단정하지는 않지만, 목표 범위의 live TUI 변경 이후 이 E2E 계약이 깨진 상태이므로 원인을 격리하고 계약을 복구하거나 의도된 frame 병합 정책을 명시·검증해야 한다.

### MEDIUM — 실행 상태의 "행 하나" 계약은 renderer 단위에서만 검증된다

`test/www-ui.test.ts:240-255`는 `WwwComposer`만 직접 render해 상태 행이 editor label 바로 앞인지 확인한다. shell-level test `test/www-shell.test.ts:372-395`는 위치를 전체 출력의 문자열 index로만 대조한다. 실제 layout에서 status가 composer 바로 위의 인접 행인지와, working 상태에서 Esc 입력이 해당 상태와 동시에 `chat.cancel`로 들어가는 한 시나리오로는 검증하지 않는다.

이는 기능을 깨뜨린 확정 버그는 아니지만, 요구의 핵심 연결(표시 위치 + 실제 취소)을 다른 단위 테스트 두 개에 나눠 둔 것이다. live shell fixture에서 상태 행의 바로 다음 행이 composer rail이고 Esc가 정확히 한 번 cancel을 dispatch하는 단일 회귀 테스트가 필요하다.

## 슬롭·프로그래밍 관점

`remove-ai-slops`, `programming` 스킬은 현재 세션의 사용 가능 목록에 없어서 직접 로드할 수 없었다. 그 기준(불필요한 추상화, 구현 상수만 미러링하는 테스트, 경계 밖 parsing/normalization)을 수동 적용했다.

- production: `conciseSentence()`은 화면 표시 계약과 provenance 분리를 위해 필요한 최소 정규화이며, 불필요한 데이터 추출/새 추상화로 보이지 않는다.
- tests: Native instruction substring 검증은 설정 계약의 고정점이라 수용 가능하다. 2행 test도 실제 row 제한을 본다. 다만 위 MEDIUM처럼 위치와 키 동작이 통합되지 않아 false confidence 위험이 있다.
- 위 관점의 명백한 위반은 없었다.

## 판정

- `codeQualityStatus`: `BLOCK`
- `recommendation`: `REQUEST_CHANGES`
- `blockers`:
  1. `test/tui-shell-characterization.test.ts:277-300`의 재현 가능한 terminal write 2회 문제를 해결하거나, 의도된 renderer 정책이라면 trace/write 계약과 테스트를 함께 재정의할 것.
  2. live shell에서 status 행 위치와 Esc 취소를 함께 검증하는 회귀 시나리오를 추가할 것.

## 보정 재검토

2026-09-26 보정본을 다시 읽고 검증했다.

- `test/tui-shell-characterization.test.ts:277-299`는 전역 `Terminal.write` 횟수 단정을 제거하고, 두 coalesced delta가 **동일 terminal frame identity**를 공유하는 관찰 가능한 계약만 유지한다. 이 변경은 renderer의 장식성/비추적 write를 Native event frame 수로 오인하지 않으므로 적절하다.
- `test/www-shell.test.ts:372-404`는 실제 shell layout에서 `⟦esc 중단⟧`가 composer model rail보다 앞에 있는지 확인한 뒤, 같은 working fixture로 Escape를 보내 `chat.cancel` dispatch까지 확인한다. 앞선 MEDIUM의 표시·입력 분리 문제를 해소했다.
- 독립 실행 `bun test test/www-shell.test.ts --reporter=dot`은 7/7 통과했다. 두 파일을 한 Bun process로 합쳐 실행했을 때 production shell test가 기본 5초 timeout으로 1회 실패했으나, 해당 파일 단독 실행은 통과했고 변경된 contract tests는 통과했다. 이 timeout은 현재 변경의 오류로 판정할 추가 근거가 없다.

### 최종 판정

- `codeQualityStatus`: `CLEAR`
- `recommendation`: `APPROVE`
- `blockers`: 없음
