# DEC-0001 — TUI 기반 선택

- 상태: accepted
- 날짜: 2026-08-30
- 질문: 새 WES Agent TUI를 Gajae Code 전체, Gajae Code 플러그인, 또는 다른 TUI 기반 중 어디에서 시작할 것인가?

## 목적 기준

이 TUI의 목적은 세 가지다.

1. 사용자가 무엇을 했는지 쉽게 안다.
2. 대화와 실행 결과가 정리되어 있다.
3. 결정의 판단과 근거가 명확하다.

첫 목표는 내부 WES 자동화가 아니라 껍데기인 TUI와 기본 아키텍처다. 기록은 Git이 정본을 소유하고 Obsidian이 읽기·탐색 표면을 맡는다.

## 확인한 사실

### Gajae Code

- `@gajae-code/tui`는 TypeScript/Bun 기반의 differential rendering TUI 라이브러리다.
- synchronized output, IME, Markdown streaming, viewport, pinned suffix, autocomplete, 이미지와 replay/golden/performance 테스트를 이미 갖고 있다.
- coding-agent에는 `AgentSessionEvent`, wire event contract, session storage, tool/command streaming, Bash execution component, transcript registry, two-column body가 이미 존재한다.
- GJC 플러그인 manifest의 공식 표면은 subskill, tool, hook, MCP, system/agent appendix 중심이다.
- 확인한 plugin manifest에는 전체 TUI layout이나 transcript renderer를 교체하는 공식 surface가 없다.

### Pi TUI

- GJC TUI와 같은 계열의 단순 Component 계약과 differential rendering을 사용한다.
- 최신 계열에는 main/alternate screen renderer, `HStack`, `VStack`, `ScrollView`와 constrained layout이 명시적으로 제공된다.
- 화면 분할과 독립 스크롤 영역에는 GJC의 공개 TUI API보다 직접적인 구조다.

### OpenTUI

- Zig 코어와 TypeScript/React/Solid 바인딩을 제공한다.
- flexbox, scroll box, mouse/keyboard와 복잡한 전체화면 앱 구성에 강하다.
- OpenCode가 실제 제품에서 사용한다.
- 반면 GJC와 결합할 경우 renderer, input, component, lifecycle 경계를 새로 연결해야 한다.

### terminal-notes

- 원문 보존, 계층형 설명, JSONL, provider adapter, 접기·분류 원칙이 이번 제품 목적과 일치한다.
- Agent Runtime이 아니라 읽기·렌더·보관 표면이라는 기존 경계는 유지해야 한다.

## 판단

**Gajae Code는 현재 목적에 가장 좋은 단일 완제품 코드는 아니지만, 가장 좋은 Agent Runtime 출발점이다.**

전체 GJC를 그대로 포크하면 불필요한 기능과 upstream 병합 비용을 함께 소유하게 된다. 반대로 현재 GJC plugin surface만으로는 전체 shell과 출력 구조를 원하는 수준으로 교체하기 어렵다.

## 결정

첫 수직 슬라이스는 다음 조합으로 만든다.

```text
GJC agent/session/event contracts
        +
@earendil-works/pi-tui 기반의 별도 얇은 shell
        +
terminal-notes의 출력 원칙
        +
Git canonical store / Obsidian projection
```

구현 형태는 **GJC 전체 fork도, 기존 plugin manifest만 사용하는 플러그인도 아닌 별도 shell/client**로 시작한다. GJC의 공개 패키지와 wire/session 경계를 소비한다.

TUI renderer는 `@earendil-works/pi-tui`를 사용한다. `HStack`·`VStack`·`ScrollView`의 constrained layout, 공식 `Editor`의 한글 IME, overlay focus를 실제 3영역 Shell에서 검증했다. Gajae Code에서는 welcome 화면의 정보 계층과 event/session 경계를 가져오고 renderer 내부를 결합하지 않는다. 추상 renderer 계층은 만들지 않는다.

## 근거

- 원하는 가치의 중심은 모델 호출보다 session event를 어떻게 분류하고 보여주느냐에 있다.
- GJC에는 AgentSession, tool streaming, Bash renderer, transcript와 검증된 terminal edge case가 이미 있다.
- 별도 shell은 WES 화면과 출력 카테고리를 자유롭게 설계하면서 GJC 내부 제품 UI와 결합되는 것을 피한다.
- 처음부터 OpenTUI로 이동하면 껍데기를 빨리 검증하기 전에 runtime adapter 작업이 커진다.
- Git 정본과 Obsidian 투영을 분리하면 기록 보존과 사람이 읽는 화면을 동시에 얻는다.

## 재검토 조건

다음 중 하나가 실제 prototype에서 확인되면 renderer 결정을 다시 연다.

- 넓은 Live Execution pane과 Conversation pane의 독립 스크롤을 안정적으로 구현할 수 없다.
- resize, Korean IME, 긴 command stream에서 화면 안정성 수락 조건을 통과하지 못한다.
- GJC 공개 session/wire API가 shell이 필요한 이벤트를 제공하지 않는다.
- GJC 패키지 업데이트 비용이 별도 adapter 유지 비용보다 커진다.

## 첫 구현 경계

- Session Header
- Conversation 영역
- 넓은 Live Execution 영역
- Composer
- Git 저장용 append-only session event
- 결과 카테고리: `action`, `decision`, `evidence`

WES 자동 계획, 다중 Provider, GUI, 원격 동기화는 이 결정의 범위가 아니다.
