# WES Agent TUI 초기 계획

## 1. 목적

GJC 계열 런타임을 기반으로, 사용자가 **화면에 보이는 정보**와 **모델에 전달되는 정보**를 직접 구성할 수 있는 터미널 개발 에이전트를 만든다. WES는 별도 문서 장식이 아니라 대화·계획·결정·실행·검증을 규정하는 운영 코어로 사용한다.

## 2. 제품 정의

이 제품은 다음 세 요소의 결합이다.

1. **Agent TUI** — 대화, 입력, 도구 실행, 실시간 터미널 출력, 승인 UI
2. **WES Runtime** — 원칙, 권한, Planning, Decision, Skill, Evidence의 상태와 계약
3. **Output Composer** — 에이전트 출력을 정형화하고 카테고리별로 렌더링하는 계층

제품은 WES 정본을 대체하지 않는다. 프로젝트와 WES 정본을 읽고 현재 세션에 필요한 Context Bundle을 조립하는 실행 클라이언트다.

## 3. 최우선 사용자 문제

기존 Codex 앱은 정보량은 많지만 다음 문제가 있다.

- 어떤 정보를 화면에 표시할지 사용자가 통제하기 어렵다.
- 어떤 정보를 모델 컨텍스트에 넣을지 통제하기 어렵다.
- 원문 대화, 명령 실행, 결정, 결과와 근거가 한 흐름에 섞인다.
- 출력이 길어지면 핵심 결과와 실시간 실행 과정의 관계를 다시 정리해야 한다.

따라서 UI 설정과 모델 Context Policy를 분리해야 한다.

## 4. 핵심 화면 구조

```text
┌─ Session Header ───────────────────────────────────────────────┐
│ project · branch · model · WES work item · authority · status │
├─ Conversation ─────────────────────────────────────────────────┤
│ 사용자와 에이전트의 원문 대화                                 │
│ 결과 카드는 category별 표시                                   │
├─ Live Execution ───────────────────────────────────────────────┤
│ Git/Bash/tool stdout·stderr를 넓게, 실시간으로 표시            │
│ command · cwd · elapsed · exit · evidence                     │
├─ Context / Work ───────────────────────────────────────────────┤
│ Goal · Todo · Decision · Contract · Evidence · Blocker         │
├─ Composer ─────────────────────────────────────────────────────┤
│ prompt · slash command · context attachment                   │
└─ Status Bar ───────────────────────────────────────────────────┘
```

기본 화면은 Conversation과 Live Execution에 가장 많은 면적을 준다. 보조 정보는 패널, 탭 또는 접기 방식으로 노출한다.

## 5. 출력 카테고리

에이전트의 자유 형식 Markdown을 화면에서 임의 재요약하지 않는다. 에이전트가 구조화된 이벤트를 내고 TUI가 렌더링한다.

초기 카테고리:

- `answer` — 사용자 질문에 대한 직접 답변
- `action` — 수행한 작업
- `command` — 실행 명령과 실시간 출력
- `change` — 변경 파일과 의미
- `decision` — 선택, 근거, 대안, 영향
- `todo` — 현재 작업 상태
- `evidence` — 테스트와 관측 결과
- `warning` — 위험, 제약, 불확실성
- `blocker` — 사람 또는 외부 시스템이 해결해야 하는 차단 요소

각 이벤트는 최소한 다음 필드를 가진다.

```ts
interface SessionEvent {
  id: string;
  sessionId: string;
  timestamp: string;
  category: string;
  title?: string;
  body?: string;
  status?: "pending" | "running" | "passed" | "failed" | "blocked";
  source?: string;
  correlationId?: string;
  metadata?: Record<string, unknown>;
}
```

명령 출력은 `command.started`, `command.output`, `command.completed` 이벤트로 분리하여 스트리밍한다. 원본 출력은 보존하고 요약·강조·접기는 Projection으로 처리한다.

## 6. terminal-notes에서 가져올 것

`19_terminal-notes`는 다음 원칙과 구현을 재사용 후보로 둔다.

- 원문 보존
- 요약 → 본문 → 과정의 점진적 공개
- Provider Adapter와 공통 렌더 코어의 분리
- JSONL 기반 세션 읽기
- 접기와 카테고리 렌더링
- 로컬·오프라인 우선

다만 terminal-notes 자체를 Agent Runtime으로 확장하지 않는다. terminal-notes는 읽기·렌더·보관 표면이라는 기존 경계를 유지하고, 새 제품에서는 Output Projection 또는 참고 구현으로 소비한다.

## 7. WES 통합 경계

```text
WES HQ canonical sources
  ├─ system.yaml
  ├─ constitution
  ├─ governance contracts
  ├─ planning packages
  └─ skills
          ↓ read/select
Context Composer
          ↓ session bundle
Agent Runtime
          ↓ structured events
Session Event Store
          ↓ projections
TUI / terminal-notes / future UI
```

WES 통합 규칙:

- 정본과 UI Projection을 분리한다.
- 프로젝트 현장 사실은 프로젝트 저장소가 소유한다.
- 모델이 작성·검토·승인을 한 패스로 독점하지 못하게 역할을 표시한다.
- 완료는 Evidence Event 없이는 표시하지 않는다.
- WES를 찾지 못한 일반 저장소에서도 실행은 가능하되, 임의 WES 규칙을 만들어내지 않는다.

## 8. 설정 구조

