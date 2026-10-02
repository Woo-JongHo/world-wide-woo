# Feature Template 적용 — 작은 기능 묶음 1 (2026-10-03)

- 대상 기능: project-map, plan, stats, tnote, trace, model-selection, demo, repository (절 순서 후보 각 1–2건)
- 작업 종류: 절 순서 정리(§3·§4)만. 첫 공개 선언 앞의 내부 `function` 선언을 파일 끝으로 이동하고 가독성 검사기로 정렬
- 검토자: Codex CLI 0.158, gpt-6-astra, 추론 high, 읽기 전용, 100,782 토큰
- 요청문: `.www/evidence/2026-10-03-feature-template/astra-review-batch1-prompt.md`
- 기능별 증거: `.www/evidence/2026-10-03-feature-template/<feature>/` (`before/`, `digest-before.txt`, `status-before.txt`, `test-baseline.txt`, `test-after.txt`, `work.diff`)

## 결과

8개 기능 모두 절 순서 후보 0건, P1·P2 동작 결함 없음. 작업 밖 변경 혼입 없음(검토자가 `before/` digest와 `work.diff`를 대조).

## 반영 결과

| 지적 | 등급 | 조치 | 확인 |
|---|---|---|---|
| 회귀 증거가 실행 오류 2건을 식별하지 않음 | P2 | 기준선에 `(error) <파일> <첫 error 문장>` 행을 기록하고 실패와 함께 비교하도록 스킬·스크립트 수정. 8개 기능은 `before/` 사본으로 되돌린 상태와 현재 상태를 다시 실행해 보완 | `errors-backfill-before.txt`·`errors-backfill-after.txt`: 실패 93·오류 2 동일. 오류는 `apps/project-view/tests/{data,navigation}.spec.ts`의 Playwright 로딩 오류로 이번 변경과 무관 |
| 주석 속 `export { }`가 탐지를 숨김 | P3 | 공개 목록을 블록 주석 제거 후의 본문에서 수집 | `does not treat an export list inside a block comment as public` |
| 한 줄 static 클래스의 초기화 경고 누락 | P3 | static 검사를 줄 시작 형태에서 본문 전체(주석 제외)로 확대 | `tags one-line classes with static initializers` |
| 편집 직전 digest 재대조의 증거 없음 | 관찰 | 재대조 결과를 기능별 `digest-recheck.txt`로 남기도록 수정(다음 묶음부터) | 스킬 4단계 |
| 상수가 공개 타입보다 앞선 기존 배치(trace, demo) | 결정 | §1·§2 정리는 별도 작업 종류로 두고, §3·§4 정리를 전체 기능에 마친 뒤 따로 진행한다. 타입은 런타임에 영향이 없어 위험이 낮다 | 스킬 4단계 |
| 2차 기록의 "생성기가 tsconfig 밖" | 정정 | 새 테스트가 생성기를 import하므로 검사 대상에 포함됨 | 2차 기록 수정 |

## 원문

**8개 `work.diff`에서는 동작 회귀·초기화 순서 문제·계약 혼합·새 레이어 위반을 발견하지 못했습니다.** 다만 추가 확인에서 회귀 증거의 누락 1건과 탐지기의 잔존 문제 2건을 확인했습니다. 파일 수정이나 외부 기록·게시 없이 검토했습니다.

**결함 판정**

- **P1: 없음.**
- **P2 — 회귀 증거가 실행 오류 2건을 식별하지 않습니다.** 8개 기능 모두 전후 실패 이름 93개는 동일하지만, 실제 요약은 `95 fail / 2 errors`입니다. 오류의 이름·발생 위치·내용이 없어 전후의 오류가 같은지는 확인할 수 없습니다. 따라서 입증된 범위는 “기록된 실패 이름의 새 항목 0”입니다. 오류별 정규화 목록도 전후 비교해야 회귀 게이트를 완료로 판정할 수 있습니다. **코드 회귀를 발견했다는 뜻은 아닙니다.** 근거: [test-baseline.txt:98](/Users/jonghoPro/woo/00_project/99_www/.www/evidence/2026-10-03-feature-template/project-map/test-baseline.txt:98), [test-after.txt:98](/Users/jonghoPro/woo/00_project/99_www/.www/evidence/2026-10-03-feature-template/project-map/test-after.txt:98), [SKILL.md:22](/Users/jonghoPro/woo/00_project/99_www/.agents/skills/woo-feature-template/SKILL.md:22).
- **P3 — 주석 속 별도 export가 탐지를 숨깁니다.** 선언 탐지는 블록 주석을 제거하지만, `reexported`는 원문에서 수집합니다. `/*` 블록 안에 `export { helper };`를 넣으면 실제 내부 `helper`를 공개 선언으로 오인하여 뒤의 공개 함수에 대한 후보가 사라집니다. 직접 실행하여 재현했습니다. 근거: [feature-map.ts:100](/Users/jonghoPro/woo/00_project/99_www/scripts/feature-map.ts:100).
- **P3 — 한 줄짜리 static 클래스는 초기화 경고가 빠집니다.** `function helper() {}` 다음에 `export class Api { static value = helper(); }`를 두면 순서 후보는 나오지만 초기화 경고는 없습니다. static 검사가 줄 시작의 들여쓰기 형태에 한정되어 있고, 기존 테스트는 `extends` 경로만 검증합니다. 직접 재현했습니다. 근거: [feature-map.ts:125](/Users/jonghoPro/woo/00_project/99_www/scripts/feature-map.ts:125), [feature-map.test.ts:19](/Users/jonghoPro/woo/00_project/99_www/test/feature-map.test.ts:19).

