# PLAN·PROGRESS·TEST와 Chat 검증

대상: WWW 0.0.24, `dev`의 기존 미커밋 변경을 포함한 작업 트리. 요청 ID `2e04acc7-5a32-4bf6-b3a1-97654a8709f7`.

**판정: 전체 수락 보류.** 실제 표시 누락을 재현해 수정했지만, 모든 요청의 PLAN 보장·테스트 유형 구분·모든 조건의 일정한 렌더 속도를 입증하지 못했다.

## GROUND — 현재 근거

사용자가 지칭한 `24_KRAFTONAI`라는 로컬 폴더는 없었다. `23_KRAFTON_AI/01/docs/harness/repair-loop.md`와 `24_HarnessAI/.agents/skills/Plan/references/collaborative-loop.md`를 확인했다. 이번 기록은 후자의 7축 책임과 전자의 실패 재현→같은 사례 수정 검증→회귀 보호 방식을 WWW에 적용한 것이다. **Harness Runtime DB 등록·자동 실행 연동을 완료했다는 의미는 아니다.** 원본 선택 질문에는 아직 응답이 없으며, 외부 01·02·03 프로젝트에 WWW 실험을 등록하지 않았다.

- 초기 관련 테스트: 208개 중 171 통과, 37 실패.
- `/test`, Chat TEST rail, 테스트 설명 생성에 코드 변경 이후 실행만 허용하는 필터가 있었다.
- v4 PROGRESS는 WORK가 `observed`가 된 뒤에만 요약을 표시했다. runtime에서 작업 중 상태는 `running`이며 `observed`는 RESULT 보고 이후다.
- 설명 모델의 `why` 반환값이 화면의 PlanActivity에 전달되지 않았다.
- 현재 설계는 단순 답변에는 PLAN 생략을 허용한다. 다단계 작업은 Native Plan을 요구하나 모든 실사용 요청의 도착을 보장했다는 증거는 없다.

## HYPOTHESIZE — 원인과 반증

1. 코드 변경 필터가 검증 전용 요청의 TEST를 숨긴다. file-change 없는 동일 테스트 실행이 나타나면 수정 효과가 입증된다.
2. 완료 상태만 검사하는 분기가 작업 중 PROGRESS를 숨긴다. 같은 v4 running 입력의 현재 진행이 두 화면에 나타나야 한다.
3. 설명 투영에서 `why`가 소실된다. 반환된 이유가 정제되어 화면까지 전달되어야 하며, 이유가 없으면 생성하지 않아야 한다.
4. 반복 렌더링과 cold/처음 폭 변경의 비용이 다르다. 반복 지표 통과만으로 일정한 속도를 판정할 수 없다.

## DESIGN — 비교 조건

수정 전 실패 사례와 수정 후 같은 입력을 비교했다. 다른 turn 제외, 완료 WORK 요약 우선, 실제 exit/실패 보존, read-only 명령의 테스트 오인 방지, 없는 이유 미관측을 보호 조건으로 두었다. 초기 묶음 테스트 및 최초 benchmark는 탐색 관측이며 사전등록 실험으로 소급하지 않는다.

기존 `www-render-benchmark.ts` 기준을 그대로 사용했다: warm p95 16ms, draft p95 32ms, 입력 p95 50ms/p99 100ms. cold와 처음 폭 변경은 이 GREEN 판정에 포함되지 않는다. 30회 표본의 p99는 최댓값에 가까운 설명값이며 모집단 보장이 아니다.

## EXECUTE — 변경과 시험

- TEST 세 소비자의 `requireCodeChange: true` 강제를 제거했다. 도메인의 선택적 필터는 유지했다.
- 작업 중 현재 Plan의 세부 PROGRESS를 표시하고, 없으면 WORK 요약을 표시한다. 완료 WORK 요약의 우선권은 유지했다. Plan 전용 화면의 남아 있는 Plan과 진행 turn도 맞췄다.
- 테스트 실행 후 입력 근거로 작성한 모델의 이유 해석을 `PlanActivity.why`로 전달하고 TEST 화면에 표시한다. 에이전트가 실행 전에 선언한 실제 선택 근거와 동일하다고 주장하지 않는다. 정제·길이 제한을 적용하고 이유가 없으면 미관측이다. 모델 설명은 결과 판정 권한을 갖지 않는다.

사용한 검증 유형과 이유:

| 유형 | 실행 이유 | 실제 경계 |
|---|---|---|
| 단위·컴포넌트 회귀 | 상태 분기·이유 정제·다른 turn 제외를 확인 | 합성 Activity, 실제 projection/view 코드 |
| 통합 검증 | 코드 변경 없는 실행의 narration→TEST 연결, Chat rail 표시를 확인 | FakeNativeHarness / production WwwWorkspace |
| 성능 측정 | 기록 길이·draft·입력·화면 폭에 따른 비용 구분 | 메모리 Terminal / 실제 layout 코드 |
| PTY smoke | 실제 Unix PTY에서 첫 출력 확인 | 오프라인 preview, DEMO DATA 첫 출력 |

