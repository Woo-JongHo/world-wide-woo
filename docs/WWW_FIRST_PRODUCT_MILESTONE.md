# WWW 첫 제품 마일스톤

- 상태: 기존 로컬 Workbench 범위 기록. Linear 공개 배포 마일스톤과의 관계는 논의 중.
- 기준일: 2026-09-04
- 대상: 프로젝트 루트에서 실행하는 Codex Native Workbench

이 문서의 포함·제외 범위는 로컬 Workbench 목표에 한정된다. Linear의 `v0.1.0 — First Public Release`에서 첫 Workflow를 제외한다는 결정이 아니다. 공개 배포 범위와 개발 순서는 [현재 개발 기획](planning/linear-development/README.md)에서 사용자와 확정한다. 아래 과거 범위를 자동으로 release 수락 조건에 적용하지 않는다.

## 한 문장 목표

> 한 프로젝트에서 Codex Native 작업을 요청하고, 진행을 이해하고, 필요한 결정을 내리고,
> 결과와 검증 근거까지 확인한 뒤 안전하게 세션을 닫을 수 있는 로컬 Workbench를 완성한다.

WWW의 장기 목표는 Service Lifecycle Orchestration Harness다. 그러나 첫 제품 마일스톤은
그 전체를 구현하는 단계가 아니다. 지금 존재하는 Native Workbench를 일상 작업에 신뢰하고
사용할 수 있는 하나의 완결된 제품 흐름으로 만드는 단계다.

## 사용자가 끝까지 수행할 수 있어야 하는 흐름

```text
프로젝트에서 WWW 실행
  → 질문 또는 작업 요청
  → 공개 가능한 Plan·Agent·Tool·승인 상태 이해
  → HUD에서 모델·권한 같은 session 설정
  → 필요할 때 승인·중단·재개
  → 결과와 "무엇을 왜 했는지" 확인
  → 검증 근거와 실패·불확실 상태 확인
  → draft와 native session을 보존하며 종료
```

각 단계는 Chat 로그의 양이 아니라 사용자가 다음 질문에 답할 수 있는지로 판단한다.

- 요청이 실제로 접수됐는가?
- 지금 무엇을 왜 하고 있는가?
- 사용자 결정이 필요한가?
- 무엇이 바뀌었고 무엇으로 검증했는가?
- 성공, 실패, 중단, 불확실 중 어떤 상태인가?
- 종료하거나 재개해도 작업 맥락이 보존되는가?

## 첫 마일스톤에 포함하는 것

- Codex App Server 기반 새 session과 명시적 resume
- Chat·T-note·Todo·Trace/Source의 일관된 화면 역할
- Native Plan·Tool·Agent·승인·결과의 공개 가능한 관측
- 모델·권한·협업 설정의 빠르고 위치가 안정적인 HUD 상호작용
- 실행 명령이 아니라 작업 의미를 설명하는 완료 회고
- 승인, 취소, queue, uncertain 상태의 보수적인 복구
- terminal 폭·입력·스크롤·장기 session의 사용성
- macOS 기본 흐름과 Windows/Linux 핵심 계약의 반복 가능한 검증

## 첫 마일스톤에 포함하지 않는 것

- 전체 Service Lifecycle Workflow Loop
- Product·RPA Workflow Profile의 실행 자동화
- Figma·Atlas·Linear·Obsidian 양방향 연동
- 여러 프로젝트를 모으는 Operations TUI
- Codex를 대체하는 자체 범용 Agent Execution Runtime
- 임의 Provider를 섞는 Router 또는 실행 중 Provider 교체
- 실행 성공을 Story/Epic 수락으로 자동 승격하는 기능

이 항목은 폐기 대상이 아니라 다음 마일스톤의 입력이다. 첫 마일스톤 안으로 끌어오지 않는다.

## 현재 구조에서 먼저 개선할 부분

### 1. ProjectWorkbench의 구현 책임 분리

`ProjectWorkbench`의 외부 interface인 `snapshot`, `backgroundWorkState`, `waitUntilReady`,
`subscribe`, `dispatch`, `close`는 제품 경계에 맞다. 반면 하나의 구현에 command 직렬화,
Chat queue, Native event 수집, resume reconciliation, usage 집계, T-note, Todo sync,
narration과 snapshot projection이 함께 들어 있다.

외부 seam을 늘리지 않고 다음 책임을 내부 모듈로 모은다.

- Native turn 전달·queue·cancel·uncertain reconciliation
- Native event의 durable activity 변환과 live delta 처리
- T-note 생성·복구와 Todo 동기화
- session usage 집계
- immutable snapshot projection

분리 뒤에도 호출자와 테스트는 가능한 한 `ProjectWorkbench` interface를 통과한다.

### 2. TUI shell과 화면 projection 분리

`workbench-shell.ts`는 TUI 생명주기, polling, view routing, HUD, overlay, 입력 명령과 외부
dispatch를 함께 소유한다. `workbench-views.ts`는 렌더링뿐 아니라 완료 회고의 분류와
재생 규칙까지 소유한다.

- Shell은 focus와 화면 배치, 입력 전달만 조정한다.
- HUD에서 끝나는 session 설정은 Chat overlay를 점유하지 않는다.
- 완료 회고는 render 중 원시 activity를 다시 해석하지 않고 presentation-independent
  projection을 입력으로 받는다.
