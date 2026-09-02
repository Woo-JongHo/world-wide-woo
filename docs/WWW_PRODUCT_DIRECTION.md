# WWW 제품 방향과 Agent 실행 경계

- 상태: 장기 제품 방향
- 기준일: 2026-09-02
- 현재 구현 범위: 프로젝트별 Codex Native Workbench
- 장기 범위: 개인용 멀티프로젝트 업무 Control Plane

## 목적

WWW의 목적은 사용자의 반복 업무 방식을 코드화하고 여러 프로젝트에 일관되게
적용하며, 각 프로젝트의 진행상황을 사용자가 자기 업무 기준으로 정의·판단하는
TUI에서 파악하고, 실행 결과와 Token 성과를 근거로 그 방식을 계속 개선하는 것이다.

> **WWW는 반복 업무를 버전이 있는 Standard와 프로젝트별 Binding으로 구성하고,
> Native Executor와 선택적 Direct Executor로 실행하며, Contract·Logical ID·Validator로
> 결과를 검증하고, 사용자가 정의한 Progress Model과 Operations TUI로 여러 프로젝트의
> 현재 위치를 파악하며, Agent Revision별 성과를 학습하는 개인용 멀티프로젝트
> Workbench다.**

WWW의 차별점은 Pane, TUI 외형, Skill 개수 또는 Agent Loop 보유 자체가 아니다. 여러
프로젝트에 같은 업무 의미를 유지하고, 그 의미에 맞는 진행상황을 사용자가 직접
정의하며, 다음 다섯 가지를 한 운영 이력으로 연결하는 것이 핵심이다.

1. 어떤 Standard와 Project Binding을 적용했는가.
2. 어떤 Agent Revision·Skill·모델·실행기로 수행했는가.
3. 결과가 Contract와 Logical ID 규칙을 만족했는가.
4. Token·시간·재시도·사람 개입·품질이 이전 실행보다 나아졌는가.
5. 지금 어디까지 왔고, 무엇이 막혔으며, 다음에 무엇을 해야 하는가.

## 여섯 층

```text
Standard / Blueprint
        |
        v
Project Binding + Logical ID
        |
        v
WWW Workflow Loop
        |
        +-- Codex App Server       [기본 Native Executor]
        +-- Claude read-only       [독립 검토]
        +-- Script / RPA           [결정론적 실행]
        +-- Direct one-shot        [제한된 정형 생성]
        `-- future Direct Loop     [증명된 요구에만]
        |
        v
Contract Validator
        |
        v
Evidence + Token Tuning
        |
        v
Progress Model + Operations TUI
```

### Standard와 Blueprint

Standard는 여러 프로젝트에 반복 적용하는 버전이 있는 규칙이다. Blueprint는 그
Standard를 단계·입력·산출물·승인으로 실행할 수 있게 만든 형태다. Skill은 Blueprint의
일부 Stage에서 수행 방법을 제공하지만 Standard나 Contract를 대신하지 않는다.

### Project Binding과 Logical ID

Project Binding은 공통 Standard에 프로젝트별 값, 허용된 예외, 외부 Artifact 참조를
결속한다. WWW의 Logical ID와 Figma·Linear·GitHub 같은 외부 시스템이 발급한 ID는
합치지 않고 명시적으로 매핑한다.

```text
Definition ID:          figma.design-system@3
Project Instance ID:    atlas.figma.design-system
External Artifact ID:   provider가 발급한 opaque ID
```

### Workflow Loop

WWW의 핵심 Loop는 모델과 Tool 사이의 내부 반복이 아니라 업무 Stage 사이의 상위
반복이다.

```text
Stage 선택
-> 실행기 배치
-> 실행
-> Contract 검증
-> 통과 / 재시도 / 모델 승격 / 사람 승인 / 중단
-> 다음 Stage
```

### Validator

엄격한 규칙은 자연어 Skill에만 맡기지 않는다. 구조·ID·허용값·필수 관계·완료 조건은
기계가 읽는 Contract와 결정론적 Validator가 소유한다. Agent의 중간 자가검사는
피드백일 뿐 최종 Gate를 대신하지 않는다.

### Evidence와 Token Tuning

Token Tuning은 Token 최소화만 뜻하지 않는다. Agent Revision별로 다음 값을 함께
비교한다.

- 총 Token과 Stage별 관측 증분
- 완료 시간
- 모델 호출과 Tool 재시도 수
- 사람 개입과 승인 수
- Validator 결과
- 최종 품질과 업무 수락

관측값, 파생값, 추정값은 구분한다. App Server가 제공하지 않은 내부 Prompt 구성별
Token을 실제값처럼 기록하지 않는다.

### Progress Model과 Operations TUI

Progress Model은 실행기의 상태를 그대로 보여주는 것이 아니라 사용자가 자신의 업무에서
무엇을 시작·진행·대기·위험·완료로 볼지 정의하는 체계다. 같은 Native status라도 적용된
Standard, Contract 검증, 필요한 승인, 남은 Stage에 따라 WWW의 진행 판정은 달라질 수
있다.

Operations TUI는 이 Progress Model을 여러 프로젝트에 걸쳐 한눈에 파악하고 조작하는
핵심 제품 표면이다. 사용자는 여기서 최소한 다음 질문에 답할 수 있어야 한다.

- 지금 어떤 프로젝트와 업무가 진행 중인가.
- 각 업무는 사용자가 정의한 기준에서 어느 단계인가.
- 완료를 주장할 근거와 검증 결과가 있는가.
- 무엇이 막혀 있고 누구의 판단이나 승인이 필요한가.
- 다음 행동은 무엇이며 어떤 실행기에 맡길 것인가.

따라서 Pane 분할이나 Native 로그 표시는 기반 기능일 뿐이다. WWW가 소유하는 가치는
서로 다른 실행기 이벤트를 사용자 정의 업무 상태로 해석하고, 그 판정 근거와 다음 행동을
같은 TUI에 연결하는 데 있다.

## Codex CLI, Codex App Server, 모델의 관계

Codex CLI는 사람이 사용하는 공식 TUI다. Codex App Server는 WWW 같은 별도
클라이언트가 Codex의 thread·turn·item·Tool·승인·Session을 구조화된 프로토콜로
사용하는 로컬 실행 표면이다. 일반 로컬 CLI와 App Server는 Codex Core를 공유하지만,
CLI가 항상 별도 App Server 프로세스에 접속한다고 가정하지 않는다.

```text
                         Codex Core
              model / tool / session / sandbox
                       /              \
                      /                \
             Codex CLI TUI        Codex App Server
                                       |
                                       v
                                      WWW