**형식과 변경 범위**

8개 모두 공개 함수·클래스가 내부 처리보다 앞에 오도록 정리됐습니다. 이동 대상은 호이스팅되는 함수 선언이며, 실행되는 값 선언의 상대 순서와 import 경로·binding은 유지됐습니다. 함수 통합이나 책임 이동도 없습니다. repository의 필드는 static이 아닌 인스턴스 초기화입니다. 근거: [repository-overlays.ts:21](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/repository/view/repository-overlays.ts:21), [repository-overlays.ts:125](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/repository/view/repository-overlays.ts:125).

모든 `before/`의 SHA-256이 `digest-before.txt`와 일치했고, `before/`→현재 파일의 전체 차이가 각 `work.diff`와 일치했습니다. 이번 작업 밖의 변경 혼입은 발견하지 못했습니다.

다만 판정은 **“§3·§4 정리 완료”**가 정확합니다. trace와 demo에는 상수가 공개 타입보다 앞서는 기존 §1·§2 역전이 남아 있습니다. `before/`에도 같은 배치이므로 이번 결함으로 분류하지 않았습니다. 근거: [계약:57](/Users/jonghoPro/woo/00_project/99_www/docs/workflows/FEATURE_IMPLEMENTATION_CONTRACT.md:57), [workbench-tracer-view.ts:13](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/trace/view/workbench-tracer-view.ts:13), [www-demo.ts:8](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/demo/view-model/www-demo.ts:8).

**2차 검토 조치 반영 여부**

| 조치 | 확인 결과 |
|---|---|
| 생략 표식의 0열 판별 | 반영됨. context 접두 공백을 보존하며 회귀 테스트도 통과했습니다. [file-diff.ts:22](/Users/jonghoPro/woo/00_project/99_www/src/core/domain/execution/file-diff.ts:22), [테스트:242](/Users/jonghoPro/woo/00_project/99_www/test/work-step-card-highlight.test.ts:242) |
| 파일 하나의 diff 입력 계약 | JSDoc과 계약에 명시됐습니다. [file-diff.ts:41](/Users/jonghoPro/woo/00_project/99_www/src/core/domain/execution/file-diff.ts:41) |
| 지도 추정 범위·`미발견`·탐지 개선 | 반영됨. 화살표·별도 export·default·abstract 인식을 확인했습니다. 다만 위 P3 두 건이 남습니다. [feature-map.ts:99](/Users/jonghoPro/woo/00_project/99_www/scripts/feature-map.ts:99), [FEATURE_MAP.md:5](/Users/jonghoPro/woo/00_project/99_www/docs/features/FEATURE_MAP.md:5) |
| 계약의 실행 순서 우선·권장 구현 순서 | 반영됨. 장 번호를 의존 순서로 강제하지 않습니다. [계약:26](/Users/jonghoPro/woo/00_project/99_www/docs/workflows/FEATURE_IMPLEMENTATION_CONTRACT.md:26), [계약:68](/Users/jonghoPro/woo/00_project/99_www/docs/workflows/FEATURE_IMPLEMENTATION_CONTRACT.md:68) |
| 스킬의 고정·차분·게이트 절차 | 문서에 반영됐고 기능별 사본·digest·차분도 존재합니다. 편집 직전 digest 재대조 실행 여부는 제공 증거만으로 확인되지 않습니다. [SKILL.md:21](/Users/jonghoPro/woo/00_project/99_www/.agents/skills/woo-feature-template/SKILL.md:21) |

추가로 “생성기가 타입 검사 대상 밖”이라는 기록은 현재 상태와 다릅니다. 새 테스트가 생성기를 import하여 `tsc --listFilesOnly`에 포함됩니다. 근거: [feature-map.test.ts:2](/Users/jonghoPro/woo/00_project/99_www/test/feature-map.test.ts:2), [검토 기록:20](/Users/jonghoPro/woo/00_project/99_www/docs/audit/2026-10-03-codex-astra-structure-review-2.md:20).

직접 검증한 결과는 **타입 검사 통과, 관련·아키텍처 테스트 48개 통과, 8개 파일 `00/06` 통과, 8개 모듈 import 성공, 장 지도 최신성 통과**입니다. 전체 테스트는 재실행하지 않았습니다.

바로 고칠 것 / 실행 오류 2건의 전후 비교 증거 보완, 탐지기 P3 두 건 수정.
결정이 필요한 것 / 기존 §1·§2 배치 정리를 후속 범위에 포함할지 여부.
문제없음 / 8개 기능의 이번 함수 이동·정렬, 차분 격리, 생략 표식 수정.