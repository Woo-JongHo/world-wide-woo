# Senpi·Gajae Code 저장소 구조 조사

이 문서는 조사 시점의 소스 관측과 당시 설계 제안을 보존한다. WWW에 대한 구조 권고는 승인된 목표가 아니며, 현재 목표 논의는 [개발 아키텍처 초안](../../docs/planning/linear-development/ARCHITECTURE.md)을 따른다.

- 조사일: 2026-09-05 (Asia/Seoul)
- Senpi: [`339776f`](https://github.com/code-yeongyu/senpi/tree/339776fd94b8ebe67f8146efffd4e6b9166db8d9)
- Gajae Code (GJC): [`9d2176a`](https://github.com/Yeachan-Heo/gajae-code/tree/9d2176a04291e9126b053786b84676881941174c)
- 방법: 각 저장소의 해당 커밋을 shallow clone해 패키지 manifest·진입점·의존성을 확인했다. README 검색 결과만 근거로 삼지 않았다.

## 결론

두 프로젝트 모두 **재사용 가능한 agent platform**과 **사용자-facing coding-agent product**를 분리한다. 그러나 제품 내부까지 `domain → application → infrastructure → presentation`처럼 엄격히 나누지는 않는다.

- **Senpi**는 Pi 계열의 비교적 정돈된 수평 platform monorepo다. `ai`, `agent`, `tui`를 독립 패키지로 유지하고, `coding-agent`가 CLI·session·tool·extension·mode를 통합한다.
- **GJC**는 같은 platform 분리는 두되, workflow와 외부 제어까지 가진 대형 harness를 `packages/coding-agent/src/` 안에 응집한다. 제품 기능의 발견성은 강하지만, `coding-agent` 하위의 개념 축은 넓다.
- 둘 다 project-work, approval, evidence, acceptance 같은 업무 도메인을 갖지 않는다. 따라서 WWW의 업무 제어면을 이들의 폴더 구조로 그대로 대체할 근거는 없다.

## Senpi

```text
packages/
  telemetry/              # 관측 계약·스키마
  ai/                     # provider/auth/stream/model 경계
  agent/                  # turn loop, agent state, attachment
  tui/                    # terminal component·renderer
  protocol/               # 원격 session CBOR protocol
  client/                 # protocol 기반 remote client
  pty/                    # persistent terminal
  session-backends/sqlite-node/
  coding-agent/           # senpi CLI product
    src/core/             # session, config, tool, extension runtime
    src/modes/            # interactive · print · RPC · app-server
    src/extensions/       # product-local extension entry
  senpi-codemode/         # 별도 source-only extension
  server/, evals/
```

주 의존 경로는 다음과 같다. `coding-agent`는 `ai`, `agent`, `tui`, `protocol`, `client`, `pty`를 조립한다. `agent`는 `ai`와 `telemetry`에 의존하고, `tui`는 독립적이다. SQLite session backend는 선택 패키지로 둬 core agent가 Node SQLite를 강제로 끌고 오지 않게 한다.

```text
telemetry ← ai ← agent ┐
protocol  ← client     ├─ coding-agent (Senpi product)
tui ───────────────────┤
pty ───────────────────┘
```

이 구조의 핵심은 extension-first다. permission, goal, todo, compaction 같은 Senpi의 정책 기능 대부분이 `coding-agent/src/core/extensions/builtin/` 아래의 builtin extension으로 배치된다. upstream Pi 변경은 각 변경 지점의 `changes.md`에 남긴다. [Senpi README](https://github.com/code-yeongyu/senpi/blob/339776fd94b8ebe67f8146efffd4e6b9166db8d9/README.md#L397-L414)

단, `core`라는 이름을 순수 도메인 계층으로 읽으면 안 된다. 예를 들어 `core/agent-session.ts`는 interactive theme를 직접 import한다. 즉 package 경계(`ai`/`agent`/`tui`)는 유의미하지만, `coding-agent` 내부의 `core → modes` 의존 방향까지 강제하는 구조는 아니다.

## Gajae Code

```text
packages/
  natives/ + platform binary packages # Rust/N-API capability
  utils/                              # process, fs, prompt 등 공통 util
  ai/                                 # model/provider/auth/stream
  agent/                              # Agent loop와 state
  tui/                                # differential terminal UI framework
  stats/                              # local usage dashboard
  coding-agent/                       # gjc CLI와 product runtime
    src/sdk/                          # session 조립 및 broker transport
    src/session/ config/ tools/       # agent 실행 환경
    src/modes/ tui/                   # interactive/print/ACP 화면
    src/workflow/ skill-state/        # workflow 상태와 HUD projection
    src/task/ coordinator*/           # 역할 agent와 외부 controller
    src/extensibility/ customization/ # skills/hooks/plugins/MCP
    src/defaults/gjc/                 # source-bundled workflow skills
```

의존 관계는 `coding-agent`가 `agent-core`, `ai`, `tui`, `stats`, `utils`, `natives`를 조립하는 product shell이다. `agent-core`는 `ai`를, `ai`와 `tui`는 `utils`·`natives`를 사용한다. GJC 공식 overview도 정상 CLI 흐름을 `cli.ts → main.ts → sdk/session.ts → agent-core → selected mode`로 설명한다. [GJC codebase overview](https://github.com/Yeachan-Heo/gajae-code/blob/9d2176a04291e9126b053786b84676881941174c/docs/codebase-overview.md)

GJC의 distinctive point는 workflow가 별도 업무 도메인 패키지가 아니라 coding harness 내부 기능이라는 점이다. 기본 workflow skills와 public task-agent prompts는 소스에 embed되고, run-time artifact/spec/plan/goal은 대상 프로젝트의 `.gjc/`에 저장된다. [GJC product shape](https://github.com/Yeachan-Heo/gajae-code/blob/9d2176a04291e9126b053786b84676881941174c/docs/codebase-overview.md#L5-L20)

따라서 GJC `coding-agent/src/`에는 workflow 외에도 tools, SDK, session, MCP, TUI, agent delegation, hooks, memory, LSP, web이 모두 sibling으로 있다. 이것은 “coding agent harness 하나”의 응집도를 우선한 선택이며, 일반 business domain의 코드 배치 기준으로 복제하면 거대한 app-core가 될 위험이 있다.

## WWW 구조 재편에 가져갈 원칙

1. **Senpi처럼 기술 platform과 제품 정책을 분리한다.** executor/model session/TUI engine처럼 다른 제품에서도 재사용 가능한 것은 runtime platform으로, contract/evidence/approval/progress는 제품 도메인으로 둔다.
2. **GJC처럼 workflow의 상태 projection은 한 곳에서 소유한다.** 단, WWW에서는 `work` lifecycle과 실행 journal을 같은 구현 폴더에 섞지 말고 `application`이 둘을 조립하게 한다.
3. **`shared/`를 도메인 우회로로 만들지 않는다.** 두 프로젝트의 shared util은 prompt/stream/fs 같은 primitive 중심이다. `Workflow`, `Evidence`, `Session` 같은 business concept가 들어가면 소유 도메인에 남긴다.
4. **GJC의 giant `coding-agent`를 피한다.** `domain/`, `application/`, `runtime/`, `presentation/`의 경계가 필요한 이유는 WWW가 agent harness뿐 아니라 work control-plane이기 때문이다.

## 후속 설계 때 확인할 질문

- `Workflow`는 업무 lifecycle 모델인가, agent turn을 실행하는 runtime engine인가? 전자와 후자는 별도 용어와 module ownership을 가져야 한다.
- Journal event가 Evidence 후보를 만드는 단방향 관계인가? 아니라면 저장·보존 책임이 중복된다.
- executor adapter가 `runtime`에만 의존하고 domain type을 직접 생성하지 않는가?
- TUI는 application이 만든 display model만 보고, raw executor event를 직접 해석하지 않는가?
