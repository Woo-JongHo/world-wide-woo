# Native Plan revision reader 구현 증거

- 날짜: 2026-09-13
- 브랜치: `astra/terminal-ui`
- 구현 범위: `src/core/domain/work/native-plan-revision.ts`, `src/core/domain/work/workflow-projection.ts`
- 설계 정본: `.omo/evidence/2026-09-13-workflow-projection-refactor-design.md`의 첫 추출

## 구현 결과

- `readNativePlanRevision(activity)`가 `not-plan-revision`, `invalid-plan-revision`, `valid-plan-revision` discriminated union으로 Native Plan 감지, structured/Markdown 해석, fail-closed 검증, 상태 정규화를 소유한다.
- `WorkStepStatus`와 parser 전용 `NativePlanRevisionValidationCode`를 새 module에서 정의했다.
- 기존 `workflow-projection.ts`는 `WorkStepStatus`를 type re-export하고 `source_turn_mismatch | NativePlanRevisionValidationCode`로 기존 `RevisionValidationCode`를 합성한다.
- facade는 reader의 unredacted `identityText`를 기존 dplan digest 입력으로 쓰고 `sourceTitle`에만 기존 bounded public redaction을 적용한다.
- journal validation은 `valid-plan-revision`만 duplicate revision key 후보로 등록한다.
- hashing, redaction, reconciliation, selected-turn/journal window, activity association은 기존 `workflow-projection.ts`에 유지했다.
- `src/core/domain/work/index.ts`, runtime/application/adapters, 기존 테스트는 수정하지 않았다.

보존한 계약은 structured empty Plan의 유효한 빈 revision, completed Markdown blank의 `blank_entry`, foreign source의 `source_turn_mismatch` 우선순위, malformed revision의 Layer B 우선순위, NFKC/whitespace canonical identity, structured unknown status의 `pending` 정규화다.

## 검증

### 통과

```text
bun test test/work-flow.test.ts test/workflow-projection.test.ts
30 pass, 0 fail, 111 assertions

bun test test/native-plan-wiring.test.ts
14 pass, 0 fail, 118 assertions

bun test test/architecture.test.ts
13 pass, 0 fail, 1,420 assertions

bunx tsc --noEmit --ignoreConfig --target ES2024 --module NodeNext \
  --moduleResolution NodeNext --strict --skipLibCheck --types bun \
  src/core/domain/work/workflow-projection.ts \
  src/core/domain/work/native-plan-revision.ts
exit 0

git diff --check -- src/core/domain/work/workflow-projection.ts
git diff --no-index --check /dev/null src/core/domain/work/native-plan-revision.ts
exit 0
```

변경 파일의 `TODO`, `test.skip`, `test.only`, `describe.skip`, `describe.only`, `it.skip`, `it.only`, `not implemented`, `NOT_IMPLEMENTED` 검색 결과는 0건이다.

### 저장소 동시 변경에 따른 전체 gate 상태

`bun run check`는 이 구현 파일 밖의 동시 작업 오류로 실패했다. 마지막 실행에서 `src/core/application/orchestration/project-workbench.ts`의 충돌/누락 symbol과 `test/tui-feature-registry.test.ts`의 descriptor ID type 오류가 보고됐으며, 두 구현 파일의 TypeScript 오류는 없었다.

전체 `bun test`의 첫 직접 실행은 동시 TUI 이동 중 1,020 pass, 9 fail, 7 import errors였다. 다른 작업이 진행된 뒤 재실행한 최신 결과는 1,172 pass, 4 fail이었다. 남은 실패는 아래 네 개이며 Native Plan/workflow 경로와 무관하다.

```text
workbench dashboard views > reuses Chat rows when only the activity spinner frame changes
work traceability > keeps source and test issue annotations connected to registered Linear identities
development map > keeps the last valid projection stale during a failed poll without overlapping refreshes
development map > notifies an open map when its planning revision changes
```

관련 workflow, Native wiring, architecture test는 전체 실행에서도 통과했다.
