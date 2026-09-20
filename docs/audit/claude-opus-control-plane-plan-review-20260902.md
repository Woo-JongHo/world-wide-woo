# Control Plane 계획 독립 검토

- 검토자: Claude Opus
- 방식: 읽기 전용 Planning review
- 최초 판정: `ITERATE`

## P0 지적과 반영

1. Trace가 INIT-002에 잘못 귀속됨
   - EP-011 후속 ST-011-14~19로 이동하고 INIT-002는 EP-012부터 시작하도록 수정했다.
2. Package artifact 매핑 없음
   - 사용자 수락 뒤 INITIATIVE·PRD·ARCHITECTURE·Epic·Story로 분리하는 물리 구조를 추가했다.
3. Todo 정본 충돌
   - Todo를 Native Plan의 읽기 전용 Projection으로 확정하고 `/todo`와 vault Todo는 legacy
     migration 대상으로 명시했다.
4. T-note/Trace 의미 변경의 이력 없음
   - ST-011-17과 ST-011-18이 각각 ST-011-08과 ST-011-09를 supersede하도록 제안했다.
5. App Server schema 실측 순서가 늦음
   - ST-011-14 schema 실측을 첫 실행 Story로 신설했다.
6. Atlas 정의 없음
   - CONTEXT에 사용자 정의를 반영했고 실제 제품/API는 사용자 검증 항목으로 남겼다.

## P1 반영

- Story 선행관계 DAG 추가
- Operations TUI 시간 검증을 고정된 3개 시나리오로 구체화
- effort 비교를 5개 fixture, 설정별 3회로 구체화
- 외부 Read EP-017과 Write EP-018 분리
- Progress Model에 cancelled·abandoned와 uncertain 처리 추가
- Obsidian 필요성 판정에서 Agent 자가판정을 배제
- Claude reviewer write-deny를 Blueprint와 write contract에 추가
- legacy activity/T-note/Todo migration을 ST-011-19에 추가
- 외부 상태 cache TTL과 invalidation 계약 추가

## 최종 재검토

- 판정: `OKAY`
- 남은 P0: 없음
- ST-011-14: 기술적으로 착수 가능하며 Catalog 승격만 선행 필요
- 후속 보완: ST-011-14의 관측 method·Evidence 종료 조건, Todo glossary, inferred의 결정론적
  interval, uncertain의 Blocker 소유를 계획에 추가 반영했다.
