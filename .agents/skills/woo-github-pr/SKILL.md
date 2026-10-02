---
name: woo-github-pr
description: 99_www GitHub PR을 생성하거나 본문을 수정할 때 변경·검증·Linear·Code·Obsidian·Receipt를 구조화한 Candidate와 승인 경계를 적용하고, PR과 연결 대상의 일치를 읽기 전용으로 검증한다.
---

# GitHub PR Control

[Artifact 제어 계약](../../../docs/workflows/ARTIFACT_CONTROL_CONTRACT.md)을 적용한다. Push, Merge, Release는 이 스킬의 범위가 아니다.

1. base/head, 열린 PR, diff, 검증 결과를 읽고 중복 PR을 확인한다.
2. 한국어 결과 제목과 변경 전후 동작, 검증, Linear·Code-ID·Obsidian·Receipt, 위험·복구를 `github-pr` Candidate에 기록한다.
3. `artifact:control validate`와 `render`를 통과한 전체 제목·본문·base/head·digest를 사용자에게 제시해 승인받는다.
4. 승인 직전에 head SHA와 기존 PR body를 `expectedBefore`와 대조하고, 일치할 때만 `gh pr create` 또는 `gh pr edit`를 한 번 실행한다.
5. 생성·수정된 PR을 JSON으로 재조회한다. 아래 Read-back 검증을 적용한다.

승인은 해당 Candidate 하나의 PR 생성 또는 수정만 허용한다.

## Read-back 검증

PR 생성·수정 뒤, 또는 기존 PR의 연결만 검증해 달라는 요청에 읽기 전용으로 적용한다.

PR을 JSON으로 읽어 title, body, base, head SHA를 승인 Candidate와 byte 단위로 대조한다. 본문의 Linear ID·Code-ID·Obsidian URI·Receipt 경로가 실제 대상을 가리키는지 확인하고, Linear의 GitHub 연결도 같은 PR 번호인지 재조회한다.

모든 연결이 일치하면 `succeeded`, 실행 결과는 있으나 재조회가 불가능하거나 모호하면 `uncertain`, 명시적 불일치는 `failed` Woo Receipt로 남긴다. 검증 단계는 PR, Linear, Vault, Git을 수정하지 않는다.
