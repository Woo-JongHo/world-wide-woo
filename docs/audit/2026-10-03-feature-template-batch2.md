# Feature Template 적용 — 묶음 2와 개별 기능 (2026-10-03)

- 작업 종류: 절 순서 정리(§3·§4)만. 마지막 공개 선언 앞의 내부 `function` 선언을 파일 끝으로 이동하고 가독성 검사기로 정렬
- 검토자: Codex CLI 0.158, gpt-6-astra, 추론 high, 읽기 전용. 다섯 검토를 병렬 실행
- 요청문: `.www/evidence/2026-10-03-feature-template/astra-review-{b2,context,workflow,dashboard,monitoring}-prompt.md`
- 순수 이동 증거: `.www/evidence/2026-10-03-feature-template/pure-move-check.txt`

## 결과

| 검토 | 기능 | 결과 |
|---|---|---|
| b2 | approval, authentication, cache, session, test | P1·P2·P3 없음 |
| context | context | P1·P2·P3 없음 |
| workflow | workflow | P1·P2·P3 없음 |
| dashboard | dashboard | P1·P2·P3 없음 |
| monitoring | monitoring | P1·P2·P3 없음 |

## 진행 중 발견한 문제와 조치

- **이동 도구의 블록 끝 오판.** 0열의 첫 `}`를 함수 끝으로 보던 도구가 context의 여러 줄 반환 타입(`} {`)을 잘라 문법 오류를 냈다. 타입 검사에서 즉시 발견해 `before/` 사본으로 복원했다(`context-failed-run1/`). 도구를 문자열·템플릿·주석을 구분하는 중괄호 깊이 스캐너로 바꾸고, 순수 이동 검사와 타입 실패 시 자동 복원을 추가했다.
- **오염된 기준선.** workflow는 context가 깨진 상태에서 기준선을 잡았으므로 무효 처리하고 복원 후 다시 실행했다(`workflow-invalid-run1/`).
- **이전 도구로 처리한 기능의 검증.** approval·authentication·cache·session은 이전 도구로 처리됐다. 공백 제거 후 문자 multiset 비교에서 추가된 문자가 검사기의 import 끝 쉼표뿐임을 확인했고, b2 검토자가 AST 비교로 본문 동일성을 따로 확인했다.
- **test의 남은 후보 3건.** 내부 helper가 모두 `const` 화살표 함수여서 계약 원칙 6에 따라 옮기지 않았다(`test/remaining.md`).

## 원문 — b2

**지정한 `work.diff` 5개·대상 파일 8개에서 P1·P2·P3 결함을 발견하지 못했습니다.** 파일 수정과 외부 게시·기록은 하지 않았습니다.

- **동작·초기화 순서:** TypeScript AST로 선언별 구조를 비교한 결과, 함수 본문과 공개 선언은 동일하고 내부 `function`을 제외한 선언 순서도 보존됐습니다. 이동한 함수는 같은 모듈 범위에 남아 있습니다. `extends`, static 필드·블록, computed key, 최상위 호출과의 순서 충돌도 발견하지 못했습니다. 대표적으로 공개 클래스 뒤에 helper가 배치된 [approval-overlay.ts:129](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/approval/view/approval-overlay.ts:129), [www-cache-view.ts:94](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/cache/view/www-cache-view.ts:94), [native-thread-picker.ts:79](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/session/view/native-thread-picker.ts:79)을 확인했습니다.
- **계약 병합·레이어·변경 혼입:** 함수 병합이나 import 대상 변경은 없습니다. 8개 모두 `before/`에 `work.diff`를 메모리에서 적용한 결과가 현재 파일과 정확히 일치했고, 사본 SHA-256도 `digest-before.txt`·`digest-recheck.txt`와 일치했습니다. 기존 미커밋 변경을 이번 결함으로 판정하지 않았습니다.
- **과잉 적용:** 공개 이름, 반환 계약, 문자열·정규식, 호출 관계를 형식에 맞추려고 바꾼 흔적은 없습니다.

형식 판정은 다음과 같습니다.

