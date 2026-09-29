## 변경

- evidence 감사에서 미확정으로 분류한 Project Comment Candidate 73건을 과거 작업 기록으로 게시했다.
- 기존 감사 보고서에 후속 처리 완료를 표시하고 docs/audit/2026-09-29-linear-recording-backfill.md에 73개 직접 링크와 결과를 정리했다.

## 영향

- 원문 Candidate에서 끝났던 작업 흐름을 Linear Project Activity에서 추적할 수 있다.
- 당시 검증·실패·차단 상태를 원문에 귀속했다. 제품 테스트 재실행·현재 구현 완료 판정이 아니다. 새 이슈·기존 이슈 상태/본문·Project Update·Obsidian은 변경하지 않았다.

## 분류

Validation · Improvement

## 검증

- 전체 Activity 106건, hasNextPage=false에서 회수 73건의 정확한 본문·원문 SHA-256·원문 내용 보존·고유 출처 표기를 확인했다. 오류 0건.
- 관련 통합 기록 3건은 기존 Comment를 연결해 과거 세부 내역으로 구분했다. 참조 경로만 존재하던 2건도 본문 기록을 추가했다. 조회 지연 1건은 재저장 없이 재조회로 확인했다.

## 연결

- 관련 기존 이슈: [WOO-894](https://linear.app/woo-world/issue/WOO-894/linear-작업-candidate와-게시-검증을-정형화한다)
- docs/audit/2026-09-29-linear-recording-status.md
- docs/audit/2026-09-29-linear-recording-backfill.md
- .www/evidence/2026-09-29-linear-recording-backfill/manifest.json
- .www/evidence/2026-09-29-linear-recording-backfill/verification-final.json
