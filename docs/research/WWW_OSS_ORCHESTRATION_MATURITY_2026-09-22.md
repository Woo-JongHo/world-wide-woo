# WWW와 오픈소스 코딩 에이전트의 오케스트레이션 완성도 비교

- 조사일: 2026-09-22 (Asia/Seoul)
- WWW 기준: `/Users/jonghoPro/woo/00_project/99_www`, `dev` worktree
- 비교 대상: Oh My Pi, Pi Coding Agent, OpenCode, goose
- 평가 원칙: 공식 저장소·공식 문서에 명시된 현재 기능만 인정한다. 별점과 홍보 문구는 성숙도의 직접 근거로 쓰지 않는다.

## 결론

WWW는 범용 코딩 에이전트 제품으로는 아직 **중기 개발 단계(약 3.1/5)**지만, 실행 증거·승인·불확정 작업 복구를 다루는 **감사 가능한 오케스트레이션 계층은 상위권(약 4.5/5)**이다.

Oh My Pi와 OpenCode보다 뒤처지는 것은 도구 수, LSP/DAP, 공개 SDK, 확장 생태계, 설치·배포, 다중 플랫폼 검증이다. 반대로 WWW가 앞서는 부분은 append-only ProjectActivity, write-ahead 실행 receipt, uncertain action reconcile, 재계획 후 과거 evidence 재사용 차단, 외부 전달 identity 검증처럼 업무 완료 주장을 수락하는 제어 평면이다.

따라서 WWW를 Oh My Pi의 작은 복제품으로 평가하면 미완성이다. Native Codex/Pi 같은 실행기를 감싸는 개인 업무 control plane으로 평가하면 핵심 차별 기능은 이미 상당 부분 구현되어 있다.

## 현재 규모와 확인된 상태

| 항목 | WWW 현재 관측 |
|---|---:|
| 버전·배포 상태 | `0.0.18`, `private: true` |
| TypeScript 소스 | 280파일, 약 40,466줄 |
| 테스트 | 162파일, 약 30,688줄, `test/it` 선언 1,282개 |
| 핵심 검증 | `tsc --noEmit`, 아키텍처 게이트, Runtime/Workbench 핵심 190테스트 통과 |
| 실행 엔진 | Codex App Server가 주 경로, Pi lane은 선택 경로 |
| 제품 표면 | CLI/TUI, Astra operations 화면, Todo/T-note/Review/Trace/Monitor |
| 공개 통합 표면 | 전용 SDK·RPC·ACP·외부 plugin interface 없음 |

규모는 성숙도의 증거가 아니지만, WWW는 더 이상 화면 모형이나 얇은 wrapper는 아니다. 동시에 `ProjectWorkbench` 한 파일이 3,062줄이고 다수 상태기를 소유하므로, 구현량에 비해 내부 모듈 깊이와 변경 locality는 아직 부족하다.

## 비교 대상의 제품 중심

### Oh My Pi

Pi를 기반으로 LSP, DAP, 브라우저, persistent Python/Bun 실행, subagent, 세션, 확장과 rich tool surface를 기본 제공하는 batteries-included 코딩 에이전트다. Interactive, one-shot, Node SDK, RPC, ACP라는 네 진입점을 제공한다. 공식 README는 60개 이상 provider, 31개 built-in tool, LSP 14개 동작, DAP 28개 동작을 명시한다.

- 공식 저장소: https://github.com/can1357/oh-my-pi
- SDK/RPC/ACP와 제품 기능: https://github.com/can1357/oh-my-pi#four-entry-points-interactive-one-shot-rpc-and-acp

### Pi Coding Agent

작은 agent harness와 깊은 extension interface가 중심이다. Interactive, print/JSON, RPC, SDK를 제공하고, session branching·compaction·import/export와 TypeScript extension·skill·prompt·theme를 조합한다. 기본 제품은 subagent와 plan mode를 의도적으로 내장하지 않는다.

- 공식 저장소: https://github.com/earendil-works/pi
- Coding Agent 문서: https://github.com/earendil-works/pi/tree/main/packages/coding-agent

### OpenCode

