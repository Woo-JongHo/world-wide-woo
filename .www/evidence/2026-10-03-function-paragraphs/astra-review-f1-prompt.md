당신은 99_www(WWW TUI, TypeScript/Bun) 저장소의 독립 검토자다. 읽기 전용으로만 작업하고 파일을 수정하지 마라. Linear·Obsidian 게시나 기록도 하지 마라(검토만 하는 세션이다).

먼저 `AGENTS.md`, `docs/workflows/FEATURE_IMPLEMENTATION_CONTRACT.md`(특히 새 절 "함수 단위: 문단 순서")를 읽어라. `.www/runtime`, `.www/sessions`, `.www/scratchpad`는 탐색하지 마라.

## 검토 대상

1. **규칙**: 계약의 "함수 단위: 문단 순서"(F1 가드 → F2 준비 → F3 처리 → F4 결과, 첫 처리 문장 뒤 새 선언 금지, 누적 배열 화면 함수는 구역별 단계 함수로 나눔, 평가 순서를 바꾸는 선언 끌어올리기 금지).
2. **탐지기**: `scripts/function-paragraphs.ts`(TypeScript 7 AST로 함수 본문의 직계 문장을 G/D/B/R로 분류, 첫 B 뒤 D를 후보로 보고), `test/function-paragraphs.test.ts`, `scripts/feature-map.ts`의 `문단 후보` 열.
3. **시범 적용**: `src/adapters/inbound/tui/features/chat/view/result-cards.ts`의 세 카드 render를 단계 함수로 나눔. 변경 전 파일 `.www/evidence/2026-10-03-function-paragraphs/result-cards/before.ts`, 차분 `.www/evidence/2026-10-03-function-paragraphs/result-cards/work.diff`, 골든 비교 `.www/evidence/2026-10-03-function-paragraphs/result-cards/golden.ts`(96개 입력 조합에서 변경 전후 render 출력이 같음; 실행은 그 파일이 `.www/scratchpad/golden/`에 있을 때 기준 경로라 그대로는 실행되지 않을 수 있다).
   실행자 검증: tsc 통과, test/result-cards.test.ts·work-step-card-highlight.test.ts 44 pass(변경 전과 동일), 가독성 00/06 통과.

다음 단계로 이 규칙을 남은 72개 함수(사용자 미커밋 변경이 없는 파일만)에 같은 방식으로 적용할 예정이다.

## 요청

한국어로 답하고 근거는 `파일:줄`로 대라. 추측은 추측이라고 표시하라. 필요하면 `bunx tsc --noEmit`, `bun test <파일>`, 임시 디렉터리에서 도구 실행을 해도 된다.

1. **시범 결함**: 시범 차분이 동작(출력·평가 순서·예외)을 바꾼 곳을 P1/P2/P3로 찾아라. 특히 GenericToolResultCard의 출력 없음 분기, Bash stream 라벨, 생략 줄 위치, 단계 함수 호출 순서.
2. **규칙·탐지기**: 분류(G/D/B/R)의 거짓 양성·음성(예: `let` 누산기, 구조 분해, `using`, 클래스 필드 화살표, 중첩 함수가 부모에 미치는 영향), 규칙이 과잉인 곳(선언이 처리 결과에 의존하는 정상적인 경우), 확대 적용 전에 바꿀 점.
3. **확대 방식**: 72개 함수를 같은 방식으로 바꿀 때의 안전장치(골든 비교의 일반화 방법, 기능별 검토 단위, 건너뛸 기준)를 제안하라.
4. 마지막에 "바로 고칠 것 / 결정이 필요한 것 / 문제없음" 3줄로 요약하라.
