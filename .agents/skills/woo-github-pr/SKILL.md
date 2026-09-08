---
name: woo-github-pr
description: 99_www GitHub PR을 생성하거나 본문을 수정할 때 변경·검증·Linear·Code·Obsidian·Receipt를 구조화한 Candidate와 승인 경계를 적용한다.
---

# GitHub PR Control

[Artifact 제어 계약](../../../docs/workflows/ARTIFACT_CONTROL_CONTRACT.md)을 적용한다. Push, Merge, Release는 이 스킬의 범위가 아니다.

1. base/head, 열린 PR, diff, 검증 결과를 읽고 중복 PR을 확인한다.
2. 한국어 결과 제목과 변경 전후 동작, 검증, Linear·Code-ID·Obsidian·Receipt, 위험·복구를 `github-pr` Candidate에 기록한다.
3. `artifact:control validate`와 `render`를 통과한 전체 제목·본문·base/head·digest를 사용자에게 제시해 승인받는다.
4. 승인 직전에 head SHA와 기존 PR body를 `expectedBefore`와 대조하고, 일치할 때만 `gh pr create` 또는 `gh pr edit`를 한 번 실행한다.
5. 생성·수정된 PR을 JSON으로 재조회한다. read-back 검증은 `woo-github-pr-verify`를 적용한다.

승인은 해당 Candidate 하나의 PR 생성 또는 수정만 허용한다.
