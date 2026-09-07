# 추적 저장 경계

## 통합 입력

기준 commit에는 없지만 사용자의 main working tree에는 `DevelopmentStore`,
`development_sources`, immutable development source envelopes 구현이 존재한다. 이 구현과
관련 테스트를 보존적으로 가져와 v0.2 관계 투영의 공용 저장 경계로 사용한다.

## 소유권

- `.www/control-ledger/traceability-v2.json`은 Unit UUID와 `Code-NNN` alias, Linear UUID,
  Obsidian URI, PR code evidence, validation run 관계를 소유하는 immutable relation ledger다.
- `$WWW_DATA_DIR/development/sources/<project-uuid>`의 envelope는 대화·테스트 capture 원문을
  소유한다. 관계 원장의 대체 사본을 쓰지 않는다.
- `DevelopmentStore` 하나가 `$WWW_DATA_DIR/development/index.sqlite`를 연다. 같은 DB와
  transaction 경계에서 `development_sources`와 `traceability_*` projection을 관리한다.
- SQLite writer는 projection을 원장이나 source envelope로 역반영하지 않는다. 삭제·변조·
  canonical digest 불일치 때 전체 rebuild 전까지 query가 실패한다.

## 호환과 이관

기존 `DevelopmentStore`의 unit/link/binding/record/test API와 프로젝트별 rebuild를 유지한다.
v2 조회는 같은 class의 `rebuildTraceability`, `assertTraceabilityCurrent`,
`queryTraceability`가 담당한다. 이전 별도 `traceability.sqlite`와 별도 store class는 사용하지
않는다. work traceability 원장의 Initiative·Epic·Story·Evidence 관계도 Map과 역방향 조회의
입력으로 유지한다.
