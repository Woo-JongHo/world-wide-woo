# 기존 목적·결정 대조와 설계 정정

2026-09-06. 기존 기록을 충분히 확인하지 않고 작성한 PostgreSQL·DB-only 정본 제안을 철회한다. **공유 DB는 SQLite**라는 사용자 결정을 현재 기준으로 삼는다. 이 문서는 설계 정정 기록이며 제품 구현·외부 반영 완료 보고가 아니다.

## 대조 결과

| 근거 | 지위·범위 | 설계에 반영한 내용 |
| --- | --- | --- |
| 현재 사용자 정정 | 제품 공유 DB 엔진 결정 | SQLite 고정. 엔진 재선택 질문 제거 |
| IDENTITY.md의 2026-09-05 결정 | Unit과 Linear Issue 분리 | 기능의 지속 identity·변경 Issue·다대다 관계 유지 |
| WWW_PRODUCT_DIRECTION.md | 제품 장기 방향 | Work Chain·Logical ID·Handoff·Evidence 중심. 독립 ID 체계 남발 금지 |
| WES DEC-0019·GOV-0022·최종 사람 수락 | WES 검증 인덱스 채택 | Git/Evidence 권위, SQLite 재구축. 제품에는 같은 권위 경계를 적용하는 설계안으로 명시 |
| WES Obsidian TOOL.md | WES 도구 계약 | append-only Raw·derived note·명시적 Git Promotion·자동 역동기화 금지 |
| PRODUCT_WORKFLOW.md | 제품 장기 Workflow Profile | Decision Truth는 WES 정책 권위 이전의 승인으로 해석하지 않음. 대화·테스트 보존은 최신 요청으로 범위 확장 |
| WWW_V010_ARCHITECTURE_PROPOSAL.md·EXECUTION_HANDOFF.md | 단계별 설계·구현 인계 | 기존 Todo 같은 파일 계약과 T-note·외부 통합의 미완료 경계를 보존 |
| .www/planning/README.md | legacy EP/ST catalog 계약 | 기존 catalog를 자동 폐기하거나 Linear에 이중 발급하지 않음 |
| 현재 Linear Project MCP read-back | 2026-09-06 관측 | TUI/System/Workflow 구조, 얇은 Control Ledger, v0.1.0 Milestone 유지 |
| 기존 코드 감사·v1 원장 | 로컬 구현 확인 | 현재 Issue–Code 참조와 Unit/SQLite/Obsidian 통합 미구현을 분리 |

WES의 기존 SQLite 채택은 사용자 설명과 일치하는 엔진 근거지만, 제품 공유 DB와 같은 물리 파일·같은 schema·같은 호스트를 뜻하지 않는다. 기존 제품 문서도 WWW 소유 ID와 얇은 관계 원장은 허용한다. 따라서 “모든 관계 DB가 금지된다”는 결론은 내리지 않는다. 이 정정안은 **source manifest를 남기고 공유 SQLite로 결합 조회하는 구현 방향**을 제안한다.

## 철회·보류한 제안

- 공유 PostgreSQL 및 SQLite를 단순 로컬 outbox로 축소한 권고: 철회.
- DB-only Unit registry·관계를 새 정본으로 전환하는 cutover: 철회.
- 근거 없이 추가한 백업 30일·RPO 24시간·RTO 4시간: 철회.
- UNT/DEV/REC/TST/DOC 접두어, 별도 서비스 배치, 새 Vault 폴더 트리: 승인된 규격으로 취급하지 않음.
- 이전 Opus PASS: 제출 초안의 내부 검토 이력으로만 보존. 기존 기록 전체와 정합성이 검증됐다는 의미로 재사용하지 않음.

이전 초안은 삭제하지 않고 [철회 이력](../../../.www/scratchpad/2026-09-06-knowledge-bridge-withdrawn-draft.md)에 남겼다. 현재 설계는 [KNOWLEDGE_BRIDGE_DESIGN.md](KNOWLEDGE_BRIDGE_DESIGN.md)다. STORAGE·HANDOFF에는 오래된 미결정 목록이 당시 기록임을 표시했다.

## 확인한 범위와 남은 한계

WES 원문 목록·줄번호·수락 이력은 [WES 감사](../../../.www/scratchpad/2026-09-06-sqlite-decision-audit.md), 제품 문서 완독과 충돌은 [로컬 목적 감사](../../../.www/scratchpad/2026-09-06-local-purpose-audit.md)에 보존한다. 주 작성자는 이 보고서 외에 WES verification/Obsidian 계약 원문, 로컬 Linear 개발 문서 전체와 Product Workflow를 직접 읽었다.

Linear MCP로 현재 World Wide Woo Project·Milestone·리소스, 프로젝트 문서 목록, WOO-672 본문·관계를 읽었다. Project resourceCount는 0, 문서 목록은 빈 배열이며 hasNextPage=false, WOO-672 본문은 비어 있었다. [read-back 원문](../../../.www/scratchpad/2026-09-06-sqlite-linear-readback.json)을 보존했다. 다른 모든 Issue·댓글·workspace 문서를 전수 조사했다는 뜻은 아니다.

후속으로 macOS Obsidian 등록 정보에서 실제 WES Vault(`/Users/jonghoPro/woo/02_WES`)를 찾았다. README 전문과 Markdown 파일 목록, 관련 SQLite 키워드 검색 및 2026-08-13 Action Contract 검토 Raw의 관련 절을 읽었다. Raw의 당시 DB 도입 유예는 8월 20일 후속 수락보다 오래된 검토이며 현재 SQLite 결정을 취소하지 않는다. 일반 Vault(`/Users/jonghoPro/woo/01_obsidian`) 검색은 일부 파일 읽기 오류가 있어 전수 완료하지 못했다. 제품 기록용 Vault binding과 전체 과거 대화는 여전히 미확인이다. WES 사본 STATUS의 다른 writer 머신과 원격 최신성도 대조하지 않았다. 제품 공유 DB의 실제 경로·소유 프로세스·머신 간 접근 방식은 미확인이다. 따라서 “모든 기록을 확인했다”거나 “운영 배치를 확정했다”고 주장하지 않는다. 이 한계 때문에 이미 정해진 SQLite 엔진을 다시 묻지는 않는다.

이번에는 설계 문서만 정정했다. DB·Vault·Linear 쓰기와 제품 코드 변경은 수행하지 않았다.
