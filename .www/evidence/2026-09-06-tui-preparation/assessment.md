# TUI 요구사항·개발 준비 확인 — 2026-09-06

Linear는 현재 요구사항·진행 상태의 정본이다. 이 문서는 특정 로컬 작업 트리의 조사·연결·반영 근거다. 제품 개발이나 실제 TUI 수락 완료를 뜻하지 않는다.

## 기준과 검증

- HEAD `19bad6c00b2dbb4f8c58fd632eb362aae6d31d8d` + 기존 미커밋 변경. [기준선](baseline.json).
- 준비 전 `bun run check` exit 0, `bun test` 618 pass / 0 fail / 74 files. [타입 검사](typecheck-baseline.log), [전체 로그](tests-baseline.log).
- ID 연결 후 `bun run check` exit 0, `bun test` 618 pass / 0 fail / 74 files. [최종 타입 검사](typecheck-final.log), [최종 전체 로그](tests-final.log). [파일 대조](verified-source.json)에서 제품 소스8개는 주석만 변경됐고 나머지 소스·테스트는 기준선과 같음을 확인했다.
- 실제 Native TUI·provider·IME·resize 수락은 이번 작업에서 수행하지 않았다. 기존 테스트 실행은 새 요구 전체의 수락을 대신하지 않는다.
- 제품 실행 동작은 변경하지 않았다. 대표 선언에 이슈 주석을 추가하고 원장의 ID·관계·경로를 확장했다.
- 신규 T-note WOO-693, Composer WOO-694. 기존8 이슈는 본문·제목·라벨을 보완하고 기존 Chat10은 TUI 라벨만 추가했다. 기존 상태·부모·마일스톤은 유지하며 신규2건은 Todo다.
- 보관 항목 포함 기존22건을 대조했다. [처리 목록](disposition.json), [전체 이전 본문·관계](linear-before.json), [반영 범위](publication-plan.json).
- 반영 후 신규2건 포함24건을 MCP 재조회했다. [원문](linear-after.json), [ID·관계·상태·범위 밖 본문 보존 대조](verification.json).

## 기능과 코드 ID

