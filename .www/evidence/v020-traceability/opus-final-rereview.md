쓰기 도구가 비활성이라 계획 파일은 만들지 못했습니다. 감사는 읽기 전용으로 완료했고, 보고서를 그대로 올립니다.

---

# 최종 적대적 감사 — v0.2 traceability / PR #46 / WOO-678 HUD

**대상**: `99_www-v020-traceability`, base `origin/main`(19bad6c). HEAD == origin/main이므로 전체 변경은 미커밋 워킹트리(수정 23 + 미추적 33).

**실행 제약(공개)**: 이 세션은 승인 창구가 없어 `bun`·`python3`·`shasum`·리다이렉션이 전부 자동 거부됐습니다. **게이트를 직접 재실행하지 못했고**, 정적 코드 판독 + 산출물 대조 + mtime 타임라인으로만 판정했습니다.

## 확인된 결과 (심각도 순)

### 1. [BLOCK · 중] 배선되지 않은 TUI 명령을 help가 광고하고, 해소 문서가 이를 "구현됨"이라 기록

- `src/infrastructure/development-cli.ts:14-15` — `DEVELOPMENT_HELP`가 `TUI: /work issue … · /work status · /work checkpoint · /work open`, `TUI: /map issue … · /map unit …`를 TUI 명령으로 제시합니다.
- `src/application/development-service.ts:43` `executeDevelopmentShellCommand`의 **production 호출부가 0개**입니다(정의 1 + `test/development-cli.test.ts` 6개가 전부).
- `src/presentation/tui/workbench-shell.ts:91-98`의 `workbenchViewModeCommand`는 정확히 `/map`만 매칭합니다. 워크벤치에서 `/work status`나 `/map issue WOO-678`을 치면 라우팅되지 않고 모델에게 채팅 텍스트로 전달됩니다.
- `.www/evidence/v020-traceability/opus-block-resolution.md`는 "the TUI commands that remain listed are implemented"라고 적었습니다. 함수는 존재하고 테스트도 되지만 **호스트가 받아들이지 않습니다**. "배선은 도는가가 아니라 받아들여지는가까지 본다"에 정확히 걸리는 거짓 검증 문장입니다.

완화 요인: `src/cli.ts:109` 가드와 production 생성자 부재로 `DEVELOPMENT_HELP`는 현재 제품에서 도달 불가이고, `verification.json`의 `opusFinalFixes`는 "hidden **top-level** commands"만 주장해 정확합니다. 거짓은 help 2줄과 메모 1문장에 국한됩니다. 그래도 진실성 시스템 자신의 증거이므로 통과시킬 수 없습니다.

### 2. [하] CHANGELOG와 package.json 버전 불일치
`0.1.11 → 0.0.15`는 사양대로이고 근거도 `docs/planning/linear-development/V020_TRACEABILITY_PLAN.md:29,99,166-170`에 있습니다. 그런데 `CHANGELOG.md:3`은 여전히 `## 0.1.12 — 2026-09-02`로 시작합니다. 배포·tag가 없고 `src/product-version.ts`가 package.json 단일 출처라 정본 중복은 아니지만, 저장소를 읽는 사람에게 0.1.x가 현행처럼 보입니다.

### 3. [하] `receipt-check --vault-root`가 manifest의 `actualVaultRoot`에 묶여 있지 않음
`scripts/traceability.ts:139-141`은 전달 경로를 resolve만 하고 `obsidian-export-manifest.json`의 `actualVaultRoot`와 대조하지 않아, `.www/vault`를 넘겨도 "actual Vault 검증"이 통과합니다. 실제 로그는 올바른 경로를 썼고 trust boundary가 정직히 표시돼 blocker는 아닙니다.

### 4. [정보] 전체 스위트 미재실행 범위 — 컴파일 위험은 없음
`final-bun-test.txt`(13:47:57) 이후 편집됐고 14:22:33 targeted run이 덮지 않은 것은 `workbench-shell.ts`(basis 4→1)와 `legacy-session-shell.ts`(basis 2→1)입니다. 다만 tsconfig가 `test/**/*.ts`를 포함하고 `tsc --noEmit`이 14:22:33 PASS라, 삭제된 `wooni-dock.ts`·`usage-strip-color-probe.ts`로 인한 dangling import는 없습니다. `workbench-shell-policy.test.ts`·`dashboard-layout.test.ts`에 HUD 행수 단언이 없어 회귀 가능성도 낮습니다. 레이아웃 delta는 실사용 검증 위임 영역이라 blocker로 보지 않습니다.

