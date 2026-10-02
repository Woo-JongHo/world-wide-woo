당신은 99_www(WWW TUI, TypeScript/Bun) 저장소의 독립 검토자다. 읽기 전용으로만 작업하고 파일을 수정하지 마라. Linear·Obsidian 게시나 기록도 하지 마라.

먼저 `AGENTS.md`, `LAYERS.md`, `docs/workflows/FEATURE_IMPLEMENTATION_CONTRACT.md`를 읽어라. `.www/runtime`, `.www/sessions`, `.www/scratchpad`는 탐색하지 마라.

## 검토 대상

기능: approval, authentication, cache, session, test (각 후보 3건, 묶음 검토)
변경 파일: 각 기능 `.www/evidence/2026-10-03-feature-template/<feature>/work.diff`의 대상 파일
작업 내용: 절 순서 정리(§3·§4)만 — 마지막 공개 선언 앞의 내부 `function` 선언(호이스팅됨)을 파일 끝으로 옮기고 const·class·type은 그대로 두었다. 이어서 가독성 검사기 `--write`로 정렬했다.
작업 차분: `.www/evidence/2026-10-03-feature-template/<feature>/work.diff` — 작업 직전 사본(`before/`) 대비 이번 작업의 전체 차이다. 이 차분만 평가하라. 같은 파일의 다른 미커밋 변경은 평가 대상이 아니다.
실행자 검증 보고: 기능마다 `00`/`06` changed=0·misaligned=0, `tsc` 통과, 아키텍처 0 fail, 모듈 import smoke 통과, `test-baseline.txt` 대비 `test-after.txt`의 실패·오류(`(fail)`·`(error)`) 새 항목 0(`test-diff.txt` 비어 있음), 편집 직전 digest 재대조 `digest-recheck.txt`. 순수 이동 확인: `.www/evidence/2026-10-03-feature-template/pure-move-check.txt`(공백 제거 후 문자 multiset 비교, 추가는 검사기의 import 끝 쉼표뿐).

## 요청

한국어로 답하고 근거는 `파일:줄`로 대라. 추측은 추측이라고 표시하라. 필요하면 `bunx tsc --noEmit`과 `bun test <파일>`을 실행해도 된다.

1. **결함**: 동작 회귀, 선언 이동으로 생긴 초기화 순서 문제(TDZ, `extends`, static 필드·블록, computed key, 최상위 호출), 계약이 다른 코드를 합친 곳, 레이어 경계 위반, `work.diff` 밖의 변경 혼입을 P1/P2/P3로 나눠 찾아라.
2. **형식**: 계약의 장 순서·절 순서에 맞는지, 형식에 맞추려고 의미를 해친 곳(과잉 적용)이 있는지 평가하라.
3. 마지막에 "바로 고칠 것 / 결정이 필요한 것 / 문제없음" 3줄로 요약하라.

## 추가 정보

approval·authentication·cache·session은 블록 끝을 0열 `}`로 찾던 이전 이동 도구로 처리됐다. 이 도구는 context에서 여러 줄 반환 타입(`} {`)을 잘못 잘라 문법 오류를 냈고(자동 검사에서 발견, `.www/evidence/2026-10-03-feature-template/context-failed-run1/`), 이후 중괄호 깊이 스캐너와 순수 이동 검사로 교체됐다. 앞의 네 기능은 tsc·테스트를 통과했고 `pure-move-check.txt`로 순수 이동을 확인했다. 이 판단이 충분한지도 평가하라. test 기능은 const 화살표 helper라 옮기지 않았다(`.www/evidence/2026-10-03-feature-template/test/remaining.md`).
