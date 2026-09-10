# Native Plan·Todo·Tracer 구현 인수인계

상태: 제품 코드 구현 완료, 검증 미실행. 브랜치 `fix/native-plan-todo-tracer`, 2026-09-08.

## 변경 파일

- `src/adapters/outbound/execution/codex-app-server.ts`
- `src/core/domain/execution/native-session.ts`
- `src/core/application/orchestration/project-workbench.ts`
- `src/core/domain/work/workflow-projection.ts`
- `src/core/application/work/todo-ledger.ts`
- `src/core/domain/work/todos.ts`
- `src/adapters/outbound/workspace/project-workbench-session.ts`
- `test/todo-ledger.test.ts`
- `test/trace-selection.test.ts`
- `test/workspace-todo-view.test.ts`

## 구현 내용

- Codex native thread 시작·재개 config에 `tools.update_plan.enabled=true`를 명시했다. 사용자 전역 설정이나 주입된 transport/command는 변경하지 않는다.
- default collaboration mode의 developer instruction은 다단계 실행에만 native `update_plan` 등록·상태 갱신을 요구하고, 도구 묶음 전 한국어 목적과 결과 후 관측 설명을 요구한다. 도구 성공이나 turn 종료를 계획 완료 근거로 쓰지 않도록 명시했다.
- plan collaboration mode는 `update_plan` 호출을 요구하지 않고 공개 계획 문서를 작성하도록 분리했다. 이 계약은 모델 지침이며 native gate라고 주장하지 않는다.
- projection source에 `native-checklist`와 `public-plan-document` 권한을 구분했다. 과거 public fallback은 읽고 표시할 수 있지만 executable Todo source로 동기화하지 않는다.
- 계획 미수신 시 `계획 본문 미수신` 가짜 항목을 더 만들지 않는다. `request/started`와 일반 tool activity도 Todo 항목이나 완료율을 만들지 않는다.
- default turn에 과거 public fallback을 복제하던 경로를 제거했다. 세션 Todo 갱신은 현재 turn의 native checklist revision에만 반응한다.
- native Plan의 flat 항목마다 설명용 detail을 발명하던 변환을 제거했다. native 상태를 그대로 보존하며, 여러 running 항목도 pending으로 강등하지 않는다.
- 직접 Plan item 참조가 없는 실행 증거는 running 항목이 하나일 때만 연결한다. 여러 running 항목에서는 Todo evidence도 임의 항목에 귀속하지 않는다. 기존 inferred association, pre-plan/source mismatch/ambiguous orphan, revision interval 및 원본 thread/turn/activity identity 규칙은 유지했다.
- 별도 `PiActivityNarrator` 생성은 `enableActivityNarrator` 명시 opt-in일 때만 수행한다. 기본 조립은 native 공개 commentary와 plan narration을 사용한다.
- 새 source 권한과 flat native Todo 계약에 명백히 어긋난 fixture 세 곳을 최소 수정했다.

## 미구현

- native app-server가 Plan 항목별 직접 ID를 제공하지 않으므로 직접 association은 추가하지 않았다. 현재 관계는 기존처럼 명시적인 `inferred`이며, 모호하면 orphan이다.
- public Plan document 전용 영속 문서는 새로 만들지 않았다. 기존 journal/projection 표시와 과거 fallback 호환 읽기만 유지한다.
- narrator opt-in을 켜는 새 사용자 UI/설정은 추가하지 않았다. composition API 옵션만 제공한다.

## 위험

- Codex app-server 0.153.4의 실제 thread config 수용 형태와 collaboration developer instruction 동작은 실행 확인하지 않았다.
- 다중 running native Todo를 허용하도록 문서 validation을 확장했으므로 기존 수동 Todo의 단일 active 제한은 source 없는 문서에만 유지된다.
- 기존 테스트 중 과거 public fallback 생성·기본 narrator·자동 detail을 기대하는 추가 assertion이 남아 있을 수 있다.

## 검증

사용자 요청에 따라 test, typecheck, build, benchmark, 독립 review, 외부 AI 호출을 모두 실행하지 않았다. 계획의 수락 시나리오 1~9는 전부 **NOT RUN**이다. 따라서 빌드 가능, 실사용 완료, 회귀 없음으로 판정하지 않는다.
