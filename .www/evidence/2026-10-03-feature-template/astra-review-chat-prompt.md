당신은 99_www(WWW TUI, TypeScript/Bun) 저장소의 독립 검토자다. 읽기 전용으로만 작업하고 파일을 수정하지 마라. Linear·Obsidian 게시나 기록도 하지 마라.

먼저 `AGENTS.md`, `LAYERS.md`, `docs/workflows/FEATURE_IMPLEMENTATION_CONTRACT.md`를 읽어라. `.www/runtime`, `.www/sessions`, `.www/scratchpad`는 탐색하지 마라.

## 검토 대상

기능: chat
변경 파일: `.www/evidence/2026-10-03-feature-template/chat/work.diff`의 대상 파일 17개
작업 내용: 절 순서 정리(§3·§4)만 — 마지막 공개 선언 앞의 내부 `function` 선언(호이스팅됨)을 파일 끝으로 옮기고 const·class·type은 그대로 두었다. 이어서 가독성 검사기 `--write`로 정렬했다.
작업 차분: `.www/evidence/2026-10-03-feature-template/chat/work.diff` — 작업 직전 사본(`before/`) 대비 이번 작업의 전체 차이다. 이 차분만 평가하라. 같은 파일의 다른 미커밋 변경은 평가 대상이 아니다.
실행자 검증 보고: 파일마다 `00`/`06` changed=0·misaligned=0, `tsc` 통과, 아키텍처 0 fail, 17개 모듈 import smoke 통과, `.www/evidence/2026-10-03-feature-template/chat/test-baseline.txt` 대비 `test-after.txt` 실패·오류 새 항목 0, `digest-recheck.txt`, 순수 이동 `.www/evidence/2026-10-03-feature-template/pure-move-check.txt`의 chat 행. 4개 파일(`status-before.txt`)에는 작업 전부터 미커밋 변경이 있었고, 그중 www-execution.ts·work-step-components.ts·work-step-public-projection.ts에는 오늘 앞선 diff 표시·record 통합 작업도 포함돼 있다(이번 평가 대상 아님).

## 요청

한국어로 답하고 근거는 `파일:줄`로 대라. 추측은 추측이라고 표시하라. 필요하면 `bunx tsc --noEmit`과 `bun test <파일>`을 실행해도 된다.

1. **결함**: 동작 회귀, 선언 이동으로 생긴 초기화 순서 문제(TDZ, `extends`, static 필드·블록, computed key, 최상위 호출), 계약이 다른 코드를 합친 곳, 레이어 경계 위반, `work.diff` 밖의 변경 혼입을 P1/P2/P3로 나눠 찾아라.
2. **형식**: 계약의 장 순서·절 순서에 맞는지, 형식에 맞추려고 의미를 해친 곳(과잉 적용)이 있는지 평가하라.
3. 마지막에 "바로 고칠 것 / 결정이 필요한 것 / 문제없음" 3줄로 요약하라.

## 추가 정보

1차 실행은 이동 도구가 정규식 리터럴(`{16,}`, 따옴표)을 코드로 읽어 `result-cards.ts`에서 문법 오류가 났고, 타입 검사 실패 시 자동 복원으로 17개 파일 모두 `before/` digest로 돌아갔다(`.www/evidence/2026-10-03-feature-template/chat-failed-run1/`). 도구에 정규식 리터럴 모드를 추가한 뒤 임시 사본에서 17개 파일의 이동·문법 검사를 먼저 통과시키고 다시 실행했다. 남은 후보 1건은 `.www/evidence/2026-10-03-feature-template/chat/remaining.md` 참고. 차분이 크므로 함수 본문 동일성은 AST 비교로 확인하라.
