# Code-ID/TUI 경로 정합 검증

## 변경 근거

- `git log --diff-filter=D`로 확인한 결과, `.www/vault/Development/Code-0001.md`부터 `Code-0005.md`는 `c2a3d14`에서 삭제된 과거 v1 산출물이다.
- 현재 정본 `.www/control-ledger/traceability-v3.json`은 `0001`~`0005`를 각각 `Code-001`~`Code-005`로 이관한 migration과 Unit entity를 함께 보관한다.
- 따라서 개별 Vault 노트를 되살리거나 새 ID를 만들지 않고, legacy Code-ID 원장의 `detail`을 현재 정본으로 이동했다. `code-ids.json`과 v2 Unit 원장의 TUI 경로는 현재 `features`/`foundation`/`shell` 구조와 대조했다.

## 성공 기준과 실행 증거

| 성공 기준 | 시나리오 | 실행 | 이진 관찰값 | 이 artifact |
| --- | --- | --- | --- | --- |
| 삭제된 이전 TUI 파일이 Code-ID AST 탐색을 실패시키지 않는다 | Git index에는 남아 있으나 작업 트리에서 삭제된 `src/deleted-move.ts` fixture | `bun test test/code-id.test.ts` | exit 0, fixture 포함 8 expect 통과 | 이 파일 |
| Code-0001~0005가 현재 Unit 정체성에 연결된다 | `detail`의 v3 Unit entity와 `000N → Code-00N` migration을 대조 | `bun scripts/code-id.ts` | exit 0, `Code-ID 5개...통과` | 이 파일 |
| 로컬 Unit 원장이 현재 경로와 Linear links를 가진다 | 5개 Unit의 code path/symbol 및 32개 link 검사 | `bun run units:check` | exit 0, `5 Units · 32 Linear links · valid` | 이 파일 |
| 이동 뒤 TypeScript 경계가 유지된다 | 전체 no-emit 타입 검사 | `bun run check` | exit 0 | 이 파일 |
| 구조와 추적성 계약이 함께 유지된다 | Code-ID, Unit registry, work traceability, v3 traceability, architecture 테스트 | `bun test test/code-id.test.ts test/local-unit-registry.test.ts test/work-traceability.test.ts test/traceability-v3.test.ts test/architecture.test.ts` | exit 0, 32 pass / 0 fail / 1928 expects | 이 파일 |
| 패치 형식이 유효하다 | 변경 diff whitespace 검사 | `git diff --check` | exit 0, 출력 없음 | 이 파일 |

## 전문 출력

### `bun scripts/code-id.ts`

```text
Code-ID 5개: 등록·대표 선언·파일·문서 연결 통과 (SQLite 연결 검사는 아님)
```

### `bun run units:check`

```text
$ bun scripts/local-units.ts check
5 Units · 32 Linear links · valid · 4a5b0089fcb5000b498507a4e9cbeca5037841ab19f9ed9c9ca4f56ec231d2cc
```

### `bun run check`

```text
$ tsc --noEmit
```

### `bun test test/code-id.test.ts test/local-unit-registry.test.ts test/work-traceability.test.ts test/traceability-v3.test.ts test/architecture.test.ts`

```text
bun test v1.4.0 (34cbb9a40)

test/traceability-v3.test.ts:
(pass) receipt-scoped registry authority > does not make an unrelated spec retroactively required [7.43ms]
(pass) receipt-scoped registry authority > rejects traversal, symlink escape, digest tamper, and envelope identity mismatch [3.59ms]
(pass) runtime receipt journal authentication > selects the exact receipt from a multi-turn ProjectActivity JSONL journal [3.86ms]
(pass) runtime receipt journal authentication > authenticates a fixed pre-v2 Plan plus command receipt without rewriting its historical meaning [0.64ms]
(pass) runtime receipt journal authentication > authenticates observed command results and rejects edited command output [0.65ms]
(pass) runtime receipt journal authentication > rejects replay tampering, global sequence gaps, and receipt checkpoint tampering [0.75ms]
(pass) traceability v3 SQLite projection > rebuilds identical logical and row digests after deleting SQLite [95.14ms]
(pass) traceability v3 SQLite projection > projects current receipts from aligned source digests and deterministic coverage [96.17ms]
(pass) traceability v3 SQLite projection > projects a contained runtime receipt through the production CLI into validated evidence and store queries [311.31ms]

test/work-traceability.test.ts:
(pass) work traceability > queries Linear, code, test, and evidence in both directions without merging identifiers [1.89ms]
(pass) work traceability > rejects duplicate, dangling, conflated, and malformed references [2.75ms]
(pass) work traceability > rejects links whose endpoints violate the relation contract [0.18ms]
(pass) work traceability > keeps source and test issue annotations connected to registered Linear identities [365.05ms]
(pass) work traceability > requires knowledge bridge issues to annotate linked production code and regression tests [15.60ms]
(pass) work traceability > validates the real Chat issue mappings offline without inventing legacy planning ownership [95.67ms]

test/local-unit-registry.test.ts:
(pass) local Code-ID registry > validates code owners and projects Linear links into SQLite [58.58ms]
(pass) local Code-ID registry > rejects missing symbols and unknown Linear issues before writing [12.03ms]
(pass) local Code-ID registry > normalizes unordered links and members into a stable projection [24.88ms]

test/architecture.test.ts:
(pass) source architecture > keeps flattened layers grouped by their canonical responsibility [31.46ms]
(pass) source architecture > keeps the core independent from adapters [25.59ms]
(pass) source architecture > keeps core domain independent from orchestration and effects [67.13ms]
(pass) source architecture > does not recreate the retired top-level source layers [7.58ms]
(pass) source architecture > keeps inbound adapters from importing outbound adapters [107.39ms]
(pass) source architecture > keeps process execution behind application-owned ports [31.28ms]
(pass) source architecture > keeps TUI foundation independent from higher-level TUI groups [23.91ms]
(pass) source architecture > keeps TUI feature implementations independent from sibling features [24.82ms]
(pass) source architecture > keeps concrete executor adapters independent [13.34ms]
(pass) source architecture > has no relative source dependency cycles [14.04ms]
(pass) source architecture > keeps the Work capability entry independent from TUI and Runtime implementations [14.56ms]
(pass) source architecture > keeps the composition root small [0.51ms]
(pass) source architecture > keeps the native workbench shell independent from the legacy session runtime [13.66ms]

test/code-id.test.ts:
(pass) Code-ID는 문자열 예시를 선언으로 세지 않고 실제 선언·노트·중복을 대조한다 [291.80ms]

 32 pass
 0 fail
 1928 expect() calls
Ran 32 tests across 5 files. [1.93s]
```

### Final focused re-run

```text
$ bun test test/code-id.test.ts
bun test v1.4.0 (34cbb9a40)

test/code-id.test.ts:
(pass) Code-ID는 문자열 예시를 선언으로 세지 않고 실제 선언·노트·중복을 대조한다 [608.88ms]

 1 pass
 0 fail
 8 expect() calls
Ran 1 test across 1 file. [698.00ms]

$ bun scripts/code-id.ts
Code-ID 5개: 등록·대표 선언·파일·문서 연결 통과 (SQLite 연결 검사는 아님)

$ git diff --check
```
