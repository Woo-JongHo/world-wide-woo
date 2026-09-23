# ASTRA Monitoring Figma 페이지 프롬프트 계약

- Figma file: `Q7kGUdqiaQRJI8CZlPMRX7`
- 기준 section: `50:609`
- 대상: Dashboard, Usage, Context, Cache, Workflow
- 목적: 공통 디자인 언어를 재사용하면서 페이지별 정보 구조와 실제 데이터 의미를 독립적으로 관리한다.

이 문서는 Figma를 다시 읽거나 화면을 구현할 때 사용하는 입력 계약이다. 생성된 React·Tailwind 코드는 참고 자료이며, 실제 구현은 `pi-tui`의 terminal cell과 기존 theme/layout 모듈로 변환한다.

## 1. 공통 프롬프트

모든 페이지 요청 앞에 아래 계약을 적용한다.

```text
ASTRA 99_WWW용 keyboard-first terminal monitoring 화면을 설계한다.

공통 시각 언어
- background #121314, panel #1c1d1e, border #323435
- primary #fbf1c7, muted #a89984, quiet #665c54
- orange #fe8019, olive #b8bb26, mint #8ec07c
- blue #83a598, pink #d3869b, yellow #fabd2f, red #fb4934
- JetBrains Mono 계열의 고정폭 글꼴
- 장식보다 행·열·경계·상태색으로 정보 계층을 표현한다.
- 둥근 카드, gradient, glass, marketing hero를 사용하지 않는다.

공통 셸
- header / main workspace / right rail / footer의 네 영역을 유지한다.
- large viewport는 160열 이상, standard는 120열, compact는 80열을 기준으로 한다.
- large에서 main:rail은 약 4:1이며 rail은 34~44열 범위다.
- standard에서 rail은 축약하고 compact에서는 본문에 핵심 상태를 병합한다.
- 모든 panel header, table column, metric baseline은 같은 축을 공유한다.

데이터 원칙
- observed 값과 derived 값을 구분한다.
- 관측하지 못한 값은 0이나 샘플 수치로 만들지 않고 `미관측`으로 표시한다.
- Demo fixture는 `DEMO DATA · synthetic fixtures · not live telemetry`를 표시한다.
- count, capacity, quota, status를 같은 meter 의미로 섞지 않는다.

터미널 변환
- pixel spacing은 terminal cell 간격으로 변환한다.
- SVG connector는 ├─, └─, →로 변환한다.
- chart는 block/background cell로 변환한다.
- hover는 keyboard focus marker와 slash command로 대체한다.
```

## 2. 공통 구현 패턴

페이지는 데이터를 소유하고, `tui/foundation`은 그리는 방법만 소유한다.

| 패턴 | 페이지가 선언하는 값 | 공통 모듈이 처리하는 값 |
|---|---|---|
| Summary strip | 카드 제목·값·상태색 | 동일 높이·균등 폭·remainder 분배 |
| Panel | 제목·meta·본문 행 | border·padding·폭 제한 |
| Table | column heading·최소 폭·weight·정렬·rows | 남은 폭 분배·ANSI 표시 폭·잘림·열 축 |
| Meter | value·total·색·의미 | fill ratio·빈 cell·폭 제한 |
| Rail | section·metric rows | 고정 폭·독립 스크롤·compact 숨김 |
| Unavailable | title·reason | `미관측` 상태와 비활성 색 |

공통 패턴은 페이지 의미를 알지 않는다. Usage의 quota, Context의 source, Cache의 layer를 하나의 제네릭 데이터 모델로 합치지 않는다.

## 3. 페이지별 프롬프트

### Dashboard

- Node: `50:2169`
- 질문: 지금 세션은 어떤 상태이고 어느 화면으로 이동해야 하는가?
- Main: session summary → module router → token/context 상태 → activity
- Rail: session context → system state → navigation
- Table axes: `MODULE | STATE | PRIMARY METRIC | ACTION`
- Source: `WorkbenchSnapshot`, `UsageSnapshot[]`
- 금지: 관측되지 않은 OS memory/swap을 system load로 표시하지 않는다.

### Usage

