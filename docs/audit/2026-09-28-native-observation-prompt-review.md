# Native Observation 프롬프트와 현재 WWW 구조 비교

작성일: 2026-09-28  
범위: 첨부 프롬프트 1~18절의 구조·방향 비교, 채택 기준 정리. 제품 기능 전체 구현이나 live Native 성능 수락을 뜻하지 않는다.

## 결론

기본 방향은 일치한다. Native 관측에서 Projection을 만들고, Chat은 실시간 작업, Monitor는 요청 하나의 상세 관측, Dashboard는 세션과 요청 탐색을 담당한다. **ACTION 카드는 Chat 본문에 둔다. Chat 사이드바에 일반 ACTION 목록이나 Shell 실행 카드를 추가하지 않는다.**

프롬프트의 개념 트리는 관측 모델로 채택한다. 모든 이벤트가 INPUT→UNDERSTAND→PLAN→PROGRESS→ACTION의 직렬 상태를 가진다고 가정하지 않는다. 현재 observe 요청의 INTENT/WORK/RESULT와 선택적인 Native Plan, broker 요청의 7단계 계약을 유지한다. UNDERSTAND는 공개 의도·제약 설명으로 읽으며 private reasoning을 대신 노출하지 않는다.

## 현재 상태에서 확인한 근거

| 책임 | 현재 구현 | 확인한 사실 |
|---|---|---|
| Native 수신·해석 | `native-event-projection.ts`, `native-session.ts`, `project-activity.ts` | thread/turn/item 참조와 started/updated/terminal 관측이 있다. Journal은 크기 제한·정제를 거친 파생 관측이며 Native RAW 전체의 복제본이 아니다. reasoning은 정제하고 공개 summary만 제한적으로 취급한다. |
| PLAN·PROGRESS | `request-protocol.ts`, `workbench-note-narration.ts`, `plan-activity-narration.ts` | Native Plan과 단계 결과가 별도 권위를 가진다. PROGRESS 요약은 모델 해석이며 PLAN 완료를 직접 판정하지 않는다. `PlanActivity.stepId`는 Projection 문맥에서 부여된다. |
| ACTION 위치 | `www-surface.ts`, `www-execution.ts`, `www-monitor-view.ts` | Chat 본문이 실제 Input/Tool 카드를 렌더한다. 사이드바는 compact `runInspector`의 PLAN·PROGRESS·DECISION·TEST다. 일반 ACTION/TRACE 목록은 full Monitor 경로에 있다. TEST 안의 실행 명령·결과 근거는 일반 ACTION 카드와 구분한다. |
| Shell 설명 | `plan-activity-narration.ts`, `www-execution.ts` | 현재 직렬 LLM 큐, 최대 20개 entry, 30초 timeout이다. 설명 미도착 시 `설명 준비 중`이 실제로 렌더된다. deterministic Shell parser는 이 경로에 없다. |
| TEST | `request-test-workspace.ts` | 실행 관측·exit·runner 출력으로 결과를 만든다. Bun suite/실패 이름·duration·truncation을 취급한다. 성공 case별 label/status/duration의 완전한 모델은 아직 없다. |
| Monitor | `www-monitor-view.ts`, `workbench-shell.ts` | request 범위 조회, stage watermark/trace/failure/performance가 있다. stage 시간 창의 tool 배치는 인과 연결 증거가 아니다. 요청 하나의 모든 Progress별 해석 이력은 아직 완전하지 않다. |
| Dashboard | `entry-dashboard-view.ts`, `workbench-shell.ts` | 세션 요약·요청 선택·↑↓·Enter→Monitor와 `/monitor #번호` 경로가 존재한다. 선택 요청은 activities/planActivities를 해당 turn으로 제한하고 세션 성능값을 제거한다. |
| 성능 관측 | `LAYERS.md`, `layer-performance.ts` | Native 수신부터 terminal-write까지 7경계다. terminal-write는 동기 호출 반환까지이며 OS flush/pixel 완료가 아니다. 단계 시간 합계가 Total과 같다고 가정할 수 없다. |

이 판정은 현재 worktree 소스를 읽은 결과다. 이번 검토에서 live RAW 샘플 캡처, LLM 호출 수·latency 측정, TUI 수동 시나리오는 실행하지 않았다. 소스의 지원 가능성과 실제 세션에서 관측된 값은 구분한다.

## 프롬프트 항목별 판정

