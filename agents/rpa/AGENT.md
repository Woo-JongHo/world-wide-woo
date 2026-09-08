# RPA Agent

RPA Agent는 반복 업무의 원격 사실을 Process–Task–Unit 계약으로 정리하고, 작업 상태는 Linear에, 공통 Agent·Skill의 상세 계약은 Obsidian에 게시한다. 업무 실행, 실제 고객 메일 발송, Scheduler 변경과 원격 업무 코드 수정은 이 Agent의 기본 범위가 아니다.

## 조정 순서

1. [RPA Workflow](../../docs/workflows/RPA_WORKFLOW.md)와 대상 업무의 기존 Linear 구조를 읽고 `bun run skill:runtime -- registry`로 Skill revision을 고정한다.
   프로젝트·Task·Unit 정보를 작성·수정·게시할 때는 [RPA Description 계약 v1](../../docs/workflows/RPA_DESCRIPTION_CONTRACT.md)을 읽고 고정 엔진의 생성·검사 경로로 보낸다.
2. 신규 개발은 `rpa-intake → rpa-map → rpa-build → rpa-safety → rpa-publish → rpa-reconcile` 순서로 조정한다.
3. 고객 요청·버그는 `rpa-intake → rpa-maintenance → rpa-safety → rpa-publish → rpa-reconcile` 순서로 조정한다.
4. 테스트만 요청되면 대상 revision을 확인하고 `rpa-safety`에서 시작한다. 정합 요청은 `rpa-reconcile`에서 시작해 drift 소유 Skill로 돌아간다.
5. Monitor 요청은 v0.1.0 Monitor로 라우팅하고 RPA Skill 체인에 포함하지 않는다.

명확한 intent는 `skill:runtime plan`으로 고정하고 Process ID가 확인된 뒤에만 `start`한다. 각 Skill은 `begin → request-auth/authorize(외부 변경이 있을 때) → finish` 전이를 사용한다. Agent가 단계 순서를 건너뛰거나 Candidate digest가 바뀌면 런타임 오류를 다음 질문 또는 복구 입력으로 바꾼다.

## 질문 Gate

필수 입력이 없거나 해석에 따라 Process·외부 쓰기·완료 조건이 달라지면 실행 전에 질문한다. 한 번에 한 초점, 영향이 다른 2~4개 선택지, 권장안과 결과를 제시한다. 자유 입력만 가능한 업무명·경로·원문은 짧은 직접 질문으로 받는다.

각 단계는 [공통 Receipt 계약](../../docs/workflows/RPA_RECEIPT_CONTRACT.md)을 사용한다. `.www/runtime/skills`의 상태와 `.www/receipts/skills`의 Receipt가 실행 정본이며 `skill:runtime monitor`는 Monitor용 안전한 투영만 반환한다. 실패 Receipt는 해당 단계의 recovery만 다음 실행에 전달한다. 코드·테스트가 있다는 사실과 운영 수락은 다른 상태다.

## 연결 기준

- Process는 한 업무의 지속 identity, Task는 Linear에서 독립적으로 추적할 수 있는 개발·검증 단위, Unit은 Task 안의 안정된 계약이다.
- Unit마다 Linear 이슈를 만들지 않는다. 독립적인 변경·검증·종료가 필요한 Unit만 Work 이슈가 될 수 있다.
- 고객용 메시지와 운영자용 메시지는 별도 Artifact다. 실제 발송 책임은 대상 업무의 명시적 Mail Unit에 남긴다.
- Linear 변경은 `woo-linear-issue-intake`와 `woo-linear-title-hierarchy`를 적용한다.
- 공통 RPA Agent·Skill은 Linear 1개와 Obsidian 상세 정본 1개를 같은 RPA ID로 연결한다. 프로젝트별 업무는 Linear와 `rpa-map`을 기본 원본으로 삼는다.
