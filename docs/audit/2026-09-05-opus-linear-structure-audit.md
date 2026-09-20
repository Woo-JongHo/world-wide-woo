# Opus Linear 구조 감사

기록 성격: 이전 설계 후보에 대한 감사 결과를 작성자가 요약·재구성한 문서다. 원본 CLI 출력 전문은 보존되지 않았으며, 아래 내용은 축자 인용이나 승인된 설계가 아니다. 현재 논의는 [개발 기획](../../docs/planning/linear-development/README.md)을 따른다.

후속 정정: Linear의 Backlog/In Progress 상태만으로 컴파일 의존성을 증명할 수 없다. 로컬 Workbench 마일스톤과 공개 배포 범위도 동일하지 않다. 아래 중앙 contracts 폴더·수락 항목 등의 권고는 자동 채택하지 않는다.

- 감사일: 2026-09-05 (Asia/Seoul)
- 감사자: Claude Opus (`claude --model opus`)
- 권한: `--restricted --permission-mode plan --permission-prompts none --safe-mode --no-session-persistence`
- 범위: 읽기 전용. 파일·외부 시스템 변경·하위 agent 위임 없음.
- 입력: 실제 Linear MCP Project/Milestone/Issue 스냅샷 및 README·제품 방향·첫 마일스톤·Linear handoff·코드 architecture 문서.

## Verdict

**REVISE.**

최상위 3분할 이름(TUI / System / Specialized Workflow)은 Linear 정본과 일치하므로 유지할 가치가 있다. 그러나 `tui → workflows` / `system → workflows(port)` 의존 규칙과 `shared` 범위는 v0.1.0 Milestone 구조·Issue 상태와 충돌한다.

## 핵심 반박

1. WOO-673(TUI)은 In Progress이고 WOO-672(System), WOO-671(Workflow)은 Backlog다. Workflow를 그래프 바닥에 두면 TUI와 System이 Workflow 없이 독립 완료될 수 없게 된다.
2. 현행 `app.ts`는 workflow 없이 workbench·usage·observability history·git telemetry를 TUI에 주입하고, Chat/Todo/T-note/Trace/Stats는 System Journal의 projection이다. TUI가 workflows만 볼 수 있다는 규칙은 이 1차 기능을 위반하게 한다.
3. System은 Feature·Work·Run·Evidence identity, Session·Run·Activity·Journal, Executor, Approval·Review·Evidence record, Integration, Control Ledger를 소유한다. 이를 Runtime으로 이름 붙이면 “Runtime/Executor는 lifecycle 의미와 Acceptance를 소유하지 않는다”는 Linear 원칙과 용어가 충돌한다.
4. `Runtime`은 이미 Application Runtime, Agent Execution Runtime, runtime monitor 등 여러 뜻으로 사용된다. Linear가 쓰는 System으로 통일해야 traceability handoff가 생기지 않는다.
5. Evidence·Approval은 System의 기록과 Workflow의 선택·충분성·수락 판정으로 분리하되, 이 결정을 문서와 acceptance test에 명시해야 한다.

## 수정된 구조

```text
src/
├── tui/                     # 화면·입력·focus·배치만. 판정을 재계산하지 않는다
│   ├── chat/  todo/  tnote/  monitor/  dashboard/  stats/  hud/  overlay/
│   └── shell/
├── workflows/               # Specialized Workflow = 정책
│   ├── contracts/           # Stage·Handoff Contract·Verdict
│   ├── profiles/            # 첫 profile 1개. 범용 엔진 아님
│   └── acceptance/          # evidence 선택·충분성·수락 판정
├── system/                  # 공통 실행·기록·통제 수단
│   ├── contracts/           # Identity, Session·Run, Activity·Journal, Approval/Evidence record, Port
│   ├── session/             # ProjectWorkbench 등 use case
│   ├── executors/           # codex/, pi/ — 서로 독립
│   ├── journal/  ledger/  integrations/
│   └── legacy/
├── shared/                  # id/result/time/error + 의존 없는 순수 util
├── app.ts                   # 유일한 concrete wiring
└── cli.ts
```

## 의존 규칙

