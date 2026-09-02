# World Wide Woo

> **프로젝트와 Agent가 바뀌어도 나의 업무 방식은 바뀌지 않는 개인용 Engineering
> Control Plane.**

World Wide Woo, 줄여서 **WWW**는 여러 프로젝트의 개발 업무를 같은 규칙으로 운영하고,
진행 상태·연결 관계·검증 증거를 사용자의 기준으로 파악하기 위한 로컬 CLI/TUI다.

현재 버전은 Codex App Server를 사용하는 **Native Project Workbench**다. 여러 프로젝트와
Provider를 연결하는 전체 Control Plane은 구현 중인 장기 제품 방향이며, 아직 완성된
기능으로 주장하지 않는다.

## 왜 WWW를 만드는가

개발 업무는 한 Agent 안에서 끝나지 않는다. 디자인은 Figma에, 개발 정의는 Atlas에,
실행 항목과 일지는 Linear에, 코드는 GitHub에, 장기 의사결정은 Obsidian에 남는다.
Codex·Claude 같은 Agent Runtime과 구독도 상황에 따라 달라진다.

문제는 도구가 많다는 사실 자체가 아니다.

- 프로젝트마다 같은 업무 규칙을 다시 설명해야 한다.
- 한 도구의 상태만 보고는 실제 업무가 어디까지 끝났는지 알기 어렵다.
- Agent가 성공했다고 말해도 완료 조건과 증거가 충분한지 따로 확인해야 한다.
- 모델·Skill·Context·effort 변경이 품질과 Token에 어떤 영향을 줬는지 비교하기 어렵다.
- 실행기나 구독을 바꾸면 계획과 진행 맥락이 함께 끊어진다.

WWW는 Agent Runtime을 하나 더 만드는 것으로 이 문제를 해결하지 않는다. 교체 가능한
Runtime 위에 사용자가 소유하는 업무 규칙과 상태 체계를 둔다.

```text
Agent Runtime          교체 가능
Model / Subscription   교체 가능
Client / Tool          교체 가능

Standard / Contract    유지
Work Chain ID          유지
Progress Model         유지
Evidence               유지
Operations TUI         유지
```

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
Chat   대화와 질문별 완료 기록 #n
Todo   Native Plan의 사용자용 Projection
Trace  Plan 아래에서 관측된 Agent·Tool·승인·결과와 Source
```

## WWW가 아닌 것

- Codex·Claude·Gajae Code를 대체하는 범용 Coding Agent Runtime
- 많은 Agent·Skill·Provider를 묶어 제공하는 배포판
- Figma·Linear·GitHub·Obsidian의 원본을 복제하는 중앙 데이터베이스
- 모델의 숨겨진 추론을 보여주는 관찰 도구
- 실행 성공만으로 업무 완료를 선언하는 자동화
- Pane 분할이나 화려한 Dashboard 자체를 목적으로 한 TUI

필요성이 실제로 입증되기 전에는 범용 Agent Loop를 직접 소유하지 않는다. 복잡한 코딩은
Codex App Server나 Claude Code 같은 Native Executor에 맡기고, WWW는 Stage 선택·검증·
재시도·승인·완료를 조정하는 상위 Workflow를 소유한다.

## 현재 상태

현재 `v0.1.12`는 프로젝트별 Codex Native Workbench를 제공한다.

현재 사용할 수 있는 기능:

- Codex native thread 생성·선택·resume
- Chat, Todo, T-note와 실행 Activity Projection
- 모델·effort 선택과 사용량 표시
- command·approval·subagent 등 Native 실행 관측
- 프로젝트 로컬 `.www/` 작업 기록

진행 중인 다음 단계:

1. Native Plan 항목의 안정적인 identity
2. Phase Todo와 선택 항목 기반 Trace
3. Standard·Blueprint·Contract와 결정론적 Validator
4. Figma·Atlas·Linear·GitHub·Obsidian Work Chain
5. Codex·Claude Native Executor 선택과 명시적 handoff
6. Agent Revision별 Token·시간·품질 비교

현재 계획과 구현의 차이는 [제품 방향](docs/WWW_PRODUCT_DIRECTION.md)과
[Control Plane 구현계획](docs/WWW_CONTROL_PLANE_PLANNING_PROPOSAL.md)에 명시한다.

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

- **Native first**: 검증된 Native Runtime 기능을 기본으로 사용한다.
- **Evidence before completion**: 실행 성공과 업무 수락을 분리한다.
- **Observed before inferred**: 관측하지 않은 관계를 사실처럼 표시하지 않는다.
- **One owner per truth**: 도구별 원본 소유권을 유지하고 참조로 연결한다.
- **Schema-EN / Prose-KO**: 기계가 읽는 값은 영어, 사람이 읽는 설명과 UI는 한국어로 쓴다.
- **Human authority**: 자동화가 제안하고 검증해도 최종 승인 권한은 사람이 가진다.

## 문서

- [제품 방향과 Agent 실행 경계](docs/WWW_PRODUCT_DIRECTION.md)
- [개인 업무 Control Plane 구현계획](docs/WWW_CONTROL_PLANE_PLANNING_PROPOSAL.md)
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