| 기능 | 판정과 근거 |
|---|---|
| approval | §3 뒤에 §4 배치 완료. [approval-presentation.ts:85](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/approval/view/approval-presentation.ts:85) |
| authentication | 공개 함수 뒤에 내부 helper 배치 완료. [auth-overlay-view.ts:89](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/authentication/view/auth-overlay-view.ts:89) |
| cache | 공개 투영 함수·클래스가 내부 처리보다 먼저 위치. [cache-telemetry-projection.ts:9](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/cache/view-model/cache-telemetry-projection.ts:9), [www-cache-view.ts:26](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/cache/view/www-cache-view.ts:26) |
| session | 공개 클래스·함수 뒤에 내부 helper 배치 완료. [www-history-view.ts:40](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/session/view/www-history-view.ts:40) |
| test | §3·§4 후보 3건은 남아 있으며 정렬만 수행. 이번 범위의 의도적 보류로 수용 가능. [www-test-view.ts:13](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/test/view/www-test-view.ts:13), [remaining.md:3](/Users/jonghoPro/woo/00_project/99_www/.www/evidence/2026-10-03-feature-template/test/remaining.md:3) |

장 위치와 의존 관계는 변경되지 않았습니다. 다만 **전체 절 순서까지 완료된 것은 아닙니다.** approval·authentication에는 상수가 공개 타입보다 앞서는 기존 §1·§2 순서가 남아 있습니다. 이는 이번 범위에서 명시적으로 제외된 작업입니다. [approval-presentation.ts:9](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/approval/view/approval-presentation.ts:9), [auth-overlay-view.ts:11](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/authentication/view/auth-overlay-view.ts:11), [SKILL.md:24](/Users/jonghoPro/woo/00_project/99_www/.agents/skills/woo-feature-template/SKILL.md:24)

`test` 유지 사유에는 구분이 필요합니다. 계약은 **모든 const의 이동을 금지하지 않고 초기화 의존성을 우선**합니다. 따라서 “const라서 이동 불가”보다는 “이번 작업은 호이스팅된 function 이동으로 한정했고 const helper는 별도 검토로 보류”라는 해석이 정확합니다. 현재 유지로 생긴 회귀는 없습니다. [remaining.md:4](/Users/jonghoPro/woo/00_project/99_www/.www/evidence/2026-10-03-feature-template/test/remaining.md:4), [FEATURE_IMPLEMENTATION_CONTRACT.md:29](/Users/jonghoPro/woo/00_project/99_www/docs/workflows/FEATURE_IMPLEMENTATION_CONTRACT.md:29)

**이전 이동 도구의 안전성을 문자 multiset만으로 입증하기에는 부족합니다.** 문자 수가 같아도 인수 순서·연산 순서·함수 경계는 달라질 수 있으며, 타입 검사와 테스트가 모든 의미 변경을 잡지는 않습니다. [pure-move-check.txt:1](/Users/jonghoPro/woo/00_project/99_www/.www/evidence/2026-10-03-feature-template/pure-move-check.txt:1) 다만 이번 네 기능은 추가로 수행한 선언별 AST 비교와 초기화 검토에서도 보존을 확인했으므로, **이번 변경을 수용할 근거는 충분합니다.**

직접 재검증한 결과는 타입 검사 통과, 아키텍처 포함 관련 테스트 **71 pass / 0 fail**, 8개 모듈 import 성공, `00 changed=0`·`06 misaligned=0`, 장 지도 최신입니다. 전체 테스트는 재실행하지 않았으며, 저장된 다섯 기능의 전후 실패·오류 목록이 각각 동일함을 확인했습니다. 전체 테스트 자체는 기존 실패가 남아 있습니다. [test-after.txt:100](/Users/jonghoPro/woo/00_project/99_www/.www/evidence/2026-10-03-feature-template/approval/test-after.txt:100)

바로 고칠 것: 이번 차분에는 없음.
결정이 필요한 것: 이번 변경 수용에는 없음.
문제없음: 네 기능의 function 이동과 다섯 기능의 정렬 변경.
## 원문 — contex

**이번 `context/work.diff`에서 P1·P2·P3 결함을 발견하지 못했습니다.** 파일 수정이나 외부 게시·기록은 하지 않았습니다.

