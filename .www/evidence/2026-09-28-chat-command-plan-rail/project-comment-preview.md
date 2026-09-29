## 변경

- 접힌 도구 묶음에서 중복 Terminal 카드를 제거하고 명령마다 실행 목적을 표시한다. zsh -lc·-lcr 래퍼는 요약에서 벗기고 원본은 확장 카드에 남긴다.
- Chat 사이드바 폭을 넓히고 PROGRESS 문장을 여러 줄로 표시한다. PLAN은 활성 turn의 Native 계획을 우선 선택하며 Runtime 작업 진행과 별도 계수를 표시한다.
- 다단계 요청은 Native update_plan을 생성하고 항목 완료 때 갱신하도록 요청 프로토콜 지시를 보강했다.

## 영향

- 사용자는 같은 명령을 두 번 읽지 않고 무엇을 확인·실행했는지 볼 수 있다.
- PROGRESS의 개별 도구 완료를 PLAN 항목 완료로 오인하지 않으며 이전 요청의 계획이 현재 요청을 가리지 않는다.

## 분류

Improvement · Fix · Validation

## 검증

- Chat 화면 집중 테스트 102 pass, Native Plan·Request Runtime 42 pass, 아키텍처 17 pass.
- npm run check 및 git diff --check 통과. 실제 TUI 사용자 조작과 전체 회귀 재실행은 미실행.

## 연결

- Primary Linear: WOO-700 · PLAN·PROGRESS
- Related Linear: WOO-680 · Chat 배치
- Obsidian Candidate: .www/evidence/2026-09-28-chat-command-plan-rail/obsidian-canonical-candidate.json
- Evidence: .www/evidence/2026-09-28-chat-command-plan-rail
