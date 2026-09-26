# WWW 상태 소유권 리팩터링 최종 Gate Review

- 검토일: 2026-09-26
- 검토 범위: S0-A~S6 구현과 Phase 9 문서·Candidate·Evidence
- recommendation: **REJECT**
- 검토 방식: 실행자·기존 리뷰의 성공 문구를 신뢰하지 않고 현재 worktree에서 코드·테스트·문서·Candidate를 재검증

## Original Intent

사용자는 기존 Inbound / Core / Outbound를 폐기하지 않고 외부 연결과 처리 로직은 Hexagonal 경계로 유지하며, Core가 정제한 데이터를 TUI로 옮기는 내부 구조는 익숙한 MVC 어휘인 Controller / ViewModel / View로 탐색할 수 있기를 원했다. 그 전에 상태 변경 책임, 여러 원천의 합성 규칙, 화면 전달 Interface를 고정하고, WWW 명칭·기능 폴더·문서·Evidence까지 단계적으로 정리하는 것이 요청의 핵심이었다.

## Desired Outcome

1. Runtime, stream→final, Snapshot, async scope, 7계층 관측 계약이 행동 테스트로 고정된다.
2. Hexagonal 의존 방향과 TUI MVC 책임이 실제 코드와 architecture gate에 반영된다.
3. 18 Feature·39 Unit, 좁은 Chat·Plan·Tracer·Note Projection, 완료 Note 읽기 흐름이 실제 소비 경로에 연결된다.
4. Astra 제품명은 WWW로 정리하되 deprecated CLI alias와 외부 모델 ID만 명시적으로 남는다.
5. 문서·Code-ID·traceability·Candidate가 실제 트리와 일치하고, 완료 조건인 Summary→Note 정책·Legacy Router 결정·고정 Opus 감사까지 닫힌다.
6. 외부 Linear·Obsidian 쓰기는 항목별 사용자 승인 전 수행하지 않는다.

## Findings

### BLOCKER 1 — Summary→Note capture/review/promote 계약이 완료 조건과 달리 미결정

- violatedCriterion: `linear-issue-preview.md` 완료 조건 4 — “Summary capture identity·review·promote 정책이 사용자 결정으로 기록된다.”
- observation: 완료 Note 읽기 흐름은 구현됐지만 capture가 동일 산출물 등록인지 참조 record인지, writer·review·promote 승인 정책은 여전히 Gap이다.
- evidencePointer: `.www/evidence/2026-09-25-www-code-structure-review/linear-issue-preview.md:45`, `docs/planning/WWW_STATE_OWNERSHIP_REFACTOR_PLAN_2026-09-25.md:791`, `.www/evidence/2026-09-25-www-code-structure-review/obsidian-canonical-candidate.json`의 `GAP-WWW-005`.

### BLOCKER 2 — Legacy Router 유지/폐기 및 migration 범위가 완료 조건과 달리 미결정

- violatedCriterion: `linear-issue-preview.md` 완료 조건 6 — “legacy Router의 유지 또는 폐기 결정과 migration 범위가 기록된다.”
- observation: 코드는 안전하게 보존됐고 WWW rename과 분리했지만, 최종 제품 결정 자체는 내려지지 않았다.
- evidencePointer: `.www/evidence/2026-09-25-www-code-structure-review/linear-issue-preview.md:47`, `docs/planning/WWW_STATE_OWNERSHIP_REFACTOR_PLAN_2026-09-25.md:792`, Obsidian Candidate의 `GAP-WWW-006`.

### BLOCKER 3 — 명시적 완료 조건인 traceability 검사가 실패

- violatedCriterion: `linear-issue-preview.md` 완료 조건 7 — “Code-ID 및 추적성 검사가 통과한다.”
- observation: `units:check`와 `development-map:check`는 통과했지만, 정식 `bun run traceability:check`는 `VAULT_EXPORT_PROVENANCE_MISMATCH`로 exit 1이다. Phase 9 문서도 이 실패를 정확히 기록한다.
- evidencePointer: `.www/evidence/2026-09-25-www-code-structure-review/linear-issue-preview.md:48`, `.www/scratchpad/www-refactor-plan-2026-09-25/sol-s9-docs-evidence.md:57`, 현재 명령 출력 `VAULT_EXPORT_PROVENANCE_MISMATCH`.

### BLOCKER 4 — 고정 Opus 구현 최종 감사가 판정 없이 종료

- violatedCriterion: `linear-issue-preview.md` 완료 조건 7 — “고정 Opus 최종 감사 결과가 기록된다.” 및 사용자의 Opus 교차검증 요청.
- observation: 설계 단계 Opus `ACCEPT_WITH_CHANGES`는 존재하지만 구현 전체 최종 감사는 조직 정책 403으로 판정을 받지 못했다. 낮은 모델로 대체하지 않은 처리는 올바르지만 최종 gate 조건은 충족하지 못했다.
- evidencePointer: `docs/planning/WWW_STATE_OWNERSHIP_REFACTOR_PLAN_2026-09-25.md:793`, `.www/scratchpad/www-refactor-plan-2026-09-25/sol-s9-docs-evidence.md:56`, Obsidian Candidate의 `GAP-WWW-007`.

## Non-blocking Notes

