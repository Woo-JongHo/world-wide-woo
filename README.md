# World Wide Woo

> **프로젝트와 실행기가 바뀌어도 나의 업무 방식은 유지되는 개인화 서비스 생애주기
> Orchestration Harness.**

World Wide Woo, 줄여서 **WWW**는 기획·디자인·개발·검증·배포·운영·유지보수를 여러
AI와 도구에 배분하고, 사용자의 업무 규칙·승인·Evidence 아래 일관되게 관리하는 로컬
CLI/TUI 기반 Orchestration Harness다.

현재 버전은 Codex App Server를 사용하는 **Native Project Workbench**다. 여러 프로젝트의
Service Lifecycle과 복수 Execution Lane을 연결하는 전체 Orchestration Harness는 구현
중인 장기 제품 방향이며, 아직 완성된 기능으로 주장하지 않는다.

## 왜 WWW를 만드는가

서비스를 만들고 운영하는 일은 한 Agent 안에서 끝나지 않는다. 기획·디자인은 Figma에,
개발 정의는 Atlas에, 실행 항목과 일지는 Linear에, 코드는 GitHub에, 장기 의사결정은
Obsidian에 남는다. Codex·Claude 같은 Agent Runtime과 구독도 상황에 따라 달라진다.

문제는 도구가 많다는 사실 자체가 아니다.

- 프로젝트마다 같은 업무 규칙을 다시 설명해야 한다.
- 한 도구의 상태만 보고는 실제 업무가 어디까지 끝났는지 알기 어렵다.
- Agent가 성공했다고 말해도 완료 조건과 증거가 충분한지 따로 확인해야 한다.
- 모델·Skill·Context·effort 변경이 품질과 Token에 어떤 영향을 줬는지 비교하기 어렵다.
- 실행기나 구독을 바꾸면 계획과 진행 맥락이 함께 끊어진다.

WWW는 특정 Agent Runtime 하나에 업무 체계를 결속하지 않는다. WWW Application Runtime
위에 사용자가 소유하는 업무 규칙과 상태를 두고, 모델·Tool Loop를 담당하는 Agent
Execution Runtime은 Adapter 뒤에서 교체한다.

```text
Agent Execution Runtime 교체 가능
Model / Subscription    교체 가능
Client / Tool           교체 가능

Standard / Contract     유지
Work Chain ID           유지
Progress Model          유지
Evidence                유지
Operations TUI          유지
```

```text
현재
www -> Project Workbench -> NativeHarnessPort -> Codex App Server

목표
www -> WWW Application Runtime -> Execution Lane
                                  |- Codex Native Executor
                                  |- Pi Embedded Executor
                                  `- GJC 등 위임 Harness
