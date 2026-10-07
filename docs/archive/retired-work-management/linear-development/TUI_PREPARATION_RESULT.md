# TUI Linear 개발 준비 결과

2026-09-06 계층 정정: 아래 최초 계획·실행 이력의 WOO-674 직계 T-note/Composer 배치는 대체됐다. 현재 WOO-693·694는 Chat(WOO-679) 아래에 있으며 Workbench 직계는 기존 Chat·Layout·Tracer·Todo 네 분류다. ID·본문·상태·Milestone은 보존했다. 이후 이슈 작업에는 [Linear Intake](../../../.agents/skills/woo-linear-issue-intake/SKILL.md)를 적용한다.

2026-09-06 사용자 실행 지시에 따라 요구사항·개발 출발점·코드 ID를 정리했다. 제품 기능 구현 완료를 뜻하지 않는다.

- 기존8개 이슈(673~677,680~682)의 목적·현재 코드·남은 개발·수락 조건·검증 경로를 보완했다.
- WOO-693 T-note, WOO-694 Composer를 WOO-674 아래 Todo로 생성했다.
- 기존 Chat10개 본문·상태를 유지하고 TUI 라벨을 추가했다. 영역 라벨9개를 만들었다.
- 기존 상태·부모·v0.1.0 마일스톤을 유지했다. HUD/Completion 취소와 System/Workflow는 변경하지 않았다.
- 이번10개 이슈의 실제 UUID·URL과 대표 선언의 `@linear WOO-...`를 연결했다. 기존 Chat을 포함하면20개다.
- 제품 소스 변경8개 파일은 주석만 추가했다. 타입 검사와 전체618개 테스트가 통과했다. 실제 TUI 수락은 미실행이다.

개발은 Layout/focus를 기준으로 Chat 보존·thread 격리와 Tracer 결속을 우선하고, Todo/T-note/Composer·Monitor·Stats/Dashboard의 누락 동작을 이어서 검증한다. 현재 상태와 상세 요구의 정본은 Linear다.

[실행·조사 근거](../../../.www/evidence/2026-09-06-tui-preparation/assessment.md) · [원격 재조회](../../../.www/evidence/2026-09-06-tui-preparation/linear-after.json) · [ID 연결 원장](../../../.www/control-ledger/traceability.json)