provider-neutral 코딩 에이전트이자 client/server 플랫폼이다. TUI, desktop, IDE extension, SDK, server, plugin, MCP, ACP를 제품 표면으로 제공한다. Primary agent와 subagent를 구분하며 agent별 model·prompt·permission을 설정할 수 있다.

- 공식 문서: https://opencode.ai/docs
- Agents: https://opencode.ai/docs/agents
- Permissions: https://opencode.ai/docs/permissions
- SDK/Server: https://opencode.ai/docs/sdk

### goose

코딩에 한정되지 않는 범용 로컬 에이전트다. Desktop, CLI, API와 70개 이상 문서화된 MCP extension, YAML Recipe, subagent, sandbox와 prompt-injection 방어를 제품 중심으로 둔다.

- 공식 사이트·문서: https://block.github.io/goose/
- 공식 저장소: https://github.com/block/goose

## 상대 점수

5점은 해당 제품 방향에서 공개 사용자가 안정적으로 소비할 수 있는 수준이다. 서로 다른 제품 철학을 억지로 단일 총점으로만 비교하지 않는다.

| 평가 축 | WWW | Oh My Pi | Pi | OpenCode | goose |
|---|---:|---:|---:|---:|---:|
| 코딩 도구·IDE 결합 | 2.8 | 5.0 | 3.5 | 4.4 | 3.6 |
| 세션·입력 UX | 3.7 | 4.7 | 4.6 | 4.5 | 4.0 |
| 멀티에이전트 실행 | 3.4 | 4.5 | 2.0 | 4.5 | 4.3 |
| 승인·권한 안전성 | 4.4 | 4.1 | 3.5 | 4.5 | 4.5 |
| 불확정 작업 복구·idempotency | 4.8 | 3.5 | 3.0 | 3.7 | 3.7 |
| 실행 증거·감사 가능성 | 4.8 | 3.5 | 3.0 | 3.5 | 3.5 |
| 관측·operations projection | 4.5 | 4.3 | 3.1 | 4.0 | 4.1 |
| SDK·RPC·외부 확장 interface | 1.8 | 5.0 | 5.0 | 5.0 | 4.6 |
| 설치·배포·다중 플랫폼 | 1.8 | 4.8 | 4.5 | 4.8 | 4.8 |
| 생태계·문서·온보딩 | 2.2 | 4.7 | 4.7 | 4.8 | 4.7 |
| 내부 구조의 변경 용이성 | 3.0 | 4.1 | 4.7 | 4.2 | 4.2 |

점수는 공식 기능과 현재 WWW 저장소의 구현·테스트를 바탕으로 한 상대적 공학 판단이다. 외부 프로젝트의 모든 실패 모드를 실제로 재현한 benchmark 점수는 아니다.

## WWW가 실제로 앞서는 부분

### 1. 완료 주장을 수락하는 계약

WWW Request Runtime은 `UNDERSTAND → DECOMPOSE → GROUND → DECIDE → EXECUTE → VERIFY → DELIVER`를 고정하고, 실행·검증 완료에 실제 Runtime receipt를 요구한다. 단순한 모델의 “완료했습니다”나 일반 tool log는 완료 evidence로 인정하지 않는다.

### 2. 불확정 외부 효과 처리

작업 전에 prepared receipt를 남기고, 결과가 불확정하면 같은 작업을 자동 재시도하지 않는다. `reconcile`은 기록된 대상을 read-back할 뿐 원래 작업을 재실행하지 않는다. 이는 일반 코딩 에이전트의 permission prompt보다 한 단계 뒤의 운영 문제를 다룬다.

### 3. 재계획과 evidence 무효화

VERIFY 실패로 replan하면 해당 단계 이후를 초기화하고 이전 시도의 receipt로 새 시도를 완료하지 못하게 한다. 외부 전달은 target과 artifact identity가 receipt와 정확히 일치해야 한다.

### 4. 실행기와 업무 정본의 분리

Native agent의 private reasoning과 provider session을 업무 정본으로 삼지 않고, ProjectActivity와 public projection을 별도로 유지한다. 이 방향은 여러 native harness를 같은 업무 의미로 관찰하는 control plane에 적합하다.

## WWW가 명확히 뒤처지는 부분

### 1. 코딩 하네스 자체의 폭