- Node: `50:610`
- 질문: 각 provider의 잔여 quota와 현재 관측 가능한 model usage는 무엇인가?
- Main: provider cards → model telemetry → 3-column analysis
- Rail: workbench metrics → time window → provider pulse → hints
- Table axes: `MODEL | EFFORT | REQUESTS | TOKENS | RECENT | SUPPORT`
- Provider axes: `PROVIDER | WINDOW | REMAINING | RESET | STATE`
- Source: `UsageSnapshot[]`, `WorkbenchSnapshot.sessionUsage`
- 금지: input/output/cached, 비용, 실행시간, today trend를 관측값처럼 합성하지 않는다.

### Context

- Node: `50:967`
- 질문: context가 무엇으로 구성되고 얼마나 남았으며 어떤 capability가 활성화됐는가?
- Main: 7-card summary → spectrometer → 57:43 analysis grid
- Rail: loaded skills → MCP servers → storage metrics
- Composition axes: `SOURCE | DISTRIBUTION | SIZE | SHARE`
- Activity axes: `METRIC | T-8 | T-7 | T-6 | T-5 | T-4 | T-3 | T-2 | T-1`
- Diagnostic axes: `EVENT | COUNT | CHANGE | STATUS`
- Item axes: `RANK | ITEM | SIZE | STATE`
- Source: `WorkbenchSnapshot`, explicit Demo fixture
- 금지: Demo catalog 아래에 Live Context Ledger·raw JSON·provider detail을 중복 연결하지 않는다.

### Cache

- Node: `50:1403`
- 질문: 무엇이 cache되어 있고 reuse가 작동하며 어느 telemetry가 비어 있는가?
- Main: layer summary → logical byte distribution → hit/miss → flow
- Rail: cache metrics → observation coverage → navigation
- Table axes: `LAYER | STATE | ENTRIES | BYTES | HIT | MISS | EVICT`
- Source: transcript `CacheDiagnostics`, `CacheLayerObservation`
- 금지: limit 없는 logical bytes를 bounded capacity meter로 표현하지 않는다.

### Workflow

- Node: `50:1986`
- 질문: 현재 request가 어느 단계이며 어떤 agent가 무엇을 수행하는가?
- Main: goal summary → delegation tree → 7-stage pipeline → event/state panels
- Rail: active process → stage count → agent state → navigation
- Stage axes: `STAGE | STATE | OWNER | MODEL | EVIDENCE`
- Agent axes: `ROLE | TASK | MODEL | EFFORT | STATE`
- Source: `requestRuntime`, `delegation`, `sessionGoal`
- 금지: 전용 source가 없는 retry queue나 완전한 event feed를 합성하지 않는다.

## 4. 페이지 구현 요청 템플릿

아래 템플릿에서 `<PAGE>`와 `<NODE>`만 바꿔 사용한다.

```text
공통 ASTRA Monitoring 프롬프트 계약을 적용해 <PAGE> 화면을 구현한다.
Figma file은 Q7kGUdqiaQRJI8CZlPMRX7, node는 <NODE>다.

1. get_design_context로 해당 node의 구조와 screenshot을 다시 읽는다.
2. header/main/rail/footer와 panel 순서를 먼저 기록한다.
3. 각 숫자를 observed/derived/unavailable 중 하나로 분류한다.
4. 페이지별 table axes를 고정하고 같은 역할의 모든 행이 같은 열을 사용하게 한다.
5. 160+, 120, 80열의 배치 변화를 명시한다.
6. 실제 TUI capture를 Figma와 같은 viewport에서 비교한다.
7. 문자열 존재뿐 아니라 panel 순서, 열 좌표, rail 경계, 첫 viewport를 테스트한다.
```

## 5. 페이지 수락 체크리스트

각 페이지는 다음 항목을 독립적으로 통과해야 한다.

- Figma node를 현재 작업에서 다시 읽었다.
- 첫 viewport의 panel 순서가 Figma와 같다.
- 반복 행의 column 시작점과 오른쪽 경계가 일치한다.
- 본문 행이 rail 시작 열을 침범하지 않는다.
- large·standard·compact에서 모든 행이 viewport 폭 이내다.
- 숨긴 rail의 핵심 정보가 compact 본문에 남는다.
- 관측 불가능한 값이 명시적으로 `미관측`이다.
- Demo와 Live 데이터가 한 화면에 중복되지 않는다.
- 변경 파일에 `TODO`, `test.skip`, `test.only`가 없다.
- `bun run check`, 관련 화면 테스트, architecture test, `git diff --check`가 통과한다.
