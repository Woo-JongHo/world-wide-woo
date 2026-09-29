## 변경

- Project Activity Comment는 사용자의 상시 사전 승인 범위로 정하고, live 대상·중복·expectedBefore·Candidate 검증 뒤 항목별 승인 질문 없이 게시·read-back하도록 AGENTS와 Linear Activity/Publish 지침을 맞췄다.
- 종료 훅은 기존 WOO 이슈를 먼저 확인하고 새 이슈는 실제로 필요할 때만 작성하도록 바꿨으며 Comment Candidate만 준비한 상태는 완료가 아니라고 명시했다. 다른 외부 쓰기는 기존 항목별 승인 경계를 유지한다.
- linear-woo OAuth invalid_grant를 복구한 뒤 WOO-915 Chat 진단과 WOO-912 HUD 수정 Comment를 각각 게시하고 Activity에서 본문·작성자·시각을 read-back했다.

## 영향

- 작업 기록이 Candidate 단계에서 반복 정지하지 않고 Project Activity에 한 번 게시되며, 최신 Activity 비교와 read-back 근거가 남는다.
- 사용자의 사전 승인은 Project Comment에만 적용되고 Issue·Update·Obsidian·GitHub·commit 쓰기의 승인 범위는 넓히지 않는다.

## 분류

Improvement · Operation · Validation

## 검증

- Live Linear read-back: WOO-902는 World Wide Woo 프로젝트의 WOO-894 하위이며 Backlog다.
- WOO-915 Chat 진단 Comment 0c24c70e-cfd1-476d-b0ba-2e2613b75063와 WOO-912 HUD Comment 82b109db-d6a0-447f-8ca3-da8d47901693가 Project Activity에서 작성자·시각·렌더 본문 일치로 재조회됐다.
- AGENTS, woo-linear-activity, woo-linear-publish, Artifact Control contract, Stop hook 지침을 다시 읽어 Project Comment는 사전 승인, 다른 외부 쓰기는 별도 승인인 경계를 확인했다.
- Artifact Control Candidate validate/render를 통과했다. 변경은 workflow 지침이므로 자동 테스트는 실행하지 않았다.

## 연결

- Linear: WOO-902 https://linear.app/woo-world/issue/WOO-902/03-승인된-linear-candidate를-게시하고-재조회한다 (live read-back 2026-09-28; Backlog; parent WOO-894)
- Linear: WOO-915 Chat 렌더 지연 진단 · Project Activity Comment 0c24c70e-cfd1-476d-b0ba-2e2613b75063
- Linear: WOO-912 Provider HUD 수정 · Project Activity Comment 82b109db-d6a0-447f-8ca3-da8d47901693
- Evidence: .www/evidence/2026-09-28-project-comment-publication-unblock
- Changed: AGENTS.md; .agents/skills/woo-linear-activity/SKILL.md; .agents/skills/woo-linear-publish/SKILL.md; docs/workflows/ARTIFACT_CONTROL_CONTRACT.md; src/core/domain/development/work-recording-gate.ts
