당신은 99_www(WWW TUI, TypeScript/Bun) 저장소의 독립 검토자다. 읽기 전용으로만 작업하고 파일을 수정하지 마라. Linear·Obsidian 게시나 기록도 하지 마라(이번 세션은 검토만이며 기록 대상 작업이 아니다).

먼저 `AGENTS.md`, `LAYERS.md`를 읽어라. `.www/runtime`, `.www/sessions`, `.www/scratchpad`는 탐색하지 마라. 작업 트리에는 사용자의 무관한 미커밋 변경이 많다. 아래 대상만 평가하라.

이것은 2차 검토다. 1차 검토 원문과 조치표는 `docs/audit/2026-10-03-codex-astra-structure-review.md`에 있다.

## 검토 대상

1. **1차 지적 조치 확인**
   - `src/core/domain/execution/file-diff.ts`: hunk 범위 기반 상태 처리, 파일 헤더는 hunk 밖에서만, `\` 표식 무시, 생략 뒤 번호 null, gap 행 문자는 표현 장으로 이동.
   - `src/adapters/inbound/tui/foundation/rendering/unified-diff-view.ts`: 내용 행만 세는 접기, 좁은 폭 처리(`rowLead`, 폭 3 미만).
   - `src/adapters/inbound/tui/features/chat/view/work-step-components.ts`: ObservationCard 경로는 접지 않음.
   - `src/core/domain/value/record.ts` 주석, `.agents/skills/woo-linear-issue-intake/SKILL.md` 참조.
   - 테스트: `test/work-step-card-highlight.test.ts`의 새 테스트 4개.
   - 회귀 증거: `.www/evidence/2026-10-03-structure-review/test-failures-before.txt`(변경 전 소스), `test-failures-after.txt`.
2. **개정한 계약**: `docs/workflows/FEATURE_IMPLEMENTATION_CONTRACT.md` — 1차 의견대로 장 순서를 읽기 순서로 한정하고, 입력·외부 효과 장을 추가했으며, 검증을 위험 순서로 바꾸고, 이름은 권고, 함수 지도는 게이트에서 제외했다.
3. **장 지도 생성기**: `scripts/feature-map.ts`(`bun run feature-map:build|check`, `report <feature>`) → `docs/features/FEATURE_MAP.md`. import 그래프(`test/architecture/import-graph.ts`)로 기능별 장을 추정하고, 최상위 줄 패턴으로 "공개 선언이 내부 함수 뒤에 있음"을 보고만 한다.
4. **실행 스킬**: `.agents/skills/woo-feature-template/SKILL.md`, `references/astra-review-prompt.md`, AGENTS.md 등록 줄.

다음 단계로 이 스킬을 19개 기능 전체에 차례로 적용(주로 절 순서 정리)할 예정이다. 그 전에 위험을 찾는 것이 목적이다.

## 요청

한국어로 답하고 근거는 `파일:줄`로 대라. 추측은 추측이라고 표시하라. 필요하면 `bunx tsc --noEmit`, `bun test <파일>`, `bun scripts/feature-map.ts report <feature>`를 실행해도 된다.

1. **1차 조치 검증**: 각 지적이 실제로 해소됐는지, 조치로 새 결함이 생겼는지(특히 범위 없는 diff, 여러 파일 diff, `+ changed` 같은 헤더 없는 입력, 폭 계약) P1/P2/P3로 판정하라.
2. **생성기 정확성**: 장 추정이 틀리는 경우(누락·과잉 포함), 절 순서 탐지의 거짓 양성·음성, `check`의 안정성(실행 환경에 따라 결과가 달라지는지)을 평가하라.
3. **스킬의 안전성**: 전체 실행 시 동작 회귀를 만들 수 있는 지점(선언 이동의 TDZ, 사용자 미커밋 변경과의 충돌, 게이트 누락)과 과잉 규칙을 지적하고, 실행 전에 바꿀 점을 제안하라.
4. 마지막에 "바로 고칠 것 / 결정이 필요한 것 / 문제없음" 3줄로 요약하라.
