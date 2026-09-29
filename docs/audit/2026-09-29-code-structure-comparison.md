# 99_www 코드 구조와 유사 오픈소스 비교

## 판정과 범위

99_www는 core / adapters 의존 방향을 실제 코드에서도 지키는 기반이 있다. 개선 우선순위는 폴더 재배치보다 실행 조정자·공통 snapshot·화면 조립의 책임을 좁히는 것이다. 정적 구조 평가이며 렌더링 지연의 원인 확정이나 리팩터링 수락 판정은 아니다.

대상은 dev의 HEAD `8486a759746ab2e0748beb1ab9fdd4d250fa6b27` 및 당시 미커밋 소스다. 동시 세션 변경이 있으므로 HEAD만으로 현재 소스를 재현할 수 없다. 파일 수·라인 수는 규모 설명에만 사용했다.

## 비교

| 대상 | 구조상 강점 | 집중된 책임 또는 주의점 | WWW에 적용할 교훈 |
|---|---|---|---|
| 99_www | domain / application / ports / adapters의 방향과 정적 검사 코드 | ProjectWorkbench에 실행·기록·승인·관측·화면 설정이 모이고, 공통 snapshot을 여러 화면이 소비 | 기능별 읽기 계약과 계산의 소유권을 좁힌다 |
| pi | provider API, agent loop, coding-agent, TUI를 재사용 가능한 패키지로 분리 | AgentSession과 interactive-mode는 큰 조립 모듈이며 coding-agent core에서 interactive theme를 참조 | 재사용되는 실행 엔진과 UI 경계를 배운다. 패키지 수 자체를 목표로 삼지 않는다 |
| 가재코드 | ai / agent / coding-agent / tui / natives 경계와 workflow 확장 표면 | AgentSession이 약 2.8만 줄이다. 패키지 분리만으로 조정자 집중이 사라지지 않는다 | 확장 계약을 명시하되 거대한 session을 구조 모범으로 복제하지 않는다 |
| OpenCode | TUI와 SDK 경계, 이벤트 배치, keyed store 갱신 | 서비스 계층과 상태 동기화의 추가 복잡성이 있다 | 최종 렌더 병합뿐 아니라 데이터 갱신 범위도 줄이는 방식을 검토한다 |

고정 소스:

