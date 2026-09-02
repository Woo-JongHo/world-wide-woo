# SessionGoal · T-notes · 사용량 계기판 조사

조사일: 2026-09-01  
대상: WWW 프로젝트 TUI, Codex App Server 0.151.0, GajaeCode `28e3759`

## 조사 질문

1. 하단의 컨텍스트와 세션 사용량, 구독 잔여량은 어떤 데이터로 표시해야 하는가?
2. SessionGoal과 질문별 T-notes는 언제 만들고 어디에서 상태를 소유해야 하는가?
3. Todo.md와 T-notes가 다시 겹치지 않게 하는 최소 계약은 무엇인가?
4. GajaeCode의 Git/Bash 표현에서 WWW가 가져올 핵심은 무엇인가?

## 확인된 사실

### 컨텍스트와 누적 사용량은 다른 값이다

Codex 정본 구현은 `last.totalTokens`를 최신 활성 컨텍스트 크기로, `total.totalTokens`를 세션 누적으로 정의한다. 컨텍스트 잔여율은 12,000 토큰의 기준 영역을 제외한 유효 창을 사용한다. 따라서 WWW는 `last`를 컨텍스트 게이지에, `total`의 증가분을 모델별 세션 카운터에 사용해야 한다. [`TokenUsage::tokens_in_context_window`](https://github.com/openai/codex/blob/90ae0c4ef944bb80a3c725d15910289dfbb7db51/codex-rs/tui/src/token_usage.rs#L16-L49)

App Server 이벤트는 `threadId`, `turnId`, `last`, `total`, `modelContextWindow`를 함께 제공한다. 이벤트 자체에는 모델명이 없으므로 WWW가 `turn/start` 시점의 모델을 `turnId`에 고정해서 귀속해야 한다. [`ThreadTokenUsageUpdatedNotification`](https://github.com/openai/codex/blob/90ae0c4ef944bb80a3c725d15910289dfbb7db51/codex-rs/app-server-protocol/schema/json/v2/ThreadTokenUsageUpdatedNotification.json)

App Server에는 스레드별 모델·reasoning effort 집계를 읽는 별도 계정 사용량 응답도 있다. v0.1.x의 실시간 표시는 이벤트 델타로 만들고, 이후 이 응답을 사후 대조원으로 연결할 수 있다. [`GetAccountTokenUsageResponse`](https://github.com/openai/codex/blob/90ae0c4ef944bb80a3c725d15910289dfbb7db51/codex-rs/app-server-protocol/schema/json/v2/GetAccountTokenUsageResponse.json)

### SessionGoal 스킬과 제품 상태는 분리해야 한다

App Server는 `$skill-name` 텍스트만으로도 스킬을 찾을 수 있지만, 명시적인 `skill` input item을 보내는 편이 빠르고 확실하다고 안내한다. 현재 WWW v0.1.x는 텍스트 호출을 먼저 지원하고, 이후 `skills/list`와 명시적 skill item 배선을 붙이는 것이 안전하다. [Codex App Server의 Skills 계약](https://github.com/openai/codex/blob/90ae0c4ef944bb80a3c725d15910289dfbb7db51/codex-rs/app-server/README.md#skills)

스킬은 목표 문장을 만드는 규칙만 소유한다. 목표 값은 완성된 assistant 메시지의 제한된 `SESSION_GOAL:` 표식을 WWW가 검증해 snapshot으로 투영한다. 이 방식이면 스킬이 파일을 임의 수정하지 않고, TUI도 모델을 다시 부르지 않고 렌더링할 수 있다.

### 질문별 요약은 턴 완료 뒤 비동기로 만든다

Caltech의 학습 자료는 처음 보는 사람에게 평이한 말로 설명하고, 막히는 지점을 찾고, 다시 단순화하는 과정을 핵심으로 설명한다. WWW는 이를 장문의 교육 설명이 아니라 `질문 / 왜 이 과정을 거쳤는지 / 결과` 세 줄의 짧은 계약으로 축소한다. [Caltech CTLO, The Power of Teaching](https://ctlo.caltech.edu/aboutctlo/whoweserve/undergraduates/learning-resources/learning/power-of-teaching)

생성 시점은 `turn/completed` 뒤다. 다음 Chat 전송을 막지 않는 별도 큐에서 작은 모델로 생성하며, raw 로그·파일 목록·다음 할 일·숨은 사고과정은 넣지 않는다. 한 질문마다 하나의 append-only T-note를 남기며 이전 질문의 노트를 교체하지 않는다.

### Todo와 T-notes의 시제와 책임이 다르다

- Chat: 원문 대화와 관찰 가능한 실행 내역
- Todo.md: 지금부터 할 일과 현재 진행 상황. `무엇을 하는지`와 `왜 필요한지`를 서술
- T-notes: 끝난 질문의 과거형 기록. 질문, 과정의 이유, 결과만 보존
- SessionGoal: 세션 전체가 도달하려는 한 문장

Todo에 command, args, path 같은 코드 입력을 복사하지 않는다. T-note에 다음 행동을 넣지 않는다.

### GajaeCode에서 가져올 것은 색이 아니라 렌더링 규칙이다

GajaeCode Bash 렌더러는 상태 헤더, 하이라이트된 명령, 별도 Output 구역, tail preview, 생략 표식을 하나의 카드로 구성한다. WWW는 이미 같은 native tree-sitter 계열 하이라이터를 사용하므로 코드를 복제하지 않고 이 구조와 의미별 색 규칙을 이식한다. [GajaeCode Bash renderer](https://github.com/Yeachan-Heo/gajae-code/blob/28e375925cf5cf2887b030a693b7e7f8a9a391b4/packages/coding-agent/src/tools/bash.ts#L1850-L1992)

Git 출력은 `diff --git`, `@@`, 추가, 삭제, 수정, 미추적 상태를 서로 다른 의미로 분류한다. 터미널 폭이 좁아지면 색을 없애는 대신 행을 제한하고 생략 사실을 표시한다.

## 불확실성과 제한

- 재개한 스레드에는 과거 누적값이 이미 있으므로 첫 `total` 이벤트를 WWW 프로세스의 기준점으로 잡는다. 첫 관측 이전의 사용량은 현재 실행의 모델별 카운터에 넣지 않는다.
- 모델별 카운터는 Codex Native thread의 `total` 델타와 분리된 T-note Luna·Claude 검토 응답의 `usage.totalTokens`를 한 WWW 프로세스 안에서 합산한다. Fable·Sonnet처럼 호출되지 않았거나 provider가 사용량을 보내지 않은 모델은 `–`로 남겨 0으로 추정하지 않는다.
- 컨텍스트 감소는 압축 뒤 정상일 수 있다. 전체 세션에 단조 증가 규칙을 적용하면 안 된다. 대신 현재 턴이 아닌 지연 이벤트가 게이지를 덮어쓰지 못하게 한다.
- Codex·Claude 구독 퍼센트는 tokenUsage가 아니라 각 provider의 rate-limit 응답을 사용하며 리셋 시간을 함께 표시한다.

## 판정

1. 컨텍스트는 Native `last`, 세션 모델 사용량은 `total` 델타, 구독 퍼센트는 provider rate-limit으로 완전히 분리한다.
2. T-notes는 누적 세션 요약을 폐기하고 질문당 한 개의 완료 기록으로 바꾼다.
3. SessionGoal은 프로젝트 스킬이 제안하고 WWW가 검증된 결과를 상태로 소유한다.
4. Todo는 코드 입력을 버리고 `무엇 / 이유`의 2계층 서술만 남긴다.
5. Git/Bash는 GajaeCode의 카드 구조와 의미별 색 분류를 WWW 디자인 토큰으로 재구현한다.

## 파인만식 한 문장

아래 퍼센트는 구독 잔여량, Context는 지금 대화의 기억 공간, 모델별 숫자는 이 WWW 실행에서 실제로 관측한 Native 턴의 토큰이며, T-notes는 질문 하나가 끝난 뒤 그 질문과 과정의 이유와 결과만 쉬운 말로 남기는 기록이다.
