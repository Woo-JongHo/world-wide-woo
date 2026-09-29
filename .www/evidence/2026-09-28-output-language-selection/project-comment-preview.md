## 변경

- 상단 KOREA/ENGLISH 표시와 F8·/language ko|en 전환을 추가하고 선택을 Git에서 제외된 런타임 환경설정에 저장했다.
- 새 Native 턴의 공개 응답 지침, 명령 행동 AI 요약, Note 본문과 주요 Chat·PLAN·PROGRESS·TEST·Monitor 고정 문구가 선택 언어를 따르도록 연결했다.
- 원본 명령·대화·활동 기록은 덮어쓰지 않고, 빠른 전환에서도 마지막 선택이 저장되도록 직렬화했다.

## 영향

- 사용자는 작업 중 출력 언어를 바꾸고 다음 턴과 새 요약을 선택한 언어로 읽을 수 있다.

## 분류

Feature · Validation

## 검증

- 관련 13개 테스트 파일 204 pass, 0 fail. bun run check, bun run build, git diff --check 통과.
- 전체 회귀 1628 pass, 6 fail. 남은 실패는 설치된 가독성 스킬 경로 2건, Linear 대시보드 1건, Dashboard 표시 3건이다.

## 연결

- Linear: WOO-689는 로컬 Chat pilot의 다국어 수락 조건에 등장한다. 정본 linear-woo 원격 read-back은 미실행.
- Code: src/core/domain/execution/output-language.ts, src/core/application/orchestration/output-language-controller.ts, src/adapters/outbound/workspace/output-language-preference.ts
- Evidence: .www/evidence/2026-09-28-output-language-selection
