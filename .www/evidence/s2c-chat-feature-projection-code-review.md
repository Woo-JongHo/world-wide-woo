# S2-C Chat Feature Projection 독립 코드 리뷰

- 검토일: 2026-09-25
- 범위: `workbench-feature-reads.ts`, `adapters/inbound/tui/features/chat/**`, `workbench-shell.ts`, `astra-surface.ts`, 관련 테스트·아키텍처 게이트
- 판정: `CLEAR` / `APPROVE`

## 확인 결과

- Chat 하위 파일에는 `WorkbenchSnapshot` 참조가 남아 있지 않다. Chat view, durable transcript, live activity, renderer, Astra execution transcript 모두 `ChatFeatureProjection` 또는 그 도메인 항목 타입만 받는다.
- 일반 Workbench, Astra execution surface, Astra execution heading, demo 진입·복귀 경로가 모두 `projectChatFeature(snapshot)`을 통해 Chat에 상태를 전달한다. `AstraWorkspace`가 전체 Snapshot getter를 유지하는 것은 Workflow/Context/Usage 등 다른 화면의 조립 책임이며, Chat transcript의 입력은 `getChat`으로 한정된다.
- Projection은 화면 폭·ANSI·focus·scroll·캐시를 포함하지 않고, 활동·채팅·휘발 draft·실행/승인·queue·T-note·workflow 등 Chat 합성에 필요한 의미 상태만 제공한다. 새 writer, store, 상태 owner를 만들지 않는다.
- 최종 Snapshot은 `ProjectWorkbench.makeSnapshot()`에서 깊게 동결된다. Projection은 그 불변 producer 참조를 선택하고 외부 record만 동결하므로, 오래된 Snapshot/Projection이 뒤 publish의 변경으로 바뀌지 않는 기존 S0-C 계약과 모순되지 않는다.
- streaming→final 교체는 `project-workbench-lifecycle.test.ts`의 실제 Workbench lifecycle 검증이 보장한다. 같은 assistant identity가 final Activity로 정착할 때, volatile draft와 durable message가 겹치는 Snapshot이 없음을 검증한다. S2-C의 Projection 테스트는 이 경계의 identity/draft 전달도 추가로 확인한다.

## 실행한 검증

`bun test test/workbench-feature-reads.test.ts test/architecture.test.ts test/astra-ui.test.ts test/project-workbench-lifecycle.test.ts && bun run check && git diff --check`

- 135 tests passed, 0 failed, 4,607 assertions
- TypeScript `tsc --noEmit` 통과
- diff whitespace 오류 없음

## 스킬 관점 점검

요청된 `remove-ai-slops`, `programming` 스킬은 현재 제공된 skill catalog 및 로컬 skill 경로에서 찾을 수 없어 로드하지 못했다. 대신 같은 기준으로 수동 점검했다.

- 테스트는 단순 제거 확인만 하지 않고, 좁은 필드 계약·streaming/final identity·과거 Projection 안정성 및 실제 lifecycle/render 경로를 검증한다.
- 구현은 새 parser/normalizer/store를 추가하지 않고 기존 Snapshot에서 필요한 읽기 상태만 선택한다.
- `any`, untyped escape hatch, 프롬프트 문자열 일치식 테스트, 불필요한 추상화는 이 변경 범위에서 발견하지 못했다.

## Findings

### CRITICAL

없음.

### HIGH

없음.

### MEDIUM

없음.

### LOW

없음.

## 결론

`codeQualityStatus: CLEAR`  
`recommendation: APPROVE`  
`blockers: 없음`
