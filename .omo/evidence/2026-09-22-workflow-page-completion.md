# Workflow 페이지 구현 검증

- 범위: `src/adapters/inbound/tui/features/workflow/astra-workflow-view.ts`, `test/astra-ui.test.ts`
- Figma 기준: `Q7kGUdqiaQRJI8CZlPMRX7`, node `50:1986` (`04 WORKFLOW — Subagent Runtime`).

## 시나리오와 관측

1. **넓은 화면의 실제 7단계/위임 투영**
   - 호출: `bun test test/astra-ui.test.ts --test-name-pattern 'Workflow'`
   - 입력: 현재 Turn에 바인딩된 7단계 Request(3 completed, 1 running, 3 pending)와 실행 중인 `verifier` Subagent.
   - 이진 관측: `2 pass / 0 fail`, 30 assertions. 120열 출력에 `7-STAGE REQUEST`, 7단계 상태, 실제 위임 task가 포함된다.

2. **좁은 화면의 안전한 압축**
   - 호출: 동일 테스트.
   - 입력: 위와 동일한 관측을 52열로 렌더.
   - 이진 관측: 모든 행 `visibleWidth <= 52`; 카드 대신 Goal/Stages/Subagents/Failed 행을 사용하면서 7단계와 위임 task를 유지한다.

3. **이전 Turn 차단**
   - 호출: 동일 테스트.
   - 입력: 활성 Turn과 불일치하는 이전 Request만 남긴 상태.
   - 이진 관측: `현재 Turn에 연결된 Request 관측이 없습니다.`를 표시하고 이전 objective를 표시하지 않는다.

4. **타입과 diff 건전성**
   - 호출: `bun run check && git diff --check`
   - 이진 관측: `tsc --noEmit` exit 0, whitespace 오류 없음.

5. **Figma 하단 분석 패널과 실제 Workspace 폭**
   - 호출: `bun test test/astra-ui.test.ts --test-name-pattern 'Workflow'`.
   - 입력: 80열(120열 Workspace에서 38열 rail이 보일 때의 본문 폭) 및 120×100 Workspace 프레임.
   - 이진 관측: `Subagents · delegation relationship tree`, `Parallel execution pipeline`, `Active work queue & retry counts`, `Subagent state matrix`, `State change event log` landmark가 80열에서 모두 보이고 모든 행이 폭을 넘지 않는다. Workspace 프레임은 main Workflow와 `Active process` rail을 함께 표시하며 120열 경계를 넘지 않는다.

## 구현 판정

Figma의 요약 카드 → 위임 관계 그래프 → 7단계 실행 파이프라인 → parallel lane → queue/matrix/state panel → 우측 상태 rail 계층을 기존 `astra-theme`과 `astra-monitoring-layout`의 공통 패널 컴포넌트로 재사용했다. 시간, 컨텍스트 예산, 예시 에이전트, 관계선은 고정값으로 만들지 않았고 Request/Native delegation에 실제로 관측된 값만 출력한다. Native가 queue 순서·retry count·matrix 차원/갱신 시각을 제공하지 않는 영역은 `unavailable`로 표시한다.
