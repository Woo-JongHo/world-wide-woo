# Oh My Codex·Oh My OpenAgent와 WWW의 제품 경계

조사 기준: 2026-09-01.

- Oh My Codex(OMX): `Yeachan-Heo/oh-my-codex` `8513abf70609061770a97100ef8964c8ebb40700`
- Oh My OpenAgent(OMO): `code-yeongyu/oh-my-openagent` `57c7b1fbb2174690f4c823d9b15766212c623c0c`
- 이름이 같은 포크와 별도 프로젝트가 있으므로 위 정본만 비교한다.

## 한 문장 구분

- **OMX는 Codex가 일하는 방식을 강화한다.**
- **OMO는 여러 에이전트와 모델의 실행을 오케스트레이션한다.**
- **WWW는 사용자의 반복 업무 Standard를 여러 프로젝트에 적용하고, 진행상황을 사용자가 정의한 Progress Model과 Operations TUI로 파악하며, 네이티브 실행 결과를 Contract로 검증해 Agent Revision과 Token 성과를 개선하는 개인 Control Plane이다.**

WWW의 현재 v0.1 구현은 Native Project Workbench이고 위 문장은 장기 제품 방향이다.
Standard·Project Binding·Logical ID·Validator·Native/Direct 실행 경계의 상세 정본은
[WWW 제품 방향과 Agent 실행 경계](./WWW_PRODUCT_DIRECTION.md)를 따른다.

## 제품 경계 비교

| 축 | Oh My Codex (현행) | Oh My OpenAgent (현행) | WWW 목표 (v0.1 미도달) |
|---|---|---|---|
| 제품 형태 | Codex CLI workflow layer (실행 엔진은 Codex 유지) | OpenCode·Codex plugin 제품군 + standalone edition(Senpi) | 독립 로컬 TUI 애플리케이션 |
| 실제 실행 엔진 | Codex | Ultimate는 OpenCode, Light는 Codex, Senpi는 bundled engine | Codex App Server·Claude Code 같은 네이티브 실행기 |
| 주된 문제 | 계획·역할·팀·검증·완주 workflow | 다중 agent/model orchestration과 도구 확장 | 멀티프로젝트 업무 표준·진행 파악·검증·Agent Revision 최적화 |
| UI | Codex TUI + tmux/HUD | host UI + tmux team view | 사용자 정의 Progress Model을 표현하는 Operations TUI |
| 주된 상태 | `.omx/`의 계획·로그·memory·mode | agent/team/goal/plugin 설정과 host session | ProjectActivity, Chat projection, T-notes, Todo.md |
| 모델 전환 | Codex 범위 | provider/model routing이 핵심 | 네이티브 세션 사이의 명시적 handoff |
| 확장 방향 | Codex를 더 강하게 사용 | 여러 harness에서 같은 orchestration 재사용 | Standard·Binding·Validator를 유지하며 Native/Direct 실행기를 교체 |

이 표의 WWW 열은 목표 상태다. 현재 코드에는 자체 `SessionRuntime`과 `ModelRouter`가 있어 모델 전환과 실행 책임의 경계는 아직 이 목표에 도달하지 않았다. 아래 「현재 코드에 대한 경고」를 함께 읽어야 한다.

