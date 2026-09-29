# 큐 후속 Goal 연속성 코드 리뷰

## 범위

- `src/core/application/orchestration/request-protocol.ts`
- `src/core/application/orchestration/project-workbench.ts`
- `test/project-workbench-recording.test.ts`

## 스킬 관점 확인

`remove-ai-slops`와 `programming`은 이 세션의 사용 가능한 스킬 목록과 저장소의 `SKILL.md` 검색 결과에 없어서 직접 로드할 수 없었다. 해당 관점(구현을 그대로 되풀이하는 테스트, 불필요한 추상화·정규화, 경계 밖 검증)을 수동 적용했다. 새 테스트는 생산 구현의 상수를 단순 확인하는 부분은 있으나, 큐 진입 컨텍스트라는 외부 계약을 확인하므로 그 자체가 slop 위반은 아니다. 다만 실제 연속성 결과를 검증하지 않아 아래 결함을 막지 못한다. 불필요한 생산 코드 추상화나 untyped escape hatch는 발견하지 못했다.

## CRITICAL

없음.

## HIGH

1. 동일 Goal의 `UNDERSTAND: pass`가 기존 Goal을 보존하지 못한다.

   - 위치: `src/core/application/orchestration/request-protocol.ts:16`
   - 근거: 새 지시문은 같은 Goal이면 `UNDERSTAND`를 `pass`로 보고하고 “retain the current goal”하라고 한다. 그러나 런타임 적용부 `src/core/runtime/request-runtime.ts:244`는 `UNDERSTAND`가 `completed` 또는 `skipped`일 때 `r.objective = report.goal ?? report.summary`를 수행한다. `pass`는 parser에서 `skipped`가 되고, 현재 지시문은 `report.goal`에 `entry.currentGoal`을 넣도록 요구하지도 않는다.
   - 결과: 에이전트가 자연스럽게 연속성 사유만 summary에 기록하면, 새 request의 objective가 기존 Goal이 아니라 “같은 Goal의 후속 요청입니다” 같은 사유로 덮인다. UI/이후 계획이 원래 Goal을 기준으로 유지된다는 요구를 충족하지 못한다.
   - 필요한 수정: 같은 Goal로 skip할 때 runtime objective를 `entry.currentGoal`으로 보존하는 명시적 계약/데이터 경로를 만들거나, 최소한 지시문과 검증을 `UNDERSTAND` pass report의 `goal`이 `entry.currentGoal`과 정확히 같도록 강제해야 한다.

## MEDIUM

없음.

## LOW

없음.

## 테스트·검증 관측

- `bun test test/project-workbench-recording.test.ts test/request-runtime.test.ts`: 50 pass, 0 fail (2026-09-27 로컬 실행).
- `git diff --check`: pass.
- 추가된 테스트(`test/project-workbench-recording.test.ts:289-306`)는 시작 turn에 entry와 문구가 들어간 것만 확인한다. 같은 Goal 판정의 실제 stage report가 적용된 뒤 request objective가 기존 Goal으로 남는지 검증하지 않으므로 HIGH 결함을 검출하지 못한다.

## 재검토 (보완 후)

`src/core/application/orchestration/request-protocol.ts:16`은 이제 currentGoal이 있을 때만 continuity pass를 허용하고, 해당 report의 `goal`을 `entry.currentGoal`과 정확히 같게 넣도록 요구한다. `test/request-runtime.test.ts:67-75`는 skipped UNDERSTAND가 이 Goal을 request objective로 보존함을 검증한다. 따라서 이전 HIGH 결함은 해소됐다.

- 재실행: `bun test test/project-workbench-recording.test.ts test/request-runtime.test.ts` — 51 pass, 0 fail.
- 재실행: `bun run check` — pass.
- 재실행: `git diff --check` — pass.

## 최종 판정

- `codeQualityStatus`: CLEAR
- `recommendation`: APPROVE
- `blockers`: 없음.
