# RPA domain scope removal receipt

- Scenario: 사용자 범위가 Linear-only로 변경된 뒤 이 작업자가 만든 RPA domain/port/SQLite/schema/script/test 파일을 전부 제거한다.
- Invocation: 각 대상에 `test -e`를 실행한다.
- Binary observable: 아래 7개 대상이 모두 `ABSENT`였다.
  - `src/core/domain/rpa/rpa-catalog.ts`
  - `src/core/ports/rpa-catalog.ts`
  - `src/adapters/outbound/rpa/rpa-sqlite-catalog.ts`
  - `src/adapters/outbound/rpa/rpa-inventory-importer.ts`
  - `schemas/rpa-catalog-v1.schema.json`
  - `scripts/rpa-catalog.ts`
  - `test/rpa-catalog.test.ts`
- Invocation: `git status --short -- <7개 삭제 대상> LAYERS.md test/architecture.test.ts`
- Binary observable: 삭제 대상에는 출력이 없고, 이 작업자가 되돌리지 않은 기존 병렬 변경 `LAYERS.md`와 `test/architecture.test.ts`만 `M`으로 남았다.
- Invocation: `git diff --name-status -- <7개 삭제 대상>`
- Binary observable: 출력 없음. 신규 RPA 구현 변경이 worktree에 남지 않았다.
- Invocation: `bun run check`
- Binary observable: exit code 0, `tsc --noEmit` 통과.
- Invocation: `bun test test/architecture.test.ts`
- Binary observable: exit code 0, 11 pass / 0 fail.