- [pi 패키지 구조](https://github.com/earendil-works/pi/blob/cb7969d212836b8939001dce159fbd2ed6ad395f/README.md), [AgentSession](https://github.com/earendil-works/pi/blob/cb7969d212836b8939001dce159fbd2ed6ad395f/packages/coding-agent/src/core/agent-session.ts). 현재 upstream 고정 SHA이며 WWW가 설치한 0.84.4와 동일 revision이라고 주장하지 않는다.
- [가재코드 구조](https://github.com/Yeachan-Heo/gajae-code/blob/7e54f9cbcf712cfa7f633d3c8da58a6d89f7f301/docs/codebase-overview.md), [AgentSession](https://github.com/Yeachan-Heo/gajae-code/blob/7e54f9cbcf712cfa7f633d3c8da58a6d89f7f301/packages/coding-agent/src/session/agent-session.ts).
- [OpenCode SDK 이벤트 배치](https://github.com/anomalyco/opencode/blob/7945de208964a49300d7f770d1a71d078db9a4c4/packages/tui/src/context/sdk.tsx), [상태 동기화](https://github.com/anomalyco/opencode/blob/7945de208964a49300d7f770d1a71d078db9a4c4/packages/tui/src/context/sync.tsx).

## 실제 확인한 강점

1. 기존 import resolver로 src TypeScript 331개를 정적으로 읽었다. core → adapters, domain → application/ports/runtime/commit, inbound → outbound 세 방향의 금지 참조 0건, 상대 import 순환 0건이다. 전체 architecture 테스트 통과를 뜻하지 않는다.
2. Native·executor·terminal·journal·usage·persistence에 실제 외부 경계가 있다. TUI 너비·색·스크롤은 adapter가 소유하고 feature read projection도 이미 존재한다.
3. WorkbenchDurableProjection은 activity 길이와 thread를 기준으로 이력·Chat 투영을 재사용한다. deepFreeze는 이미 frozen인 값을 건너뛴다. RenderScheduler도 렌더 요청을 병합한다. 따라서 '매 이벤트마다 전체 Chat을 복제한다' 또는 '캐시가 없다'는 평가는 틀리다.

## 개선 후보

### 1. 공통 snapshot의 계산과 발행 범위

`src/core/application/orchestration/project-workbench.ts:1458`의 publish는 snapshot을 만들고 전체 listener에 발행한다. `makeSnapshot:1483`는 요청 선택·Goal 확인·실행 상태·성능·usage·기록·UI 설정을 함께 조립한다. 일부 데이터 캐시는 있어도 Goal의 activity 조회, performance projection, executionRun 복제 같은 작업이 남는다. 실제 지연 기여도는 계측해야 한다.

`WorkbenchSnapshot` 정의 모듈은 정적 import 52곳에서 사용된다. type import도 포함하므로 런타임 실행 결합 52개라는 뜻은 아니다. 그러나 변경 파급 범위가 넓다는 신호다. feature별 의미 있는 입력에 따라 계산을 재사용하고, 관련 slice 변경 시에만 소비자가 갱신되는 계약을 우선 검토한다. 작은 projection 객체를 무조건 memoize하는 것으로 해결됐다고 판정하지 않는다.

### 2. 표시 코드에 들어간 업무 해석

`www-monitor-view.ts`의 nativeProgress / reportRows는 Native 보고 수락·현재 turn 선택·활동 집계를 포함한다. 최근 추가한 PROGRESS·REPORT 코드도 이 부채에 해당한다. core의 ANSI 없는 읽기 DTO에서 의미를 결정하고 view에는 폭·색·줄 제한을 남기는 편이 변경을 국소화한다. PLAN 완료 권위와 PROGRESS 설명의 구분은 유지해야 한다.

### 3. snapshot 생성의 부작용

`makeSnapshot`은 첫 줄에서 `noteNarration.scheduleNarrations()`를 호출한다. 상태 조회와 백그라운드 작업 예약이 같은 메서드에 있어 호출 순서 이해 부담이 생긴다. 예약은 관련 상태 전이의 실행 책임으로 옮기고 snapshot 조립은 읽기 역할로 좁히는 후보가 명확하다. 현재 동작이 잘못됐다고 입증한 것은 아니다.

### 4. 실행 조정자와 shell의 인터페이스 폭

ProjectWorkbench 옵션에는 실행·권한·저장소 계약과 hud/slash/노트 표시 제한이 섞여 있다. shell은 구독·timer·입력·navigation·렌더 조정을, www-surface는 페이지·sidebar·HUD·실행 레이아웃을 함께 조립한다. 내부 import 수는 shell 55, ProjectWorkbench 46이다. 단순 전달 wrapper를 늘리지 말고 독립된 상태와 생명주기를 숨기는 모듈만 분리한다.

## 권장 순서와 다음 확인 기준

1. 같은 Chat 스트리밍 입력에서 snapshot 생성 → feature projection → view render → terminal write의 시간을 분리해 재는 후속 작업. 캐시 누락·반복 스캔의 실제 기여를 먼저 확인한다.
2. Native PROGRESS와 질문별 REPORT의 공통 읽기 DTO를 설계한다. 화면마다 같은 보고를 다르게 해석하지 않는지가 기준이다.
3. snapshot의 작업 예약 부작용과 화면별 불필요한 갱신을 줄인다. 관련 없는 slice 변경에는 참조와 계산이 유지되는지 확인한다.
4. 그 뒤 shell과 실행 조정자의 옵션·생명주기 경계를 좁힌다. Effect/Solid 도입이나 패키지 전면 재편은 현재 근거로 권하지 않는다.

## 검증 한계와 기록

- 기존 graph helper를 사용한 정적 수집만 수행했다. regex resolver와 type import의 한계가 있다.
- 제품 코드 수정, 테스트, 성능 벤치마크, 실제 TUI 수락은 이번 평가에서 수행하지 않았다.
- 로컬 read-only 수집 결과를 저자 패스에서 재대조했다. 전체 이력 복제라는 초기 해석은 캐시 소스 확인 뒤 제외했다.
- Claude Sonnet 교차 리뷰와 Opus 최종 감사는 미실행이다. 최종 감사 통과나 구현 완료로 승격하지 않는다.
- 분석 제안이며 새 계약 채택은 없다. Obsidian 정본 개정 대상은 아직 아니다. Project Activity에 평가 경과를 기록한다.
- 정적 근거: `.www/evidence/2026-09-29-structure-comparison/local-graph.json`.
