# Request Runtime v4 분석

기준: 2026-10-01 현재 `dev` 작업트리. 관련 구현과 문서에 기존 미커밋 변경이 있으므로 이 보고서는 현재 작업트리의 동작을 설명한다. 분석 중 제품·테스트 코드는 수정하지 않았다. v4는 요청을 통제하는 새 실행 엔진이 아니라 Native Activity journal에서 공개 상태를 계산하는 관측 계약이다. [제품 계약](REQUEST_RUNTIME.md), [레코드 타입](../src/core/domain/execution/request-runtime.ts)

## 1. 상태 전환

v4 요청의 세 Checkpoint는 `UNDERSTAND → WORK → RESULT`다. `request/submitted`가 UNDERSTAND를 `running`으로 만들고, `request/started`는 요청 상태와 turn ID를 연결한다. 공개 UNDERSTAND 보고가 유효하면 목표와 Plan 판단을 저장하고 UNDERSTAND를 `observed`로 바꾼다. WORK의 시작 조건은 2절과 같다. 공개 RESULT 보고는 WORK가 `running`일 때만 수락되어 WORK를 `observed`, RESULT를 `running`으로 바꾼다. 그 뒤 일반 최종 Assistant 응답이 RESULT를 `observed`로 만든다. Native turn 종료는 요청의 `completed`·`failed`·`blocked`를 정하고, 남은 `pending`·`running` Checkpoint를 `unobserved`로 남긴다. 따라서 Native turn 완료와 세 보고의 관측 완료는 별개다. [재생 로직](../src/core/runtime/request-runtime.ts#L72), [요청·turn 이벤트](../src/core/runtime/request-runtime.ts#L394), [최종 응답·종료 처리](../src/core/runtime/request-runtime.ts#L482), [전환 테스트](../test/request-runtime.test.ts#L32)

보고는 완료된 공개 Assistant 메시지의 `[www-runtime]` JSON만 파싱한다. 사용자 입력·도구 출력·내부 추론은 보고로 취급하지 않는다. 형식이나 순서가 틀린 보고는 `protocol.rejected` 문제로 남고 상태를 앞당기지 않는다. v4 레코드는 옛 7단계 `stages`를 비워 두며, 과거 v3 기록은 기존 의미로 재생한다. [메시지 필터](../src/core/runtime/request-runtime.ts#L37), [v4 파서](../src/core/domain/execution/request-runtime.ts#L185), [버전별 초기화](../src/core/runtime/request-runtime.ts#L92), [누락·입력 오염 테스트](../test/request-runtime.test.ts#L62)

## 2. Plan 필요 판단

UNDERSTAND 보고에는 `goal`, `planRequired` 불리언, 구체적인 `planReason`이 모두 있어야 한다. 간단한 요청에서 `false`를 기록하면 즉시 WORK가 `running`이 된다. 여러 단계 작업에서 `true`를 기록하면 WORK는 `pending`에 머물며, **현재 요청과 같은 turn**에서 비어 있지 않은 유효한 Native Plan revision이 관측될 때 시작한다. 빈 Plan, 잘못된 revision, 다른 turn의 Plan은 이 조건을 충족하지 못한다. Plan Activity ID가 결정 레코드에 저장된다. [보고 계약](../src/core/application/orchestration/request-protocol.ts#L15), [파서](../src/core/domain/execution/request-runtime.ts#L185), [Plan 수락 조건](../src/core/runtime/request-runtime.ts#L72), [Native Plan 판독](../src/core/domain/work/native-plan-revision.ts#L42), [다른 turn 테스트](../test/request-runtime.test.ts#L77)

Plan 항목의 진행 갱신은 Native Plan이 소유한다. 관측 Checkpoint가 Todo를 대신하거나 Plan 완료를 추정하지 않는다. Plan 결정이나 보고는 도구 실행·외부 게시 승인도 아니다. [제품 계약](REQUEST_RUNTIME.md), [Native 지시](../src/core/application/orchestration/request-protocol.ts#L17)

## 3. 실패·재개 경로

Native 요청 전달 실패(`request/failed`)는 요청을 `failed`, 실행 중 Checkpoint를 `failed`, RESULT를 `unobserved`로 만든다. 수신 여부가 불명확한 `request/uncertain`은 요청을 `blocked`로 두고 결과를 `unobserved`로 남긴다. 전달 전에 실패하면 Plan 판단을 만들어 내지 않는다. `turn/failed`는 요청 실패, `turn/interrupted`·`turn/cancelled`는 차단, `turn/completed`는 Native 완료로 기록한다. 미보고 Checkpoint는 종료 시 `unobserved`가 되므로 실패나 정상 종료를 근거로 누락 보고를 채우지 않는다. [전달 실패 재생](../src/core/runtime/request-runtime.ts#L394), [turn 종료 재생](../src/core/runtime/request-runtime.ts#L482), [전달 실패 테스트](../test/request-runtime.test.ts#L84), [누락 보고 테스트](../test/request-runtime.test.ts#L62)

호출 측은 `startTurn`·`steerTurn`의 수신 불명 오류에서 `request/uncertain`을 남기고 자동 재시도하지 않는다. 확정 오류는 `request/failed`로 기록한다. thread 재개는 기존 Activity를 불러오고 Native thread 상태를 대조하며, 진행 중인 turn이면 같은 turn ID를 다시 연결한다. 이는 기존 journal의 관측을 복원하는 경로이지 종료된 v4 요청의 Checkpoint를 임의로 재시작하거나 새 Plan 결정을 생성하는 경로가 아니다. 뒤 문장은 재개 코드와 v4 재생의 turn 결박 조건에서 도출한 해석이다. [steer 실패 처리](../src/core/application/orchestration/project-workbench.ts#L933), [start 실패 처리](../src/core/application/orchestration/project-workbench.ts#L1029), [thread 재개](../src/core/application/orchestration/project-workbench.ts#L787), [같은 turn 결박](../src/core/runtime/request-runtime.ts#L108)

검증 기록: `bun test test/request-runtime.test.ts`에서 v4 관련 7개 사례는 통과했다. 파일 전체는 36개 중 27개 통과, 9개 실패였다. 실패는 같은 파일의 과거 7단계 표시 기대값에서 발생했다. 따라서 전체 테스트 통과를 주장하지 않는다.