| 절 | 판정 | 채택 내용과 보정 |
|---|---|---|
| 1 전체 개념 | 조건부 채택 | 요청·계획·세부 목표·행동의 설명 모델. 강제 직렬 lifecycle로 바꾸지 않는다. |
| 2 Native RAW 우선 | 채택 | 기존 Native source와 bounded Journal/Projection 구분. 새로운 값과 관계는 실제 수신 샘플로 확인 후 사용한다. |
| 3 PLAN | 채택 | 큰 작업 목표, 선택적인 Native Plan. shell 명령을 계획 항목으로 자동 승격하지 않는다. |
| 4 PROGRESS | 채택 | 현재 계획 안의 세부 목표. 단순 상태문을 목표로 취급하지 않는다. 모델 요약의 provenance를 보존한다. |
| 5 ACTION | 채택·현재 일치 | 실제 관측된 실행. Chat 본문 카드와 full Monitor 상세에 표시한다. 사이드바에 일반 ACTION을 추가하지 않는다. |
| 6 Shell 가독성 | 채택·구현 gap | 파일·줄 범위·검색어·limit·pipeline 등 확인 가능한 명령 의미를 한 줄로 설명한다. 목적·발견 내용을 명령만으로 추측하지 않는다. |
| 7 설명 지연 | 채택·구현 gap | deterministic fast path 우선, 복합 명령만 선택적인 LLM 해석. 실행을 기다리게 하지 않는다. placeholder 교체를 제거하는 후속 구현에서 fallback과 latency를 실측한다. |
| 8 TEST | 채택·부분 구현 | 실제 이름/경로/결과/duration과 검증 목표를 연결한다. LLM 번역은 label만 담당하고 pass/fail은 실행 관측만 소유한다. 성공 case별 모델은 후속 범위다. |
| 9 Chat | 채택·현재 일치 | 현재 요청의 실제 실행·공개 응답. RAW/private reasoning을 기본 화면에 노출하지 않는다. |
| 10 Monitor | 채택·부분 구현 | 요청별 Action·공개 해석·실측을 더 상세히 보여준다. 시간 인접성을 인과로 단정하지 않는다. |
| 11 성능 | 채택·부분 구현 | 관측된 시작/종료·횟수·오류만 표시한다. provider 시각과 local 수신 시각, 병렬 구간과 합계, frame와 pixel 지연을 구분한다. |
| 12 Dashboard | 채택·현재 경로 존재 | Session→Input 목록→선택 Monitor. 기존 키보드 navigation을 재사용한다. |
| 13 화면 관계 | 채택 | 동일 관측 원천의 다른 밀도. 화면마다 경쟁 정본을 만들지 않는다. |
| 14 관계 키 | 조건부 채택 | threadId→session, turnId/requestId→Input, itemId/activityId→Action 매핑을 명시한다. plan/progress/test ID는 실제 존재하거나 Projection 소유일 때만 부여하고 관계 source를 표시한다. |
| 15 구조 판단 | 채택 | 현재 observe/broker 계약 안에서 합리적으로 진행한다. UNDERSTAND 독립 UI와 7단계 강제 도입은 이번 요청의 요구가 아니다. |
| 16 금지 표현 | 채택·현재 gap | 정보 없는 Shell 설명 placeholder와 장황한 해석을 줄인다. 관측이 없는 값의 `미관측` 표시는 보존한다. |
| 17 순서 | 후속 실행 순서로 채택 | RAW receipt→관계/provenance→Projection→PLAN/PROGRESS→Shell→TEST→Monitor→Dashboard→live 검증. 이미 있는 기능을 다시 만든다고 주장하지 않는다. |
| 18 사용자 경험 | 채택·부분 구현 | ACTION은 본문, 사이드바는 PLAN/PROGRESS/TEST 중심. Monitor 상세와 Dashboard 탐색은 기존 경로에 증분 적용한다. |

## 채택한 경계

- Raw와 해석을 분리한다. Journal의 bounded observation을 RAW 전체라고 부르지 않는다.
- Plan은 목표, Progress는 그 안의 세부 목표, Action은 실제 관측이다. 해석 label이 실행·완료·검증 권위를 갖지 않는다.
- Action→Progress 연결은 명시적 Native 참조, 당시의 Projection 문맥, 시간 근접을 구분한다. 불명확하면 연결 미관측이다.
- 짧은 Shell 설명은 기본적으로 deterministic fast path를 목표로 한다. 복합 명령 해석은 실행 critical path 밖에 둔다. 현재 LLM 큐 구현은 이 목표를 아직 충족하지 않는다.
- Test 결과는 runner/exit/read-back만 판정한다. 번역·목적 요약은 별도 표시 의미다.
- Chat sidebar에 일반 ACTION을 추가하지 않는다. full Monitor는 행동 상세를 가질 수 있다.

## 후속 우선순위와 완료 증거

| 순서 | 남은 작업 | 필요한 증거 |
|---|---|---|
| 1 | Native 관측 필드·관계 Receipt | 동일 요청의 입력/plan/tool/result/test/model/usage/lifecycle 표본과 누락 필드 목록. private reasoning은 공개 artifact에서 제외. |
| 2 | Shell fast path와 placeholder 제거 | sed/rg/git/test 등 정확한 명령 의미 사례, 복합·실패 fallback, 실행 지연·설명 latency·LLM 호출 수 비교. |
| 3 | Progress 의미·연결 provenance | 계획 수정/후속 입력/동시 도구/계획 없는 요청에서 stable ID와 관측·추정 구분. |
| 4 | case별 TEST 표시 | 성공·실패·skip·잘린 출력·지원하지 않는 runner에서 label/path/result/duration 정확성. |
| 5 | Monitor 해석·관계 확장 | 시간 창과 명시적 관계를 구분하는 요청 단위 상세, 미관측 성능값 보존. |
| 6 | 기존 Dashboard 경로 회귀 | Input 선택→해당 Monitor, 현재 요청 복귀, 세션값의 요청별 누출 없음. |

이번 요청에서 채택 기준을 실행 콘솔 문서에 반영했다. 위 gap의 구현과 live end-to-end 수락은 수행 완료로 기록하지 않는다.
