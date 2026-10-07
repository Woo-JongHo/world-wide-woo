# RPA Description 계약 v1

프로젝트별 RPA Description의 고정 작성 계약이다. 사용자 결정(2026-09-08): 프로젝트 정보·정확한 WBS 날짜·Task 탐색 구조를 유지하고, Task는 Unit 수와 예외·테스트 케이스를, Unit은 사용 기술·코드 설명·Step 수와 흐름을 담는다. 진행·고객 결정 이력은 Project Update를 사용한다.

## 정본과 적용 범위

`rpa-map`의 Process → Task → Unit → Step 계약을 구조화된 입력으로 정규화하고, [템플릿 엔진](../../src/core/domain/development/rpa-description.ts)이 같은 입력에서 같은 Markdown을 생성한다. 이 문서는 필드의 의미와 운용을 소유하며, 정확한 필드·검증·렌더 순서는 엔진이 소유한다. 스킬마다 별도 템플릿을 복사하거나 생성된 본문을 손으로 재작성하지 않는다. v1의 구조 변경은 명시적인 사용자 결정과 계약·엔진·행동 검증의 동시 개정으로만 한다.

- Linear Project Description과 그 프로젝트에 연결된 업무 Task Description에 적용한다. Linear Project와 Process 부모 이슈는 다른 객체다. 기존 parentId나 프로젝트 소속을 이 템플릿 때문에 변경하지 않는다.
- Unit은 Task 본문에 펼쳐 쓰고 Step은 해당 Unit 안에 기록한다. 독립 Work인 Unit의 별도 이슈 여부는 기존 계층 결정을 따른다.
- 공통 RPA Agent·Skill 이슈와 Process의 예외 처리·테스트 전용 이슈는 기존 역할을 유지한다. Task의 케이스 표는 해당 Task의 상세 계약 투영이며 전용 이슈를 대체하지 않는다.
- 프로젝트 업무의 기술·코드·Step 설명에는 이 계약을 적용한다. 일반 이슈의 짧은 본문 규칙 때문에 이 항목들을 삭제하거나 Obsidian 링크만 남기지 않는다.

## 고정 Description 구조

### Project

| 순서 | 절 | 내용 |
| --- | --- | --- |
| 1 | 프로젝트 정보 | 프로젝트명, 고객사, 담당 부서, 업무 목적, 대상 시스템, 저장소, Process ID |
| 2 | WBS | WBS 원본과 revision, 기준일, 계획 시작일, 계획 종료일 |
| 3 | Task 구성 | 전체 Task 수와 `단계 / 업무 / 무엇을 하는가 / 결과 / Task 이슈` 탐색 표 |
| 4 | 연결 | Linear Project 식별자, Process와 rpa-map 원본·revision 연결 |

FTA 원산지 프로젝트의 Task 탐색 방식을 사용한다. 완료한 Task도 탐색 표에 유지한다. 실제 Task 목록과 순서는 해당 프로젝트의 rpa-map을 읽어 생성하며 FTA의 9개 업무를 다른 프로젝트에 복사하지 않는다.

확인사항·현재 Blocker·고객 결정 이력 절은 Project Description에 두지 않는다. 열린 작업과 종료 여부는 각 이슈의 상태가 소유한다. 이 규칙은 안전 검증이나 업무 수락 조건을 생략하라는 뜻이 아니다.

WBS 날짜는 원본에서 확인한 `YYYY-MM-DD`를 기입한다. `baselineDate`는 해당 WBS의 기준일이고 `startDate`·`endDate`는 그 WBS의 계획 시작·종료일이다. 문서 작성일, Linear 생성일 또는 코드 revision 날짜로 대체하지 않는다. 정확한 일자가 없으면 intake에 미확인으로 남기고 완성된 Description 렌더를 보류한다. 검사는 날짜의 유효성과 시작 ≤ 종료를 판정하며 원본의 진실성은 intake 근거로 확인한다.

### Task

| 순서 | 절 | 내용 |
| --- | --- | --- |
| 1 | Task 정보 | 안정 Task ID, 업무 목적, 결과, 전체 Unit 수 |
| 2 | Unit 구성 | 순서, Unit ID·기능, 책임, Step 수 |
| 3 | 예외 케이스 | Case ID, 영향 Unit·Step, 발생 조건, 처리, 복구, 연결 테스트 |
| 4 | 테스트 케이스 | Case ID, 영향 Unit·Step, 유형, 시나리오, 기대 결과, 실행 결과, 증거 |
| 5 | Unit 상세 | 각 Unit의 책임·입출력·부작용·승인·재실행 정책, 사용 기술, 코드 설명, Step 흐름 |
| 6 | 연결 | Task 이슈, Process와 rpa-map 원본·revision 연결 |