### 5. [정보] 커밋 후보 위생
`*.log` gitignore로 `targeted-red.log` 등 TDD red 로그 5개는 커밋되지 않습니다(정본 참조 없음). `pr46-readback.json` + `pr46-file-pages.json` 약 2.1MB가 커밋 대상인데, 게이트가 실제로 읽는 증거는 `linear-final-readback.json`·`linear-mcp-receipt.json`·`obsidian-export-manifest.json`·`verification.json` 4개뿐입니다.

## 통과 확인 (재지적하지 않음)

- **중복 work 도메인 제거 완결.** `src/domain/work/`는 traceability 3파일만, 삭제된 3모듈 잔재 없음, origin/main `work-steps.ts`가 미변경 정본. `wooni`/`color-probe` 참조가 코드·테스트·원장 어디에도 없음.
- **원장 remap 완결.** 241 refs / 173 links, `assertRepositoryReferencesExist`가 모든 traceability 명령의 첫 단계이고 마지막 소스 편집(14:22:26) 이후 14:22:34 PASS.
- **HUD 한 줄·정직한 대시 확인.** `render`는 항상 길이 1, 두 shell 모두 `basis/min/max = 1`. Gemini는 `usage-service.ts`의 `PROVIDERS`에 없어 snapshot 자체가 없고 `Gemini —`가 나옵니다. 정규식을 실측 대조했습니다 — gajae `claude.ts:370-400`의 `"Claude 7 Day(/(Opus|Sonnet))"`, `openai-codex.ts:207-221,332`의 `"7 days"`/`"7 days (Spark)"`에 대해 `isWeekly`/`isTier`가 tier만 정확히 배제합니다. Wooni는 HUD·welcome에서 제거됐고 두 테스트가 부재를 단언합니다.
- **Code-010 ↔ WOO-678 ↔ Vault ↔ Linear ↔ SQLite ↔ Map 전원 일치.** `@Unit` 선언 10개가 원장 10 Unit과 1:1. edge 110 = 38+17+11+17+27로 정확히 재구성되고 entity 46 = 10+17+17+1+1. digest `68c2fc9d…`/`e3f73171…`가 원장·rebuild·verification.json에서 동일. Linear의 `* Code-ID: Code-010`은 평문, 예시 `Gemini —`가 코드·노트와 같은 규칙. Canceled→Backlog 전환이 `2026-09-07T04:54:59.390Z` stateHistory로 기록.
- **PR #46 범위 독립 확인.** readback 126 파일 중 `.www/vault` 경로는 `Development/2026-09-07-Chat-Completion-Verification.md` 하나뿐이고 v2 note set 밖. `ledgerNoteSetPaths: []`, `v020IssueIdsLinked: []`, `zeroTraceabilityPathsClaim: false`.
- **증거 신선도.** 모든 편집 ≤14:22:26, `current=true` 실행은 14:22:33–14:22:53. 1차 Opus의 stale evidence 지적은 재발하지 않았고 이력은 `current=false`로 분리됐습니다.
- **정본 충돌 없음.** v1(43 linear-issue)과 v2(17)의 중첩 이슈 UUID·URL 동일(WOO-679·WOO-696 확인). `registerUnit`/`linkIssue`가 v2 존재 시 throw로 경쟁 writer 차단.
- **탬퍼/이스케이프 방어.** integrity_check + foreign_key_check + entity/edge/meta 3중 비교 + projection digest. realpath·isWithin 이중 봉쇄, `repositoryArtifact` 저장소 한정, vault symlink 거부. 역방향 순회는 4진입점 테스트로 커버.
- **가짜 완료 없음.** TODO/skip/only/미구현 분기 없음(검출 매치는 전부 gate가 *탐지 대상*으로 쓰는 리터럴). `git diff --check` 클린. `releaseGate: BLOCKED`, `acceptanceStatus: not-asserted`, `fullSuite: not rerun`이 정직히 기록됨.

## BLOCK 해소를 위한 최소 수정 (이 2개만)

1. `src/infrastructure/development-cli.ts:14-15` — TUI 2줄을 실제 배선 상태에 맞춥니다. 최소안은 두 줄 삭제 또는 "현재 TUI에 배선되지 않은 내부 adapter 명령"으로 명시. 대안은 `executeDevelopmentShellCommand`를 워크벤치 입력 경로에 실제로 연결하고 호스트가 출력을 수용하는 것까지 확인한 증거를 남기는 것.
2. `.www/evidence/v020-traceability/opus-block-resolution.md` — "the TUI commands that remain listed are implemented" 문장을 1에서 택한 실제 상태로 교체.

(비차단 권장: CHANGELOG에 0.0.15 재기준화 한 줄, `receipt-check`의 `--vault-root`를 manifest `actualVaultRoot`와 대조.)

**BLOCK**
