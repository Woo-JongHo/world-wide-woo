조사를 마쳤습니다. 먼저 이번 감사에서 **독립 재확인하지 못한 범위**를 밝힙니다.

- 실제 Obsidian vault(`/Users/jonghoPro/woo/01_obsidian`)는 이 세션 샌드박스 밖이라 Read/비교가 거부됐습니다. 바이트 동일성은 기록된 `receipt-check` 출력과 export manifest를 **믿고 받아들인 것**이지, 제가 재계산한 것이 아닙니다.
- `shasum`, `python3`, `bun` 실행이 권한 거부됐습니다. 해시·게이트를 재실행하지 못했습니다.
- Linear/GitHub MCP는 미인증이라 라이브 상태를 조회하지 못했습니다. PR #46은 저장된 `pr46-file-pages.json`(126건 실측 확인)으로만 검증했습니다.

읽기 전용만 수행했고, 아무것도 수정·커밋하지 않았습니다.

---

# 최종 감사 보고 (심각도순)

## 1. 정본 충돌: "값 없음" 표시 규칙이 Linear과 Obsidian에서 다르고, 구현은 둘을 섞었다 — 블로커

- **Linear WOO-678 §동작 2**: "값이 없으면 숫자를 만들지 않고 **짧은 미확인 상태로** 표시한다."
- **Obsidian `WOO-678.md` 21행**: "Codex와 Claude도 확인할 수 없는 값은 같은 원칙으로 **`—`를** 표시한다."
- **구현 `usage-strip-view.ts:50-56`**: Gemini만 `—`, Codex/Claude는 상태 문구. 두 정본을 절반씩 따랐습니다.

과제의 확인 항목 4("Code-010, WOO-678, 실제 Vault 노트, Linear readback, SQLite, Map이 일치")가 여기서 깨집니다. 게이트는 이 불일치를 못 잡습니다 — `validateTraceability`는 본문에서 평문 `Code-ID:` 줄만 대조하고 동작 규칙은 보지 않습니다.

## 2. ready 스냅샷에 주간 한도가 없으면 "조회 실패"로 원인을 틀리게 단정한다 — 블로커

`usage-strip-view.ts:52` → `unavailable(snapshot)`은 `state === "ready"`인 경우 fall-through로 `"조회 실패"`를 반환합니다. 조회는 성공했고 7일 버킷만 없는 상황입니다.

재현: `test/fixtures/usage-strip-color-probe.ts`의 입력 그대로 — anthropic이 `state:"ready", limits:[]`, codex는 `5 hours` + `7 days (Spark)`(tier라 `isTier`로 걸러짐)만 보유 → 화면은 `Codex 조회 실패 | Claude 조회 실패 | Gemini —`. WOO-678 완료 조건 3번("값을 추정하지 않는다")과 Obsidian의 대시 규칙 양쪽에 어긋납니다.

## 3. `verification.json`이 같은 파일 안에서 자기모순 — 블로커

이 파일은 ledger의 `runs[0].evidencePath`이자 판정 정본입니다.

- `storageBoundary.mainDirtyInputPreserved`에 `src/domain/work/activity-classification.ts`, `delegation.ts`, `workflow-projection.ts`가 **"보존됨"**으로 남아 있습니다.
- 같은 파일 `workManifest.removedDeadModules`는 **바로 그 셋을 제거했다**고 기록합니다.

파일시스템 확인 결과 셋 다 없습니다. 제거가 정답이고, 보존 목록이 낡았습니다.

## 4. WOO-678의 Linear 상태 전환(Canceled → Backlog)이 근거에 없다 — 중

`woo678-linear-readback.json:46-63`의 `stateHistory`: `Canceled` 구간이 `2026-09-07T04:54:59.390Z`에 끝나고 `Backlog`로 복귀했습니다. Linear 쓰기(05:05)·receipt(05:07)와 같은 작업 창 안입니다.

