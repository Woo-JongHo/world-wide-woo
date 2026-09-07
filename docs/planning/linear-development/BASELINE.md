# 현재 기준선과 논의할 충돌

2026-09-05, main의 HEAD 19bad6c 및 미커밋 변경이 있는 worktree를 확인했다. 아래는 조사 당시 상태이며 구현 수락 결과가 아니다.

## Linear

MCP에서 [World Wide Woo](https://linear.app/woo-world/project/world-wide-woo-9c0e7963f1ff)를 조회했다. Project UUID는 5639ee1c-a6cd-44cf-9ed6-82ee9c5fc3db다. v0.1.0 — First Public Release Milestone UUID는 193948f7-2a11-4110-a143-360d83f2a076이다. 조회 목록은 22개이며 hasNextPage=false였다.

| 축 | Parent | 관측 상태 |
| --- | --- | --- |
| TUI | WOO-673 | In Progress |
| System | WOO-672 | Backlog |
| 첫 Workflow | WOO-671 | Backlog |

TUI에는 WOO-674(TUI 개발), WOO-675(Monitor), WOO-676(Dashboard), WOO-677(Stats)가 연결돼 있다. WOO-674 아래는 Chat(WOO-679), Layout(WOO-680), Tracer(WOO-681), Todo(WOO-682)다. Chat 아래 Message(WOO-683), Git Bash 카드(WOO-684), 취소된 Completion(WOO-685)이 있다. Message 아래 WOO-686~WOO-692가 있다. WOO-678(HUD)은 Canceled다.

WOO-683의 최신 본문을 직접 조회했으며, 제외 범위가 여전히 Completion을 소유자로 참조한다. WOO-685는 Canceled이므로 Chat/Message 논의에서 책임 문구를 맞춰야 한다. WOO-691/692의 별도 Issue 필요성도 Message 본문의 '단순 구현 단계·Unit Test는 체크리스트' 규칙과 대조해야 한다.

## 기존 구현과 연결 후보

| 기능/작업 | 현재 코드 후보 | 목표 영역 후보 |
| --- | --- | --- |
| Message / WOO-683 | src/presentation/tui/workbench-views.ts | tui/chat/message |
| Layout / WOO-680 | src/presentation/tui/dashboard-layout.ts | tui/layout |
| Tracer / WOO-681 | src/presentation/tui/delegation-tree-view.ts | tui/tracer (부분 책임만 확인) |
| Todo / WOO-682 | src/application/todo-ledger.ts, src/domain/todos.ts | system의 계획 상태 처리와 tui/todo 분리 검토 |
| System / WOO-672 | src/application/project-workbench.ts, src/infrastructure/executors/ | system/workbench, system/runtime |
| 관측 기록 | src/domain/project-activity.ts, src/infrastructure/activity-journal-store.ts | system/journal |
| ID 연결 | src/domain/work/traceability.ts, traceability-validator.ts | system/ledger |

표는 대표 후보이며 전체 귀속 inventory나 Issue 수락 검증이 아니다. 거대 파일은 복수 기능에 걸칠 수 있다. 코드 존재만으로 Done으로 바꾸지 않는다.

## 조사 당시 기존 계약과 충돌

아래는 정리 전 관측이다. 이후 문서의 현재/목표 구분, 로컬/공개 배포 범위 구분, 감사 기록의 잘못된 '전문' 표기는 교정했다. Unit/Issue 분리는 확정했지만 schema 이관과 실제 Linear 연결은 여전히 미실행이다.

| 기존 문서/구현 | 확인한 차이 | 필요한 처리 |
| --- | --- | --- |
| docs/WWW_CODE_ARCHITECTURE.md | layer-first 목표와 TUI/Work/Runtime 최종 경계가 함께 적힘 | 새 목표와 현재 구현 이력을 구분해 개정 |
| .www/planning/README.md | catalog가 EP/ST 본문·관계 정본, 외부 tracker 정본화 제외 | Linear-first 신규 작업과 기존 이력의 권한·전환 규칙 확정 |
| docs/WWW_FIRST_PRODUCT_MILESTONE.md | 로컬 Workbench 목표 | Linear의 첫 Workflow 포함 공개 배포 목표와 단계 관계 논의 |
| .www/control-ledger/traceability.json | code/test reference와 link만 존재 | 합의된 작업부터 Linear 연결 추가 |
| traceability schemaVersion 1 | 경로 기반 identity, Unit/Run kind 없음 | ID 결정 후 호환 migration 계획 |
| 이전 Opus 감사 | REVISE 및 하위 구조·acceptance 권고 | 권고를 확정된 사용자 scope와 구별 |

기존 감사 파일의 '전문' 절은 원 응답을 축약한 부분이 있어 verbatim 원문으로 취급하지 않는다. 이번 결론은 현재 사용자 요구와 실제 코드·Linear 증거를 우선한다.
