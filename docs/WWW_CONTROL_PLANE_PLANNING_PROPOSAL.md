# WWW 개인 업무 Control Plane 계획 제안

- 상태: 사용자 검증 대기
- 계획 세대: v0.2~v0.3 proposal
- 승격 대상: `INIT-002`, `EP-012` 이후
- 선행 기준선: v0.1.x Native Project Workbench
- 주의: 이 문서는 검증용 제안이며 append-only Planning Catalog의 수락된 artifact가 아니다.

## 1. Initiative

### INIT-002 — 개인 멀티프로젝트 업무 Control Plane

사용자의 RPA Work와 Product Work에 같은 업무 규칙을 적용하고, Figma·Atlas·Linear·
GitHub·Obsidian의 Artifact를 하나의 Work Chain으로 연결하며, Native Agent의 계획·실행·
검증·Token 성과와 여러 프로젝트의 진행상황을 WWW Operations TUI에서 운영한다.

### 사용자

- 여러 프로젝트를 동시에 운영하는 단일 사용자
- 사용자가 승인한 Story를 수행하는 Codex Native Executor
- 구현 결과를 읽기 전용으로 검토하는 반대 provider

### 해결할 문제

1. 프로젝트마다 같은 업무를 다른 방식으로 수행해 규칙과 품질이 흔들린다.
2. Figma·Atlas·Linear·GitHub·Obsidian의 정보가 서로 다른 의미와 ID로 분리된다.
3. Native Agent의 Plan은 보이지만 각 Plan 아래 실제 실행 구조와 출처를 파악하기 어렵다.
4. 여러 프로젝트의 완료·차단·다음 행동을 사용자의 기준으로 한눈에 판단하기 어렵다.
5. 모델·Skill·Context·effort 선택이 품질과 Token에 어떤 영향을 줬는지 비교하기 어렵다.

### 성공 결과

- 모든 업무는 `RPA Work` 또는 `Product Work`로 분류되고 하나의 Work Chain을 가진다.
- 각 도구가 소유하는 정보와 외부 ID가 WWW Logical ID에 명시적으로 연결된다.
- Contract 위반은 Agent의 완료 주장과 독립적으로 차단된다.
- Todo는 Native Plan을 보여주고 Trace는 그 아래의 관측 가능한 실행 구조를 보여준다.
- Chat은 완료된 질문을 안정된 `#n` T-note로 남긴다.
- 여러 프로젝트의 상태·차단·승인·다음 행동을 Operations TUI에서 확인한다.
- Stage별 모델과 effort는 정책으로 자동 선택되고 실행 성과로 조정된다.

### Non-goals

- Codex의 범용 Agent Runtime·Sandbox·파일 편집기를 다시 구현하지 않는다.
- Figma·Atlas·Linear·GitHub·Obsidian 내용을 서로 복제해 새로운 정본을 만들지 않는다.
- 관측되지 않은 chain-of-thought, Skill 실행, Todo 귀속 관계를 추정 사실로 표시하지 않는다.
- 사람 승인 없이 외부 시스템에 변경을 쓰거나 Planning artifact를 수락하지 않는다.
- 첫 릴리스에서 조직·다중 사용자·Cloud 동기화를 제공하지 않는다.

## 2. 업무 분류와 기본 Workflow

사용자가 말한 `비RPA`는 범위가 부정형이고 Web·App·Tool이라는 실제 의미를 숨기므로
정본 용어는 `Product Work`로 제안한다. UI 입력 호환을 위해 `non-RPA` alias는 허용할
수 있지만 저장값은 `product`로 둔다.

```text
RPA Work
Atlas -> Linear -> GitHub -> Obsidian

Product Work
Figma -> Atlas -> Linear -> GitHub -> Obsidian
```

### 도구별 정보 소유권

| 도구 | 소유하는 정보 | 참조만 하는 정보 |
| --- | --- | --- |
| Figma | 디자인 원본, 화면, Component, Design Token | Atlas 개발 항목, 구현 상태 |
| Atlas | 디자인 또는 자동화 정의를 개발 가능한 항목으로 구조화한 Definition과 Dashboard | Figma 원본, Linear 실행 상태 |
| Linear | 실행 항목, 담당, 상태, 개발 일지, 일정과 수락 진행 | 장기 의사결정, 코드 원본 |
| GitHub | 코드, Commit, PR, 자동 테스트와 기술 증거 | 제품 결정 원문, 전체 운영 상태 |
| Obsidian | 도구를 가로지르는 의사결정, 정책, 조사, 장기 문서 | 실시간 이슈 상태, 코드 원본 |
| WWW | Standard, Binding, Logical ID, Work Chain, Progress Model, Contract, Evidence index | 외부 Artifact 본문 원본 |

### 문서 경계

```text
Linear Docs = 해당 실행 항목을 수행하는 데 필요한 작업 문서
GitHub Docs = 코드와 같은 버전으로 바뀌어야 하는 기술 문서
Obsidian    = 프로젝트와 도구를 가로지르는 의사결정과 장기 지식
Atlas       = 무엇을 어떤 개발 단위로 만들 것인지에 대한 구조
```

## 3. Architecture

### 전체 구조

```text
Standard Catalog + Blueprint
              |
              v
Project Binding + Work Chain Registry
              |
              v
WWW Workflow Loop
  |           |             |
  v           v             v
Codex      Deterministic   Read-only
Native     Adapter/RPA     Reviewer
  |
  v
ProjectActivity Journal
  |
  +--> Chat: 원문 대화 + 완료 T-note #n
  +--> Todo: Native Plan projection
  +--> Trace: 관측된 하위 실행 구조 + Source
  `--> Operations TUI: 멀티프로젝트 Progress Model
              |
              v
Contract Validator + Evidence + Token Tuning
```

### Native data normalization

WWW TUI는 provider raw event를 직접 읽지 않는다.

```text
Codex App Server raw event -> Codex adapter  --┐
                                                +-> ProjectActivity -> TUI projection