| 규칙 | 이유 |
| --- | --- |
| `system/contracts` → `shared`만 | 순수 계약을 계속 경로 기반으로 강제한다. |
| `workflows/**` → `system/contracts` + `shared`만 | Workflow는 정책만 소유하고 executor·저장소 구현을 모른다. |
| `tui/**` → workflow public entry + system contract의 읽기 전용 projection | Workflow 없이도 v0.1.0 TUI/System이 동작하며 adapter에는 닿지 않는다. |
| `system/**` → `workflows/**` 금지 | WOO-672를 WOO-671 없이 수락할 수 있다. |
| concrete wiring은 `app.ts`만 | 역방향·순환을 막는다. |

## 판정 소유권

| 사실 | Owner |
| --- | --- |
| Run·Activity·Journal immutable observation | System |
| Evidence record identity·저장·불변성 | System |
| Approval 요청·응답 기록 | System |
| Evidence 선택·충분성·Contract 충족·Verdict | Workflow |
| Progress의 사용자 업무 의미 | Workflow |
| usage·시간·재시도 원시 집계 | System |
| 모든 표시 | TUI |

## Linear acceptance 보강

### WOO-672 — 공통 실행·관측 System

1. Workflow 미로드 상태에서도 세션 시작 → Run/Activity Journal 기록 → 종료 → resume이 가능하다.
2. Feature·Work·Run·Evidence identity와 Work↔Run, Run↔Evidence 연결을 발급·저장·read-back한다.
3. Journal은 재개·재실행 때 기존 activity를 재작성하지 않고, 미관측 Token 값을 실제값처럼 기록하지 않는다.
4. System 공개 interface에 PASS/PARTIAL/BLOCKED/REJECTED/UNCERTAIN 판정 entry point가 없다.
5. Codex·Pi는 동일 ExecutorPort contract suite를 통과하며, 미지원 기능은 fail closed한다.
6. Control Ledger는 외부 원문을 복제하지 않고 reference 및 stale/missing/conflicted 상태만 보존한다.
7. System 경계에서 hidden reasoning 미노출과 redaction을 보장한다.

### WOO-671 — 첫 번째 Specialized Workflow

1. WWW TUI 기능 개발 Workflow 1개가 요청부터 Acceptance까지 실제 Run으로 완주되고 Evidence가 Linear Issue와 연결된다.
2. PASS/PARTIAL/BLOCKED/REJECTED/UNCERTAIN 다섯 Verdict의 재현 시나리오가 있다.
3. executor success이지만 Contract 미충족인 negative case가 PARTIAL 또는 REJECTED가 됨을 증명한다.
4. 모든 Verdict는 구체 Journal Activity ID를 참조하는 Evidence에 고정되며, 근거가 없으면 UNCERTAIN이다.
5. `workflows/`는 `system` 구현체와 `tui`를 import하지 않는다.
6. v0.1.0은 profile 데이터/얇은 코드만 두며 범용 Workflow Engine·Runtime Registry·Feature Registry를 만들지 않는다.
7. terminal state로 닫을 때 의도·결정·원본·완료 조건을 담은 Handoff packet이 만들어진다.
8. TUI는 Workflow Verdict를 표시만 하고 재계산하지 않는다.

## 동반 변경

후속 정정: 아래는 당시 권고다. 현재 아키텍처 문서는 목표와 현행 구현을 구별하도록 교정했다. `domain/work/index.ts`를 검사하는 architecture test는 현행 코드 안전장치이므로 문서 정리만으로 변경하지 않는다. 실제 코드 이관 시 새 Interface와 함께 검토한다.

이 구조를 채택한다면 `docs/WWW_CODE_ARCHITECTURE.md`의 현행 `TUI / Work / Runtime` 목표 문구와 `test/architecture.test.ts`의 canonical Work entry 규칙을 같은 별도 Sub-issue에서 개정해야 한다. 그렇지 않으면 정본과 코드가 서로 다른 최상위 구조를 주장한다.

## Opus 감사 내용 재구성 — 원본 전문 아님

읽기 전용으로 README.md, docs/WWW_PRODUCT_DIRECTION.md, docs/WWW_FIRST_PRODUCT_MILESTONE.md, .www/planning/inputs/LINEAR-WWW-PROJECT-HANDOFF-20260904.md, docs/WWW_CODE_ARCHITECTURE.md, src 트리, test/architecture.test.ts, src/app.ts, src/domain/work/traceability.ts를 확인했다. 파일은 수정하지 않았다.

