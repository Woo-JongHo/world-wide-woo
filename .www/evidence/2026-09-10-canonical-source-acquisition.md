# 정본 소스 확보 Receipt · 2026-09-10

## Linear

- 연결: `linear-woo`
- Workspace: `Woo-World` (`b7b91489-dd9b-4fb7-b958-822d5dc577e0`)
- Project: `World Wide Woo` (`5639ee1c-a6cd-44cf-9ed6-82ee9c5fc3db`)
- 조회: `mcp__linear_woo__get_project` 및 `list_issues(project=5639ee1c-a6cd-44cf-9ed6-82ee9c5fc3db, includeArchived=false, limit=250)`
- 조회 결과: 프로젝트 최신 갱신 `2026-09-08T08:43:25.390Z`, 이슈 `56개`, 다음 페이지 없음
- 판정: 현재 Linear 원본을 확보함. 기존 `.www/evidence/v020-traceability/linear-consistency-final-normalized.json`(2026-09-07)은 재생성 대상임.

## Obsidian Vault

- 경로: `.www/vault`
- 수집 결과: Markdown `47개`
- 기존 byte manifest: `.www/evidence/v020-traceability/obsidian-export-manifest.json`
- 판정: bytes는 읽을 수 있으나 Traceability 문서가 `record_type: requirement`/구 경로·구 구조라 현재 schema v2와 일치하지 않음.
- 검증 근거: `bun run obsidian:check -- --vault .www/vault`에서 `PATH_DRIFT` 발생; `bun run traceability:check`에서 `VAULT_EXPORT_PROVENANCE_MISMATCH` 발생.
- 안전 경계: 기존 문서를 임의로 active 정본으로 바꾸지 않음. 새 schema v2 Candidate는 원문·Linear 상세·코드 관계를 대조한 뒤 draft로 생성해야 함.

## 다음 단계

1. 확보한 최신 Linear snapshot을 파일로 고정한다.
2. 47개 Vault 문서의 `document_id`·경로·digest를 보존한 migration preview를 만든다.
3. 정보가 없는 14개 정본 절은 추정하지 않고 `draft`/`BLOCKED`로 남긴다.
4. 사용자 승인 후에만 `woo-obsidian-publish`로 Vault를 변경하고 read-back한다.

## 자동 진행 결과

- migration preview 실행: `OBSIDIAN_CONTRACT_BLOCKED` — 현재 Traceability 문서는 schema v2 정본 수가 아니므로 Vault 변경을 하지 않음.
- TypeScript dev build/check: PASS (`bun run check`)
- 전체 회귀 테스트: PASS — `1039 pass, 0 fail`, `117 files`
- CLI dev startup/help: PASS — `.www/evidence/2026-09-10-dev-build-help.log`
- 플랫폼 게이트: PASS (darwin)
- Development Map check: PASS (`37 issues` current projection)