Claude stream-json event   -> Claude adapter --┘
```

공통 `ProjectActivity`는 두 provider가 실제로 공유하는 최소 의미만 소유한다. provider에만
있는 필드는 source envelope와 capability extension으로 보존하고 다른 provider에 없는
값을 추정해 채우지 않는다. `unsupported`, `unknown`, `not_observed`를 서로 구분한다.

v0.2에서는 Codex Adapter를 통해 공통 의미와 TUI Projection을 확정하되 Claude raw event를
구현하지 않는다. v0.3에서 Claude 실제 schema를 먼저 probe한 뒤 Claude Adapter를 추가한다.

단, v0.2의 독립 교차검증에는 로그인된 Claude Code 구독을 사용하는 좁은 Review
Transport를 제공한다. 이 Transport는 승인된 redacted packet 하나와 review instruction만
받고 Tool·project cwd·resume·Plan·Subagent를 사용하지 않으며 review text와 usage·
provenance만 반환한다. 이 결과는 ProjectActivity Native 실행 정규화의 선행 구현으로
간주하지 않는다.

### 정본과 Projection

| 정보 | 정본 | WWW에서의 형태 |
| --- | --- | --- |
| Native 대화와 실행 | Native thread/item | append-only ProjectActivity 관찰 사본 |
| 현재 계획 | Native Plan | session-scoped Todo.md projection |
| 실행 Trace | ProjectActivity와 native refs | 재생성 가능한 Trace projection |
| 질문 완료 기록 | immutable T-note | Chat의 turn-stable `#n` projection |
| 디자인 | Figma | Logical ID와 opaque external ref |
| 개발 정의 | Atlas | Logical ID와 opaque external ref |
| 실행 상태 | Linear | bounded status cache와 external ref |
| 코드·기술 증거 | GitHub/Git | commit·PR·check ref |
| 의사결정·장기 지식 | Obsidian | 문서 ref와 승인된 promotion |
| 공통 규칙 | WWW Standard Catalog | versioned Standard·Blueprint·Contract |

### Todo·Trace·Chat 경계

```text
Todo  = Codex Native Plan의 사용자용 실행 원장
Trace = 선택된 Plan을 수행하며 공개된 Agent·Tool·승인·결과의 관측 구조
Chat  = 대화 원문과 완료된 질문별 T-note #n
```

Todo는 Native Plan의 읽기 전용 의미 Projection이다. 현재 `/todo`가 제공하는 사용자 직접
변경과 `.www/vault/Todo.md` project 정본 의미는 새 기본 Workbench에서 제거한다. 기존
파일은 삭제하지 않고 legacy migration view에서만 열며, 사용자 장기 Work는 Planning
Story와 Linear가 소유한다.

#### GJC Todo와 WWW Todo의 경계

GJC의 화면은 하나의 기능처럼 보이지만 실제로는 두 출처를 합쳐 보여준다.

- `Performing initial repository check` 같은 문장은 모델 response의 공개
  `summaryText`이며 Todo 항목이 아니다.
- `Todo Write 7 tasks`는 모델이 `todo_write` Tool에 `phase + items`를 `init`으로 넘긴
  결과다. 이후 `start`, `done`, `drop`, `append`, `note`, `rm` operation으로 갱신된다.
- GJC Todo는 session 또는 memory에 저장되고, pending 항목 중 하나를 자동으로
  `in_progress`로 만든다. Phase는 화면에서만 로마 숫자로 꾸며진다.
- GJC task에는 고유 ID가 없고 task 문구 전체가 address다. 문구 변경은 identity 변경과
  같으므로 WWW의 안정적 Plan identity나 Work Chain ID로 사용할 수 없다.

WWW는 GJC에서 다음 표현만 benchmark로 채택한다.

```text
Todo
I. 기준 확인
├─ ✓ 현재 위치와 Git 상태 확인
└─ ◉ 정본 문서와 범위 확인
II. 실측
├─ ○ Codex 버전과 프로토콜 확인
└─ ○ 실제 App Server 이벤트 캡처
```

- Phase와 task의 두 단계 계층, 전체 task 수, `pending | in_progress | completed |
  abandoned` 상태, 한 개의 명확한 현재 항목을 제공한다.
- 화면 문구와 별개인 안정적 `planItemId`를 내부 identity로 사용한다. Native ID가 없으면
  ST-011-15의 deterministic identity와 provenance를 사용하고 문구를 ID로 사용하지 않는다.
- source는 Codex Native Plan event이며 모델이 임의로 만든 별도 Todo를 기본 정본으로
  승격하지 않는다. Native Plan이 없는 실행은 `unavailable` 또는 명시적 inferred
  projection으로 표시한다.
- 공개 reasoning summary는 Todo 위의 `current activity` 한 줄 또는 Trace node로 표시할 수
  있지만 task 상태를 변경하지 않는다.
- Todo에서 항목을 선택하면 그 항목에 귀속된 하위 Agent·Tool·승인·결과는 Trace에서
  펼친다. Todo에 하위 실행 로그를 직접 중첩하지 않는다.
- 입력 대기·queue·재전송 알림은 composer transport 상태이며 Todo와 분리한다.

Trace의 모든 node와 edge는 다음 중 하나의 attribution을 가진다.

- `observed`: native `turnId`, `itemId`, `agentThreadId`, tool call ID처럼 직접 연결됨
- `inferred`: ST-011-16에서 고정한 동일 turn·활성 Plan interval 규칙으로 연결한 Projection

`inferred` edge는 기본으로 접고 추정임을 표시한다. Skill과 Validator는 독립 이벤트나
WWW 자체 실행 receipt가 있을 때만 표시한다.

### Progress Model

실행기 상태와 사용자 업무 상태를 분리한다.

```text
execution: queued | running | waiting_approval | succeeded | failed | cancelled | uncertain
validation: not_required | pending | passed | failed
work: proposed | ready | active | blocked | review | accepted | cancelled | abandoned | superseded
```

