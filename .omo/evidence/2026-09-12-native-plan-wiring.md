# Native Plan / Runtime Todo 테스트 증거

- 저장소: `/Users/jonghoPro/woo/00_project/99_www`
- 브랜치: `astra/terminal-ui`
- 수정 대상: `test/native-plan-wiring.test.ts`만
- 실행: `bun test test/native-plan-wiring.test.ts`
- 결과: exit code `0`, 14 pass, 0 fail, 118 assertions
- 추가 검사: `git diff --check -- test/native-plan-wiring.test.ts` — exit code `0`

## 수락 관측

- Native public/structured Plan은 각 입력 형태의 기존 `workFlow` 제목·상태·출처·관찰 연결 기대를 유지한다. Todo 부모는 Native Plan 단계로 교체되지 않으며, Plan 갱신 전후 Runtime Todo revision이 유지됨을 확인한다.
- 종료된 요청: `understand`, `decompose`, `ground`, `decide`, `execute`, `verify`, `deliver` 정확히 7개 부모 ID와 각각의 관측 상태 `blocked`를 검사한다.
- 실행 중 요청: 동일한 7개 부모 ID에서 `understand=in_progress`, 나머지 6단계 `pending`을 검사한다.

## 시나리오 및 실행 결과

| 시나리오 | 테스트 이름 | 결과 |
|---|---|---|
| public 번호 Plan 및 후속 manual 실행 | `keeps a public numbered Plan in workFlow without replacing the seven-stage Todo or carrying it into manual execution` | pass |
| structured Native Plan이 public 응답보다 우선 | `keeps a structured Native plan authoritative over a public numbered reply` | pass |
| Plan 본문 없음 | `does not manufacture a Native Plan when a Plan turn supplies no plan body` | pass |
| 번호 헤딩 Native Plan 및 Bash 연결 | `projects the Test2 numbered-heading Native plan and associates the earlier Bash activity` | pass |
| 단계 수 헤딩 아래 번호 목록 | `projects the Test2 numbered list beneath a step-count heading without treating the heading as a step` | pass |
| 최상위 번호 Native Plan 및 Bash 연결 | `projects the Test2 top-level numbered Native plan and associates the earlier Bash activity` | pass |
| manual / 실패 / 관측 없는 Plan 보호 | `does not infer a Native Plan for manual mode`, `does not infer a Native Plan for failed Plan turn`, `does not infer a Native Plan for Plan turn without observed work` | 모두 pass |
| 일반 번호 목록 / 불연속 번호 / 실패·중단 Plan의 비투영 | `does not project 일반 번호 목록`, `does not project 불연속 번호 계획`, `does not project 실패한 계획 turn`, `does not project 중단된 계획 turn` | 모두 pass |
| 알려진 root turn Plan 수락과 Runtime Todo 분리 | `accepts only the known root turn's completed plan item without replacing the Runtime Todo` | pass |

## 테스트 표준 출력

```text
bun test v1.4.0 (34cbb9a40)

test/native-plan-wiring.test.ts:
(pass) Native Plan and Runtime Todo boundaries > keeps a public numbered Plan in workFlow without replacing the seven-stage Todo or carrying it into manual execution [24.96ms]
(pass) Native Plan and Runtime Todo boundaries > keeps a structured Native plan authoritative over a public numbered reply [6.63ms]
(pass) Native Plan and Runtime Todo boundaries > does not manufacture a Native Plan when a Plan turn supplies no plan body [6.37ms]
(pass) Native Plan and Runtime Todo boundaries > projects the Test2 numbered-heading Native plan and associates the earlier Bash activity [10.03ms]
(pass) Native Plan and Runtime Todo boundaries > projects the Test2 numbered list beneath a step-count heading without treating the heading as a step [6.78ms]
(pass) Native Plan and Runtime Todo boundaries > projects the Test2 top-level numbered Native plan and associates the earlier Bash activity [7.87ms]
(pass) Native Plan and Runtime Todo boundaries > does not infer a Native Plan for manual mode [21.15ms]
(pass) Native Plan and Runtime Todo boundaries > does not infer a Native Plan for failed Plan turn [21.04ms]
(pass) Native Plan and Runtime Todo boundaries > does not infer a Native Plan for Plan turn without observed work [20.40ms]
(pass) Native Plan and Runtime Todo boundaries > does not project 일반 번호 목록 [15.05ms]
(pass) Native Plan and Runtime Todo boundaries > does not project 불연속 번호 계획 [15.64ms]
(pass) Native Plan and Runtime Todo boundaries > does not project 실패한 계획 turn [15.50ms]
(pass) Native Plan and Runtime Todo boundaries > does not project 중단된 계획 turn [15.58ms]
(pass) Native Plan and Runtime Todo boundaries > accepts only the known root turn's completed plan item without replacing the Runtime Todo [45.38ms]

 14 pass
 0 fail
 118 expect() calls
Ran 14 tests across 1 file. [264.00ms]
```
