# Code-006~015 원장 drift 읽기 전용 감사

## 범위와 snapshot

- 대상: `src`의 `@Unit Code-NNN`/`@codeId NNNN`, `.woo/units.yaml`, `.www/control-ledger/code-ids.json`, `traceability-v2.json`, `traceability-v3.json`, 저장소 Vault export와 보존된 Linear readback.
- 기준 HEAD: `559b29599ab966978182acdebd59a920426469a1` (`astra/terminal-ui`). 이 worktree는 TUI 이동 작업이 동시에 진행 중인 dirty 상태였다. 아래 판정은 2026-09-13의 읽기 시점 byte 상태이며, 원장이나 소스는 수정하지 않았다.
- 외부 Linear/Obsidian live MCP는 이 세션에 노출되지 않았다. Linear 근거는 `.www/evidence/v020-traceability/linear-consistency-final-normalized.json`의 readback이고, Obsidian 근거는 `.www/vault` export 및 `traceability-v2.json` URI다.

## 판정

`Code-006`~`Code-015`는 새 번호가 필요한 빈 번호 구간이 아니다. 이미 선언되었거나 v2 원장에 안정 ID가 있는 Unit이 서로 다른 세 레지스트리에 부분적으로만 투영되어 있다.

1. `.woo/units.yaml`과 `code-ids.json`은 `001`~`005`에서 멈췄다.
2. `traceability-v2.json`은 `Code-001`~`Code-014`를 보유한다. `Code-015`는 없다.
3. `traceability-v3.json`은 `Code-001`~`Code-013`만 보유한다. 따라서 v2의 `Code-014` 이관도 누락됐다.
4. 소스에는 유일한 `@Unit` 선언이 `Code-001`~`005`, `008`~`015`에 있다. `Code-006`과 `Code-007`은 v2 원장에만 있고 대표 선언 주석이 없다. `@codeId`는 legacy `0001`~`0005`에만 있다.

즉 실제 원인은 v2 Unit 이관, legacy numeric manifest, local SQLite manifest, v3 migration이 하나의 원자적 change로 유지되지 않은 데 있다. `scripts/code-id.ts`는 `code-ids.json`에 등록된 numeric `@codeId`만 AST로 수집하므로 `@Unit Code-006`~`015`의 미등록 또는 중복을 발견할 수 없다. `local-units.ts`도 `.woo/units.yaml`만 검증하고 v3를 우선 읽으므로 같은 분기를 교차 검증하지 않는다.

## ID별 대조

