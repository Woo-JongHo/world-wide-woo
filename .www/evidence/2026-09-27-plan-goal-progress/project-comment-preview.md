## 변경

- 사이드 영역을 STAGE·PLAN·PROGRESS 순서로 재구성하고 GOAL 중복 영역을 제거했다.
- PLAN에 실제 stage task, 의존 작업과 같은 단계의 병렬 가능성을 표시하고 상태 기호를 통과·실행·대기·실패 의미로 분리했다.
- 상단 한 행의 왼쪽에 반짝이는 GOAL을, 오른쪽에 www 프로젝트·페이지 identity를 배치했다.
- 일반 입력 원문을 GOAL로 즉시 복사하지 않고 UNDERSTAND의 공개 결과로 Session Goal을 설정하도록 변경했다.
- PROGRESS의 2줄·6줄 절단 제한을 제거해 해석된 전체 내용을 스크롤로 읽게 했다.

## 영향

- 사용자는 고정 Runtime 단계, 실제 작업 계획, 해석된 진행을 서로 겹치지 않는 세 영역에서 읽는다.
- GOAL은 요청 원문이 아니라 요청 이해 결과를 나타내며 좁은 화면의 세로 공간과 Progress 가독성이 개선된다.

## 분류

Improvement · Fix · Validation

## 검증

- 변경 관련 6개 테스트 파일에서 160 pass, 0 fail.
- pnpm check와 변경 TypeScript import normalization·table alignment 검사가 통과했다.
- 전체 회귀는 1566 pass 뒤 화면 계약 기대값 2건을 수정해 단독 통과했고, 범위 밖 project-workbench-async-scope 비동기 대기 1건은 15초에서도 timeout이었다.

## 연결

- Linear: WOO-700 · UUID 770ebed8-f030-4610-9668-dd2023b26a9a
- Parent: WOO-682
- Obsidian Candidate: .www/evidence/2026-09-27-plan-goal-progress/obsidian-canonical-candidate.json
- Evidence: .www/evidence/2026-09-27-plan-goal-progress
- Branch: dev · HEAD 216b9d9faa09bcb19151f0f188792e8ce7113bf6 · uncommitted