```

Pi는 사용자가 별도로 실행하는 CLI가 아니다. WWW 프로세스 안에서 SDK Library로 사용하며,
제품 이름·명령·화면·업무 상태의 소유자는 계속 WWW다.

## WWW가 소유하는 것

### 일관된 업무 규칙

반복 업무를 버전이 있는 `Standard`로 정의하고, 실행 순서는 `Blueprint`, 완료 조건은
`Contract`, 프로젝트별 값과 예외는 `Project Binding`으로 분리한다. Skill은 특정 Stage를
수행하는 방법이며 Standard나 Contract를 대신하지 않는다.

### 연결된 Work Chain

각 도구의 원본 소유권은 유지하면서 하나의 업무를 Logical ID로 연결한다.

```text
Product: Figma → Atlas → Linear → GitHub → Obsidian
RPA:              Atlas → Linear → GitHub → Obsidian
```

- **Figma**: 디자인 원본
- **Atlas**: 디자인 또는 자동화 정의를 개발 항목으로 구조화
- **Linear**: 실행 항목, 진행 상태와 개발 일지
- **GitHub**: 코드, commit, PR과 check
- **Obsidian**: 장기 의사결정과 다시 사용해야 하는 지식

### 사용자의 진행 상태

WWW는 실행기의 `running`이나 `succeeded`를 그대로 업무 완료로 취급하지 않는다. 적용된
규칙, Contract 검증, 필요한 승인과 남은 Stage를 함께 보고 사용자의 `Progress Model`로
현재 상태를 판단한다.

### 관측 가능한 실행

TUI는 다음 질문에 답해야 한다.

- 지금 무엇을 하고 있는가.
- 어떤 Plan 항목이 진행 중인가.
- 그 아래 어떤 Agent·Tool·승인·결과가 실행됐는가.
- 무엇이 막혔고 다음 행동은 무엇인가.
- 완료를 뒷받침하는 Evidence가 있는가.
- Token·시간·재시도·사람 개입이 이전보다 나아졌는가.

이를 위해 화면의 책임을 나눈다.

```text
Chat    사용자와 Execution Lane의 대화 및 공개 중간 작업
Todo    활성 Run Plan의 읽기 전용 Projection
T-note  완료 질문의 질문·이유·결과와 Chat #n
Trace   선택한 Run의 Plan·Agent·Tool·승인·결과와 Source
```

### 교체 가능한 실행 Runtime

WWW 자체는 Work Chain·Workflow·승인·Projection·Evidence를 유지하는 Application Runtime을
소유한다. 복잡한 모델·Tool 반복은 Codex App Server 같은 Native Executor 또는 Pi SDK를
Library로 내장한 Embedded Executor에 맡긴다. 사용자는 어느 경우에도 `www`만 실행한다.

## WWW가 아닌 것

- Codex·Claude·Gajae Code와 경쟁하는 또 하나의 범용 Coding Agent
- 많은 Agent·Skill·Provider를 묶어 제공하는 배포판
- Figma·Linear·GitHub·Obsidian의 원본을 복제하는 중앙 데이터베이스
- 모델의 숨겨진 추론을 보여주는 관찰 도구
- 실행 성공만으로 업무 완료를 선언하는 자동화
- Pane 분할이나 화려한 Dashboard 자체를 목적으로 한 TUI

범용 Agent Runtime을 다시 만들지는 않는다. 복잡한 코딩은 Native Executor 또는 검증된
SDK 기반 Embedded Executor에 맡기고, WWW는 Stage 선택·검증·재시도·승인·완료를 조정하는
상위 Workflow를 소유한다.

## 현재 상태

현재 `v0.1.11`은 프로젝트별 Codex Native Workbench를 제공한다.

현재 사용할 수 있는 기능:

- Codex native thread 생성·선택·resume
- Chat, Todo, T-note, Trace와 실행 Activity Projection
- 모델·effort 선택과 사용량 표시
- command·approval·subagent 등 Native 실행 관측
- 프로젝트 로컬 `.www/` 작업 기록

진행 중인 다음 단계:

1. Todo·T-note·Trace의 역할과 source identity 안정화
2. Pi SDK를 Library로 내장하는 선택적 Execution Lane
3. Executor와 무관한 의미형 Event·승인·Evidence 계약
4. Standard·Blueprint·Contract와 결정론적 Validator
5. Figma·Atlas·Linear·GitHub·Obsidian Work Chain
6. Agent Revision별 Token·시간·품질 비교

현재 계획과 구현의 차이는 [제품 방향](docs/WWW_PRODUCT_DIRECTION.md)과
[기존 Control Plane 구현계획](docs/WWW_CONTROL_PLANE_PLANNING_PROPOSAL.md)에 명시한다.

## Quickstart

### 요구 사항

- Bun 1.4 이상
- Git
- Codex App Server 대화를 사용할 경우 로그인된 Codex CLI
- ANSI/UTF-8을 지원하는 Terminal

### 개발 환경에서 실행

```sh
git clone https://github.com/Woo-JongHo/world-wide-woo.git www
cd www
bun install --frozen-lockfile
bun run check
bun test
bun start
```

패키지는 현재 `private: true`이며 자동 publish를 제공하지 않는다. 작업 데이터는 실행한
프로젝트의 `.www/`에 저장되므로 설치 저장소와 작업 프로젝트를 구분해야 한다.

### 주요 명령

```text
www                         새 Codex native Workbench 실행
www threads                 현재 프로젝트의 native thread 목록
www --resume                native thread를 선택해 재개
www --resume <thread-id>    지정한 native thread 재개
www auth status             모델 인증 상태 확인
```

Workbench 안에서는 `/model`, `/source`, `/tnote`, `/approve`, `/decline`, `/cancel`,
`/exit`을 사용할 수 있다. 전체 설치·업데이트·롤백 절차는
[릴리스 절차](docs/RELEASE_V010.md)를 따른다.

## 설계 원칙

- **WWW owns the lifecycle**: 실행기가 바뀌어도 Workflow·승인·상태·Evidence의 의미를 유지한다.
- **Native default, Embedded measured**: 현재는 Codex Native를 기본으로 두고 Pi 내장은 contract와 실측을 통과한 기능부터 맡긴다.
- **Evidence before completion**: 실행 성공과 업무 수락을 분리한다.
- **Observed before inferred**: 관측하지 않은 관계를 사실처럼 표시하지 않는다.
- **One owner per truth**: 도구별 원본 소유권을 유지하고 참조로 연결한다.
- **Schema-EN / Prose-KO**: 기계가 읽는 값은 영어, 사람이 읽는 설명과 UI는 한국어로 쓴다.
- **Human authority**: 자동화가 제안하고 검증해도 최종 승인 권한은 사람이 가진다.

## 문서

- [제품 방향과 Agent 실행 경계](docs/WWW_PRODUCT_DIRECTION.md)
- [서비스 생애주기 Harness의 기존 Control Plane 구현계획](docs/WWW_CONTROL_PLANE_PLANNING_PROPOSAL.md)
- [오픈소스 제품과 WWW의 경계](docs/OSS_POSITIONING.md)
- [Agent TUI 비교](docs/TUI_COMPARISON.md)
- [기능별 TUI 코드 구성표](docs/TUI_CODE_MATRIX.md)
- [README 구성 조사](docs/README_STRUCTURE_RESEARCH.md)
- [릴리스 절차](docs/RELEASE_V010.md)

## 개발 검증

```sh
bun run check
bun test
bun run release:gate -- --platform-check
```

이 저장소는 기존 dirty worktree와 로컬 Evidence를 자동으로 정리하지 않는다. `PASS`,
`BLOCKED`, `PARTIAL`을 구분하고 관측하지 않은 결과를 추정값으로 채우지 않는다.

## 라이선스와 배포

현재 저장소에는 공개 배포용 라이선스가 정해져 있지 않으며 npm package도 private이다.
라이선스와 외부 배포 정책이 확정되기 전에는 공개 사용 조건을 가정하지 않는다.