| ID | 현재 source symbol/path와 선언 | `.woo` / `code-ids` / v2 / v3 | Linear 근거 | Obsidian path 근거 | 판정 |
|---|---|---|---|---|---|
| Code-006 | v2가 `src/core/domain/development/development-traceability.ts#validateLedger`를 가리키나 그 파일에 symbol과 `@Unit`이 없다. 실제 export는 `src/adapters/outbound/development/development-traceability-contract.ts#validateLedger`이며 주석이 없다. | 없음 / 없음 / 있음 / 있음 | v2 `WOO-695`; saved readback도 `WOO-695`에 Code-006 | `Traceability/WOO-695.md` (`unit_id: Code-006`) | location과 선언이 둘 다 drift. 기존 UUID/ID를 보존하고 location만 정정해야 한다. |
| Code-007 | `src/adapters/outbound/development/traceability-validator.ts#validateTraceability`; symbol은 존재하지만 `@Unit`/`@codeId` 없음. | 없음 / 없음 / 있음 / 있음 | v2 `WOO-695`, `WOO-698`; saved readback 동일 | `Traceability/WOO-698.md` (`unit_id: Code-007`), `WOO-695.md` 본문 Code-ID | 대표 선언 누락. ID 재발급 대상이 아니다. |
| Code-008 | `src/adapters/outbound/development/development-store.ts#DevelopmentStore`; `@Unit` 1회, numeric 주석 없음. | 없음 / 없음 / 있음 / 있음 | `WOO-696`, `WOO-697` | `Traceability/WOO-696.md`, `WOO-697.md` | registry projection만 누락. |
| Code-009 | `src/adapters/outbound/development/development-map-builder.ts#buildDevelopmentMap`; `@Unit` 1회, numeric 주석 없음. | 없음 / 없음 / 있음 / 있음 | `WOO-699` | `Traceability/WOO-699.md` | registry projection만 누락. |
| Code-010 | `src/adapters/inbound/tui/features/usage/workbench-bottom-hud.ts#WorkbenchBottomHudView`; `@Unit` 1회, numeric 주석 없음. | 없음 / 없음 / 있음 / 있음 | `WOO-678` | `Traceability/WOO-678.md` | registry projection만 누락. |
| Code-011 | `src/core/application/work/todo-ledger.ts#TodoLedger`; `@Unit` 1회, numeric 주석 없음. | 없음 / 없음 / 있음 / 있음 | v2: `WOO-682,700,701,702,703,721,722`; saved readback도 동일 | 해당 `Traceability/WOO-*.md` 7개 | registry projection만 누락. |
| Code-012 | `src/core/application/development/development-service.ts#DevelopmentService`; `@Unit` 1회, numeric 주석 없음. | 없음 / 없음 / 있음 / 있음 | v2: `WOO-681,704,705,706,709,723,724`; saved readback에는 추가 `WOO-717`도 Code-012로 표시 | 해당 v2 7개 `Traceability/WOO-*.md` | registry projection 누락 및 v2↔saved Linear readback의 `WOO-717` edge 불일치. |
| Code-013 | `src/adapters/inbound/tui/foundation/layout/dashboard-layout.ts#createDashboardLayout`; `@Unit` 1회, numeric 주석 없음. | 없음 / 없음 / 있음 / 있음 | `WOO-680,707,708,725,726` | 해당 `Traceability/WOO-*.md` 5개 | registry projection만 누락. |
| Code-014 | `src/core/commit/commit-governance.ts#CommitControlPlane`; `@Unit` 1회, numeric 주석 없음. | 없음 / 없음 / 있음 / 없음 | v2 `WOO-844`, `traceability-validation-woo-844-20260908`; local Linear draft에도 Code-014 | v2 URI `Architecture/Woo-Commit-Control-Plane.md`; repository Vault export에는 해당 file readback이 없음 | v3 및 두 local manifest 이관 누락. Obsidian URI는 존재하나 export proof가 없어 live/readback 재확인이 필요하다. |
| Code-015 | `src/adapters/outbound/authentication/gemini-cli-auth.ts#ProviderAuthController`; `@Unit` 1회, numeric 주석 없음. | 없음 / 없음 / 없음 / 없음 | 찾지 못함 | 찾지 못함 | source-only unregistered identity. 현재 근거만으로 registry 추가나 새 ID 발급을 할 수 없다. |

소스에서 관측된 `@Unit` 값은 중복 없이 각 한 번뿐이다. 단, 이 사실은 006/007의 부재와 manifest 누락을 해결하지 않으며 Code-015의 외부 연결 근거도 만들지 않는다.

## 안전한 복구 절차