### 1. VERDICT

**REVISE.**

최상위 3분할 이름(TUI / System / Specialized Workflow)은 Linear 정본과 일치하므로 유지할 가치가 있다. 그러나 후보의 **의존 규칙**과 **shared 범위**는 Linear의 Milestone 구조·Issue 상태와 직접 충돌하며, 그대로 고정하면 WOO-672와 WOO-673을 WOO-671 없이는 닫을 수 없게 된다. 이름은 채택, 의존 규칙과 하위 경계는 재작성이 필요하다.

### 2. Linear 계획과의 적합성, 그리고 Runtime 명명

handoff 문서는 두 축을 명시한다. 실행 관점에서는 TUI 안에서 공통 System이 동작하고 그 위에서 업무별 Workflow가 수행된다. 정책 소유권 관점에서는 Workflow가 해야 할 일을 결정하고 System은 실행·기록·통제 수단을 제공한다.

후보의 `tui → workflows` / `system → workflows(port)`는 정책 축 하나만 남기고 실행·포함 축을 삭제한다. 결과는 `workflows/`가 의존 그래프의 최하단이 되는 것이고, 이는 Linear 상태와 모순된다. WOO-673은 In Progress, WOO-672·WOO-671은 Backlog다. Workflow가 그래프 바닥이면 TUI와 System은 Workflow가 생기기 전에는 컴파일 단위로도 독립 완료를 주장할 수 없다. 현재 `src/app.ts`도 workflow 없이 workbench·usage·observabilityHistorySource·gitTelemetrySource를 TUI에 직접 주입하며, Chat/Todo/T-note/Trace/Stats는 System Journal의 projection이다. TUI가 workflows만 볼 수 있다는 규칙은 이 화면들을 규칙 위반으로 만들거나 Workflow를 pass-through 계층으로 만든다.

System을 Runtime으로 부르면 틀린 이유는 세 가지다.

1. handoff는 Runtime/Executor가 lifecycle 의미와 Acceptance를 소유하지 않는다고 못 박았지만, System에는 Feature·Work·Run·Evidence Identity, Journal, Approval, Control Ledger가 들어간다. Runtime으로 부르면 원칙이 해당 내용물을 금지하거나 무력화한다.
2. 이 저장소에서 Runtime은 WWW Application Runtime과 Agent Execution Runtime으로 이미 서로 다른 뜻으로 쓰인다. `src/application/session-runtime.ts`는 legacy Router를, `src/domain/runtime-monitor.ts`는 관측 projection을 가리킨다.
3. Linear Parent Issue와 Project description이 System을 쓰므로 코드를 Runtime으로 부르면 Feature↔Work↔코드 traceability에서 사람이 계속 번역해야 하는 handoff가 생긴다.

System의 약점은 내용이 비어 있는 이름이라 god-package가 되기 쉽다는 것이다. Runtime으로 개명해서 풀 문제가 아니라 System 내부 하위 경계와 금지 목록으로 해결해야 한다.

### 3. 모순·누락·과도한 추상화

**F1. 의존 규칙이 Milestone 완료 단위를 파괴한다.** Milestone은 공통 System의 Run·Activity·Evidence 기록을 독립 결과로 요구한다. `system → workflows`는 System을 Workflow 종속으로 만들며, `tui → workflows`만 허용하면 Monitor·Stats·Todo·Evidence 확인이 갈 곳이 없다. WOO-685(Completion)·WOO-678(HUD)이 책임 중복으로 취소된 것과 같은 중복을 계층 규칙이 재발시킨다.

**F2. v0.1.0이 제외한 것을 그래프 바닥에 놓는다.** 첫 마일스톤은 전체 Service Lifecycle Workflow Loop를 제외하고, architecture 문서는 첫 수락 전 범용 Workflow Engine을 만들지 말라고 한다. 모든 것이 `workflows/`를 import하면 첫 workflow 하나를 끝내기 위해 지금 범용 엔진을 요구한다.