그런데 `verification.json`은 `preservedMetadata`에 `status`를 넣어 보존을 주장하고, `woo678-dogfood-summary.md`는 "Backlog"를 마치 기존 상태처럼 서술합니다. 외부 시스템에 가한 상태 변경이 어디에도 기록되지 않았습니다. (누가 바꿨는지는 확인할 수 없습니다 — 사실만 보고합니다.)

## 5. PR #46 "zero traceability paths"는 부정확 — 중

126개 파일 중 **`.www/vault/Development/2026-09-07-Chat-Completion-Verification.md`** 가 있습니다. 이 경로는 v0.2가 `obsidian-export-manifest.json`에서 `exportRoot: ".www/vault"`로 선언한 바로 그 디렉터리 안입니다.

게이트는 깨지지 않습니다 — `vaultExportRoot`는 manifest의 note 집합만 ledger와 대조하고 export root를 훑지 않으므로, `relativeRoot`(`01_프로젝트/99_WWW/01_문서`) 밖의 여분 파일은 무시됩니다. 그래도 `scopeSeparationStatus`, `traceabilityFiles: []`, sonnet 결의문의 "contains zero traceability paths"는 반례가 있는 주장입니다.

부수 사항: PR #46도 `.github/workflows/quality.yml`을 수정합니다. 이 브랜치가 같은 파일에 `traceability:check` 단계를 추가하므로 병합 시 충돌 지점입니다.

## 6. `verification.json`·`final-*.txt`의 낡은 수치가 phase 표기 없이 공존 — 중

| 기록 | 값 | 최종 실제 |
|---|---|---|
| `checks[].traceability:rebuild` | 43 entities / 105 edges | 46 / 110 |
| `checks[].development-map` | 16 issues | 17 |
| `checks[].work reference gate` | references 245 | 243 (직접 계수: `"kind"` 589 − 2×173 links) |
| `final-traceability-check.txt` | 9 Units, 16 issues, digest `b0939e7f…` | 10, 17, `7948ea2a…` |
| `final-map-check.txt` | 16 issues | 17 |

"before Sonnet cleanup" 표시가 붙은 행도 있지만 위 항목들엔 없습니다. `final-`이라는 이름이 실제로는 WOO-678 이전 상태인 점도 오독을 부릅니다. `woo678-*.txt`가 최신입니다.

## 7. 낮은 심각도 (블로커 아님)

- **Wooni**: HUD 공간은 정상적으로 비웠습니다(요구 충족). 다만 `wooni-dock.ts`는 프로덕션에서 참조 0이 됐는데 `test/wooni-dock.test.ts`가 살아남아 죽은 모듈을 계속 검증합니다.
- `test/fixtures/usage-strip-color-probe.ts`는 참조하는 테스트가 없는 고아이고, 제거된 색/막대 동작을 전제합니다.
- `legacy-session-shell.ts:90`은 usage strip에 `basis:2, minSize:2, maxSize:2`를 고정 배정하는데 이제 1행만 반환합니다(legacy 경로 미세 회귀).
- `DEVELOPMENT_HELP`(`development-cli.ts:18-19`)가 `/work`, `/map` slash command를 광고하지만 `slash-commands.ts`에 없습니다.
- `runDevelopmentCli`는 `src/cli.ts:109`가 차단한 뒤 제품 경로에서 도달 불가이고 자기 테스트로만 생존합니다. work manifest는 WOO-699를 `src/cli.ts`+`development-cli.ts`에, v2 ledger는 Code-009(`buildDevelopmentMap`)에 매핑 — 두 원장이 서로 다른 구현체를 지목합니다.
- "Development Map"이 둘입니다: TUI가 읽는 `FileDevelopmentMapSource`(`.www/planning` 기반)와 새 `buildDevelopmentMap`(`.www/Development-Map.md` 생성, TUI가 읽지 않음). **파서 충돌은 없음**을 확인했습니다.
- Code-010의 alias `"0010"`은 신규 Unit인데 legacy 별칭을 부여한 것이고 `migrations`에 대응 항목이 없습니다(가짜 이력, 게이트는 통과).
- `.gitignore`의 `*.log` 때문에 evidence의 로그 5개가 커밋되지 않습니다. 게이트 필수 경로는 아닙니다.
- 0.1.11 → 0.0.15는 사양대로지만 `--version` 역행입니다. `src/product-version.ts`가 package.json 단일 출처라 정본 중복은 없습니다.