```yaml
ui:
  layout: execution-focus
  panels:
    conversation: true
    live_execution: true
    work: true
    context: false
  output_categories:
    visible: [answer, action, command, change, decision, evidence, warning, blocker]
  command_output:
    mode: expanded
    max_buffer_lines: 10000
    follow: true

context:
  include:
    - project_rules
    - active_work
    - relevant_decisions
    - selected_skills
  exclude:
    - unrelated_workspace_tree
  budgets:
    project_rules: 12000
    active_work: 8000

wes:
  discovery: auto
  system_manifest: system.yaml
  authority_mode: enforce
```

`ui`는 사람에게 보이는 정보, `context`는 모델에 전달되는 정보, `wes`는 정본과 실행 권한을 각각 소유한다.

## 9. 구현 전략

### Phase 0 — 참고 구현 조사와 경계 확정

- GJC TUI의 프레임워크, 이벤트 루프, 명령 스트리밍, 세션 저장 형식을 조사한다.
- oh-my-openagent의 multi-harness 구조와 GJC/Senpi 연결 경계를 조사한다.
- `19_terminal-notes`의 parser, render, screen, transcript, provider 경계를 조사한다.
- SSH `woojongho`의 `/Users/woojongho/src/gajae-code/packages/tui`를 읽기 전용 참고자료로 조사한다.
- 재사용·포크·재구현 대안을 Decision Case로 비교한다.

산출물: 기술 선택 Decision, 컴포넌트 경계, 최소 이벤트 계약.

### Phase 1 — 제품 Shell과 Router 확인면

- `www` 실행 시 왼쪽 주 화면과 오른쪽 상·하 패널의 3영역 Shell
- 각 영역의 독립 스크롤, 폭·높이 반응형 축소, 한글 IME 입력
- Router에서 OAuth/API 키 로그인, Provider·모델·추론 강도 설정
- Codex·Claude 구독 사용량과 초기화 시각의 주기적 갱신
- 색상과 공간을 함께 사용한 상태·영역 구분
- append-only JSONL 세션 기반과 안전한 종료·재개

이 단계는 MVP 화면이 아니라 이후 내부 시스템을 수용할 제품 Shell의 품질 기준이다. Agent 도구 루프, 내부 시스템, WES 자동화는 이 확인면이 승인된 뒤 구현한다.

### Phase 2 — Agent 실행 수직 슬라이스

- 사용자 입력과 스트리밍 답변
- Bash/Git 명령의 실시간 stdout/stderr
- 승인, 명령 종료 코드, 취소와 오류 수명주기
- 대화·도구 이벤트 저장과 재생

### Phase 3 — Output Composer

- 카테고리 이벤트 계약 도입
- 답변·변경·결정·증거 카드 렌더링
- terminal-notes식 접기와 단계적 공개
- 원문과 Projection 간 추적 ID 유지
- 사용자별 카테고리 표시 설정

### Phase 4 — WES Context Composer

- WES 저장소 및 Field Harness 탐지
- `system.yaml`, 프로젝트 규칙, 활성 Planning 항목 로딩
- 관련 Decision·Contract·Skill 선택
- Context Budget과 제외 규칙 적용
- 화면 표시 정보와 모델 주입 정보의 독립 설정

### Phase 5 — Work Runtime

- Goal, Todo, Decision, Evidence 상태 모델
- `/plan`, `/decision`, `/work`, `/verify` 명령
- 작성·검토·승인 Authority 표시
- Evidence 없는 완료 차단
- 세션 재개와 Work Item 연결

### Phase 6 — 플러그인과 다중 Harness

- GJC 외 Provider Adapter
- Codex/OpenCode/Pi 계열 Harness 연결
- Hook 및 Skill 플러그인 API
- 사용자 설정 가능한 패널과 출력 Renderer

## 10. 제품 Shell 확인면 수락 조건

1. 넓은 화면에서 왼쪽 1개와 오른쪽 상·하 2개의 콘텐츠 영역이 동시에 보인다.
2. 영역은 색상뿐 아니라 테두리, 간격, 제목으로도 구분된다.
3. TUI 안에서 OAuth/API 키 로그인을 완료하고 모델을 선택할 수 있다.
4. Codex와 Claude의 사용량 백분율, 남은 양, 초기화 시각을 비밀 노출 없이 갱신한다.
5. 인증 없음·API 키 quota 미지원·조회 실패 상태를 서로 다르게 표시한다.
6. 좁은 화면과 작은 높이에서도 주 화면과 입력기가 깨지지 않는다.
7. 세션 이벤트와 인증 정보는 각각 0600 파일에 저장되고 안전한 종료·재개가 동작한다.

## 11. 초기에 하지 않을 것

- GUI/Desktop 앱
- 원격 협업 서버
- 자체 LLM Provider 구현
- WES 정본 자동 수정
- 자동 커밋·푸시·승인
- 모든 Harness 동시 지원
- 모델 출력의 사후 임의 요약

## 12. 먼저 내려야 할 Decision

1. GJC를 fork할지, plugin으로 확장할지, 별도 TUI client로 연결할지
2. TUI 프레임워크와 구현 언어를 GJC와 동일하게 유지할지
3. Agent와 TUI 사이의 이벤트 프로토콜을 무엇으로 고정할지
4. terminal-notes의 코드 재사용 범위와 기존 제품 경계를 어떻게 보존할지
5. WES 기능이 없는 저장소에서의 동작 모드를 어디까지 허용할지
6. `/plan`이 단순 대화 모드인지 WES Planning Package writer인지

## 13. 현재 판정

첫 구현은 **3영역 제품 Shell + Router 로그인·모델 설정 + 실시간 구독 사용량 + append-only Session Event Store**로 제한한다. Agent 도구 루프와 내부 시스템은 이 Shell 확인 이후에 추가한다.
