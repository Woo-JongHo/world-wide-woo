독립 읽기 전용 검토를 마쳤습니다. 이 세션에서 `bun`·`gh`·`python` 실행이 샌드박스에서 거부되어, 게이트 green과 "650 tests" 주장은 **커밋된 증거 파일에만** 근거합니다(증거 파일들은 상호 정합적: ledger `payloadDigest b0939e7f…`가 evidence·map·verification.json에서 동일, 테스트 수치 3개 아티팩트 일치).

---

# v0.2 Traceability — 독립 검토 보고서

## 문제없이 확인된 것

- **단일 체인 / 경쟁 정본 없음**: schema v2 관계 원장이 Unit·Issue·Note·PR·Run의 유일 정본. `DevelopmentStore.registerUnit`/`linkIssue`가 `traceability-v2.json` 존재 시 fail-closed로 경쟁 source envelope를 거부. SQLite는 원장에서만 재생성되고, `assertTraceabilityCurrent`가 entity/edge/meta/projection-digest 및 `PRAGMA integrity_check`·`foreign_key_check` 불일치를 rebuild 안내와 함께 throw.
- **게이트가 실제로 red가 됨**: realpath/symlink 탈출 검사가 vault·note·snapshot·receipt·export-root·work-reference 전 경로에 존재. AST 검사는 top-level class/function의 `@Unit Code-NNN`을 정확히 1회·심볼 일치로 강제하고 미등록 선언도 red. Linear 계약(Chat+Traceability)이 단일 `traceability:check` 안에서 실행되며 native `<pull-request>` embed 정규화·평문 Code-ID·링크 금지가 fixture로 검증됨. Map staleness가 `traceability:check` 내부와 CI(`quality.yml`)에 배선됨.
- **역방향 탐색**: `queryTraceability`가 issue/unit/run/note 4개 진입점에서 BFS(issue 완전 전개 포함)로 전체 서브그래프에 도달. `check`가 4개 진입점 probe + SQLite 삭제 후 재생성 digest 동치 확인.
- **MCP 영수증 경계가 정직**: CI `traceability:check`는 frozen snapshot + `enforceFreshness=false`. 24h 신선도는 `receipt-check`에만. `review-block-resolution.md`·CI job 이름·verification.json 모두 "live Linear API 호출 아님"을 명시. 영수증에 자격증명 없음.
- **버전 0.0.15**: package.json / `test/cli.test.ts` / `test/codex-app-server.test.ts`(native client) 일관, `--version → 0.0.15` 증거. 0.1.11→0.0.15 재기준화 근거는 계획서 §25·§29·§100에 기록.
- **PR #46 분리(부분 확인)**: v2 원장이 pr:46을 `chat-v0.1-code-evidence`로만 스코프, v0.2 이슈에 pr edge 0개.
- **가짜 완료 없음**: 신규 소스/테스트에 `.skip`/`.only`/미구현 분기 없음. `TODO/TBD` 문자열은 전부 mutation fixture·release-gate 탐지 패턴. 시크릿 없음. platform gate darwin PASS.
- **정직한 미완 공개**: verification.json이 `releaseGate: BLOCKED`(무관한 v0.1 ST-011 누락), `acceptanceStatus: not-asserted`, commit/push/PR 미수행, 독립 재리뷰 PENDING을 스스로 명시.

## 발견 (심각도 순)

### 1. [Medium — 수정 요구] `src/domain/work/`에 죽은 중복 모듈 ~1,100줄
`work/index.ts`가 `export *` 하는 `workflow-projection.ts`(904줄)·`delegation.ts`(133)·`activity-classification.ts`(63)를 **어떤 코드/테스트도 임포트하지 않음**. 실사용 심볼(`projectWorkFlow`·`classifyWorkActivity`·`projectNativeDelegation`)은 전부 `src/domain/work-steps.ts`(origin/main, 1,022줄, `test/work-flow.test.ts` 등이 계속 테스트)에서 옴. dplan/workflow projection 로직의 분기된 사본이 두 벌 존재하고, 새 사본은 자기 경로로 테스트되지 않으며 traceability와 무관함.
- 위반: 계획서 §174("두 독립 기능을 한 PR에 묶지 않는다"), 머신 규칙("같은 이름의 다른 사본"), 계획서 §110 정신. migration record 없음.
- **최소 수정**: `src/domain/work/`에서 `workflow-projection.ts`·`delegation.ts`·`activity-classification.ts` 삭제 + `work/index.ts`의 해당 재export 제거(traceability·traceability-validator만 노출). `work-steps.ts → work/` 이관이 실제 의도라면 importer/test 갱신 + 이관 기록과 함께 **별도 PR**로 분리.

### 2. [Low] PR #46 "traceability 파일 0개" 주장이 아티팩트로 뒷받침되지 않음
`pr46-readback.json` 파일 목록은 `gh`의 100파일 상한(`observedFileCount: 100`)에서 잘렸고, 잘린 창은 `.github/` + `.www/evidence/**`만 포함. `docs/`·`scripts/`·`src/`·`test/` 경로는 캡처 창 밖이라 이 아티팩트로는 증명 불가. (브랜치 분리와 v2 원장 스코프는 별도로 확인됨.)

### 3. [Low] 생성된 Map 산문이 과장
`buildDevelopmentMap` 출력 문구는 표가 "공용 SQLite 투영에서 생성"된다고 적지만, 함수는 SQLite를 전혀 읽지 않고 원장 + work manifest만 사용함.

### 4. [Low] `www development unit` / `link` CLI가 이 저장소에서 항상 throw
`traceability-v2.json` 존재 시 fail-closed. 새 `Code-NNN`을 v2 원장에 발급하는 자동 경로 없음(수동 JSON 편집만). `nextUnitKey` 헬퍼는 존재하나 미배선. 계획서 §160의 "Unit 발급" 자동화 미제공.

### 5. [Info] frozen dirty-worktree 증거
모든 note/run이 `worktree:19bad6c…:dirty`에 고정. CI는 live git과 재대조하지 않으므로 merge 후 정본 증거가 미커밋 상태를 영구 인코딩. "frozen artifacts" 설계와는 일치.

## 재확인 절차
- `bun run check` / `bun test`(650 pass) / `bun run traceability:check` / `... receipt-check -- --vault-root <실제 Vault>` / `development-map:check`
- 발견 1 수정 후 `tsc --noEmit` 및 `test/work-flow.test.ts` green 유지 확인
- `gh pr view 46 --json files` 전체(>100)로 traceability 경로 부재 재확인

---

## 판정

**BLOCK**

핵심 traceability 체인·게이트·증거는 견고하고 정직하지만, 발견 1(무관한 죽은 중복 코드 ~1,100줄이 v0.2 PR에 동승, migration 기록 없음)이 "테스트가 통과하니 승인"에 해당하는 항목이며 머신 규칙·계획서 §174 위반입니다.

**필요한 최소 수정**: `src/domain/work/`에서 `workflow-projection.ts`·`delegation.ts`·`activity-classification.ts`를 삭제하고 `work/index.ts` 재export를 `traceability`·`traceability-validator`로 한정. (`work-steps.ts` 이관 의도라면 별도 PR로.) 이후 `tsc --noEmit`과 기존 work 테스트 green 재확인.