Oh My Pi의 LSP/DAP/AST/browser/persistent kernel/edit benchmark 수준을 WWW가 직접 제공하지 않는다. 현재는 Codex App Server나 Pi가 가진 실행 능력을 adapter로 소비한다. 이 차이는 의도된 경계일 수 있지만, 독립 코딩 에이전트로 평가하면 큰 격차다.

### 2. 공개 interface와 생태계

Pi·Oh My Pi는 SDK/RPC와 TypeScript extension을, OpenCode는 SDK/server/plugin/ACP를 제공한다. WWW는 내부 port는 많지만 외부 개발자가 안정적으로 소비할 versioned interface가 없다. 작은 사용자 맞춤도 core 변경으로 이어지기 쉽다.

### 3. 배포 제품성

WWW는 `private: true`인 프로젝트 로컬 애플리케이션이다. 패키지 배포, 설치 프로그램, release artifact, migration·compatibility 정책, Windows/Linux 수락 matrix가 경쟁 제품 수준으로 입증되지 않았다.

### 4. 내부 오케스트레이터의 집중

`ProjectWorkbench`가 Native lifecycle, command serialization, projection, Todo/T-note, review, MCP, model, approval을 함께 소유한다. 테스트는 강하지만 새 기능이 여러 상태기계와 큐를 동시에 건드릴 가능성이 높다.

### 5. 멀티에이전트의 소유권

WWW는 Native subagent 상태를 잘 투영하지만, agent scheduling·worktree isolation·role configuration·background task lifecycle을 독자적인 안정 interface로 소유하지 않는다. Oh My Pi, OpenCode, goose와 비교하면 관측은 강하고 실행 생태계는 약하다.

## 제품 성숙도 판정

| 관점 | 판정 |
|---|---|
| 개인이 현재 저장소에서 쓰는 operations workbench | **Beta 후반** |
| 실행 증거·승인·복구 control plane | **강한 Beta / 일부 Production-grade invariant** |
| 범용 코딩 에이전트 | **Alpha 후반~Beta 초반** |
| 제3자가 설치·확장하는 오픈소스 제품 | **Alpha** |
| Oh My Pi/OpenCode와 직접 경쟁하는 독립 생태계 | **아직 아님** |

핵심 Runtime 테스트가 강하다는 사실과 공개 제품 준비도를 혼동하면 안 된다. 내부 안전성은 높은데 distribution maturity가 낮은 비대칭 상태다.

## 다음 완성도 상승 순서

1. `ProjectWorkbench`에서 command scheduling, Native turn coordination, journal projection을 독립 seam으로 추출한다.
2. 실제 macOS/Linux 및 최소 한 Windows terminal에서 resume·approval·cancel·uncertain delivery·long stream 수락 matrix를 만든다.
3. 외부 확장보다 먼저 versioned read-only SDK를 공개한다: snapshot 구독, activity 조회, command receipt.
4. Native harness conformance suite를 만들어 Codex/Pi/future OpenCode adapter가 같은 lifecycle·approval·reconcile 계약을 만족하는지 검증한다.
5. 설치·upgrade·schema migration·release artifact 계약을 만든 뒤 `private` 제품에서 공개 배포 제품으로 넘어간다.
6. 그 이후에 제한된 command/card/capability extension interface를 연다. arbitrary TypeScript plugin은 provenance·trust·dispose·budget 계약 이후가 맞다.

## 최종 판단

Oh My Pi가 **가장 완성된 코딩 도구 상자**, Pi가 **가장 깊은 조립 기반**, OpenCode가 **가장 넓은 client/server 제품 플랫폼**, goose가 **가장 넓은 범용 MCP agent**라면, WWW는 **가장 엄격한 개인 업무 실행 원장과 수락 제어 평면**에 가깝다.

현재 WWW의 경쟁력은 agent가 코드를 더 잘 쓰게 하는 데 있지 않다. 에이전트가 한 일을 재시작 뒤에도 설명하고, 불확정 효과를 중복 실행하지 않으며, 실제 증거가 없으면 완료를 거부하는 데 있다. 이 중심을 유지하면서 공개 interface와 배포 제품성을 보강하면 독자적인 오픈소스 위치가 생긴다.