업무 완료는 `execution=succeeded`만으로 성립하지 않는다. 해당 Blueprint가 요구하는
Contract가 모두 `passed`이고 필요한 사람 승인이 있어야 `work=accepted`가 된다.
`execution=uncertain`은 Work 상태를 자동 변경하지 않고 현재 상태를 유지한 채 ST-014-03의
Blocker record로 운영 attention과 reconciliation 요구를 추가한다.

### Work Chain과 ID

```text
workId: www.work.<project>.<sequence>
type: rpa | product
refs:
  figma?: opaque external ID
  atlas: opaque external ID
  linear: opaque external ID
  github: branch/commit/PR/check refs
  obsidian?: vault-relative logical document ref
```

Product Work에는 Figma ref가 필수다. RPA Work의 기본 Chain은 Figma를 요구하지 않지만
운영 화면 등 별도 디자인 Artifact를 연결하는 것은 허용한다. Atlas·Linear·GitHub는 두
유형 모두 필수다. Obsidian Decision 필요 여부는 Blueprint의 명시 규칙 또는 사람의
판정이 소유하며 Agent의 자가판정만으로 필수 여부를 해제하지 않는다.

### 실행기와 Agent Loop

- 기본 Agent Loop는 Codex App Server가 소유한다.
- WWW Workflow Loop는 Stage 선택, 실행기 배치, 검증, 재시도, 승인과 완료를 소유한다.
- WWW가 직접 Tool loop를 소유하는 실행기는 Native로 표현할 수 없는 반복 요구가
  실측된 뒤에만 추가한다.
- GJC는 Story를 읽어 구현하고 Acceptance별 Evidence를 반환하는 실행 주체로 사용할 수
  있지만 Planning 정본과 완료 판정을 소유하지 않는다.

### 동적 모델·effort 정책

사용자가 매번 모델과 effort를 선택하지 않는다. Stage policy가 기본값을 선택하고,
승격 조건이 발생할 때만 한 단계 올린다.

모델 선택은 세 Provider Lane, Native Execution Lane과 여러 Agent Role의 Role Binding으로
표현한다.

```text
Provider Lane: Codex | Claude | Gemini

Execution Lane:
  codex-execution:
    Native Executor      -> Codex App Server
    Plan/Tool/Skill/Agent -> Codex native contract

  claude-execution:
    Native Executor      -> Claude Code CLI stream-json Adapter
    Plan/Tool/Skill/Agent -> Claude native contract

Fixed Role:
  Rule Critic            -> Gemini read-only
```

1차 구현은 `codex-execution`과 `claude-execution` 두 Lane만 다룬다. Gemini Execution,
임의 provider 조합, Run 중간 교체는 범위 밖이다. `claude-execution`의 실제 활성화는 현재
WES의 Codex-author/Claude-reviewer 권한 정책을 변경하는 별도 Decision과 사람 승인을
요구한다.

| Stage | 기본 | 승격 조건 |
| --- | --- | --- |
| 규칙 preflight·경계 사례 생성 | Gemini Rule Critic | 중대한 충돌 또는 규칙 변경 판단이면 Sol `high` |
| 분류·추출·형식 변환·bounded 요약 | Gemini lightweight | Contract 실패 또는 판단 필요 시 Luna `low` |
| 목록·기계적 수집 | Luna `low` | 구조 불일치가 발견되면 Terra `medium` |
| 일반 조사·가역 검증 | Terra `medium` | 상충 근거 또는 안전 경계면 Sol `high` |
| 설계·구현·통합 | Sol `medium` | 상태·동시성·보안·정본 경계면 Sol `high` |
| 계획·Architecture | Sol `high` | 전체 시스템 모순 감사면 Sol `xhigh` |
| 독립 구현 리뷰 | Claude Sonnet 읽기 전용 | 고위험 반박이면 Claude Opus/Fable 정책 모델 |
| 최종 기계 검증 | 결정론적 Tool | 실패 원인 해석만 Terra 또는 Sol |

`max`는 대표 workload에서 `xhigh`보다 Acceptance 통과율이 개선된 증거가 있을 때만
사용한다. 모델·effort 변경은 Agent Revision에 기록하고 Token·시간·재시도·사람 개입·
Validator 결과를 함께 비교한다.

Gemini lightweight 작업은 Tool이 없거나 read-only이고, 입력·출력 크기가 bounded이며,
결과를 결정론적 Contract로 즉시 검증할 수 있어야 한다. Contract 실패, 모호한 판단,
프로젝트 Write 또는 보안 경계가 발생하면 Gemini 안에서 반복하지 않고 다음 정책 단계로
승격한다. 특정 Gemini 모델 ID는 Provider catalog 실측 뒤 Binding한다.

Gemini Rule Critic은 Validator 실행 전 규칙 자체를 읽고 다음 결과만 구조화해 반환한다.

- 서로 충돌하거나 동시에 만족할 수 없는 규칙
- 자연어가 모호해 결정론적으로 검사할 수 없는 조건
- 누락된 경계 사례와 반례 fixture 후보
- Validator 결과를 설명하는 사용자용 요약

이 결과는 `advisory`이며 Contract나 Validator를 자동 변경하지 않는다. 실제 Artifact의
pass/fail은 결정론적 Validator가 소유하고, 규칙 변경은 Sol 설계 패스와 사람 승인을
거친다.

### 실패 정책

- 외부 Artifact를 읽지 못하면 stale cache를 최신값처럼 표시하지 않는다.
- 외부 write 결과가 불명확하면 재시도하지 않고 `uncertain`과 reconciliation을 요구한다.
- Work Chain 필수 ref가 없으면 다음 Stage 전환을 차단한다.
- Native Plan 재작성 시 index만으로 기존 Activity를 새 단계에 재부모화하지 않는다.
- Trace Source inspector가 없는 Activity는 상세 근거가 있다고 표시하지 않는다.
- 사람 승인과 Validator 결과 없이 Agent의 완료 문구를 accepted로 승격하지 않는다.

## 4. Epic과 Story 제안

