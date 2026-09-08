---
name: woo-github-pr-verify
description: GitHub PR과 연결된 Linear·Code-ID·Obsidian·Receipt 및 승인 Candidate가 서로 일치하는지 읽기 전용으로 검증할 때 사용한다.
---

# GitHub PR Verify

PR을 JSON으로 읽어 title, body, base, head SHA를 승인 Candidate와 byte 단위로 대조한다. 본문의 Linear ID·Code-ID·Obsidian URI·Receipt 경로가 실제 대상을 가리키는지 확인하고, Linear의 GitHub 연결도 같은 PR 번호인지 재조회한다.

모든 연결이 일치하면 `succeeded`, 실행 결과는 있으나 재조회가 불가능하거나 모호하면 `uncertain`, 명시적 불일치는 `failed` Woo Receipt로 남긴다. 이 스킬은 PR, Linear, Vault, Git을 수정하지 않는다.
