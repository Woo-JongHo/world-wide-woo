# S5 Astra → WWW 명칭 변경 재감사

- 재감사일: 2026-09-25
- 범위: 이전 BLOCK 보정 — Runtime 정책표, deprecated alias 문서/도움말 경계, `WWW_PERFORMANCE` 이동, S5 dangling link
- 방식: 읽기 전용 코드·문서·테스트 대조
- 실행: `bun test test/app-runtime-mode.test.ts test/cli.test.ts test/request-runtime-mode.test.ts test/request-runtime.test.ts test/project-workbench-session.test.ts test/architecture.test.ts --reporter=dot` — 83 pass / 0 fail / 3,052 assertions; `bun run check`; `git diff --check`; S5 문서(`REQUEST_RUNTIME`, `WWW_PERFORMANCE`, `WWW_EXECUTION_CONSOLE`)의 상대 Markdown 링크 검사 — 0 dangling

## Skill-perspective check

`remove-ai-slops`와 `programming`은 이 세션의 사용 가능 Skills 목록에 없어 로드할 수 없었다. 수동으로 같은 기준을 적용했으며, 보정은 실행 계약을 문서화하고 직접 관찰 가능한 CLI/help·composition 동작을 검증하는 범위에 그쳤다. 삭제만 확인하는 테스트, 구현 상수만 반영하는 tautology, untyped escape hatch, 불필요한 production parsing/normalization은 확인되지 않았다.

## Findings

### CRITICAL

없음.

### HIGH

없음. 이전 HIGH였던 Runtime 문서 충돌은 해소됐다. [docs/REQUEST_RUNTIME.md:8](/Users/jonghoPro/woo/00_project/99_www/docs/REQUEST_RUNTIME.md:8)~[10](/Users/jonghoPro/woo/00_project/99_www/docs/REQUEST_RUNTIME.md:10)은 `runtime-config → broker`, 일반 `www`/`runWww() → off`, 별도 설정 없는 `runApp() → observe`를 구분하며, [src/app.ts:58](/Users/jonghoPro/woo/00_project/99_www/src/app.ts:58)~[92](/Users/jonghoPro/woo/00_project/99_www/src/app.ts:92) 및 [test/app-runtime-mode.test.ts:74](/Users/jonghoPro/woo/00_project/99_www/test/app-runtime-mode.test.ts:74)~[113](/Users/jonghoPro/woo/00_project/99_www/test/app-runtime-mode.test.ts:113)와 일치한다.

### MEDIUM

없음. [docs/WWW_PERFORMANCE.md:304](/Users/jonghoPro/woo/00_project/99_www/docs/WWW_PERFORMANCE.md:304)~[311](/Users/jonghoPro/woo/00_project/99_www/docs/WWW_PERFORMANCE.md:311)은 현재 script·환경 변수·output 이름을 모두 WWW로 맞췄다. 이전 `ASTRA_PERFORMANCE.md` 참조와 old script path는 S5 대상 문서/코드에서 남지 않았다.

### LOW

없음. [test/cli.test.ts:95](/Users/jonghoPro/woo/00_project/99_www/test/cli.test.ts:95)~[102](/Users/jonghoPro/woo/00_project/99_www/test/cli.test.ts:95)는 `--help`가 `astra`를 포함하지 않음을 직접 고정한다. 반면 [src/cli.ts:289](/Users/jonghoPro/woo/00_project/99_www/src/cli.ts:289)의 alias route와 [docs/REQUEST_RUNTIME.md:45](/Users/jonghoPro/woo/00_project/99_www/docs/REQUEST_RUNTIME.md:45)~[50](/Users/jonghoPro/woo/00_project/99_www/docs/REQUEST_RUNTIME.md:50)의 deprecated 설명은 호환 목적에 한정된다.

## 확인된 통과 항목

- `runWww`는 surface와 기본 off를 명시하지만 runtime config의 capability factory는 broker를 우선한다. factory는 [src/adapters/outbound/workspace/project-workbench-session.ts:320](/Users/jonghoPro/woo/00_project/99_www/src/adapters/outbound/workspace/project-workbench-session.ts:320)~[358](/Users/jonghoPro/woo/00_project/99_www/src/adapters/outbound/workspace/project-workbench-session.ts:358)를 통해 실제 Workbench options로 전달된다.
- plain CLI, resume, runtime config, compatibility alias는 `runWww`로 수렴한다. Legacy Router와 `session-model-usage`는 독립 경로로 보존됐으며, `gpt-6-astra`는 외부 model ID로만 남았다.
- S5 문서의 local Markdown link 검사에서 dangling target은 0건이다. 타입 검사·architecture test·whitespace 검사도 통과했다.

## 판정

- codeQualityStatus: `CLEAR`
- recommendation: `APPROVE`
- blockers: 없음
