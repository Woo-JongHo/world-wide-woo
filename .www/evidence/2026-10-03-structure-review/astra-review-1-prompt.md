당신은 99_www(WWW TUI, TypeScript/Bun) 저장소의 독립 검토자다. 다른 에이전트(Claude)가 오늘 수행한 코드 리뷰·수정·제안을 평가하라. 읽기 전용으로만 작업하고 파일을 수정하지 마라.

작업 트리에는 사용자의 미커밋 변경이 많이 섞여 있다. 아래 "Claude 변경 범위"만 평가 대상으로 삼고, 그 밖의 미커밋 변경은 평가하지 마라. `.www/runtime`, `.www/sessions`, `.www/scratchpad`는 탐색하지 마라. 먼저 `AGENTS.md`, `LAYERS.md`를 읽어라.

## Claude 변경 범위

1. 구조 정리
   - `src/core/domain/value/record.ts`를 새로 만들어 30여 파일에 흩어진 `record()`/`isRecord()` 중복을 `isRecord`·`asRecord`로 통합했다. 실패 시 반환값(null/undefined/{})이 파일마다 달랐는데, `{}` 기본값을 쓰던 곳은 `?? {}`로 명시했다. `runtime-monitor.ts`의 `!== null` 비교는 `isRecord(...)`로 바꿨다.
   - 새 domain 폴더 `value`를 `test/architecture.test.ts` 허용 목록과 LAYERS.md에 등록했다. LAYERS.md의 import 규칙을 실제 코드(`@/` alias)에 맞췄다.
   - `src/test.jsp`를 `.www/evidence/2026-09-23-test-jsp-readability/`로 옮겼다.
   - 손댄 TS 파일에 98_Plugin 가독성 검사기(`.agents/skills/woo-code-readability/scripts/typescript/00_normalize-imports.ts`, `06_align-tables.ts`)를 `--write`로 적용했다.
2. 스킬 정리 (`.agents/skills`)
   - `woo-obsidian-contract`를 `woo-obsidian-publish`에, `woo-github-pr-verify`를 `woo-github-pr`에 합쳤다. `woo-issue-intake`를 `woo-github-issue-intake`로 이름을 바꿨다. `development-map`에 "표는 `development-map:build`로만 생성"을 명시했다. AGENTS.md 참조를 갱신했다.
3. 코드 diff 표시 기능
   - `src/core/domain/execution/file-diff.ts`: unified diff를 줄 번호가 붙은 행으로 해석(`parseUnifiedDiff`, `diffStats`, `classifyDiffLine`).
   - `src/adapters/inbound/tui/features/chat/view-model/file-change.ts`: 두 곳의 중복된 파일 변경 해석을 `projectFileChanges`로 통합.
   - `src/adapters/inbound/tui/foundation/rendering/unified-diff-view.ts`: 줄 번호·+/- 배경색·10줄 뒤 `… +N lines (Ctrl+E 펼치기)` 접기.
   - 호출부: `features/chat/view/www-execution.ts`(`wwwToolRows`), `features/chat/view/work-step-components.ts`(`fileChangeRows`), 상수 `CHAT_DIFF_PREVIEW_ROWS`(chat-output-policy.ts).
   - 테스트: `test/work-step-card-highlight.test.ts`.
4. 아직 구현하지 않은 제안: 기능 구현을 "논문 형식"으로 통일
   - 기능 단위 장 순서: 0 초록(registration) → 1 정의(core/domain) → 2 방법(core/application) → 3 경계(core/ports) → 4 해석(view-model) → 5 표현(view/foundation) → 6 조립(app.ts/shell) → 7 검증(test, 1→4→5 순서). 필요 없는 장은 비우고 명시만 한다.
   - 파일 단위 절 순서: §1 함수 지도(GROUP|FUNCTION|INPUT|RETURN|CALLS|ROLE, `08_function-map.ts`로 검사) → §2 공개 타입 → §3 공개 함수 → §4 개별 처리 → §5 내부 helper. 공개 함수 이름은 장별로 정의 `parse*/classify*/*Stats`, 해석 `project*`, 표현 `render*`.
   - 강제 수단: `docs/workflows/FEATURE_IMPLEMENTATION_CONTRACT.md`, 아키텍처 테스트("기능마다 registration과 test 존재"), 98_Plugin에 절 순서 검사기 추가.

검증 상태(Claude 보고): `tsc --noEmit` 통과, 전체 테스트 1,665개 중 93개 실패는 작업 전과 동일(새 실패 없음), 손댄 파일은 검사기 changed=0·misaligned=0.

## 요청

한국어로 답하라. 근거는 반드시 `파일:줄`로 대라. 추측은 추측이라고 표시하라.

1. **결함**: 위 변경에서 동작 회귀·버그·계약 위반을 심각도 순으로 찾아라. 특히 null/undefined/{} 의미 변화, diff 줄 번호 계산(여러 hunk, `\ No newline at end of file`, 번호 없는 `@@`, 생략 줄 이후), 접기 개수, 레이어 경계 위반을 확인하라. 필요하면 `bun test <파일>`과 `bunx tsc --noEmit`을 실행해도 된다.
2. **구조 판단**: `core/domain/value` 폴더 신설, diff 해석을 core/domain/execution에 둔 결정, 스킬 합치기가 적절한지 평가하고 더 나은 대안이 있으면 제시하라.
3. **논문 형식 제안 평가**: 이 저장소의 실제 기능 2~3개를 골라 제안이 맞는지 확인하고, 약점·과잉 규칙·빠진 장을 지적하라. 채택한다면 바꿀 점을 구체적으로 제안하라.
4. 마지막에 "바로 고칠 것 / 결정이 필요한 것 / 문제없음"으로 3줄 요약하라.
