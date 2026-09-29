## 변경

- 99_www의 레이어·조정자·snapshot·화면 조립을 pi, 가재코드, OpenCode의 고정 SHA 소스와 비교해 평가 문서를 작성했다.
- 레이어 경계는 강점이며 공통 snapshot 발행 범위, view의 Native 보고 해석, snapshot 생성 중 작업 예약, 실행/UI 옵션 혼합을 개선 후보로 정리했다. 제품 코드는 수정하지 않았다.

## 영향

- 폴더·파일 크기만으로 구조를 판정하지 않고 변경 파급과 모듈이 숨기는 책임을 기준으로 후속 작업 우선순위를 제시한다. 기존 durable 캐시와 렌더 병합을 확인했으며 전체 Chat 이력 반복 복제라는 해석은 제외했다.
- 렌더 지연 원인 확정·리팩터링 승인·새 계약 채택은 아니다. Obsidian 정본 변경은 현재 대상이 아니다.

## 분류

Validation · Improvement

## 검증

- 기존 import resolver를 사용한 정적 수집: src TS331개, core→adapters/domain→상위 실행층/inbound→outbound 금지 참조0, 순환0. regex/type import 한계가 있으며 전체 architecture 테스트 통과를 뜻하지 않는다.
- 세 upstream clone의 SHA 고정 소스와 로컬 캐시 구현을 직접 읽고 대조했다. 제품 테스트·성능 측정·실제 TUI 수락·Sonnet/Opus 감사는 미실행이다.
- 기존 WOO-913과 WWW Activity를 조회했다. 같은 평가 기록이 최근 Activity에 없음을 확인하고 게시 전 latest identity를 대조한다.

## 연결

- 관련 기존 이슈: WOO-913 https://linear.app/woo-world/issue/WOO-913/workbench-monitoring-figma-5화면의-계측-의미와-정보-구조를-일치시킨다
- docs/audit/2026-09-29-code-structure-comparison.md
- .www/evidence/2026-09-29-structure-comparison/local-graph.json
- 비교 SHA: pi cb7969d212836b8939001dce159fbd2ed6ad395f; gajae-code 7e54f9cbcf712cfa7f633d3c8da58a6d89f7f301; opencode 7945de208964a49300d7f770d1a71d078db9a4c4