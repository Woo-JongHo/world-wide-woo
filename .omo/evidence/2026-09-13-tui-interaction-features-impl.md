# TUI interaction features implementation evidence

- Date: 2026-09-13
- Repository: `/Users/jonghoPro/woo/00_project/99_www`
- Branch: `astra/terminal-ui`
- Scope: approval, authentication, model selection, repository, native thread picker, monitoring overlay

## Result

기존 TUI overlay 구현을 feature 경계로 이동했다. 기존 class/function public symbol은 새 구현 파일에서 그대로 유지했다.

- `features/approval/approval-overlay.ts`
- `features/authentication/auth-overlay.ts`
- `features/authentication/auth-overlay-view.ts`
- `features/model-selection/model-picker-overlay.ts`
- `features/model-selection/model-picker-view.ts`
- `features/repository/repository-overlays.ts`
- `features/session/native-thread-picker.ts`
- `features/monitoring/monitoring-overlay.ts`

Authentication과 model selection은 키 입력·비동기 상태 조회·로그인/catalog 갱신·적용을 맡는 overlay 조정자와 순수 렌더 view 함수로 분리했다. Approval overlay가 chat feature의 presentation helper를 직접 import하던 결합은 제거하고 승인 surface가 필요한 제한·label 변환을 자체 소유하게 했다.

Interaction metadata를 공통 `TuiFeatureDescriptor` 계약에 맞춰 추가했다.

| Feature | ID | Order | Kind |
|---|---:|---:|---|
| Approval | `TUI-F013` | 130 | `interaction` |
| Authentication | `TUI-F014` | 140 | `interaction` |
| Model Selection | `TUI-F015` | 150 | `interaction` |
| Repository | `TUI-F016` | 160 | `interaction` |

`features/session/session.feature.ts`와 `features/monitoring/monitoring.feature.ts`는 병렬 담당자의 기존 파일을 보존했다. 중앙 registry는 수정하지 않았다.

## Verification

### Direct behavior tests

Command:

```text
bun test test/approval-overlay.test.ts test/auth-overlay.test.ts test/model-picker-overlay.test.ts test/native-thread-picker.test.ts test/repository-overlays.test.ts test/monitoring-overlay.test.ts
```

Result: **44 pass, 0 fail**.

### Feature dependency gate

`bun test test/architecture.test.ts`에서 `keeps TUI feature implementations independent from sibling features`가 통과했다. 전체 architecture suite는 병렬 이동 중 남아 있던 `adapters/inbound/tui/dashboard/delegation-tree-view.ts` 때문에 1건 실패했으며 이 파일은 본 작업 소유 범위 밖이다.

### Standalone bundle

Command:

```text
bun build \
  src/adapters/inbound/tui/features/approval/approval-overlay.ts \
  src/adapters/inbound/tui/features/authentication/auth-overlay.ts \
  src/adapters/inbound/tui/features/model-selection/model-picker-overlay.ts \
  src/adapters/inbound/tui/features/repository/repository-overlays.ts \
  src/adapters/inbound/tui/features/session/native-thread-picker.ts \
  src/adapters/inbound/tui/features/monitoring/monitoring-overlay.ts \
  --target bun --outdir <temporary-directory>
```

Result: **6 entry points bundled successfully, 77 modules**.

### Hygiene

- `git diff --check`: pass.
- Changed interaction files에서 `TODO`, `test.skip`, `test.only`, `describe.skip`, `describe.only`, `it.skip`, `it.only`: none.
- 담당 feature 구현 사이 sibling-feature direct import: none.

## Integration blockers observed

`bun run check`는 병렬 TUI 이동의 중간 상태에서 실패했다. 출력의 원인은 `shell/workbench-shell.ts`, `shell/astra-surface.ts`, `src/cli.ts`, 다른 feature/test 파일에 남아 있는 이전 `chat/`, `dashboard/`, `overlays/` 경로 import였다. 담당 interaction feature 파일 자체의 type 오류는 출력되지 않았다.

`test/native-model-catalog.test.ts`의 model picker import는 새 feature 경로로 갱신했다. 현재 단독 실행은 해당 테스트가 함께 불러오는 `shell/astra-surface.ts`의 이전 dashboard import가 해소되기 전까지 module resolution에서 중단된다. 이동 전 baseline에서는 interaction 관련 7개 파일 전체가 **56 pass, 0 fail**이었다. 최종 전체 check와 이 통합 테스트는 소비 import를 갱신하는 통합 패스에서 재실행한다.