아래 ID는 사용자 수락 후 append-only Catalog에 생성할 목표 ID다. 수락 전에는 예약된
정본 ID가 아니다. EP-011 후속 Story는 기존 Epic을 확장하고, INIT-002는 EP-012부터
소유한다.

### EP-011 후속 — Trace와 완료 기록 재구성

**Outcome:** Todo에서 선택한 Native Plan 아래의 관측 가능한 실행 구조를 Trace에서 보고,
완료된 T-note는 Chat의 안정된 질문 번호로 되짚을 수 있다.

#### ST-011-14 — App Server event schema 실측

- 실제 Codex App Server run에서 `turn/plan/updated`, `item/started`,
  `item/commandExecution/outputDelta`, `item/completed`, command approval과
  `collabAgentToolCall`의 Plan·turn·item·agent·tool·approval 식별자를 수집한다.
- 지원 Codex version과 event method별 필드 존재 여부를 Evidence로 고정한다.
- 없는 식별자나 관계를 Trace 계약의 전제로 사용하지 않는다.
- fixture와 실제 event의 차이를 기록하고 불명확한 관계는 inferred 후보로 분류한다.
- 결과는 `.www/evidence/ST-011-14.md`에 version, 재현 명령, redacted event shape,
  필드 matrix와 미관측 method를 기록하면 완료된다.

#### ST-011-14R — 미관측 App Server 관계 보강 실측

- `ST-011-14`의 `BLOCKED / PARTIAL` Evidence를 checkpoint 입력으로 사용하고 기존 live
  관측을 다시 작성하거나 완료로 승격하지 않는다.
- `turn/plan/updated`, command approval request→response→terminal, collaborator
  started→completed 관계만 좁혀 실측한다.
- 보강 전 구현은 이미 관측된 필드만 `observed`로 사용하고 나머지는 `inferred` 또는
  `unavailable`로 fail-closed한다.
- `ST-011-15`부터 `ST-011-21`까지의 구현을 막지 않지만 `ST-011-19` 통합 수락 전에는
  PASS 또는 version-local `unsupported` Evidence로 닫혀야 한다.

#### ST-011-15 — 안정적인 Native Plan 항목 식별

- Plan 재작성·삽입·삭제 후에도 동일 단계의 identity가 유지된다.
- array index만으로 Activity를 기존 Plan 단계에 귀속하지 않는다.
- identity가 불명확하면 이전 Activity를 새 단계로 이동하지 않고 orphan/inferred로 남긴다.
- replay와 resume에서 같은 입력은 같은 projection을 만든다.
- **Schema-EN:** `dplan-v1` accepts immutable `expectedThreadKey` and `selectedTurnId`;
  `WorkFlowProjection.source` only attests that bound source and never discovers authority.
- **Prose-KO:** Native Plan-entry ID는 관측되지 않았으므로 만들지 않는다. identity는
  deterministic-derived digest이며, 모호한 변경과 source mismatch는 inferred 또는 orphan으로
  fail-closed한다. Todo parent는 `native-${digest.slice(0,48)}`, detail은 정확히
  `${parent}-detail-1`로 렌더링하고, 실제 ID 검증·prefix collision 검사는 CAS/event 전에
  원자적으로 끝낸다.

#### ST-011-16 — Trace attribution 계약

- Trace node와 edge는 `observed` 또는 `inferred`를 가진다.
- native ref가 없는 관계는 observed가 될 수 없다.
- inferred 관계는 기본 접힘이며 Source에서 추정 근거를 확인할 수 있다.
- inferred는 동일 turn에서 Plan item이 in-progress였던 단조 sequence interval 안의 Activity만
  허용하며 경계값과 tie-break를 fixture로 고정한다.
- Skill·Validator는 실제 receipt가 없으면 node를 만들지 않는다.

#### ST-011-21 — Phase Todo projection과 GJC benchmark

- GJC `todo_write`의 실제 session event, Tool result와 renderer를 benchmark Evidence로
  고정하되 GJC package를 runtime dependency로 추가하지 않는다.
- Native Plan의 flat item을 사용자용 Phase와 task로 projection하는 규칙을 fixture로
  고정한다. Native가 Phase를 제공하지 않으면 임의 의미 분류를 하지 않고 단일 Phase 또는
  명시적 inferred grouping을 사용한다.
- 각 task는 표시 문구와 분리된 안정적 `planItemId`, source `turnId`와 attribution을 가진다.
  content string이나 array index만으로 task를 갱신하지 않는다.
- TUI는 Phase 계층, 전체 수, 네 상태, 현재 항목 하나를 표시하며 compact mode에서도
  모든 항목과 Source에 접근할 수 있다.
- 공개 response `summaryText`는 `current activity`, composer queue 상태는 transport notice로
  정규화하고 Todo state mutation과 분리한다.
- Plan rewrite·동일 문구 중복·문구 수정·resume·Native Plan 부재 fixture에서 identity와
  표시 상태가 안정적이면 완료된다.

#### ST-011-17 — 활성 Todo 기반 Trace projection

- Catalog 승격 시 `ST-011-08`을 supersede한다.
- 선택된 Todo에 직접 연결된 Agent·Tool·MCP·승인·결과를 계층으로 표시한다.
- 선택하지 않은 실행과 orphan Activity는 별도 관측 구역에서 접근할 수 있다.
- 기존 delegation tree와 WorkStepCard를 재사용하고 별도 raw parser를 만들지 않는다.
- compact terminal에서도 모든 Trace node와 Source에 접근할 수 있다.

#### ST-011-18 — T-note의 Chat 완료 인덱스 이동

- Catalog 승격 시 `ST-011-09`를 supersede한다.
- 완료된 질문마다 thread 내에서 안정된 `#n`을 부여한다.
- resume·절단·화면 재정렬 후에도 같은 Native turn은 같은 번호를 유지한다.
- Chat에서 `#n`을 선택하면 T-note와 sourceActivityIds를 확인할 수 있다.
- T-note vault와 ProjectActivity는 이동·삭제·재작성하지 않는다.

#### ST-011-19 — Trace 수용 검증과 legacy migration

