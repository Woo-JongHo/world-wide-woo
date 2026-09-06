# WOO-705 Tracer 실행 identity 구현 기록

## 작업 기준

- Linear: WOO-705 `다른 요청의 근거가 섞이지 않도록 같은 실행을 추적한다`
- Linear UUID: `4738e3c5-c5b3-4cc2-9cea-ff9bf600367d`
- 부모: WOO-681
- 함께 읽은 하위/연관 계약: WOO-704, WOO-706, WOO-717
- 기준 revision: `05e2829`
- branch: `woo-705-tracer-identity`
- 계획 근거: `docs/WWW_CONTROL_PLANE_PLANNING_PROPOSAL.md`의 Todo·Trace·Chat 경계와 ST-011-16/17

작업 시작 전에 `/Users/jonghoPro/woo/00_project/99_www-pr-tracer-identity`와 clean branch를 다시 확인했다. 저장소 `AGENTS.md`는 읽었고, 실행 지시가 정본으로 지목한 `LAYERS.md`는 이 worktree와 tracked files에 존재하지 않았다. 이 환경 문서 불일치는 제품 구현을 막지 않는 기록 사항으로만 남긴다.

## 발견한 결함

기존 shell의 `/trace <plan-item-id>` 구현은 실제로 안정적인 Plan identity를 해석하지 않았다. `snapshot.activities`를 역순으로 순회하면서 `activity.nativeRefs.itemId === command.planItemId`인 마지막 activity를 골랐다. 따라서 다음 문제가 있었다.

1. 서로 다른 turn이 같은 Native `itemId`를 재사용하면 선택 시점의 최신 activity가 다른 실행 근거를 대신할 수 있었다.
2. Plan 제목, 화면 순번, `itemId` 중 어느 것도 ProjectActivity의 실행 identity를 독립적으로 증명하지 못하지만 선택 입력은 `itemId` 하나뿐이었다.
3. 잘못된 ID와 부분 journal에서 찾지 못한 ID를 구분하는 coverage가 없었다.
4. activity 자체의 observed Native refs와 Plan interval에 의한 inferred association이 하나의 선택처럼 취급됐다.
5. 실패 뒤 shell이 Source 화면으로 전환하는 경로여서 실패와 성공의 이동 정책도 분리되지 않았다.

## 고정한 계약

선택 주소는 exact `activityId`다. selection resolver는 다른 activity를 제목, 순번, `itemId`, 배열 위치, 최근성으로 대신하지 않는다.

성공 결과는 다음 두 층을 분리한다.

- identity attribution `observed`: exact ProjectActivity가 보존한 `activityId + threadId + turnId + itemId`
- Plan association `inferred`: 현재 선택 Plan의 단조 sequence interval이 exact activity ID를 포함한다는 projection

Trace 선택은 다음 검사를 순서대로 통과해야 한다.

1. exact activity ID가 현재 journal에 하나만 존재한다.
2. activity thread가 현재 Workbench root thread와 일치한다.
3. 현재 실행 context와 선택된 Plan source가 존재한다.
4. activity에 `turnId`와 `itemId`가 모두 있다.
5. activity turn이 선택 Plan source turn과 일치한다.
6. exact activity ID가 같은 turn의 정확히 한 Plan association source에 들어 있다.

실패 코드는 `activity_not_found`, `outside_observed_journal`, `duplicate_activity_id`, `no_execution_context`, `thread_mismatch`, `plan_unavailable`, `missing_turn_ref`, `missing_item_ref`, `turn_mismatch`, `plan_membership_mismatch`, `ambiguous_plan_association`으로 닫았다. 모든 결과는 `fresh | partial-local-journal`, process attach 시각, provider 과거 history hydrate 여부, 관측 activity 수와 sequence 범위를 포함한다.

부분 journal에서 exact activity를 찾지 못하면 `outside_observed_journal`을 반환한다. 다른 `itemId` 일치 activity나 latest activity로 바꾸지 않는다. 실패한 Trace command는 기존 선택을 유지하고 Source 화면으로 전환하지 않는다.

## Red

초기 실행은 worktree의 `node_modules` 부재가 섞였으므로 제품 red 증거로 사용하지 않았다. 기준 revision `05e2829`을 임시 tree에 풀고 실제 workspace `node_modules`만 symlink한 뒤, 변경한 `test/project-workbench.test.ts`를 그대로 실행했다.