| 이슈 | 준비한 범위 | 대표 코드 선언 |
| --- | --- | --- |
| [WOO-673](https://linear.app/woo-world/issue/WOO-673/tui에서-업무를-수행하고-실행과-근거를-확인한다) | TUI에서 업무를 수행하고 실행과 근거를 확인한다 | `createWorkbenchViewHost` |
| [WOO-674](https://linear.app/woo-world/issue/WOO-674/workbench에서-대화와-계획을-읽고-입력과-상태를-통제한다) | Workbench에서 대화와 계획을 읽고 입력과 상태를 통제한다 | `runProjectWorkbenchShell · WorkbenchBottomHudView` |
| [WOO-680](https://linear.app/woo-world/issue/WOO-680/화면-크기가-달라져도-읽던-위치와-입력-흐름을-유지한다) | 화면 크기가 달라져도 읽던 위치와 입력 흐름을 유지한다 | `createDashboardLayout` |
| [WOO-681](https://linear.app/woo-world/issue/WOO-681/선택한-결과에서-같은-실행의-근거를-찾아간다) | 선택한 결과에서 같은 실행의 근거를 찾아간다 | `WorkbenchMonitorView` |
| [WOO-682](https://linear.app/woo-world/issue/WOO-682/현재-native-계획과-다음-행동을-일관된-todo로-보여준다) | 현재 Native 계획과 다음 행동을 일관된 Todo로 보여준다 | `WorkspaceTodoView` |
| [WOO-693](https://linear.app/woo-world/issue/WOO-693/완료된-질문과-결과를-t-note에-보존하고-다시-찾는다) | 완료된 질문과 결과를 T-note에 보존하고 다시 찾는다 | `TNotesSourceView` |
| [WOO-694](https://linear.app/woo-world/issue/WOO-694/입력전송중단과-세션-설정을-예측-가능하게-조작한다) | 입력·전송·중단과 세션 설정을 예측 가능하게 조작한다 | `workbenchReceiptClearsComposer` |
| [WOO-675](https://linear.app/woo-world/issue/WOO-675/현재-실행과-승인실패-상태를-같은-맥락에서-관찰한다) | 현재 실행과 승인·실패 상태를 같은 맥락에서 관찰한다 | `RuntimeMonitorView` |
| [WOO-676](https://linear.app/woo-world/issue/WOO-676/세션-관측-범위와-요약을-읽고-원하는-상세로-이동한다) | 세션 관측 범위와 요약을 읽고 원하는 상세로 이동한다 | `ObservabilityDashboardView` |
| [WOO-677](https://linear.app/woo-world/issue/WOO-677/세션과-요청의-결과사용량시간을-근거와-함께-검토한다) | 세션과 요청의 결과·사용량·시간을 근거와 함께 검토한다 | `SessionStatsView` |

전체20개 TUI 작업(기존 Chat10 포함)에 실제 WOO 번호·UUID·URL을 연결했다. [이번10개 대응표](code-issue-mapping.json), [연결 원장](../../control-ledger/traceability.json).

`@linear`는 대표 선언의 개발 작업 연결이다. 모든 관련 파일에 주석을 붙이지 않는다. 같은 함수가 여러 이슈에 연결될 수 있으며 `createDashboardLayout`의 WOO-680은 배치, 기존 WOO-689는 Chat 탐색 요구와 관계가 있다. 함수 소유자를 하나로 강제하거나 별도 Unit ID를 발급하지 않는다.

원장의 implements는 구현 위치, verifies는 관련 기존 테스트 위치다. 요구 전체 완료·UI 수락·실행 결과 상태를 저장하지 않는다. 소스의 GitHub main 링크는 탐색용이며 로컬 미커밋 코드와 일치한다는 증거가 아니다.

## 확인한 개발 출발점과 남은 부분

- Layout: wide/compact·3패널·조건부 고정행은 존재한다. 서로 다른 ScrollView 전환의 위치·실제 focus/낮은 높이 검증이 남았다.
- Tracer: Source 화면과 activity 선택은 존재한다. TNotesSourceView는 완료 질문 목록이며 상세 Source가 아니다. `/trace`의 itemId 역검색은 thread/turn 결속과 결과→Source 흐름을 추가 확인해야 한다.
- Todo: Native Plan→thread Todo.md mirror와 읽기 전용 표시가 존재한다. Native /todo 변경 인자의 migration 안내를 실제 계획 표시와 정합화하고 동기화 실패/생략 UI를 확인해야 한다.
- T-note: 완료 질문 capture·보존·재개 경로가 존재한다. 이전 기록 선택·탐색·Source 진입은 남아 있다.
- Composer: Editor·receipt·FIFO·draft store·모델/승인 overlay가 존재한다. 실제 IME/붙여넣기·비동기 receipt·overlay 통합은 미수락이다.
- Monitor: historical unavailable이 idle/retry0/failure0으로 투영되는 코드 경로가 있다. 관측 불가·freshness·thread 범위를 드러내는 요구를 WOO-675에 기록했다.
- Dashboard: 최근12 세션 선택과 view10행 제한, index 기반 선택 갱신을 정적 확인했다. 선택창·identity 보존·분모/coverage·읽기 실패를 WOO-676에 기록했다.
- Stats: 빈 데이터에서 COMPLETED 헤더, 미관측 토큰 합산0, coverage/분모 표시, Stats Enter 안내와 실제 handler 불일치가 정적 조사 대상이다. WOO-677에서 수정·검증 조건을 명시했다.

위 항목들은 이번에 새로 동적 재현한 결함으로 취급하지 않는다. 실제 재현 근거가 이미 있는 Chat WOO-688/690은 [이전 조사](../2026-09-06-chat-development/assessment.md)를 재사용한다. 제품 결함 내용은 Linear와 Evidence에 보존하며 원장에 별도 schema를 만들지 않는다.

## 검증 재사용과 개발 순서

공통 폭·높이·focus 절차와 fixture는 WOO-680이 소유한다. 각 renderer는 같은 실행 기록에서 자기 내용의 단위·상태·생략 결과를 판정한다. 부모673은 화면 사이 세션/요청 identity,674는 단일 Workbench 원천·공통 상태를 종합하며 하위 근거를 재사용한다.

우선 Layout/focus 계약을 기준으로 Chat 보존·thread 격리와 Tracer 결속을 보완한다. Todo/T-note/Composer를 통합하고 Monitor의 관측 범위, Stats/Dashboard의 숫자·선택·과거 세션 흐름을 마무리한다. 마지막에 전체 화면 수락을 수행한다. 이는 개발 순서 제안이며 근거 없는 blocked-by를 생성하지 않았다.

## 조사·검토 원문

- [Workbench 조사·초안](../../scratchpad/2026-09-06-tui-workbench-drafts.md)
- [관측 화면 조사·초안](../../scratchpad/2026-09-06-tui-observability-drafts.md)
- [Sonnet 최초](../../scratchpad/2026-09-06-tui-prepublish-sonnet.json), [수정 확인 PASS](../../scratchpad/2026-09-06-tui-prepublish-sonnet-v2.json)
- [Opus 최초](../../scratchpad/2026-09-06-tui-prepublish-opus.json), [수정본 조건부 발행 가능](../../scratchpad/2026-09-06-tui-prepublish-opus-v2.json)

Opus 수정본의 남은2건(부모의 T-note 참조·불필요 자기 ID 반복)은 발행 전에 반영했다. Sonnet 후속은 일부 문서와 해소 방식을 확인한 한정 검토이며 675/676/677/681 본문 전체 재검토를 주장하지 않는다. 리뷰는 실제 TUI 검증을 대신하지 않는다.

[반영 후 Opus 감사](../../scratchpad/2026-09-06-tui-final-opus.json)는 카운트·ID·상태·범위에 문제 없음을 확인하고 비차단 REVISE로 링크 표기2종을 지적했다. WOO-673/674의 별도 자기참조 문장과 WOO-674/676의 옛 slug를 수정해 MCP로 다시 읽고 확인했다. 코드 ID 주석은 유지했다. 이 링크 수정본의 추가 독립 재검토는 수행하지 않았다.