- **동작·초기화:** 두 파일의 선언별 AST가 전후 동일하고, 함수 선언을 제외한 최상위 선언의 상대 순서도 같습니다. `sources → usedMB` 초기화가 유지됐으며, 두 클래스에는 `extends`·static 초기화·computed key가 없습니다. TDZ나 최상위 호출 회귀를 발견하지 못했습니다. 근거: [www-context-catalog.ts:17](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/context/view/www-context-catalog.ts:17), [www-context-view.ts:34](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/context/view/www-context-view.ts:34), [www-context-view.ts:103](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/context/view/www-context-view.ts:103).
- **범위·경계:** import와 각 선언의 내용이 보존되어 계약이 다른 코드의 병합이나 새 레이어 위반은 없습니다. `before/`에 차분을 메모리에서 적용한 결과가 현재 두 파일과 정확히 일치해, 차분 밖 변경 혼입도 확인되지 않았습니다. 기준: [work.diff:1](/Users/jonghoPro/woo/00_project/99_www/.www/evidence/2026-10-03-feature-template/context/work.diff:1).
- **형식:** 7장 표현의 위치를 유지하면서 공개 진입점 뒤에 내부 함수를 배치해 §3→§4 순서를 충족합니다. 의미를 해치는 과잉 적용은 없습니다. 근거: [계약:59](/Users/jonghoPro/woo/00_project/99_www/docs/workflows/FEATURE_IMPLEMENTATION_CONTRACT.md:59), [www-context-catalog.ts:31](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/context/view/www-context-catalog.ts:31), [www-context-view.ts:135](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/context/view/www-context-view.ts:135).

직접 검증한 `tsc --noEmit`, 두 모듈 import, Context·Source 관련 및 아키텍처 테스트 **40개가 통과**했습니다. 전체 테스트는 재실행하지 않았으며, 저장된 전후 실패·오류 목록의 동일성과 빈 `test-diff.txt`를 확인했습니다.

바로 고칠 것: 없음
결정이 필요한 것: 없음
문제없음: 이번 차분의 선언 이동·정렬, 초기화 순서, §3·§4 배치
## 원문 — workflow

**P1·P2·P3 결함을 발견하지 못했습니다.** 검토 범위는 workflow의 `work.diff`에 포함된 2개 파일입니다.

- **동작·초기화:** 함수·클래스 23개의 본문은 전후 변환 결과가 동일했습니다. 두 클래스에는 `extends`, static 초기화, computed key가 없으며 helper는 `render()` 실행 시 호출합니다. 선언 이동으로 생긴 TDZ·최상위 호출 문제는 없습니다. 근거: [www-workflow-view.ts:35](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/workflow/view/www-workflow-view.ts:35), [www-workflow-view.ts:57](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/workflow/view/www-workflow-view.ts:57).
- **변경 혼입·경계:** `before/`에 차분을 메모리에서 적용한 결과가 현재 두 파일과 정확히 일치했고, 사본 digest도 기록과 일치했습니다. import 대상 변경이나 서로 다른 계약의 코드 통합은 없습니다. 근거: [work.diff:1](/Users/jonghoPro/woo/00_project/99_www/.www/evidence/2026-10-03-feature-template/workflow/work.diff:1), [digest-recheck.txt:1](/Users/jonghoPro/woo/00_project/99_www/.www/evidence/2026-10-03-feature-template/workflow/digest-recheck.txt:1).
- **형식:** 공개 함수·클래스 뒤에 내부 함수가 배치되어 §3→§4를 충족합니다. 장 간 책임 이동은 없으며, 의미를 해치는 과잉 적용도 발견하지 못했습니다. 근거: [www-workflow-catalog.ts:20](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/workflow/view/www-workflow-catalog.ts:20), [www-workflow-catalog.ts:51](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/workflow/view/www-workflow-catalog.ts:51), [www-workflow-view.ts:89](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/workflow/view/www-workflow-view.ts:89).

직접 실행한 `tsc --noEmit`과 두 모듈 import는 통과했습니다. workflow 테스트는 **1 통과·1 실패**였으며, 실패는 기준선에 이미 있던 7단계 화면 검증입니다. 저장된 전체 전후 목록도 실패 93개·오류 2개로 동일합니다. 근거: [test-baseline.txt:78](/Users/jonghoPro/woo/00_project/99_www/.www/evidence/2026-10-03-feature-template/workflow/test-baseline.txt:78), [test-after.txt:78](/Users/jonghoPro/woo/00_project/99_www/.www/evidence/2026-10-03-feature-template/workflow/test-after.txt:78). 전체 테스트와 가독성·아키텍처 검사는 재실행하지 않았습니다.

바로 고칠 것 / 없음
결정이 필요한 것 / 없음
문제없음 / 이번 차분의 선언 이동·정렬, §3→§4 순서, 기존 초기화·의존 관계 유지
## 원문 — dashboard

**dashboard의 `work.diff`에서 P1·P2·P3 결함을 발견하지 못했습니다.** 다른 미커밋 변경은 평가에서 제외했습니다.