- Plan rewrite, parallel subagent, tool retry, approval, cancel, orphan event fixture를 검증한다.
- 숨겨진 reasoning과 관측되지 않은 Skill 이름이 화면에 나타나지 않는다.
- 실제 App Server run에서 observed/inferred 표시가 event schema와 일치한다.
- 기존 activity journal과 T-note를 새 projection에서 읽고 `vault/Todo.md`와 `/todo`의
  legacy 쓰기 경로를 기본 Workbench에서 제거하거나 명시적 migration view로 격리한다.
- 사용자 수동 QA와 독립 읽기 전용 리뷰가 모두 PASS여야 Epic 수락 후보가 된다.

#### ST-011-20 — Claude 구독 packet-only Review Transport

- 로그인된 Claude Code CLI를 one-shot print mode로 실행해 승인된 redacted packet만 검토한다.
- project와 분리된 빈 임시 cwd, no-tools, no-resume, bounded input·output을 강제한다.
- packet digest, Claude CLI version, canonical model, 시작·종료 시각, result digest와 관측된
  usage를 provenance로 기록하고 제공되지 않은 usage를 추정하지 않는다.
- 기존 `ReviewAdapter`·preview·exact-digest 승인 계약을 재사용하고 NativeHarness나
  ProjectActivity event normalization을 구현하지 않는다.
- CLI 인증 없음·구독 제한·timeout·비정상 JSON을 구분하며 불명확한 요청을 자동 재전송하지 않는다.
- 기존 Provider API Review Transport는 명시적 대체 경로로만 남기고 어떤 transport가
  사용됐는지 Evidence에 표시한다.

### EP-012 — Standard·Blueprint·Contract 기반

**Outcome:** 프로젝트가 달라도 같은 업무 규칙과 완료 조건을 버전으로 적용할 수 있다.

#### ST-012-01 — Standard Catalog

- Standard는 stable ID, version, owner, status와 source digest를 가진다.
- published version은 immutable하며 의미 변경은 새 version으로 만든다.
- 프로젝트 설정이나 Prompt를 Standard 원본으로 취급하지 않는다.

#### ST-012-02 — 실행 가능한 Blueprint

- Blueprint는 Stage, 입력, 산출물, 승인, Contract와 허용 실행기를 정의한다.
- 순환 Stage, 존재하지 않는 Contract, 종료 없는 retry를 fail-closed한다.
- Skill은 Stage의 수행 방법만 참조하고 Blueprint를 대신하지 않는다.
- Claude reviewer의 project·external write 권한은 schema에서 항상 금지한다.

#### ST-012-03 — Project Binding

- 공통 Standard를 프로젝트 값·예외·외부 Artifact ref에 결속한다.
- 예외는 이유·승인자·만료 조건 없이 활성화할 수 없다.
- Standard 업데이트가 기존 Binding을 조용히 변경하지 않는다.

#### ST-012-04 — Contract Validator

- 구조·필수 ID·관계·허용값을 결정론적으로 판정한다.
- Validator 결과는 실행기 주장과 독립된 Evidence를 가진다.
- 실패한 Contract가 있으면 Work를 accepted로 전환하지 않는다.
- Gemini Rule Critic 결과를 advisory로 별도 보존하고 pass/fail 입력으로 사용하지 않는다.

#### ST-012-05 — Gemini Rule Critic

- Standard·Blueprint·Contract fixture에서 충돌·모호성·누락 경계 사례를 구조화해 제안한다.
- read-only·no-tools·bounded packet만 받고 project·external write 권한을 갖지 않는다.
- 같은 규칙 version과 fixture에 대한 결과 provenance를 기록한다.
- 제안이 없어도 Validator 통과로 해석하지 않고, 제안이 있어도 규칙을 자동 변경하지 않는다.

#### ST-012-06 — GitHub CI Gemini Rule Critic

- Standard·Blueprint·Contract·Validator 변경 PR에서 Gemini Rule Critic을 read-only Job으로 실행한다.
- CI 결과는 advisory check summary와 immutable artifact로 남기며 merge pass/fail을 소유하지 않는다.
- 결정론적 Validator는 별도의 required check로 실행하고 Gemini 장애와 독립적으로 판정한다.
- `GITHUB_TOKEN`은 `contents: read`를 기본으로 하고 project·issue·PR write 권한을 주지 않는다.
- fork의 untrusted code를 secret이 있는 `pull_request_target`에서 checkout·실행하지 않는다.
- Gemini Action과 CLI version을 고정하고 prompt·model·packet digest를 provenance로 기록한다.

#### ST-012-07 — Standard 적용 수용 시나리오

- 같은 Standard를 두 fixture 프로젝트에 다른 Binding으로 적용한다.
- 동일 규칙과 허용된 차이가 각각 검증된다.
- Standard version 변경 전후 Run을 재현하고 결과를 비교한다.

#### ST-012-08 — Schema-EN / Prose-KO 저작 계약

- WES `AGENTS.md`의 문서 언어 규약을 Skill·Standard·Blueprint·Contract와 사용자용 TUI
  표면에 적용한다. 같은 규칙을 개별 `SKILL.md`마다 복제하지 않고 정본을 참조한다.
- 기계 key, Skill `name`, 식별자, enum 값, 파일 이름, 경로, CLI 옵션, JSON key,
  schema property와 코드 식별자는 영어로 유지한다.
- 제목, 설명, 절차 문장, 주석, docstring, 사람이 읽는 오류·도움말·Evidence·UI 문자열은
  한국어로 작성한다.
- 외부 제품 이름과 출처 인용문은 원문 언어를 유지하고, 번역 설명이 필요하면 원문과
  분리해 한국어로 덧붙인다.
- 대표 `SKILL.md`, validation error, TUI fixture에 대한 정적 검증이 잘못 번역된 key와
  불필요한 영어 산문을 탐지한다. 자연어 전체를 판정하는 저장 시점 훅은 만들지 않는다.

### EP-013 — Work Chain Registry

**Outcome:** Figma·Atlas·Linear·GitHub·Obsidian의 역할과 ID가 하나의 업무 관계로 추적된다.

