당신은 99_www(WWW TUI, TypeScript/Bun) 저장소의 독립 검토자다. 읽기 전용으로만 작업하고 파일을 수정하지 마라. Linear·Obsidian 게시나 기록도 하지 마라.

먼저 `AGENTS.md`, `LAYERS.md`, `docs/workflows/FEATURE_IMPLEMENTATION_CONTRACT.md`를 읽어라. `.www/runtime`, `.www/sessions`, `.www/scratchpad`는 탐색하지 마라.

## 검토 대상

기능: 작은 기능 묶음 8개 — project-map, plan, stats, tnote, trace, model-selection, demo, repository
변경 파일: 기능별 `.www/evidence/2026-10-03-feature-template/<feature>/work.diff`의 대상 파일(기능당 1개)
작업 내용: 절 순서 정리만 — 첫 공개 선언 앞의 내부 `function` 선언(호이스팅됨)을 파일 끝으로 옮기고 const·class·type은 그대로 두었다. 이어서 가독성 검사기 `--write`로 import·표를 정렬했다(project-map은 같은 이동을 수동으로 했다).
작업 차분: `.www/evidence/2026-10-03-feature-template/<feature>/work.diff` (기능별) — 작업 직전 사본(`before/`) 대비 이번 작업의 전체 차이다. 이 차분만 평가하라. 같은 파일의 다른 미커밋 변경은 평가 대상이 아니다.
실행자 검증 보고: 기능마다 `00`/`06` changed=0·misaligned=0, `tsc` 통과, 아키텍처 0 fail, 모듈 import smoke 통과, 전체 실패 목록 `test-baseline.txt` 대비 `test-after.txt` 새 실패 0(`test-diff.txt` 비어 있음). 기존 실패 93건은 작업 전부터 있었다.

## 요청

한국어로 답하고 근거는 `파일:줄`로 대라. 추측은 추측이라고 표시하라. 필요하면 `bunx tsc --noEmit`과 `bun test <파일>`을 실행해도 된다.

1. **결함**: 동작 회귀, 선언 이동으로 생긴 초기화 순서 문제(TDZ, `extends`, static 필드·블록, computed key, 최상위 호출), 계약이 다른 코드를 합친 곳, 레이어 경계 위반, `work.diff` 밖의 변경 혼입을 P1/P2/P3로 나눠 찾아라.
2. **형식**: 계약의 장 순서·절 순서에 맞는지, 형식에 맞추려고 의미를 해친 곳(과잉 적용)이 있는지 평가하라.
3. 마지막에 "바로 고칠 것 / 결정이 필요한 것 / 문제없음" 3줄로 요약하라.

## 추가 확인

이번이 `woo-feature-template` 스킬의 첫 실제 적용이다. 2차 검토 조치(`docs/audit/2026-10-03-codex-astra-structure-review-2.md`의 반영 결과 표)가 실제로 반영됐는지도 함께 확인하라: `src/core/domain/execution/file-diff.ts`의 생략 표식 판별, `scripts/feature-map.ts`의 탐지 개선과 `test/feature-map.test.ts`, 개정 계약, 개정 스킬(`.agents/skills/woo-feature-template/SKILL.md`)의 고정·차분·게이트 절차. 각 기능의 `before/`·`status-before.txt`·`digest-before.txt`도 증거로 쓸 수 있다.