```text
bun test test/project-workbench.test.ts
74 pass / 2 fail / 436 assertions / exit 1
```

실패는 다음 두 제품 계약이었다.

- invalid activity 선택에 구조화 selection failure와 coverage가 없었다.
- `trace.select` command가 없어 exact activity 선택 결과가 `undefined`였다.

임시 red tree는 검증 뒤 macOS Trash로 이동했다. 제품 worktree의 검증용 `node_modules` symlink는 stage 대상이 아니며 최종 상태 검사 전에 제거한다.

## 구현

- `src/domain/trace-selection.ts`
  - exact activity와 Trace 선택의 구조화 성공/실패 및 coverage 계약을 추가했다.
  - 동일 item ID, partial journal, thread/turn/Plan membership mismatch를 fail-closed한다.
  - `@linear WOO-705 4738e3c5-c5b3-4cc2-9cea-ff9bf600367d`를 계약에 연결했다.
- `src/domain/workbench.ts`
  - application command `trace.select { activityId }`와 receipt의 구조화 selection을 추가했다.
- `src/application/project-workbench.ts`
  - Source의 `selectActivity`도 exact activity/현재 thread/coverage 계약을 사용한다.
  - Trace 선택은 현재 WorkFlow를 기준으로 domain resolver를 호출하고 성공할 때만 selected activity를 바꾼다.
- `src/presentation/tui/slash-commands.ts`, `src/presentation/tui/workbench-shell.ts`
  - `/trace` 입력을 exact activity ID로 바꾸고 Native `itemId` 역순/latest 검색을 제거했다.
  - 실패 receipt에서는 Source view로 이동하지 않는다.
- `src/cli.ts`
  - Terra 독립 검토에서 발견한 CLI help 누락을 고쳐 `/trace <activity-id>` 진입 계약을 노출한다.
- `src/presentation/tui/workbench-views.ts`
  - Trace 진입 ref를 Native `itemId`가 아니라 ProjectActivity ID로 내보낸다.
  - 렌더 cache key에도 activity ID를 포함해 같은 내용의 다른 activity가 이전 Trace 주소를 재사용하지 않게 했다.
- 테스트
  - 동일 thread의 서로 다른 turn이 같은 `itemId`와 제목을 쓰는 fixture에서 각 exact activity와 refs를 비교한다.
  - 첫 turn activity를 둘째 Plan에서 고르면 `turn_mismatch`, item ID만 입력하면 `activity_not_found`이며 둘째 선택을 유지한다.
  - invalid ID, partial journal, inferred association과 coverage를 domain/application/shell 경계에서 검증한다.

기존 `src/domain/work-steps.ts`의 Plan projection과 association 규칙은 변경하지 않았다. Map, Monitor, Dashboard 기능과 root dirty worktree도 수정하지 않았다.

## 검증

- clean base red: `74 pass / 2 fail`, exit 1
- targeted: `161 pass / 0 fail / 4 files / 1511 assertions`, exit 0
- Terra finding 보완 뒤 targeted+CLI: `173 pass / 0 fail / 5 files / 1551 assertions`, exit 0
- full: `624 pass / 0 fail / 74 files / 4233 assertions`, exit 0
- `bun run check`: exit 0
- `git diff --check`: exit 0
- 변경 대상 skip/only/debug scan: 없음
- placeholder scan의 `TODO.md` 두 hit는 기존 fixture 문자열과 `TODO 0/0` 부정 assertion이며 구현 자리표시가 아니다.

## 수락 한계와 독립 검토

실제 Codex App Server/Native TUI는 실행하지 않았다. 따라서 자동 fixture와 타입/전체 회귀가 통과했어도 WOO-705의 실제 Native TUI 수락 완료를 주장하지 않는다.

독립 최종 감사의 정본 모델은 Claude Opus다. 작업 지시가 기록한 Opus limit reset은 03:20 KST이며 현재 패스에서는 Opus를 실행하지 않았다. 낮은 모델로 대체하지 않는다. 작성 변경을 freeze한 뒤 root agent에 독립 검토 입력으로 넘긴다.

Chat WOO-688 계열과 통합할 때는 `WorkbenchCommandReceipt`의 optional `selection` 추가와 `workbench-views.ts`의 Trace source label/cache key가 겹칠 수 있다. 이 변경은 기존 필드를 제거하지 않고 optional 필드만 추가했으며, 다른 작업자의 변경을 되돌리지 않았다.
