## 변경

- Chat durable transcript·render/cache·scroll과 Native 실행 이벤트 경계를 현재 Workbench 코드·테스트에 통합했다.
- Dashboard·Context·Usage·Monitoring·Plan·Trace 화면과 세션 재개·request runtime·approval 경계를 같은 실행 snapshot에서 읽도록 정리했다.
- Codex App Server transport/projection, Workbench shell routing, persistence·traceability·review 경계를 추가하거나 연결했다.
- pi-tui 패치와 package/lockfile, benchmark·traceability 스크립트 및 대응 회귀 테스트를 함께 고정했다.
- Readability 등록부·작성 축과 관측 계층 상세 정본은 각각 WOO-911 Candidate 및 기존 WOO-913 Obsidian Candidate로 별도 기록했다.

## 영향

- 사용자는 실행·승인·관측·검증 결과를 서로 다른 임시 화면이 아니라 같은 Workbench lifecycle에서 읽는다.
- 불변 transcript/cache와 unknown·partial 관측 상태가 테스트와 문서 증적에서 같은 의미를 유지한다.
- 이 Comment는 기존 기능별 게시 기록을 덮어쓰지 않고, 현재 로컬 커밋 후보의 통합 경계만 설명한다.

## 분류

Feature · Improvement · Refactor · Validation

## 검증

- bun run check 통과.
- bun test — 1491 pass, 0 fail, 19354 expect, 173 files.
- git diff --check 및 purpose split 전 git diff --cached --check 통과.
- WOO-689·WOO-907·WOO-911·WOO-913·WOO-915와 기존 evidence/recording-decision을 재대조했다.
- World Wide Woo Project Activity 최신 Comment ID는 1196a23e-1f9f-4bff-b6c8-83f5a1a4e5ab이며 이 Candidate는 아직 게시하지 않았다.

## 연결

- Linear: WOO-689 · WOO-907 · WOO-911 · WOO-913 · WOO-915
- Evidence: .www/evidence/2026-09-24-workbench-integration
- Existing canonical Candidate: .www/evidence/2026-09-24-www-layer-monitoring-principles/obsidian-canonical-candidate.json
- Branch: dev · HEAD 868ce9bb15231d47650cb67f2704b2ce8507f313 · dirty
