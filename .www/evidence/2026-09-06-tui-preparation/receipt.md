# Linear 반영 확인

2026-09-06 승인된 TUI 준비 계획을 실행했다.

- 기존8개 본문/제목/라벨 보완, 신규 WOO-693/694 생성, Chat10개 TUI 라벨만 추가.
- 기존 상태·부모·마일스톤·관련 관계를 보존했다. 범위 밖 System/Workflow와 취소HUD/Completion의 본문도 그대로다.
- MCP로24개를 재조회해 이번10개 UUID·URL·코드태그와 관계를 대조했다. [실제 원문](linear-after.json), [대조 결과](verification.json).
- 대표선언11곳의 ID 연결(기존태그 확장 포함), 제품소스8파일은 주석만 변경. [파일 증거](verified-source.json).
- 최종 `bun run check` exit0, `bun test` 618pass/0fail/74files. 기존 주석 무결성 테스트가 신규11개 ID주석을 함께 검사했다. [검증 로그](tests-final.log).
- `git diff --check` 및 상대 링크 검사 통과. placeholder 검색의 TODO2건은 기존 Todo 표시 문자열이며 새 미구현 항목이 아니다.
- 코드·원장·Evidence 변경은 미커밋이며 제품 기능 수정·실제 TUI 수락·배포는 수행하지 않았다.

## 검토 해소

Sonnet 최초 REVISE 뒤 수정확인 PASS. Opus 최초 REVISE 뒤 수정본의 경미2건(부모T-note 참조/자기ID반복 제거)을 반영했다. 최종 반영 감사 원문은 `.www/scratchpad/2026-09-06-tui-final-opus.json`이다. 원장의 schema와 충돌하는 결함본문 저장 제안, 실제 many-to-many 연결을 단일소유로 바꾸라는 제안은 채택하지 않았다. 검증중복은 공통 fixture/실행기록 재사용으로 해소하되 화면별 renderer의 내용 검증은 유지했다.

반영 후 Opus는 비차단 REVISE로 자기참조 문장·옛 issue slug 표기2종을 지적했다. 해당3개 이슈를 수정하고 MCP 재조회로 확인했다. 코드·테스트·이슈 범위의 미해결 지적은 없으며 링크 수정본을 추가 독립 검토한 것은 아니다.