#### ST-013-01 — Work Chain과 Logical ID

- WWW Logical ID와 모든 외부 opaque ID를 분리 저장한다.
- 동일 외부 ref의 중복 결속과 다른 프로젝트 ref 혼합을 차단한다.
- ref 변경·대체 이력을 잃지 않고 현재 관계를 조회한다.

#### ST-013-02 — Artifact ownership contract

- 각 도구가 소유하는 정보와 참조만 하는 정보를 schema로 표현한다.
- 동일 본문을 여러 도구에 정본으로 선언하는 설정을 거부한다.
- Linear Docs·GitHub Docs·Obsidian 경계를 fixture로 검증한다.

#### ST-013-03 — Product Work chain validation

- Figma→Atlas→Linear→GitHub 순서와 필수 ref를 검사한다.
- Figma가 없거나 Atlas가 디자인 ref를 잃으면 다음 Stage를 차단한다.
- 중요한 변경의 Obsidian Decision 필요 여부와 판정 근거를 남긴다.

#### ST-013-04 — RPA Work chain validation

- Atlas→Linear→GitHub 순서와 필수 ref를 검사한다.
- RPA Work에 Figma를 필수로 요구하지 않는다.
- runner 정의, 실행 증거, 사람 검토 결과를 success와 분리한다.

#### ST-013-05 — 외부 ref Source와 stale 상태

- 외부 ref의 provider, fetchedAt, digest와 접근 실패를 표시한다.
- cache가 오래됐으면 stale을 숨기지 않는다.
- Adapter별 TTL과 명시적 invalidation 시점을 정의하고 Source에 effective freshness를 표시한다.
- remote write는 preview·사람 승인·idempotency 또는 reconciliation 계약을 요구한다.

### EP-014 — 사용자 정의 Progress Model

**Outcome:** 실행기 상태가 아니라 사용자의 완료 기준으로 프로젝트 진행상황을 판정한다.

#### ST-014-01 — 실행·검증·업무 상태 분리

- `execution`, `validation`, `work` 상태가 독립적으로 저장·표시된다.
- succeeded execution을 accepted work로 자동 변환하지 않는다.
- 허용되지 않은 상태 전이를 fail-closed한다.

#### ST-014-02 — Blueprint 기반 진행 판정

- 현재 Stage, 남은 Contract, 승인, blocker로 progress를 계산한다.
- 단순 완료 개수와 사용자 정의 진행 판정을 구분한다.
- 판정의 입력과 규칙 version을 Source에서 확인한다.

#### ST-014-03 — Blocker와 다음 행동

- blocker는 원인, owner, 해제 조건과 발생 시각을 가진다.
- 다음 행동은 현재 Stage와 실패 Contract에서 결정론적으로 제안된다.
- 불확실한 상태는 정상·실패로 임의 변환하지 않는다.

#### ST-014-04 — Progress Model 수용 검증

- 실행 성공·검증 실패, 승인 대기, stale external ref, cancelled run 시나리오를 검증한다.
- 같은 사건에서 replay 결과가 동일하다.
- 사용자가 각 판정의 근거를 TUI에서 되짚을 수 있다.

### EP-015 — 멀티프로젝트 Operations TUI

**Outcome:** 여러 프로젝트의 현재 위치·차단·승인·다음 행동을 한 화면에서 운영한다.

#### ST-015-01 — Project Registry

- 명시적으로 등록한 프로젝트만 집계한다.
- 프로젝트 root, identity, Binding과 redacted summary ref를 관리한다.
- raw transcript나 고객 Artifact를 중앙 TUI가 무단 수집하지 않는다.

#### ST-015-02 — Operations Dashboard

- 프로젝트별 현재 Work, Stage, blocker, approval, validation과 freshness를 표시한다.
- RPA Work와 Product Work를 필터링한다.
- 상태가 없는 것과 수집 실패를 다르게 표시한다.

#### ST-015-03 — Project drill-down

- Dashboard에서 프로젝트를 선택하면 해당 root의 동일 ProjectWorkbench로 진입한다.
- 중앙 화면이 프로젝트 Workbench를 복제하거나 별도 상태를 정본으로 만들지 않는다.
- 복귀 후 선택·스크롤·필터 상태를 복원한다.

#### ST-015-04 — 운영 알림과 승인함

- blocked, waiting approval, failed validation, uncertain write만 운영 attention으로 집계한다.
- 알림에서 원본 Work Chain과 Source로 이동한다.
- 승인 행위는 target·digest·효과를 preview한 뒤에만 실행한다.

#### ST-015-05 — Operations TUI 실제 사용 검증

- 최소 3개 fixture 프로젝트와 2개 실제 프로젝트로 wide/compact 화면을 검증한다.
- 프로젝트 하나가 손상되거나 느려도 다른 프로젝트를 볼 수 있다.
- 사전에 고정한 3개 시나리오에서 사용자가 blocker와 다음 행동을 찾는 시간을 각각
  측정하고 모든 시나리오가 30초 이내인지 Evidence로 남긴다.

### EP-016 — 동적 Agent Revision과 Token Tuning (v0.3)

**Outcome:** 단계별 모델·effort를 자동 선택하고 품질·시간·Token 근거로 정책을 개선한다.

#### ST-016-01 — Provider·Execution Lane catalog

- Codex·Claude·Gemini 세 Provider Lane을 인증·구독·지원 모델·실행 capability와 함께 정의한다.
- Codex App Server와 Claude Code CLI stream-json의 Plan·Tool·Skill·Subagent·Session·승인 capability를
  공통 contract와 provider-specific extension으로 분리한다.
- Independent Reviewer·Rule Critic Role의 권한과 필요한 capability를 정의한다.
- Provider 이름을 Role로 사용하지 않고 Role Binding version을 Run Evidence에 기록한다.
- Reviewer와 Rule Critic은 어떤 Binding에서도 project·external write 권한을 가질 수 없다.

#### ST-016-02 — Claude stream-json schema probe와 정규화

