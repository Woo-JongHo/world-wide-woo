당신은 99_www(WWW TUI, TypeScript/Bun) 저장소의 독립 검토자다. 읽기 전용으로만 작업하고 파일을 수정하지 마라. Linear·Obsidian 게시나 기록도 하지 마라.

먼저 `AGENTS.md`, `LAYERS.md`, `docs/workflows/FEATURE_IMPLEMENTATION_CONTRACT.md`, `.agents/skills/woo-feature-template/SKILL.md`를 읽어라. `.www/runtime`, `.www/sessions`, `.www/scratchpad`는 탐색하지 마라. 작업 트리에는 사용자의 무관한 미커밋 변경이 많다. 아래 대상만 평가하라.

## 검토 대상

1. **재사용 도구** `scripts/reorder-sections.ts`(`functions`·`types` 명령)와 `test/reorder-sections.test.ts`. 지금까지 scratchpad의 Python 도구로 하던 이동을 저장소 도구로 옮겼다. 앞서 처리한 19개 기능의 `before/` 사본 69개(`.www/evidence/2026-10-03-feature-template/*/before`)에서 Python 도구와 출력이 바이트 단위로 같았다. 블록 끝은 중괄호·괄호·대괄호 깊이를 문자열·템플릿·주석·정규식 리터럴 밖에서만 센다. 비어 있지 않은 줄 집합이 바뀌면 쓰지 않는다.
2. **탐지 추가** `scripts/feature-map.ts`의 `typeOrderFindings`(§1·§2 후보)와 `test/feature-map.test.ts`. `typeof`로 값에서 파생한 타입은 제외한다.
3. **적용** §1·§2 정리를 7개 기능(approval, authentication, chat, dashboard, demo, session, trace)에 `types` 명령으로 적용했다. 기능별 `.www/evidence/2026-10-03-feature-template-types/<feature>/work.diff`가 작업 직전 사본(`before/`) 대비 이번 작업의 전체 차이다. 같은 파일의 다른 미커밋 변경(앞선 §3·§4 정리 포함)은 평가하지 마라.
   실행자 검증 보고: 파일마다 `00`/`06` changed=0·misaligned=0, `tsc` 통과, 아키텍처 0 fail, 모듈 import smoke 통과, `test-baseline.txt` 대비 `test-after.txt`의 실패·오류 새 항목 0, `digest-recheck.txt`, 순수 이동 `.www/evidence/2026-10-03-feature-template-types/pure-move-check.txt`(추가 문자는 검사기의 import 끝 쉼표 1개뿐).
4. **스킬 개정** `.agents/skills/woo-feature-template/SKILL.md` 4단계의 도구 사용 규칙.

## 요청

한국어로 답하고 근거는 `파일:줄`로 대라. 추측은 추측이라고 표시하라. 필요하면 `bunx tsc --noEmit`, `bun test <파일>`, 메모리 내 입력으로 도구 함수 실행을 해도 된다.

1. **도구 정확성**: `declarationEnd`가 틀리는 입력(정규식과 나눗셈 구분, 중첩 템플릿, 여러 줄 type alias의 `}` 다음 연속 줄, 제네릭, overload, 데코레이터 등)과 `movePublicTypes`/`moveInternalFunctions`의 배치·빈 줄 처리 결함을 P1/P2/P3로 찾아라. 순수 이동 검사가 잡지 못하는 오류(줄은 같지만 의미가 바뀌는 경우)가 있는지 평가하라.
2. **적용 결함**: 7개 `work.diff`의 동작 회귀, 타입 이동으로 읽기 흐름을 해친 곳(과잉 적용), `work.diff` 밖 변경 혼입.
3. 마지막에 "바로 고칠 것 / 결정이 필요한 것 / 문제없음" 3줄로 요약하라.