OMX는 스스로를 Codex CLI의 workflow layer로 정의하며 Codex를 실행 엔진으로 유지한다. 역할, skills, hooks, 팀 실행, HUD, `AGENTS.md`, `.omx/` 상태를 추가한다. ([README](https://github.com/Yeachan-Heo/oh-my-codex/blob/8513abf70609061770a97100ef8964c8ebb40700/README.md#L201-L215), [mental model](https://github.com/Yeachan-Heo/oh-my-codex/blob/8513abf70609061770a97100ef8964c8ebb40700/README.md#L387-L398))

OMO는 세 edition을 제공한다. Ultimate와 Light는 각각 OpenCode와 Codex에 들어가는 plugin이고, Senpi만 standalone engine을 번들한다. Ultimate는 agent, lifecycle hook, MCP, Team Mode, LSP/AST 도구를 소유하며, Codex Light는 Codex의 네이티브 협업 표면에 맞는 portable component만 이식한다. ([edition 구조](https://github.com/code-yeongyu/oh-my-openagent/blob/57c7b1fbb2174690f4c823d9b15766212c623c0c/README.md#L114-L139), [Team Mode](https://github.com/code-yeongyu/oh-my-openagent/blob/57c7b1fbb2174690f4c823d9b15766212c623c0c/README.md#L268-L280))

## 겹치는 영역과 피해야 할 복제

WWW가 다음을 제품 중심으로 만들면 OMX·OMO와 직접 중복된다.

- specialist agent catalog와 model matching
- `ultrawork` 같은 자동 완주 loop
- planner/reviewer/executor workflow engine
- team process orchestration과 agent 통신
- 대규모 hook·skill·MCP 배포판
- 공통 tool loop와 provider별 인증/runtime

검토한 공식 문서에서 다음 영역을 OMX·OMO의 제품 중심으로 선언한 근거는 확인되지 않았다. 이것들이 WWW가 방어할 수 있는 핵심 차별점이다.

- 서로 다른 native harness event를 한 Chat timeline으로 정규화
- 구독 변화에 따른 Codex↔Claude 명시적 handoff
- 여러 프로젝트에 같은 버전의 Standard와 Project Binding 적용
- Logical ID와 외부 Artifact ID의 명시적 매핑
- Agent의 완료 주장과 독립된 Contract Validator
- Agent Revision별 Token·시간·재시도·사람 개입·품질 비교
- 프로젝트별 실행기 상태를 사용자 정의 Progress Model로 해석하는 Operations TUI

### 겹치지만 소유 형태가 다른 영역

- 프로젝트 TUI와 화면 전환
- T-notes·Todo·memory와 project-local 기록
- HUD와 실행 관찰

`.omx/`도 계획·로그·memory를 project-local로 남기며 OMO도 Todo, Goal, HUD, team view를 제공한다. 따라서 TUI, Todo, 로컬 기록 보유 자체는 차별점이 아니다. WWW의 설계 의도는 이 데이터를 특정 workflow가 아니라 사용자가 소유하는 공통 project journal로 만드는 것이지만, 이 스키마 소유권은 구현과 사용자 검증으로 입증해야 한다.

따라서 차별점은 개별 기능이 아니라 **이종 실행기의 기록을 프로젝트 간 동일한 Standard·Binding·Contract 의미로 정규화하고, 사용자가 정의한 Progress Model로 현재 위치와 다음 행동을 보여주며, 검증 결과와 Agent Revision 성과를 다음 실행 정책에 재사용하는 결합**이다. 나머지 항목은 차별점이 아니라 구현 선택으로 취급한다.

## 현재 코드에 대한 경고

현재 WWW에는 자체 [`SessionRuntime`](../src/application/session-runtime.ts#L241)과 [`ModelRouter`](../src/infrastructure/model-router.ts#L51)가 있어 작은 agent harness의 책임까지 가진다. 이 방향을 확대하면 OMO와 차이가 줄어든다.

반면 프로젝트별 [workspace](../src/infrastructure/project-workspace.ts#L107), [Todo 저장](../src/infrastructure/todo-store.ts#L10), [Workbench projection](../src/presentation/tui/workbench-views.ts), [Todo projection](../src/presentation/tui/shared-dashboard-views.ts)은 WWW의 고유 방향과 일치한다.

차별점을 지키려면 주 작성 경로의 agent loop는 native harness adapter 뒤로 넘기고, WWW가 소유할 것은 다음으로 제한한다.

```text
WWW TUI + ProjectActivity
├── Chat / T-notes / Todo projection
├── Harness 선택과 handoff
└── HarnessAdapter
    ├── Codex App Server
    ├── Claude Code
    └── future: OpenCode / standalone runtime
```

## 경쟁보다 조합에 가까운 관계

- OMX는 Codex 쪽의 선택적 workflow pack 후보다.
- OMO Light도 Codex 쪽의 선택적 plugin 후보다.
- OMO Ultimate를 사용하려면 향후 OpenCode adapter가 필요하다.
- OMO Senpi는 bundled engine이므로 plugin이 아니라 별도 harness adapter 대상이며, v0.1 범위 밖이다.
- WWW는 이들의 화면을 복제하지 않고, 실행 결과를 project journal로 수집·표시할 수 있다.

Codex App Server가 OMX·OMO Light의 모든 hook/plugin 동작을 동일하게 노출하는지는 별도 호환성 검증 전에는 보장하지 않는다.

## 결론

WWW의 경쟁력은 더 많은 agent와 workflow를 내장하는 것이 아니다. **어떤 실행기를 사용하더라도 여러 프로젝트의 Standard·Binding·Logical ID·검증 증거와 Agent Revision 성과가 같은 의미로 남는 것**이 차별점이다.

v0.1에서는 agent orchestration framework를 추가하지 않고 Codex App Server adapter와 WWW의 세 projection을 완성한다. Claude Code adapter와 native session handoff가 다음 확장이고, 자체 agent runtime은 native 실행기로는 충족할 수 없는 요구가 실측된 뒤에만 검토한다.

외부 인용의 줄 범위는 2026-09-01 수집 시점의 위 고정 SHA를 기준으로 한다. 제품이 빠르게 변경되고 있으므로 이후 판단에서는 정본의 새 revision을 다시 확인한다.