- 로그인된 Claude Code CLI의 message·Plan·Tool·Subagent·permission·usage·session event를
  실제 run에서 수집하고 CLI version과 redacted field matrix를 Evidence로 고정한다.
- Claude raw event를 기존 Codex raw shape에 맞추지 않고 provider-neutral ProjectActivity로 변환한다.
- Claude에 없는 capability는 `unsupported`, 관측 실패는 `not_observed`, 알 수 없는 값은
  `unknown`으로 구분한다.
- 결과는 `.www/evidence/ST-016-02.md`에 재현 명령·schema·capability matrix로 남긴다.

#### ST-016-03 — 구독 기반 Codex·Claude Native 실행 선택

- `codex-execution`은 Codex App Server Adapter, `claude-execution`은 로그인된 Claude Code
  CLI stream-json Adapter로 제공한다. 존재가 확인되지 않은 Claude App Server를 가정하지 않는다.
- Story 시작 시 구독 가용성·지원 capability·정책을 평가해 Lane을 선택한다.
- 선택된 Lane이 Plan·Tool Loop·Skill·Subagent·Session·승인을 Run 종료까지 소유한다.
- 선택 provider·model·effort·권한·이유와 남은 quota 관측값을 TUI와 Evidence에 표시한다.
- 실행 중 자동 전환하지 않고 다른 Lane은 terminal 상태와 handoff packet 뒤 새 Run으로 시작한다.
- 두 Provider가 모두 실행 불가능하면 Gemini로 승격하지 않고 blocked로 중단한다.
- `claude-execution`은 WES 권한 변경 Decision과 사람 승인이 없으면 fail-closed한다.

#### ST-016-04 — Stage execution policy

- Stage별 기본 executor, model, effort, Skill, budget과 승인 경계를 정의한다.
- Gemini Rule Critic을 Validator 규칙 preflight의 기본 read-only 역할로 배치한다.
- Gemini lightweight를 가벼운 정형 작업 슬롯으로 제공하고 허용 업무·Token budget·
  no-write·Contract 조건을 기계적으로 검사한다.
- 사용자 수동 선택이 있으면 해당 Run에만 명시적 override로 기록한다.
- 지원하지 않는 모델·effort 조합은 실행 전에 차단한다.

#### ST-016-05 — Evidence 기반 effort 승격

- 구조 불일치, 반복 실패, 고위험 경계 같은 명시 조건에서만 effort를 올린다.
- 높은 effort를 항상 사용하는 정책을 허용하지 않는다.
- 승격 이유와 이전 실패 Evidence를 Run에 기록한다.

#### ST-016-06 — Agent Revision 비교

- 같은 업무 목적의 Revision별 Token·시간·재시도·사람 개입·Validator 결과를 비교한다.
- 관측값·파생값·추정값을 구분한다.
- 품질 저하가 있으면 Token 감소만으로 우수하다고 판정하지 않는다.

#### ST-016-07 — 모델 정책 제안과 사람 승인

- 충분한 비교 Run이 있을 때만 정책 변경안을 제안한다.
- 변경 전후 예상 영향과 rollback version을 보여준다.
- 사람 승인 전에는 published policy를 변경하지 않는다.

#### ST-016-08 — Codex·Claude projection parity와 Token Tuning 수용 검증

- 최소 5개 고정 fixture Story를 `medium/high/xhigh`에서 각각 3회 실행해 기술 통계를 비교한다.
- 별도 경량 fixture에서 Gemini lightweight와 Luna `low`의 Contract 통과·Token·시간을 비교한다.
- 동일한 public fixture에서 Codex·Claude의 Chat·Todo·Trace 의미가 같고 unsupported 차이가
  명시적으로 보이는지 검증한다.
- Acceptance 통과율이 같을 때 더 작은 비용·시간의 Revision을 우선한다.
- `max` 사용은 `xhigh` 대비 측정된 개선이 없으면 거부한다.

### EP-017 — 외부 도구 Read Adapter

**Outcome:** Work Chain의 외부 상태를 읽고, 승인된 변경만 각 소유 도구에 안전하게 반영한다.

#### ST-017-01 — 공통 Adapter read contract

- Figma·Atlas·Linear·GitHub·Obsidian Adapter가 opaque ref, freshness, digest, error를 반환한다.
- provider 원문을 무제한 Context나 중앙 저장소에 복제하지 않는다.
- timeout·rate limit·권한 없음·not found를 구분한다.

#### ST-017-02 — Figma·Atlas 연결 vertical slice

- Product Work의 Figma design ref를 Atlas development item과 결속한다.
- 디자인 원본은 Figma에 남고 Atlas에는 개발 해석과 참조만 저장한다.
- 누락·stale·다른 프로젝트 ID를 Validator가 차단한다.

#### ST-017-03 — Linear·GitHub 연결 vertical slice

- Atlas item에서 Linear issue, branch/commit/PR/check까지 추적한다.
- Linear 상태와 GitHub check 결과를 동일한 완료 상태로 합치지 않는다.
- PR merge 뒤에도 필요한 Contract와 Obsidian Decision 여부를 검증한다.

#### ST-017-04 — Obsidian Decision 연결 vertical slice

- 장기 의사결정이 필요한 변경만 승인된 Obsidian 문서 ref를 요구한다.
- Linear Docs와 GitHub 기술 문서를 Obsidian에 자동 복제하지 않는다.
- 문서 이동·rename 후 Logical ID 관계와 provenance를 복구한다.

### EP-018 — 외부 도구의 안전한 Write

**Outcome:** 사람이 승인한 변경만 각 도구의 소유권을 지키며 실행하고 불명확한 결과를
중복 적용하지 않는다.

#### ST-018-01 — Preview와 승인 기반 write contract

- write 전에 target, 변경 diff, source digest와 예상 효과를 보여준다.
- 승인 뒤 target이 바뀌면 stale로 중단한다.
- uncertain write를 자동 재전송하지 않는다.

#### ST-018-02 — Idempotency와 reconciliation

