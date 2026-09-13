# TUI 리팩터링 독립 코드 품질 리뷰

## 범위와 방법

- 검토 대상: `src/adapters/inbound/tui/**`, 경로 이동에 따른 `src/app.ts`, `src/cli.ts`, `src/legacy-router-app.ts`, `scripts/chat-render-benchmark.ts`, 관련 flat test, `LAYERS.md`, TUI 문서, control-ledger.
- 제외: 기존 Core·Outbound·Request Runtime 변경의 기능 적합성.
- 실제 dirty diff와 untracked TUI 소스를 직접 읽고, import graph·은퇴 경로·control-ledger 경로를 재검사했다. 작성자 evidence의 판정은 근거로 사용하지 않았다.
- `remove-ai-slops`와 `programming` 스킬은 현재 세션의 등록 목록 및 `/Users/jonghoPro/.codex/skills`, `/Users/jonghoPro/.agents/skills`에서 찾을 수 없었다. 따라서 요청된 기준(삭제만 확인하는 테스트, 구현 상수 미러링, tautology, 불필요한 추출·파싱·정규화, brittle prompt test, untyped escape hatch, needless abstraction)을 직접 적용했다. 이 관점에서 diff 위반은 발견하지 못했다.

## 결과

### CRITICAL

없음.

### HIGH

없음.

### MEDIUM

없음.

### LOW

- 전체 추적성 게이트는 현재 통과하지 않는다. `bun run traceability:check`는 `VAULT_EXPORT_PROVENANCE_MISMATCH`로 종료 코드 1을 반환했다. 이 검사는 vault export receipt를 요구하며, 이동된 TUI Code-ID/traceability 경로는 별도 재검사에서 모두 실재했다(87개 TUI code reference, missing 0). 따라서 이 리뷰는 원인을 이 리팩터링으로 단정하지 않지만, 병합/릴리스 게이트에서는 provenance를 복구하거나 현재 기준선 실패임을 확인해야 한다.

## 확인한 성공 기준

- [LAYERS.md](/Users/jonghoPro/woo/00_project/99_www/LAYERS.md:42)의 foundation·feature·shell·legacy 책임이 실제 트리와 일치한다.
- [feature-registry.ts](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/feature-registry.ts:20)는 런타임 factory 없이 정적 descriptor만 조립한다. 각 `*.feature.ts`를 직접 집계해 `TUI-F001`부터 `TUI-F016`까지 16개, 누락·중복 0개를 확인했다.
- [architecture.test.ts](/Users/jonghoPro/woo/00_project/99_www/test/architecture.test.ts:66)는 foundation의 상위 TUI 의존과 feature 구현 간 sibling import를 graph 수준에서 검증한다. 실제 실행도 통과했다.
- 활성 `src`, `test`, `scripts`에서 옛 `tui/chat`, `tui/dashboard`, `tui/overlays` 및 폐기된 shell compatibility 모듈 import는 찾지 못했다. control-ledger의 TUI code reference 87개도 모두 현존 경로다.
- Native 기본 shell과 legacy Router의 입력, 승인, 취소, resume, shutdown은 [tui-shell-characterization.test.ts](/Users/jonghoPro/woo/00_project/99_www/test/tui-shell-characterization.test.ts:35), [legacy-shell-characterization.test.ts](/Users/jonghoPro/woo/00_project/99_www/test/legacy-shell-characterization.test.ts:31) 및 관련 전체 suite로 실행 확인했다.
- 테스트는 `test/` 최상위에 유지됐다. 삭제만 검증하거나 구현 상수만 복제하는 신규 테스트, `skip`/`only`, TODO 자리표시는 발견하지 못했다.

## 실행 검증

| 명령 | 결과 |
| --- | --- |
| `bun run check` | 통과 |
| `bun test test/architecture.test.ts test/tui-shell-characterization.test.ts test/legacy-shell-characterization.test.ts test/astra-shell.test.ts test/astra-ui.test.ts test/cli.test.ts test/native-plan-wiring.test.ts test/workbench-shell-policy.test.ts test/approval-overlay.test.ts test/native-thread-picker.test.ts` | 143 통과, 0 실패 |
| `bun test` | 130 파일, 1,175 통과, 0 실패 |
| `bun run units:check` | 통과 |
| `bun run traceability:check` | 실패: `VAULT_EXPORT_PROVENANCE_MISMATCH` |
| `git diff --check` | 통과 |

## 판정

- `codeQualityStatus`: WATCH
- `recommendation`: APPROVE
- `blockers`: 없음. 다만 릴리스/추적성 게이트 전에는 위 LOW provenance 실패를 별도로 해소 또는 기준선으로 분류해야 한다.

## 후속 재검토 — shell seam 추출

검토 시각: 2026-09-13 (KST)

새 `workbench-navigation.controller.ts`, `workbench-input.controller.ts`, `ShellLifecycle`와 갱신된 `workbench-shell.ts`를 직접 읽고 재검토했다.

- **호출 순서와 disposal:** [shell-lifecycle.ts](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/shell/shell-lifecycle.ts:37)는 중복 shutdown을 상태 전이로 차단한 뒤 prompt·overlay·notice·subscription·polling·timer·disposable을 정해진 순서로 해제하고, draft 저장 → workbench close → lease release → terminal stop 순서를 유지한다. [tui-shell-characterization.test.ts](/Users/jonghoPro/woo/00_project/99_www/test/tui-shell-characterization.test.ts:128)가 병렬 shutdown 두 번에 대해 그 순서와 단 한 번의 해제를 직접 확인한다.
- **callback capture:** `unsubscribe`, `navigation`, timer, overlay, draft callback은 모두 `ShellLifecycle` 생성 전에 유효한 closure로 잡히며, `lifecycle`을 참조하는 interval은 생성 뒤 같은 동기 구간에서 초기화된다. 초기 subscription과 shutdown 경로를 따라 검토했으며 조기 호출 또는 stale callback 회귀를 발견하지 못했다.
- **seam 깊이:** navigation controller는 mode 전환·focus·map polling·browse state를 실제로 소유하고, input controller는 shell 입력 정책의 순수 변환만 소유하며, lifecycle은 shutdown 책임과 순서를 소유한다. 단순 위임 또는 불필요한 추상화가 아니다.
- **회귀 및 테스트:** `bun run check`, seam/Native/legacy/Astra/architecture 대상 테스트, 전체 `bun test`를 새 worktree에서 다시 실행했다. 전체 suite는 130 파일, 1,176 통과, 0 실패였다. `git diff --check`도 통과했다.
- **기존 finding 변화:** 이전 CRITICAL/HIGH/MEDIUM 없음은 유지된다. `bun run units:check`는 통과했고, `bun run traceability:check`의 `VAULT_EXPORT_PROVENANCE_MISMATCH`도 계속 재현된다. 여전히 TUI 이동 자체의 결함으로 귀속할 근거는 없어 LOW 검증 제한으로 유지한다.

후속 판정: `codeQualityStatus` WATCH, `recommendation` APPROVE, `blockers` 없음.