예외·테스트를 Unit 상세보다 먼저 보여준다. 케이스가 없으면 빈 목록임을 표시하며 검증 통과로 해석하지 않는다. 테스트 유형은 정상·경계·실패·부분 실패·재실행이다. 실행하지 않은 테스트의 결과는 `not-run`, 증거는 `null`이다. `passed`·`failed`에는 실제 증거 참조가 필요하다.

### Unit과 Step

Unit마다 기능의 책임과 입력·출력을 설명한 뒤 다음을 기록한다.

- 사용 기술: 실제 라이브러리·API·도구 이름과 그 기술이 담당하는 기능. 설치만 된 의존성을 사용 기술로 쓰지 않는다.
- 코드 설명: 원본 상대 경로, class/function 등 심볼, 해당 코드가 입력을 처리하고 결과를 만드는 방식. 코드 전체나 로그를 복사하지 않는다.
- Step 구성: 전체 Step 수, Step ID, 실행 순서, 수행 내용, 연결 코드 심볼, 결과. 분기·실패 조건도 실제 흐름에 맞게 설명하고 케이스 표와 연결한다.
- 부작용·승인·재실행: 확인한 계약을 유지한다. 원본에 없는 정책은 `unknown`으로 둔다.

Task·Unit ID는 책임의 안정 identity다. Step ID는 Unit 안에서 단계를 연결하는 identity다. `sequence`가 표시·실행 순서를 소유한다. 삽입·재배치만으로 기존 ID를 재발급하지 않는다. Task 수·Unit 수·Step 수는 배열에서 계산하며 사람이 별도 필드로 입력하지 않는다.

## rpa-map 연결 입력

`RpaDescriptionMap`은 게시용 정규화 입력이다. 서로 다른 프로젝트의 기존 `rpa-map.yaml`을 같은 스키마라고 가정하지 않는다. intake에서 읽은 원본의 필드를 다음 형태로 대응시키고, 해당 책임의 ID와 source revision을 유지한다. 이 투영 파일이 업무 원본을 대체하지 않는다.

| 객체 | 필수 필드 |
| --- | --- |
| Root | `schemaVersion: "1.0"`, `project`, `tasks` |
| Project | `id`, `name`, `customer`, `department`, `purpose`, `systems[]`, `repository`, `processId`, `mapRef`, `wbs` |
| mapRef | `path`, `revision` |
| WBS | `reference`, `revision`, `baselineDate`, `startDate`, `endDate` |
| Task | `id`, `name`, `sequence`, `issueUrl`, `purpose`, `output`, `units[]`, `exceptions[]`, `tests[]` |
| Unit | `id`, `name`, `sequence`, `responsibility`, `input`, `output`, `technology[]`, `code[]`, `sideEffects`, `approval`, `rerunPolicy`, `steps[]` |
| Technology | `name`, `purpose` |
| Code | `path`, `symbol`, `explanation` |
| Step | `id`, `sequence`, `action`, `codeSymbols[]`, `output` |
| Exception | `id`, `unitId`, `stepId`, `condition`, `handling`, `recovery`, `testIds[]` |
| Test | `id`, `unitId`, `stepId`, `kind`, `scenario`, `expected`, `status`, `evidence` |

`project.id`는 Linear Project ID, Task의 `issueUrl`은 실제 대상 이슈의 링크다.

`stepId: null`은 Unit 전체를 대상으로 하는 케이스다. `codeSymbols[]`는 같은 Unit의 `code[].symbol`을 참조한다. 심볼은 Unit 안에서 유일해야 하며 동명 함수는 모듈·클래스를 포함한 식별 가능한 이름으로 정규화한다. 코드의 실제 이름과 대응 관계는 intake에서 확인한다.

`kind`는 `normal | boundary | failure | partial-failure | rerun`, `status`는 `passed | failed | not-run`이다. 예외의 `testIds[]`는 같은 Task의 실제 테스트를 참조한다. 모든 Unit·Step·Case 연결은 해당 소속에서 해석 가능해야 한다.

