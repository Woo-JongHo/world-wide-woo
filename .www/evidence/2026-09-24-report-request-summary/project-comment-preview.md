## 변경

- 새 T-note 생성 계약을 질문·Plan·과정·결론의 네 필드로 변경했다.
- Astra REPORT 화면도 같은 순서로 표시하고 시스템이 관측한 Test는 결론 뒤 보조 근거로 유지했다.
- 기존 5필드와 3필드 기록은 재생 호환으로 읽되 새 생성 결과로는 수락하지 않도록 분리했다.
- ASTRA_EXECUTION_CONSOLE 문서를 새 REPORT 계약과 동기화했다.

## 영향

- 사용자는 완료 REPORT에서 자신의 질문, 세운 계획, 실제 과정, 도달한 결론을 한 흐름으로 읽는다.
- 과거 저장 기록은 깨지지 않으며 새 기록만 request-report-v2 계약을 따른다.

## 분류

Improvement

## 검증

- REPORT 관련 집중 테스트 160건과 TypeScript noEmit, git diff --check가 통과했다.
- 전체 회귀 1455건, assertion 18989건이 모두 통과했다.

## 연결

- Linear: WOO-693 · UUID 559c8b06-e8dd-4061-8d10-d719be0524a8
- Code: src/core/application/work/t-note-service.ts, src/core/application/orchestration/workbench-artifacts.ts
- UI: src/adapters/inbound/tui/features/chat/astra-execution.ts
- Contract: docs/ASTRA_EXECUTION_CONSOLE.md