- **동작·초기화:** 이동 대상은 호이스팅되는 내부 함수 선언입니다. 공개 클래스 뒤에 배치됐으며, TDZ·`extends`·static 초기화·computed key·최상위 호출에 따른 새 순서 문제는 확인되지 않았습니다. 근거: [entry-dashboard-view.ts:257](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/dashboard/view/entry-dashboard-view.ts:257), [shared-dashboard-views.ts:200](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/dashboard/view/shared-dashboard-views.ts:200).
- **의미·범위:** 함수·클래스 30개의 선언별 Bun 변환 결과가 전후 동일했습니다. 함수 병합이나 import 대상 변경도 없습니다. `before/`에 `work.diff`를 메모리에서 적용한 결과가 현재 두 파일과 일치해, 차분 밖의 후속 변경 혼입은 없었습니다.
- **형식:** §3 공개 선언 → §4 내부 처리 순서는 충족하며, 장 소유·레이어 경계 변경이나 과잉 적용은 없습니다. 다만 [shared-dashboard-views.ts:37](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/dashboard/view/shared-dashboard-views.ts:37)의 공개 interface는 여전히 클래스 뒤에 있습니다. 기존 배치이고, §1·§2는 별도 작업이라는 [스킬 규정:24](/Users/jonghoPro/woo/00_project/99_www/.agents/skills/woo-feature-template/SKILL.md:24)에 따라 이번 결함으로 분류하지 않았습니다.

직접 실행한 타입 검사는 통과했고, 아키텍처 테스트는 **17개 통과**했습니다. 관련 테스트는 **30개 통과·3개 실패**했으며, 세 실패 모두 [작업 전 기준선:11](/Users/jonghoPro/woo/00_project/99_www/.www/evidence/2026-10-03-feature-template/dashboard/test-baseline.txt:11)에 있습니다. 전체 테스트는 재실행하지 않았고, 저장된 전후 실패·오류 목록이 동일함을 확인했습니다.

바로 고칠 것: 없음
결정이 필요한 것: 없음
문제없음: 이번 함수 이동·정렬의 의미 보존과 §3·§4 순서
## 원문 — monitoring

**이번 `work.diff`에서 P1·P2·P3 신규 결함은 발견하지 못했습니다.** 5개 파일만 검토했으며 수정·게시·기록은 하지 않았습니다.

- **동작·초기화:** 내부 함수의 정규화된 실행 코드와 나머지 모듈 코드가 전후 동일했습니다. 함수는 호이스팅되는 선언이며, 관련 클래스에 `extends`·static 초기화·computed key가 없습니다. 상수 초기화 순서도 유지됩니다. 근거: [request-runtime-view.ts:13](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/monitoring/view/request-runtime-view.ts:13), [workbench-monitor-view.ts:17](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/monitoring/view/workbench-monitor-view.ts:17).
- **계약·경계·혼입:** 함수 병합이나 import 대상 변경이 없습니다. 5개 모두 `before/ + work.diff`가 현재 파일과 정확히 일치했습니다. 기존 사용자 변경 두 파일은 작업 전 사본을 기준으로 구분했습니다. 근거: [status-before.txt:1](/Users/jonghoPro/woo/00_project/99_www/.www/evidence/2026-10-03-feature-template/monitoring/status-before.txt:1).
- **형식:** 이번 범위인 §3 공개 선언 → §4 내부 처리 순서는 충족하며, 장별 책임 이동이나 의미를 해치는 과잉 적용은 없습니다. 예: [monitoring-overlay.ts:89](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/monitoring/view/monitoring-overlay.ts:89), [www-monitor-view.ts:406](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/monitoring/view/www-monitor-view.ts:406). 다만 [workbench-telemetry.ts:12](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/monitoring/view/workbench-telemetry.ts:12)의 re-export 사이 import는 기존 상태이므로, 파일 전체의 §0까지 완전 준수한다고 판정하지는 않습니다.

직접 실행한 `tsc --noEmit`과 5개 모듈 import는 통과했습니다. 관련 테스트·아키텍처 검사는 **37 통과·4 실패**였으며, 4건 모두 [기존 실패 목록:69](/Users/jonghoPro/woo/00_project/99_www/.www/evidence/2026-10-03-feature-template/monitoring/test-baseline.txt:69)에 있습니다. 제공된 전후 실패·오류 목록도 동일했습니다.

바로 고칠 것 / 없음
결정이 필요한 것 / 이번 차분에는 없음
문제없음 / §3·§4 순서 정리, 초기화 안전성, 기존 변경 보존