1. 현재 이동 작업을 하나의 commit 또는 고정된 snapshot으로 먼저 멈춘다. 경로가 감사 중에도 바뀌므로 이 상태에서 `sync`나 원장 수정은 안전하지 않다.
2. `traceability-v2`의 기존 Unit UUID/key를 identity source로 하여 Code-006~014를 **재발급 없이** candidate로 만든다. 006은 실제 `development-traceability-contract.ts#validateLedger`로 location을 정정하고, 007은 현재 symbol에 대표 `@Unit`을 복구한다. 008~014는 실제 path/symbol와 one-to-one을 재확인한다.
3. v2↔v3↔`.woo/units.yaml`↔`code-ids.json`의 ownership을 먼저 결정하고 migration candidate를 만든다. 현재 `code-ids.json`은 `detail`의 flat `Code-000N.md`와 numeric `@codeId`를 요구하지만 그 path들은 이미 존재하지 않는다. 따라서 006~014를 무작정 복사하지 말고, numeric legacy registry를 v2/v3 Unit graph로 이관하거나 schema/validator를 함께 바꿔 하나의 canonical manifest와 교차 검증 gate를 만든다.
4. 각 existing ID의 Linear issue edge와 Vault `unit_id`/URI를 readback으로 확인한다. Code-012의 `WOO-717`은 v2 edge에 넣을지, Linear 투영에서 제거할지를 해당 상세 정본과 함께 결정한다. Code-014는 `WOO-844`의 actual Vault 문서와 URI를 다시 export해 digest-bound evidence를 남긴다.
5. Code-015는 owner가 연결할 기존 Linear issue와 canonical Obsidian detail을 확정하기 전까지 source-only blocker로 남긴다. 확정 후에도 새 번호를 발급하는 일이 아니라 이미 사용 중인 `Code-015` identity를 근거와 함께 등록하는 reconciliation이다.
6. candidate 적용 뒤 source annotation 전체와 모든 registry의 key/UUID/path/symbol/Linear/note relation을 한 번에 비교하는 test를 추가하고, `bun scripts/code-id.ts`, `bun run units:check`, `bun run traceability:check`, scoped `obsidian:check`의 실제 worktree 통과를 evidence로 남긴다.

## Core 추출 판정

이번 `ProjectWorkbench` 내부 구현 상세 추출은 새 Code ID 없이 `Code-002` 아래에 남는 것이 맞다. 설계 기록 `.omo/evidence/2026-09-13-project-workbench-refactor-design.md`는 공개 `ProjectWorkbench` interface와 Code-002 위치를 유지하고 신규 ID 발급을 제외하며, 실제 대표 선언도 `project-workbench.ts`의 `@Unit Code-002` / `@codeId 0002`다. 구현 상세가 같은 Chat 대화 수명 capability의 내부 helper라면 Code-002의 member/location으로 표현한다.

다만 별도 public capability인 `RequestController`/Request Runtime control and projections를 독립 Unit으로 승격하기로 결정하면 그것은 별도 change다. 현재 core-domain audit의 Code-016 제안도 Code-006~015 reconciliation 후에만 진행하라고 명시한다. 이 감사는 Code-016을 발급하거나 Code-002 ownership을 바꾸지 않았다.

## 실행 증거

| 명령 | 결과 |
|---|---|
| `bun test test/code-id.test.ts test/development-traceability.test.ts test/traceability-v3.test.ts test/obsidian-traceability.test.ts test/work-traceability.test.ts` | 32 pass, 2 fail. 실패는 진행 중인 TUI path 이동으로 `work-traceability` manifest가 새 `chat-durable-transcript.ts`를 연결하지 않고 옛 `workbench-views.ts`를 가리킨다는 것. Code-ID fixture/traceability v3/Obsidian contract tests는 pass지만 real registry drift를 포괄하지 않는다. |
| `bun scripts/code-id.ts` | fail. legacy paths와 `.www/vault/Development/Code-0001..0005.md` 부재, 옛 deleted files, `@linear`+`@codeId` 중복을 보고했다. Code-006~015 numeric annotations는 수집하지 않아 이 구간 자체의 누락은 검사하지 못한다. |
| `bun run units:check` | fail. `.woo/units.yaml`의 Code-001 path가 이동 중 실제 TypeScript file로 확인되지 않았다. 검사는 006~015가 manifest에 없으므로 이들을 검증하지 않는다. |
| `bun scripts/traceability.ts check --linear-snapshot ... --linear-receipt ... --vault-export-manifest ...` | fail: `VAULT_EXPORT_PROVENANCE_MISMATCH`. 보존 snapshot과 현재 Vault export provenance가 일치하지 않아 actual worktree green 증거가 아니다. |

`TODO`, `FIXME`, `test.skip`, `test.only`는 이 감사에서 변경하거나 완료 근거로 사용하지 않았다.