이는 이 보고서에서 검사자가 분류한 유형이다. 제품 TEST에 단위·통합·E2E 분류 계약이 생겼다는 뜻은 아니다.

## VERIFY — 관측과 한계

### 성능

80×24 production body/shell, 합성 기록. 시간 단위 ms.

| 메시지 수 | 첫 body | 처음 폭 변경 | warm p95 | 긴 draft p95 | 입력 p95 | streaming 입력 p95 |
|---:|---:|---:|---:|---:|---:|---:|
| 100 | 38.47 | 16.55 | 1.84 | 10.65 | 4.37 | 9.77 |
| 1,000 | 106.81 | 114.30 | 1.90 | 13.57 | 3.38 | 10.47 |
| 5,000 | 556.61 | 763.04 | 3.08 | 21.97 | 6.89 | 22.67 |

각 기존 benchmark는 GREEN이고 idle write는 0이다. **첫 표시와 새 폭에서는 기록 수가 늘수록 지연이 커졌다.** 120/160×70 Chat rail 실험의 warm p95는 5.05/4.14ms, snapshot 변경 첫 frame p95는 4.95/15.16ms였다. 첫 cold 표본에는 118.40ms가 관측됐다.

메모리 Terminal의 frame write 반환은 실제 사용자 터미널의 pixel paint가 아니다. production snapshot 생성, provider 응답, OS flush, 사용자 머신의 다른 CPU 부하는 이 수치에 포함하지 않는다. 이전 10월 5일 RED 측정과 이번 GREEN은 부하 조건이 다르므로 이번 표시 수정의 성능 개선 효과라고 해석하지 않는다.

### 기능·게이트

- 감사 보완 후 관련 묶음: 236개 중 200 통과, 36 실패. 초기 실패에서 retained Plan의 PROGRESS 사례 1건 해결, 새 실패 이름 없음. 첫 수정 검증은 223개 중 187 통과·36 실패였으며 별도 로그를 유지했다.
- 아키텍처·Git Bash 강조·터미널 색상: 19 통과, 0 실패.
- PROGRESS focused: 수정 전 8개 중 6 실패 → 감사 보완 후 24개 통과. 완료 WORK 우선, 늦게 도착한 진행, 빈 완료 요약 및 retained Plan/active turn 차이를 실제 Workspace까지 확인했다.
- 코드 변경 없는 TEST: 두 실패 사례를 수정 후 통과. 목적 설명과 이유 해석의 Fake Native 연결 확인.
- PTY: 오프라인 preview 첫 출력 통과. 실행 중인 사용자 Chat 재시작이나 실제 화면 반영을 대신하지 않는다.
- 독립 리뷰·최종 감사 및 live probe 결과는 아래 최종 검증 기록에서 확정한다. 미응답은 통과가 아니다.

## DECIDE — 수락 범위

표시 누락 수정의 동작 근거는 확보했다. 전체 버전 정상 판정은 보류한다. 남은 36 실패에는 문구·화면 계약 차이, REPORT 표시, Native Runtime Todo 기대 상태 등이 섞여 있으며 모두 낡은 테스트라고 단정하지 않는다.

아직 충족하지 못한 요구:

1. **항상 PLAN:** 단순 답변 생략을 허용하는 현재 계약과 사용자 표현의 범위 확정이 필요하다. 기존 다단계 계획 요구를 유지했다.
2. **TEST 유형:** 실제 유형·선택 이유를 실행과 결속하는 정형 입력 계약이 없다. 명령과 파일명만으로 단위/통합/E2E를 추측하지 않는다. 임의 Python·benchmark 스크립트는 현재 인식 규칙 밖일 수 있다.
3. **항상 설명:** narration 미구성·지연·실패에서는 설명이 미관측일 수 있다. 실행 중인 테스트는 완료 이후 설명 대상이 되며, 출력이 파일로 전환되고 테스트 이름도 아직 관측되지 않은 실행은 설명 생성을 보류한다. 이번 수정은 실제 제공된 이유 해석의 소실을 막는다.
4. **일정한 렌더 속도:** 긴 기록의 cold/새 폭 비용과 실사용 terminal/provider 경계를 추가로 해결·측정해야 한다.

## LEARN — 다음 루프

기존에는 테스트 명령·진행 데이터가 있으면 화면에도 보일 것으로 생각할 수 있었지만, 이번 실패는 소비자 필터와 상태 분기가 관측을 숨긴다는 것을 보여줬다. 이후 같은 문제의 검증은 domain 통과에서 끝내지 않고 실제 Chat rail 및 `/test`까지 이어져야 한다.

