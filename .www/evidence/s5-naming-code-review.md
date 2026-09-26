# S5 Astra → WWW 명칭 변경 독립 코드 리뷰

- 검토일: 2026-09-25
- 범위: Phase 5의 Astra → WWW 대규모 rename 및 실행 정책 분리
- 방식: 읽기 전용 코드·문서·테스트 대조
- 실행: `bun test test/app-runtime-mode.test.ts test/cli.test.ts test/www-shell.test.ts test/legacy-router-app.test.ts test/session-model-usage.test.ts --reporter=dot` (35 pass), `bun test test/request-runtime-mode.test.ts test/request-runtime.test.ts test/project-workbench-session.test.ts test/architecture.test.ts --reporter=dot` (58 pass), `bun run check`, `git diff --check`

## Skill-perspective check

`remove-ai-slops`와 `programming`은 이 세션의 사용 가능 Skills 목록에 없어 로드할 수 없었다. 따라서 동일 기준을 수동 적용했다. 변경은 삭제만 확인하는 테스트나 구현 상수만 되비추는 테스트, untyped escape hatch, 불필요한 parsing/normalization을 추가하지 않았다. `RunAppDependencies` 주입은 실제 composition을 관찰하는 데 필요한 작은 테스트 seam이며 과도한 추상화로 보지 않는다.

## Findings

### HIGH

1. 현재 Runtime 운영 문서가 새 기본 실행 정책과 충돌한다.
   - [docs/REQUEST_RUNTIME.md:8](/Users/jonghoPro/woo/00_project/99_www/docs/REQUEST_RUNTIME.md:8)는 `www astra --runtime-config`를 공개 진입점으로 쓰고 “기본 CLI는 관측형 v1”이라고 한다. 그러나 [src/cli.ts:271](/Users/jonghoPro/woo/00_project/99_www/src/cli.ts:271)는 plain CLI를 `runWww({})`로 보내고, [src/app.ts:89](/Users/jonghoPro/woo/00_project/99_www/src/app.ts:89)는 그 WWW 진입점을 `requestRuntimeMode: "off"`로 고정한다. 또한 같은 문서의 [40](/Users/jonghoPro/woo/00_project/99_www/docs/REQUEST_RUNTIME.md:40), [163](/Users/jonghoPro/woo/00_project/99_www/docs/REQUEST_RUNTIME.md:163)도 deprecated alias를 정상 사용법으로 노출한다.
   - 영향: 사용자가 7단계 runtime의 기본 동작과 broker 실행 명령을 잘못 이해한다. 이번 Phase의 “alias는 호환 전용·help 비노출, WWW 기본은 off” 계약을 문서가 깨뜨린다.
   - 요청 수정: public 실행 예제를 `www --runtime-config runtime-config.json` (또는 `bun start -- --runtime-config ...`)로 바꾸고, 기본 WWW는 off이며 runtime config가 있을 때 factory/broker가 우선한다는 우선순위를 명시한다. `runApp()` 직접 호출의 호환 observe는 프로그램 API 계약으로 구분한다.

### MEDIUM

1. 현재 성능 문서의 제품 파일명과 재현 예시가 Astra 이름을 남긴다.
   - [docs/ASTRA_PERFORMANCE.md:306](/Users/jonghoPro/woo/00_project/99_www/docs/ASTRA_PERFORMANCE.md:306)는 새 `WWW_BENCH_*` 환경 변수와 `www-render-benchmark.ts`를 사용하면서 출력 이름만 `/tmp/astra-benchmark.json`으로 남긴다. 문서 자체도 날짜가 붙은 과거 감사가 아니라 현재 재현 안내이므로, 보존 대상인 historical evidence와 구분해 `WWW_PERFORMANCE.md` 및 `www-benchmark.json` 등으로 정리하거나 그 상태를 명시해야 한다.
   - 영향: 새 명칭의 재현 기록과 artifact 검색이 분열된다. 실행은 실패하지 않지만 “Astra 이름 제거” 완료 주장은 성립하지 않는다.

### LOW

1. alias 비노출은 구현상 충족하지만 회귀 방지 테스트가 직접 단정하지 않는다.
   - [src/adapters/inbound/cli/www-help.ts:17](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/cli/www-help.ts:17)에는 `astra`가 없고, [src/cli.ts:289](/Users/jonghoPro/woo/00_project/99_www/src/cli.ts:289)만 compatibility route를 보유한다. 그러나 [test/cli.test.ts:90](/Users/jonghoPro/woo/00_project/99_www/test/cli.test.ts:90) 이후 도움말 테스트는 Router 문구만 검사한다.
   - 요청 수정: `wwwHelpText()` 또는 `--help` 출력에 `astra`가 포함되지 않음을 하나 추가해 compatibility-only 계약을 고정한다.

## 확인된 통과 항목

- UI surface와 runtime 정책은 [src/app.ts:29](/Users/jonghoPro/woo/00_project/99_www/src/app.ts:29)~[92](/Users/jonghoPro/woo/00_project/99_www/src/app.ts:92)에서 별도 입력으로 분리됐다. capability config는 surface와 무관하게 broker를 우선하고, `runWww`는 기본 off를 선택한다. [test/app-runtime-mode.test.ts:74](/Users/jonghoPro/woo/00_project/99_www/test/app-runtime-mode.test.ts:74)~[113](/Users/jonghoPro/woo/00_project/99_www/test/app-runtime-mode.test.ts:113)가 세 조합을 검증한다.
- factory는 [src/adapters/outbound/workspace/project-workbench-session.ts:320](/Users/jonghoPro/woo/00_project/99_www/src/adapters/outbound/workspace/project-workbench-session.ts:320)~[358](/Users/jonghoPro/woo/00_project/99_www/src/adapters/outbound/workspace/project-workbench-session.ts:358)에서 실제 Workbench options로 전파된다. Policy는 capability와 broker 모드의 불일치를 거절한다.
- CLI의 기본/재개/runtime-config와 deprecated `astra` alias는 모두 `runWww`로 수렴하며, 도움말에는 alias가 없다. CLI·programmatic test와 type check가 통과했다.
- `gpt-6-astra`는 외부 model ID로 [src/core/domain/execution/model-settings.ts:3](/Users/jonghoPro/woo/00_project/99_www/src/core/domain/execution/model-settings.ts:3)에 보존됐다. `SessionModelUsageAccumulator`와 Legacy Router도 계속 독립 경로로 import·테스트된다.
- 제품 source/test/scripts의 Astra 구현 파일·import는 WWW 이름으로 치환됐고, 남은 code 문자열은 `gpt-6-astra`와 deprecated CLI alias뿐이다. 날짜가 있는 review/design/audit와 scratch/evidence 참조는 역사 보존 범위로 남겼다.
- `bun run check`, architecture test, whitespace 검사 모두 통과했다. core→adapter / inbound→outbound 경계 위반은 이번 rename에서 추가하지 않았다.

## 판정

- codeQualityStatus: `BLOCK`
- recommendation: `REQUEST_CHANGES`
- blockers: `docs/REQUEST_RUNTIME.md`의 공개 실행 명령과 기본 Runtime 정책을 현재 WWW 계약으로 정정해야 한다.