## 8. 확인 결과 문제 없던 것

- **경로/심볼릭 탈출**: `repositoryArtifact`(realpath+relative), `isWithin`, `safeRelativePath`(`..` 차단), vault의 `realpathSync` 검사 — 새 파일·워크트리 전체에 심볼릭 링크 0건.
- **DB 변조**: `assertTraceabilityCurrent`가 entity/edge/meta 전량 + canonical projection digest + `PRAGMA integrity_check`/`foreign_key_check`를 대조하고 실패 시 query를 막습니다.
- **역방향 traversal**: `queryTraceability("unit","Code-010")` → WOO-678 → run/note까지 도달합니다.
- **중복 work-domain 제거**: 완료. `src/domain/work/`에 남은 3파일은 모두 프로덕션에서 사용 중이고, manifest는 origin/main `src/domain/work-steps.ts`를 정본으로 가리키며 제거 경로 참조가 없습니다.
- **한 줄 HUD**: `render`가 `[fit(line, width)]` 단일 행을 반환하고 shell도 `basis:1,min:1,max:1`. 폭 초과 시 `truncateToWidth`로 잘릴 뿐 행이 늘지 않습니다.
- **가짜 완료**: 실행되는 `.skip`/`.only` 0건. `test/release-gate.test.ts:26`의 1건은 fixture 문자열이며 `falseCompletionScan`의 기록과 일치합니다.
- **HUD 델타의 전체 스위트 리스크**: 낮습니다. `UsageStripView`/`WorkbenchBottomHudView`를 참조하는 것은 재작성된 두 테스트, 고아 fixture, legacy shell뿐이고, 실제 workbench 레이아웃을 조립하는 테스트는 없습니다. 전체 재실행 미주장은 정직한 서술입니다.

---

## 커밋 후보 제출 전 최소 수정

1. **표시 규칙 정본 하나로 고정.** Linear WOO-678 §동작 2와 Obsidian 노트 21행 중 하나를 택해 나머지와 `usage-strip-view.ts:50-56`을 일치시킵니다. Obsidian(대시)을 택하면 `unavailable()` 호출을 `—`로 바꾸고 `loading`/`auth-required`/`unsupported`만 상태 문구를 유지 — 2줄 변경입니다.
2. **Linear WOO-678 §결과의 예시에서 `Gemini 66% · 5d`를 `Gemini —`로 정정.** 이후 `linear-final-readback.json` → receipt(snapshot/uuid-set 해시) → ledger digest → SQLite → Map 재생성이 필요합니다.
3. **`verification.json` 정정**: `storageBoundary.mainDirtyInputPreserved`에서 제거된 3개 모듈 삭제, `checks[]`의 43/105·16 issues·references 245에 phase 표기 또는 최종값 반영.
4. **WOO-678 status Canceled → Backlog 전환 사실을 근거에 기록**(또는 `preservedMetadata`에서 `status` 제외).
5. **PR #46 범위 문구 정정**: "zero traceability paths" → `.www/vault/Development/2026-09-07-Chat-Completion-Verification.md` 1건이 exportRoot 안에 있으나 ledger note 집합 밖이라는 실측 서술로.

3~5는 ledger가 provenance로 검사하는 필드(`runId`/`runPurpose`/`sourceState`/`sourceRevision`)를 건드리지 않으므로 게이트 재통과 비용이 없습니다. 1~2만 digest 재생성을 유발합니다.

**BLOCK**