다음 설계의 초점은 TEST의 종류·목적·원본 실행 ID를 명시적으로 연결하는 계약과 긴 기록의 최초 레이아웃 비용이다. Native Plan 전달 강제와 전체 회귀 실패 정리는 별도 수락 항목으로 유지한다.

## 근거

- [.www/evidence/2026-10-07-plan-progress-test-loop](../../.www/evidence/2026-10-07-plan-progress-test-loop/): 초기·최종 묶음 로그, benchmark raw JSON, PTY 결과.
- [.www/scratchpad/2026-10-07-plan-progress-test-loop](../../.www/scratchpad/2026-10-07-plan-progress-test-loop/): 실패→수정 기록, 세부 위임 보고·실험 스크립트, 검토 원문.

## 최종 검증 기록

- Sonnet 5 (`claude-sonnet-5`) 읽기 전용 검토 완료. 실제 Workspace 상태별 통합 검증 부족과 초기 benchmark의 `sourceRevision=not-provided`를 지적했다. 상태별 Workspace 회귀를 확장했고 소스 manifest에 결속한 1,000개 기록 benchmark를 별도 실행했다. 원래 측정 JSON을 소급 수정하지 않았다.
- Opus (`opus` 요청, 응답 모델 `claude-opus-5-5`) 첫 감사는 HOLD, P1 없음·P2 6건. 최종 타입 로그, `why` 통합 경로, 모델 해석 표시, 실행 중/로그 미관측 한계, 화면별 turn 범위 및 빈 완료 요약 처리가 보완 대상이다. 이 감사는 기존 로그·코드 읽기였으며 테스트 재실행이 아니다.
- Plan 전용 화면은 유지된 Plan의 source turn, Chat rail은 active turn을 따른다. 새 turn에서 아직 계획이 없으면 서로 다른 요청을 보여줄 수 있으며 같은 화면이라고 취급하지 않는다.
- 최종 타입 검사는 `final-after-audit-types.log`에서 통과했다. 작성 도중의 타입 오류 로그와 구분한다. `why`는 FakeNative 알림→가짜 narrator→toolActions→TEST와 rail까지 단일 통합 시험(13 assertions)에서 확인했고 화면에는 모델 해석임을 표시한다.
- 소스 결속 benchmark(`source-manifest.json`, `final-benchmark.json`): 1,000개 기록에서 GREEN, warm p95 2.24ms, 긴 draft p95 12.26ms, 입력 p95 4.39ms, streaming 입력 p95 10.06ms. cold 149.71ms/새 폭 115.41ms는 여전히 진단값이다. 이 manifest 시점 이후 빈 WORK 요약 분기를 보완했으며 benchmark를 모든 후속 코드의 정확성 근거로 확대하지 않는다.
- Sonnet의 상태별 통합 공백은 24개 focused 시험으로 보완했다. 레거시 두 화면의 별도 fallback은 이번에 통합하지 않았고, 캐시 부재만으로 성능 결함을 확정하지 않았다. narration 큐는 항목 수를 제한하지만 임의로 큰 외부 snapshot의 PROGRESS 성능은 이번 결과로 보장하지 않는다.
- 실제 Native probe는 App Server startup `EPERM`으로 322ms에 실패했다. journal/frame 0건, narrator 미구성이다. 샌드박스 밖 재시도는 승인 응답·실행 관측 없이 대기하다 중단됐다. **실제 Native 연결은 미검증**이며 제품 동작 실패 판정과 구분한다. 실행 중 사용자 세션은 재시작하지 않았다.
- `xxx` 공개 CLI wrapper는 npm cache 권한 오류였고 승인 대기 재시도는 중단됐다. 개발 CLI 직접 실행은 빈 출력이어서 실제 gate 수행 근거로 수락하지 않았다. 로컬 `00`/`06` 및 TypeScript hover 검사는 별도의 명시 검사다.
- 변경 파일의 import·표 정렬 직접 검사는 모두 통과했다. 필수 검사 통과를 위해 `workbench.ts`의 기존 import/선언 정렬과 `www-ui.test.ts`의 기존 97개 테이블 공백도 정규화했다. 이 서식 변경은 토큰 보존·파싱 검사와 후속 26개 행동 검사로 확인했다. `why` JSDoc hover, 최종 타입 검사와 `git diff --check`도 통과했다.
- Opus 후속 감사는 이전 P2 6건 모두 대응, 새 P1/P2 없음으로 확인했고 **전체 HOLD를 유지**했다. 감사자는 직접 테스트를 실행하지 않았으며 스타일 검사는 별도였다. 실제 Native 미검증과 기존 36실패는 이 판정 뒤에도 남는다. 테스트·타입 명령의 실제 exit 상태는 evidence의 `verification-receipt.json`에 기록한다.
