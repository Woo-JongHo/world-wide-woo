# Request Observation

WWW는 새 요청의 공개 실행을 UNDERSTAND·WORK·RESULT 세 단계로 기록한다. 내부 추론이나 검증 순서를 단계로 노출하지 않는다. 기존 protocol v3 관측 기록은 과거 의미 그대로 읽는다.

## 세 구간

| 구간 | 기록 근거 | 의미 |
|---|---|---|
| UNDERSTAND | 요청 접수 후 공개 이해 보고 | 목표와 Plan 필요 여부·이유를 기록한다. |
| WORK | Plan 불필요 결정 또는 현재 turn의 유효한 Native Plan 수신 | 실제 작업 활동과 Plan 진행을 표시한다. |
| RESULT | 공개 결과 작성 보고와 최종 Assistant 응답 | 작성 중인 결과와 전달된 결과를 구분한다. |

세 구간은 Native Activity journal을 재생해 계산한다. UNDERSTAND의 Plan 결정 전에는 WORK로 전환하지 않는다. Plan이 필요하다는 결정에는 현재 turn의 유효한 Native Plan 수신도 필요하다. 간단한 답변은 Plan 불필요 이유를 기록하고 빈 Plan을 만들지 않는다. 단계 기록은 도구 실행·외부 게시 권한을 부여하지 않는다.

## Native 경계

- `runWww()`는 protocol v4의 세 단계 문맥을 Native 요청에 전달한다. Native는 공개 UNDERSTAND·RESULT 보고를 남긴다. 보고가 없거나 형식이 틀리면 해당 단계는 관측되지 않은 상태로 남는다.
- WWW의 `/plan`과 `/mode plan`은 Codex의 `collaborationMode.mode = "plan"`으로 전환한다. 이 모드에서는 실행용 `update_plan`을 요구하지 않고 공개 계획 문서를 작성한다. 실행은 기본 모드의 별도 turn에서 시작한다.
- PLAN은 Native Plan이 실제로 제공될 때 표시한다. PROGRESS는 Native의 실제 도구·파일 활동에서 파생한다. TEST는 실제로 관측된 테스트 실행만 표시한다.
- 스레드별 `Plan.md`는 Native 체크리스트 또는 검증된 공개 계획 문서에서 동기화한다. 기존 스레드 `Todo.md`는 원본을 남기고 처음 열 때 가져온다. Request 관측 레코드가 일곱 개의 기본 항목을 만들지 않는다.
- Native의 권한 정책과 사용자 승인 흐름은 그대로 사용한다. 관찰 투영은 승인·실행 권한을 추가하거나 제거하지 않는다.
- Request의 완료·실패·중단은 Native turn 기록을 따른다. 단계 보고 누락은 별도 프로토콜 문제로 기록하고 Native 완료를 소급 변경하지 않는다.

## 저장과 호환

Project Activity가 원본이며 별도 실행 데이터베이스를 만들지 않는다. 새 protocol v4 레코드는 세 Checkpoint와 Plan 결정·실제 Activity ID를 저장하고 `stages`를 비운다. 저장 파생물은 복구 가능한 Projection이며 Native의 실행 상태나 승인 권한을 소유하지 않는다.

protocol v1/v2/v3 기록은 과거 Activity를 읽기 위해 유지한다. 새 WWW 요청에 적용하지 않는다. 과거 단계 기록을 세 구간 화면으로 요약할 수 있지만, 그 요약을 과거에 Native가 같은 세 구간으로 보고했다고 해석하지 않는다.

## 확인 기준

- 제출·시작·도구·파일 변경·최종 응답·turn 종료는 실제 Activity ID에 연결한다.
- 관측되지 않은 이해·Plan 판단·계획·검증은 추정하지 않고 `미관측`으로 표시한다.
- 정상적인 간단한 요청은 Plan 없이 완료될 수 있으나 Plan 불필요 결정은 공개 보고로 남긴다.
- WORK와 RESULT 요약은 공개 Activity에서만 만든다. 내부 추론은 저장하거나 화면에 표시하지 않는다.
- 외부 시스템 게시, Git 변경, Linear·Obsidian 기록은 각각의 기존 승인·검증 흐름을 따른다. Request Observation은 게시 승인이 아니다.

## 구현 위치

- 계약: `src/core/domain/execution/request-runtime.ts`
- Activity 재생: `src/core/runtime/request-runtime.ts`
- Native 요청 연결: `src/core/application/orchestration/project-workbench.ts`
- PLAN·PROGRESS·TEST 투영: `src/adapters/inbound/tui/features/monitoring/view/www-monitor-view.ts`
- Request 구간 표시: `src/adapters/inbound/tui/features/monitoring/view/request-runtime-view.ts`
