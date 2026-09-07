# WOO-695 Linear ↔ Code Map 구현 receipt

판정: v1 Map 구현 및 로컬 검증 PASS. 필수 Opus 독립 review는 429로 무판정이며 아직 미실행 blocker다. 이 문서는 구현 위치와 검증 관측을 기록하며 Linear acceptance를 대신하지 않는다.

## 원천과 snapshot identity

- PR worktree: `/Users/jonghoPro/woo/00_project/99_www-pr-code-map`, branch `woo-695-code-map`
- base commit: `d35b2bbb1f784a0f177c6e80453ce634d6d93d74`
- 원본 dirty worktree HEAD / origin/main: `19bad6c00b2dbb4f8c58fd632eb362aae6d31d8d`
- 원본 manifest SHA-256: `58a21070aa501b9b4125848d821852a94cace4399def94776b1e63300049bb62`
- archive manifest SHA-256: `58a21070aa501b9b4125848d821852a94cace4399def94776b1e63300049bb62`
- current manifest SHA-256: `1e90de148a1e2ec60748d4885526b355936d687b5c01fb8c0700ba56078b4f67`
- 원본 manifest 관측: schema v1, Linear 43, code 46, test 30, evidence 2, link 171
- 원본 manifest의 repository target은 78개이며, PR base에 없던 target은 그중 19개다. domain/work 6개, traceability test 1개, historical evidence 2개, development domain/application/infrastructure/test 10개.
- archive는 원본 JSON graph를 byte-for-byte 보존한다. current validator는 archive를 검사하지 않는다.

원본 dirty 관측을 PR 현재 상태로 복사하지 않았다. `.www/control-ledger/traceability.json`은 이 PR snapshot에 실제 존재하는 target과 이번 WOO-695 구현 target만 담고, 원본 전체 graph는 `.www/control-ledger/observations/2026-09-06-dirty-worktree-traceability.json`에 이력으로 남겼다.

## Linear read-back

2026-09-07에 WOO-695를 Linear에서 읽기 전용으로 조회했다.

- display ID: `WOO-695`
- UUID: `d61f3719-f59d-4f8d-aa57-8889e3d224b0`
- URL: `https://linear.app/woo-world/issue/WOO-695/기능-unit과-linear-작업을-코드에-연결한다`
- parent: `WOO-672`
- project: `World Wide Woo`
- observed remote state: `In Progress`

UUID와 URL은 current map의 기존 identity와 일치한다. 이 online read-back은 존재·identity 확인이며 구현 완료나 수락 판정이 아니다. Linear에는 쓰지 않았다.

## 현재 구현 연결

- `src/domain/work/traceability.ts`: schema v1 parser, UUID/URL/ID 보존, 중복·dangling·관계 방향 검증, 양방향 lookup
- `src/domain/work/traceability-validator.ts`: repository target 존재 및 TypeScript AST 기반 `@linear` 등록·exact path 연결 검증
- `scripts/code-map.ts`: WOO ID/UUID/URL/path 조회, JSON 출력, offline `--check`
- `test/work-traceability.test.ts`: parser/validator/실제 manifest/CLI 회귀

대표 production declaration에 `@linear WOO-695`를 붙였고 기존 `@linear WOO-690` 선언도 current map exact path에 연결했다. `--check`는 TypeScript 7 compiler API로 모든 source를 한 snapshot에서 파싱하고, 실제 선언 또는 직접 호출문에 붙은 선행 full-line comment만 센다. string/template/regexp literal과 trailing/inline/orphan comment의 marker는 무시한다. fixture만으로 production declaration 요구를 만족할 수 없게 production code declaration 1개 이상을 강제한다.

## 범위 예외와 남은 작업

WOO-696(SQLite), WOO-697(개발 기록), WOO-698(Obsidian) 및 다른 계획 이슈의 identity는 보존하되 이 snapshot에 실제 target이 없으면 관계를 만들지 않았다. 기존 Chat/Todo/Tracer/Stats 관계는 실제 경로가 존재하는 범위에서 이관했다. Monitor/Dashboard의 기존 관계는 보존했지만 새 기능·관계·annotation은 만들지 않았다.

Unit kind와 ID 발급, schema migration, 공용 SQLite projection, Development Session/Run/Record/Document 관계, Obsidian Vault 및 대화·테스트 원문 연결은 아직 남아 있다. 따라서 이번 결과는 WOO-695의 v1 Map 실행 기반이며 전체 사용자 목표의 수락 완료가 아니다.

## 검증 결과

- `bun scripts/code-map.ts --check --json`: PASS, 107 references, 142 links, 실제 comment의 `@linear` 6 declarations 중 production code 4개
- `bun test test/work-traceability.test.ts`: PASS, 7 tests / 49 assertions
- `bun test test/architecture.test.ts`: PASS, 8 tests / 314 assertions
- `bun run check`: PASS
- `bun test`: PASS, 628 tests / 4,268 assertions / 74 files
- 변경 파일 trailing whitespace 검색: PASS
- 변경한 TypeScript에서 `TODO`, `FIXME`, `test.skip`, `test.only`, `describe.skip`, `describe.only`, `NotImplemented`, `placeholder`: 0건
- 원본과 archive byte equality 및 JSON semantic equality: true.

CLI 실측에서 `WOO-690`은 UUID·URL과 함께 4 code/4 test로 조회됐고, `src/application/project-workbench.ts`는 WOO-690을 포함한 관련 Issue로 역조회됐다. UUID `a417df98-8479-4222-b7e8-170ea4230f97`와 current manifest의 정확한 Linear URL JSON 조회는 모두 WOO-690 identity를 반환했다. `WOO-696`은 등록된 identity이지만 `현재 스냅샷 연결 없음`으로 조회됐다. 도움말·검사·미연결 안내와 새 parser/validator Error 문구는 한국어이며 schema 식별자, 코드 식별자, enum, option은 영어 계약을 유지한다.

## 독립 review blocker

필수 Opus first review 실행 결과는 원본 root `.www/scratchpad/2026-09-07-code-map-opus.json`에 있다. API status 429와 `resets 3:20am (Asia/Seoul)` 응답으로 종료돼 review 판정이 생성되지 않았다. 낮은 모델로 대체하지 않았으며, reset 이후 Opus review를 다시 실행하기 전까지 독립 review는 미실행 blocker다.