- render 경로에서는 network, filesystem, 모델 호출을 하지 않는다.

### 3. 실행 기록을 의미 있는 완료 회고로 변환

현재 완료 회고는 shell command와 파일 변경을 수집해 그대로 나열한다. 이는 Source로는
유용하지만 사용자가 결과를 이해하는 Summary는 아니다.

완료 회고는 관측된 activity와 공개 narration만 사용해 다음을 짧게 설명한다.

- 무엇을 확인했는가
- 무엇을 변경했는가
- 무엇으로 검증했고 결과가 어땠는가

명령 원문과 상세 출력은 Trace/Source에 남긴다. 의미를 만들 근거가 없으면 추측하지 않고
`확인 가능한 설명 없음`으로 표시한다. 모델 해석이 필요하더라도 완료 시점에 bounded하게
생성하고 저장하며 render마다 다시 실행하지 않는다.

### 4. Native 기본 경로와 legacy Router 격리

`SessionRuntime`, `legacy-session-shell.ts`, `legacy-router-app.ts`는 호환 Router 경로에서만
사용한다. 첫 마일스톤 동안 기능을 섞어 합치지 않고 Native 기본 경로와 파일·테스트·명명에서
분명히 격리한다. 삭제는 호환 경로 종료 결정 뒤의 별도 작업이다.

## 1차 작업 묶음

### A. 목표와 현재 위치 고정

- 이 문서를 첫 제품 마일스톤 기준으로 사용한다.
- README에는 장기 비전과 현재 마일스톤을 함께 표시한다.
- Development Map은 Planning과 Evidence에서 확인한 현재 revision만 투영한다.
- 새 Epic·Story ID와 수락 상태는 Planning 정본 절차 없이 추정하지 않는다.
- B와 C의 사용자 동작·구조 범위를 사용자가 확정하면, 구현 전에 해당 범위의 Planning ID
  발급을 요청한다. 현재 Native 기본 경로에는 Planning 저장 surface가 없으므로 legacy
  Router의 명시적 `/epic`·`/story`를 사용할지 새 surface를 연결할지는 별도로 결정한다.
  결정 전에는 ID나 acceptance를 문서에서 만들어내지 않는다.

### B. 가장 자주 만나는 사용자 마찰 제거

- `/model` 등 session 설정을 고정 높이 HUD 안에서 빠르게 조작한다.
- 설정 UI가 Chat viewport를 덮거나 transcript 위치를 바꾸지 않게 한다.
- 완료 회고를 원시 명령 목록에서 쉬운 작업 설명으로 바꾼다.
- 실제 입력 지연과 render 횟수를 측정할 수 있는 회귀 시나리오를 둔다.

### C. 위 기능을 지탱하는 내부 구조 정리

- 완료 회고 projection을 `workbench-views.ts` 밖으로 옮긴다.
- HUD의 기본 상태와 일시적 interaction 상태를 하나의 작은 interface로 합친다.
- `ProjectWorkbench`에서 turn 전달과 activity projection 책임부터 내부 모듈로 분리한다.
- 기존 외부 interface와 journal 형식은 이 단계에서 바꾸지 않는다.

B는 먼저 관찰 가능한 사용자 동작과 회귀 테스트를 고정한다. C는 B의 각 동작이 확인된 뒤
동작을 더하지 않는 별도 변경으로 수행한다. 모든 B 작업이 끝날 때까지 기다렸다가 C 전체를
한꺼번에 수행하지 않고, HUD와 완료 회고를 각각 하나의 vertical slice로 닫는다.

### D. 첫 마일스톤 수락 근거 만들기

- 시작, 첫 요청, Plan/Tool, 승인, 모델 변경, 완료 회고, 종료·재개의 대표 흐름을 검증한다.
- 40·70·120·160열과 저높이 terminal에서 HUD와 주요 pane 접근성을 확인한다.
- macOS 실제 TUI와 Windows/Linux 핵심 경로 계약을 구분해 기록한다.
- placeholder, skipped/focused test와 구현되지 않은 분기가 없음을 확인한다.

## 완료 판단

다음 조건이 모두 근거와 함께 확인되어야 첫 제품 마일스톤을 완료로 제안할 수 있다.

1. 대표 흐름을 사용자가 중간 설명 없이 끝까지 수행한다.
2. Chat, HUD, Todo, T-note, Trace/Source의 역할이 겹치지 않는다.
3. 실행 중 상태와 완료 회고가 원시 명령을 읽지 않아도 이해된다.
4. 승인·취소·재개·uncertain 상태가 성공으로 오인되지 않는다.
5. 외부 `ProjectWorkbench` interface와 Native ID·journal provenance가 유지된다.
6. 자동 테스트와 실제 terminal 검증이 모두 있으며 서로의 역할을 대신하지 않는다.
7. 관련 Story의 acceptance와 Evidence가 명시적으로 연결된다.

현재 코드와 테스트가 존재한다는 사실만으로 이 마일스톤을 수락된 것으로 표시하지 않는다.
기존 Evidence가 catalog에 없는 Story ID를 참조하는 경우에는 새 연결을 추정하지 않고
Planning 이력을 먼저 정리한다.