- `docs/audit/2026-09-21-code-readability-map.md:147`은 이번 rename에서 `www-execution.ts`로 바뀌었지만 S6 이후 실제 파일은 `features/chat/view/www-execution.ts`다. 이 문서가 2026-09-21 역사 기준선이라면 원래 당시 경로를 보존해야 하고, 현재 경로를 가리키려는 목적이라면 `view/`를 포함해야 한다. 최종 구조 정본은 아니므로 위 네 완료 조건 실패와 별도의 문서 정합성 NOTE로 둔다.
- `docs/planning/WWW_STATE_OWNERSHIP_REFACTOR_PLAN_2026-09-25.md:779-780` 부근에는 동일한 TUI 완료 항목이 중복되어 있다. 의미 오류는 아니다.
- S6 리뷰의 LOW처럼 View의 Core Application allowlist는 파일 단위라 향후 `TNoteService` writer symbol import까지 기계적으로 차단하지 않는다. 현재 위반은 없다.
- 외부 Linear·Obsidian publish/read-back은 수행되지 않았다. Candidate-only 상태는 승인 경계를 지킨 것이며 blocker가 아니다.

## User Outcome Review

사용자가 원한 구조적 방향은 실제 코드에 상당 부분 구현됐다. `LAYERS.md`와 architecture test가 Hexagonal 방향을 고정하고, TUI Feature는 실제 책임이 있는 경우에만 `controller / view-model / view / registration` 아래 배치된다. 물리 수치는 controller 1 / view-model 7 / view 60 / registration 36이고 빈 역할 폴더는 없다. Registry는 18 Feature·39 Unit과 4개 productGroup을 유지한다. Chat·Plan·Tracer·Note는 전체 Snapshot 대신 좁은 readonly Projection을 소비하고, `/tnotes` 사용자 흐름도 연결됐다. Astra 잔존은 deprecated CLI alias와 `gpt-6-astra` 외부 모델 ID로 제한된다.

따라서 구현 본체는 수락에 가깝지만, 사용자가 “9번까지” 요청한 전체 완료 상태로 승인할 수는 없다. 현재 문서가 네 Gap을 숨기지 않은 점은 정확하며, 이 review의 REJECT는 코드 회귀가 아니라 명시된 최종 완료 조건이 아직 열려 있다는 뜻이다.

## Independent Verification

| 검증 | 재현 결과 |
|---|---|
| `bun run check` | PASS |
| `bun test --reporter=dot` | 1,555 pass / 0 fail / 20,747 assertions / 179 files |
| architecture·registry·Development Map·artifact tests | 49 pass / 0 fail / 3,588 assertions |
| `bun run units:check` | PASS, 5 Units·32 Linear links |
| `bun run development-map:check` | PASS, 37 issues current |
| Candidate validate | 3/3 PASS |
| Candidate preview renderer byte identity | 3/3 PASS |
| `git diff --check` | PASS |
| 역할 폴더 실측 | controller 1 / view-model 7 / view 60 / registration 36 / empty 0 |
| `bun run traceability:check` | FAIL — `VAULT_EXPORT_PROVENANCE_MISMATCH` |
| `bun run release:gate` | BLOCKED — ST-011-12, ST-011-13 |

## Slop / Overfit / Programming Pass

`remove-ai-slops`와 `programming` skill은 현재 제공된 skill 목록에 없어 직접 로드하지 못했다. 대신 같은 기준을 직접 적용했다.

- 신규 행동 테스트는 단순 삭제 확인이나 구현 상수 복제가 아니라 Runtime 우선순위, identity 정착, Snapshot 역사 안정성, async generation, Note terminal flow 같은 관찰 가능한 계약을 검증한다.
- Port 분리는 새 전달 전용 service를 늘리지 않고 기존 Interface를 책임별 파일로 옮겼다.
- Feature Projection은 새 상태 owner/store를 만들지 않고 기존 Snapshot을 좁히는 순수 selector다.
- 빈 MVC 폴더·가짜 파일·`test.skip`·`test.only`·구현 placeholder는 발견하지 못했다.
- 대규모 rename/이동에서 테스트 삭제만으로 성공을 주장하지 않았고 WWW 이름의 대응 테스트가 존재한다.
- 리뷰 evidence는 각 단계에서 동일한 slop/overfit 관점을 명시적으로 수동 적용했다. 초기에 BLOCK된 S1-B/S1-C/S4-A/S5/S6 finding도 후속 재검토에서 해소 근거를 남겼다.

## Checked Artifacts

- `docs/planning/WWW_STATE_OWNERSHIP_REFACTOR_PLAN_2026-09-25.md`
- `docs/reviews/WWW_CODE_STRUCTURE_CURRENT_STATE_AND_TARGET_2026-09-25.md`
- `LAYERS.md`, `README.md`, `docs/REQUEST_RUNTIME.md`
- `src/app.ts`, `src/cli.ts`, `src/core/application/orchestration/workbench-feature-reads.ts`
- `src/core/domain/observability/layer-performance.ts`
- `src/adapters/inbound/tui/features/**`, `src/adapters/inbound/tui/shell/**`
- `src/core/ports/**`, `src/adapters/outbound/**`
- `test/architecture.test.ts`, `test/tui-feature-registry.test.ts`, 핵심 S0~S6 행동 테스트 및 전체 suite
- `.www/evidence/2026-09-25-www-code-structure-review/*`
- `.www/evidence/s1b-*`, `s1c-*`, `s2b-*`, `s2c-*`, `s4a-*`, `s5-*`, `s6-*` review evidence
- `.www/scratchpad/www-refactor-plan-2026-09-25/sol-s9-docs-evidence.md`

## Exact Evidence Gaps Before Approval

1. 사용자 결정이 반영된 Summary→Note identity/writer/review/promote 계약과 Candidate 갱신.
2. Legacy Router 유지 또는 migration/폐기 결정 및 범위 기록.
3. provenance가 정상인 Vault export/read-back으로 `traceability:check` PASS.
4. 접근 가능한 고정 Opus 환경에서 구현 전체 최종 감사 판정.
5. 위 변경 뒤 Candidate 3종 재-render/validate, 전체 회귀와 최종 gate 재실행.