**F3. 정본 architecture 문서·테스트와 이름 충돌에 갱신 항목이 없다.** 문서는 최종 경계를 `TUI / Work / Runtime`으로 두고 test가 `domain/work/index.ts`를 canonical entry로 강제한다. Work→`workflows/`, Runtime→`system/`으로 바꾸려면 문서와 test migration도 결정을 구성하는 Scope여야 한다.

**F4. Evidence·Approval은 정본에서 이중 기재돼 있다.** System에 Approval·Review·Evidence를, Workflow에 승인·검증·Evidence를 준다. Journal=System 사실 / Evidence=Workflow 선택은 합리적이지만 새 결정이므로 One owner per truth를 위해 문서와 acceptance로 강제해야 한다.

**F5. 4-폴더 평탄화는 현재 안전장치를 잃고 귀속처 없는 코드를 만든다.** 현 architecture test는 경로로 domain 순수성을 강제한다. `system/` 하나에 identity 계약·adapter·integration·ledger persistence를 섞으면 이 규칙을 경로로 표현할 수 없다. `redaction.ts`, `terminal.ts`, `output.ts`, `narration.ts`, `model-settings.ts`, planning/development-map/canonical-document, legacy router/session 코드의 귀속도 필요하다.

### 4. 수정된 최상위 tree와 소유권

```text
src/
├── tui/                     # 화면·입력·focus·배치만. 판정을 재계산하지 않는다
│   ├── chat/  todo/  tnote/  monitor/  dashboard/  stats/  hud/  overlay/
│   └── shell/
├── workflows/               # Specialized Workflow = 정책
│   ├── contracts/           # Stage·Handoff Contract·Verdict(PASS/PARTIAL/BLOCKED/REJECTED/UNCERTAIN)
│   ├── profiles/            # 첫 profile 1개(WWW TUI 기능 개발). 범용 엔진 아님
│   └── acceptance/          # evidence 선택·충분성·수락 판정
├── system/                  # 공통 실행·기록·통제 수단
│   ├── contracts/           # 순수 계약: Identity, Session·Run, Activity·Journal, Approval/Evidence record, Port
│   ├── session/             # ProjectWorkbench 등 use case
│   ├── executors/           # codex/, pi/ — 서로 독립
│   ├── journal/  ledger/  integrations/
│   └── legacy/              # legacy Router 격리 보관
├── shared/                  # id/result/time/error + 의존 없는 순수 util
├── app.ts                   # 유일한 concrete wiring
└── cli.ts
```

`system/contracts`는 `shared`만 import한다. `workflows/**`는 `system/contracts`와 `shared`만 import한다. `tui/**`는 workflow public entry와 system contract의 읽기 전용 projection만 import한다. `system/**`은 `workflows/**`를 import하지 않으며, concrete wiring은 `app.ts`만 한다.

판정 소유권은 다음과 같다: Run·Activity·Journal immutable observation, Evidence record identity·저장·불변성, Approval 요청·응답 기록, usage·시간·재시도 원시 집계는 System; Evidence 선택·충분성·Contract 충족·Verdict와 Progress의 사용자 업무 의미는 Workflow; 모든 표시는 TUI가 소유한다.

### 5. 필수 Linear acceptance

WOO-672에는 Workflow 미로드 상태에서도 세션 시작→Run/Activity 기록→종료→resume이 가능한 Workflow 독립성, Feature·Work·Run·Evidence identity와 다대다 link, Journal 불변성·관측하지 않은 값 추정 금지, System에 Verdict entry point 없음, Codex/Pi ExecutorPort contract suite와 fail-closed, Thin Control Ledger, hidden reasoning 미노출·redaction을 추가해야 한다.

WOO-671에는 WWW TUI 기능 개발 Workflow 1건 완주와 Linear Issue 연결, 다섯 Verdict 재현 시나리오, executor success지만 Contract 미충족인 negative case, Verdict가 Journal Activity ID를 참조하는 Evidence에 고정됨, `workflows/`의 System/TUI 구현 import 금지, 범용 engine/registry 금지, Handoff packet, TUI의 Verdict 재계산 금지를 추가해야 한다.

구조 변경 자체는 architecture 문서의 현행 목표와 canonical entry architecture test를 함께 고치는 별도 Sub-issue여야 한다.
