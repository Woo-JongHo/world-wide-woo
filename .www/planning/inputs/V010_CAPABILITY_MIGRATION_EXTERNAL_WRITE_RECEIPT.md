# v0.1.0 Capability Architecture 외부 쓰기 Receipt

- 기록 시각: 2026-09-07T11:59:47Z
- source revision: `worktree:f963a587d8a48ca7f14328be001533b8eb984458:dirty`
- Linear issue write: 완료
- 실제 Vault 기록: `.www/vault/01_프로젝트/99_WWW/01_문서/Traceability/WOO-842.md`

## Linear 완료값

주 에이전트가 Woo Linear MCP write 완료 뒤 직접 재조회한 결과를 `V010_CAPABILITY_MIGRATION_LINEAR_READBACK.json`에 구조화했다. WOO-842의 UUID는 `30006fd3-0381-4b33-a2aa-edd90b560529`, 부모는 WOO-672 (`ae97b5d7-b0db-49ad-a70d-8aeaf79e350d`), project는 World Wide Woo (`5639ee1c-a6cd-44cf-9ed6-82ee9c5fc3db`), milestone은 v0.1.0 (`193948f7-2a11-4110-a143-360d83f2a076`)이다. 상태는 Backlog, label은 System·Improvement, related issue는 WOO-671·WOO-673이다.

초안은 실제 write payload와 분리해 보존하며 `status: applied`와 receipt 경로를 명시한다. 손상된 before-transfer JSON은 검증 원본이 아니므로 삭제했다.

## 재검증 경계

주 에이전트의 `mcp__linear_woo` 재조회에서 WOO-842의 본문·UUID·부모·프로젝트·마일스톤·상태·라벨·관련 이슈와 WOO-672 직계 하위 목록의 `hasNextPage=false`를 확인했다. 전체 World Wide Woo 37개 이슈의 완전한 pagination snapshot은 별도 strict acquisition 입력으로 만들지 않았다.

Obsidian 링크 patch를 실행하고 같은 URI가 본문에 남은 것을 재조회했다. 정확한 요청과 결과는 `V010_CAPABILITY_MIGRATION_LINEAR_OBSIDIAN_PATCH.json`에 기록했다.