```

App Server는 단순 Prompt 전달기가 아니다. WWW가 원문을 보내도 Codex가 자기 시스템
지침·프로젝트 규칙·Skill·Tool·Context 관리와 Native Execution Loop를 적용한다.

## Skill, Tool, Loop, Contract의 차이

| 개념 | 소유하는 질문 |
| --- | --- |
| Skill | 이 업무를 어떻게 수행하는가 |
| Tool | 외부 세계에 어떤 동작을 수행하는가 |
| Native Execution Loop | 모델 판단과 Tool 결과를 누가 완료까지 반복하는가 |
| Workflow Loop | 어떤 Stage·실행기·검증·승인 순서로 업무를 끝내는가 |
| Contract | 결과가 반드시 무엇을 만족해야 하는가 |
| Validator | Contract 준수를 누가 독립적으로 판정하는가 |

WWW가 Validator Tool을 구현해 Codex에 제공해도 Tool 구현만 WWW가 소유하고 모델과
Tool 사이의 반복은 Codex가 소유할 수 있다. Codex turn 뒤 WWW가 Validator를 강제로
실행하고 실패 보고서로 repair Stage를 만드는 경우에는 WWW가 Workflow Loop를
소유하지만 범용 Agent Runtime을 소유하는 것은 아니다.

WWW가 Provider를 직접 호출하고 Tool call을 해석·실행하며 결과를 다시 모델에 넣는
반복까지 수행할 때만 Direct Agent Loop를 소유한다고 부른다.

## 실행기 전략

### Native Executor를 기본으로 둔다

복잡한 코딩 작업은 Codex App Server를 기본 실행기로 둔다. 다음 책임을 검증된 Native
의미로 재사용하기 위해서다.

- 모델 인증과 구독 경로
- thread·turn·item과 resume
- Tool 실행과 streamed event
- 승인과 Sandbox
- Skill과 프로젝트 규칙
- Context 관리와 복구
- 모델별 Codex 최적화

WWW는 Native Executor 바깥에서 Blueprint, Project Binding, Workflow, Validator,
Evidence와 Token Tuning을 소유한다.

### Direct one-shot은 좁게 사용한다

정형 분류·요약·T-note·Contract 위반 요약처럼 Tool이 없고 출력 Schema와 종료가
명확한 작업은 Direct one-shot이 더 작고 측정 가능하다. 이는 Native Chat 경로를
대체하지 않는다.

### Direct Agent Loop는 조건부다

다음 요구가 반복 실행 증거로 확인될 때만 별도 Execution Adapter로 검토한다.

1. Native Executor로는 필요한 Tool 의미나 종료 조건을 표현할 수 없다.
2. Provider가 달라도 동일한 Tool·Session 의미를 WWW가 보장해야 한다.
3. Skill·Context·Tool schema별 정밀 Token attribution이 제품 핵심이다.
4. Native 내부 동작 때문에 같은 품질 문제가 반복된다.
5. 자체 보안·승인·복구 유지비보다 얻는 가치가 크다.

Direct Agent Loop가 추가돼도 WWW의 중심은 Runtime이 아니라 Standard·Binding·Workflow·
Validation·Optimization이다.

## Tool 소유 경계

| 책임 | 기본 소유자 |
| --- | --- |
| 일반 파일 읽기·편집 | Native Executor |
| Shell·프로세스·Sandbox | Native Executor |
| 기본 코딩 Tool Loop | Native Executor |
| Figma·Linear 등 업무 의미를 가진 Tool | WWW |
| Standard와 Project Binding | WWW |
| Logical ID 발급과 외부 ID 매핑 | WWW |
| Contract Validator와 완료 Gate | WWW |
| Stage 전환·재시도·승격·사람 승인 | WWW Workflow Loop |
| Agent Revision·Token·성과 비교 | WWW |

업무 Tool은 MCP나 Adapter로 Native Executor에 제공할 수 있다. Tool 구현을 WWW가
소유한다는 사실과 Agent Loop를 WWW가 소유한다는 사실은 같지 않다.

## 모델 호출과 튜닝

Sol·Terra·Luna 선택은 Direct 호출만의 기능이 아니다. Codex App Server에서도 turn마다
지원되는 모델과 reasoning effort를 지정할 수 있다. 직접 호출의 차이는 모델 선택이
아니라 모델에 들어가는 최종 Context, Tool schema, 재호출, 압축, 종료를 누가 소유하는가다.

WWW가 우선 소유할 튜닝은 모델 weight 학습이 아니라 다음 정책의 최적화다.

```text
업무 유형
-> Agent Revision
-> Stage
-> 실행기
-> 모델과 effort
-> Skill과 Context
-> Token budget
-> 완료 Contract
```

복잡한 코딩은 Native Executor에 맡기고, 작고 정형화된 작업만 Direct 호출로 정밀
측정한다. 모델 내부를 보지 못하는 한계를 추정값으로 덮지 않는다.

## Senpi·GJC와의 공통점과 차이

세 제품 모두 독립 CLI/TUI, Skill·Tool·Workflow, Session과 실행 관찰을 제공할 수 있다.
차이는 무엇을 최상위 최적화 단위로 삼는가다.

| 축 | Senpi | GJC | WWW |
| --- | --- | --- | --- |
| 정체성 | 범용 Agent Runtime | 검증 가능한 코딩 Harness | 개인 업무 Control Plane |
| 핵심 목적 | 모델과 Tool 실행 최적화 | 코딩 작업의 계획·완료·증거 | 여러 프로젝트의 업무 표준·진행 파악·검증·개선 |
| 기본 Loop | 자체 모델↔Tool Loop | 자체 모델↔Tool Loop와 코딩 Workflow | Stage·실행기·검증 사이 Workflow Loop |
| 실행 엔진 | 자체 | 자체 | Native 우선, Direct는 선택적 |
| 핵심 단위 | Session·Turn·Tool | Interview·Plan·Goal·Evidence | Standard·Binding·Progress Model·Agent Revision·Run |
| 엄격한 반복성 | Runtime 동작 | Goal과 Evidence | Contract·Logical ID·Validator |
| 튜닝 대상 | Prompt·Provider·Tool·압축 | 계획·Agent·Goal Workflow | 업무·Stage·Skill·모델·실행기·예산 |
| 장기 학습 | Runtime 개선 | Harness 품질 개선 | 프로젝트 간 개인 업무 체계 개선 |

```text
Senpi = 실행 최적화
GJC   = 코딩 작업 완료 최적화
WWW   = 개인 업무 시스템 운영과 최적화
```

WWW가 범용 Provider SDK, Tool-call parser, compaction, shell sandbox, 일반 파일 편집기를
제품 중심으로 재구현하면 Senpi와 직접 중복된다. Interview→Plan→Implement→Verify만
제품 중심으로 만들면 GJC와 차이가 약해진다. WWW는 멀티프로젝트 Standard, Project
Binding, Logical ID, Validator, 실행기 교체 가능성, Agent Revision의 장기 성과를
중심에 둔다.

## 현재 단계와 장기 단계

### 현재 v0.1.x

- Codex App Server 기반 Native Project Workbench
- Chat·T-notes·Todo와 ProjectActivity projection
- 승인·resume·취소·사용량 관찰
- 제한된 Direct one-shot과 읽기 전용 외부 검토

### 다음 제품 단계

- Standard Catalog와 Blueprint
- Project Binding과 Logical ID Registry
- Agent Revision과 Stage 정의
- Contract Validator와 완료 Gate
- Agent·Stage·Skill·모델별 Evidence와 Token 비교
- 사용자 정의 Progress Model과 멀티프로젝트 Operations TUI

### 조건부 후속 단계

- 여러 Native Executor Adapter
- 사용자 업무 Tool과 RPA
- Native로 충족되지 않는 좁은 Direct Agent Loop

## 제품 경계 판별 질문

다음 질문으로 WWW가 Native Companion에 머무르는지 독립 Control Plane이 되는지
판별한다.

> Codex를 다른 실행기로 바꿔도 Standard·Project Binding·Logical ID·Contract·Progress
> Model·Run Evidence·Agent Revision 성과가 같은 의미로 남는가?

남는다면 WWW가 독립적으로 업무 의미를 소유한다. 대부분 사라진다면 WWW는 Codex 전용
Companion에 가깝다.