- provider가 지원하는 idempotency key를 Work Chain operation ID에 결속한다.
- timeout 뒤 applied·not_applied·unknown을 구분하고 unknown은 사람 확인을 요구한다.
- reconciliation 전에는 같은 operation을 다시 실행하지 않는다.

#### ST-018-03 — 도구별 write 권한과 rollback

- Blueprint가 허용한 Adapter·operation만 write할 수 있다.
- Claude reviewer는 모든 project·external write가 기계적으로 금지된다.
- rollback 가능 여부와 보상 행동을 preview하고 자동 rollback을 가장하지 않는다.

## 5. 실행 순서

```text
EP-011 follow-up Trace/Review
   ST-011-14(checkpoint) -> 15 -> 16 -> 21 -> 17 -> 19
             ST-011-14R ---------------------------> 19
                         `-> 18 -> 19
   ST-011-20 --------------------> 19 independent review
                              |
EP-012 Standard/Contract      |
   |                          |
EP-013 Work Chain ------------+
   |              |
   |              `-> EP-017 Read Adapters -> EP-018 Safe Write
   v
EP-014 Progress Model
   |
EP-015 Operations TUI <------- EP-017 live external status
   |
EP-016 Agent Revision/Token
```

첫 구현 대상은 되돌릴 수 있는 조사인 ST-011-14다. 현재 코드에 Native Plan, Todo sync,
WorkStepCard, delegation tree, ProjectActivity와 Source inspector가 있어 가장 작은 변경으로
실측한 뒤 Trace 계약을 고정할 수 있다. INIT-002의 EP-012~018은 EP-011 후속 Trace가
안정된 뒤 Story 단위로 실행한다.

### Story 선행관계

- ST-011-14 checkpoint → ST-011-15 → ST-011-16 → ST-011-21
- ST-011-21 → ST-011-17, ST-011-18 → ST-011-19
- ST-011-14R → ST-011-19
- 기존 ReviewAdapter와 Claude CLI 인증 → ST-011-20 → ST-011-19
- ST-012-01 → ST-012-02 → ST-012-03 → ST-012-04·05 → ST-012-06·08 → ST-012-07
- ST-013-01 → ST-013-02 → ST-013-03·04 → ST-013-05
- EP-012와 EP-013 → ST-014-01 → ST-014-02·03 → ST-014-04
- EP-013과 EP-014 → ST-015-01 → ST-015-02·03·04 → ST-015-05
- EP-012와 Trace Evidence → ST-016-01 → ST-016-02 → ST-016-03·04 → ST-016-05 → ST-016-06 → ST-016-07 → ST-016-08
- EP-013 → ST-017-01 → ST-017-02·03·04
- EP-017과 사람 승인 정책 → ST-018-01 → ST-018-02 → ST-018-03

### Catalog 승격 형태

사용자 수락 뒤 다음 물리 구조로 분리한다.

```text
.www/planning/002-personal-work-control-plane/
├── INITIATIVE.json   # INIT-002와 EP-012~018 relation
├── PRD.md            # 이 문서의 Initiative·문제·성공·Non-goal
└── ARCHITECTURE.md   # Workflow·정본·상태·실행기·실패 정책

.www/planning/artifacts/
├── EP-012.md ... EP-018.md
└── ST-*.md
```

EP-011 후속 Story는 INIT-002 manifest가 아니라 기존 EP-011 relation에 추가한다. 각 Story의
bullet Acceptance는 의미와 순서를 보존한 하나의 multiline acceptance body로 Catalog에
저장하며 artifact projection이 동일한 본문을 렌더링한다. 승격 자체는 별도 Todo와
Evidence를 가진 한 번의 원자적 Planning mutation으로 수행한다.

## 6. GJC 실행 계약

GJC는 한 번에 Story 하나만 받는다. 전달 packet은 다음을 포함한다.

```text
Story ID와 Acceptance
관련 Architecture 경계
소유 파일과 비소유 파일
선행 Story Evidence
중단 조건
필수 test·실행·화면 증거
```

GJC는 다음을 반환한다.

- Acceptance claim별 구현 위치
- test·실행·화면 Evidence
- 미충족 Acceptance와 blocker
- 변경 파일과 기존 사용자 변경 충돌 여부
- 사용한 모델·effort·Token·시간·재시도

GJC가 새로 쓰는 사람이 읽는 설명·절차·Evidence·오류·UI 문구는 WES `AGENTS.md`의
`Schema-EN / Prose-KO`를 따른다. machine-readable key·identifier·enum·경로·CLI 옵션·
코드 식별자와 외부 제품 이름·출처 인용문은 번역하지 않는다.

Planning 의미나 Architecture 변경이 필요하면 추측 구현하지 않고 `Planning Gap`으로
반환한다. WWW/Codex 통합자는 Gap을 계획에 반영하고 새 Story 또는 superseding Story를
만든 뒤 다시 배치한다.

## 7. 사용자 검증 항목

다음 다섯 가지는 INIT-002 전체 Catalog 승격 전에 사용자가 확정해야 한다. EP-011 후속
Story만 먼저 승격할 경우에는 5번만 선행 결정이다.

1. `비RPA`의 정본 이름을 `Product Work`로 바꿔도 되는가.
2. RPA Work의 기본 Chain은 Atlas에서 시작하되 별도 Figma Artifact 연결은 허용하는가.
3. Atlas가 개발 Definition과 Dashboard의 정본이라는 책임이 맞으며, 어떤 제품/API인가.
4. v0.2는 EP-011 후속 Trace와 EP-012 규칙 기반, v0.3는 Claude Backend EP-016으로
   제한하고 외부 Read/Write EP-017~018은 그 이후로 미룰 것인가.
5. T-note는 Chat의 `#n` 완료 기록이고 오른쪽 상단은 제목 없는 Trace·Source 영역이 맞는가.

사용자 수락 후 이 문서를 `INIT-002` Package, EP-012~018과 각 Story의 append-only
artifact로 승격한다. 수락 전에는 기존 Catalog와 immutable artifact를 변경하지 않는다.