정규화 입력은 연결이 확인된 프로젝트·Task용이다. 신규 이슈 생성 전에는 Task URL을 꾸며내지 않는다. 기존 이슈 생성 절차로 실제 identity를 확보한 뒤 이 템플릿으로 Description을 반영한다. 업무 사실이나 코드가 부족한 설계 수집물은 별도로 유지하며 완성 템플릿인 것처럼 게시하지 않는다.

## 생성·게시·재조회

```bash
bun run rpa:description -- validate --map /tmp/rpa-description-map.json
bun run rpa:description -- render --map /tmp/rpa-description-map.json --surface project
bun run rpa:description -- render --map /tmp/rpa-description-map.json --surface task --task TASK-ID
bun run rpa:description -- check --map /tmp/rpa-description-map.json --surface task --task TASK-ID --actual /tmp/linear-description.md
```

위 경로와 `TASK-ID`는 명령 인자 예시다. 실행 시 확인된 파일과 안정 ID로 바꾼다. 형식 예시는 [가상 테스트 입력](../../test/fixtures/rpa-description-map.json)을 참고한다. 실제 업무·WBS 증거로 사용하지 않는다.

게시 Candidate는 공통 [Artifact 제어 계약](ARTIFACT_CONTROL_CONTRACT.md)을 사용한다.

| 대상 | kind | content | 대상 결박 |
| --- | --- | --- | --- |
| Project Description | `linear-project` | `{profile: "rpa-project-v1", map}` | `target.projectId = map.project.id` |
| Task Description | `linear-issue` | `{profile: "rpa-task-v1", map, taskId}` | 같은 `projectId`, `target.issueUrl = 해당 Task.issueUrl` |

`sourceRevision`은 `map.project.mapRef.revision`과 같아야 한다. `target`에는 실제 대상 UUID 등 게시에 필요한 identity도 남긴다. `expectedBefore`에는 변경 전 Description과 보호 메타데이터를 담는다. `artifact:control validate/render`가 동일한 템플릿 엔진을 호출하며 승인 digest는 전체 구조화 입력에 결박된다. 출력은 Description 본문이며 이슈 제목·상태·계층 변경을 포함하지 않는다.

이 RPA Project/Task 본문에는 과거 일반 이슈의 `목적 → 결과 → 범위 → 동작 → 완료 조건 → 연결` 헤딩 검사를 적용하지 않는다. 기존 `linear-contract.ts --scope RPA`는 WWW 내부의 고정 이슈 계층용이다. 고객 업무 프로젝트에 그대로 적용하지 않고 이 계약의 본문 검사와 실제 parent·project·상태·milestone read-back을 함께 수행한다. 공통 Agent·Skill과 기존 계층의 검사는 계속 유지한다.

게시 후 `check`는 재조회한 Description을 렌더 결과와 비교한다. 개행 정규화 외의 본문 차이는 drift다. Linear가 Markdown을 변환했다면 실제 차이를 분석하고 미확인 상태로 남긴다. 도구가 실행됐다는 사실만으로 외부 표면 수락을 주장하지 않는다.

## Update와 기존 본문 이관

고객 결정·일정 변경·진행 경과는 해당 Linear Project의 Update에 기록한다. 결정 일자, 변경 내용, 영향 Task·Unit, 출처를 함께 남기고 현재 유효한 업무 계약은 rpa-map에 반영한다. Update는 이력을 소유하며 현재 계약 원본을 대체하지 않는다.

기존 Description을 바꿀 때는 먼저 snapshot을 보존한다. 이미 있는 Update와 중복을 대조하고, 이동할 이력은 사용자가 승인한 범위에서 Update에 기록한 뒤 재조회한다. 이력이 보존된 것을 확인한 다음 Description에서 제거한다. 이관 실패 시 기존 기록을 지우지 않는다. 확인사항 목록의 작업은 실제 이슈 링크와 상태가 유지되는지 확인한다. 템플릿 개정만으로 Update 게시나 고객 메시지 전송을 수행하지 않는다.

## 검사 범위

엔진은 누락·임의 필드, 유효하지 않은 날짜, 중복 ID·순서, 끊어진 참조, 테스트 증거 누락, 렌더 결과의 변경을 검사한다. 실제 코드·WBS·운영 Run이 내용과 일치하는지는 intake·safety·read-back의 증거로 검증한다. 형식 통과와 운영 수락은 구분한다.
