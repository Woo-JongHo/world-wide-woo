---
name: development-map
description: WWW의 전체 개발 현황을 Initiative·Epic·Story·Evidence ID로 연결해 .www/Development-Map.md를 생성·갱신·감사할 때 사용한다.
---

# Development Map

`.www/Development-Map.md`는 상태 정본이 아니라 Planning과 Evidence를 읽어 만든 Projection이다.

## 갱신

1. `.www/planning/README.md`, `catalog.jsonl`, `INITIATIVE.json`, `.www/Epics.md`, `.www/Stories.md`와 연결된 Evidence를 확인한다.
2. 각 행에 실제 `INIT-*`, `EP-*`, `ST-*`와 근거 링크를 기록한다. 관계가 없으면 ID를 만들거나 추정하지 말고 `미연결` 또는 `미발급`으로 표시한다.
3. `Todo completed`를 `Story accepted`로, Story 상태를 Epic 상태로 자동 승격하지 않는다. 명시된 acceptance와 Evidence가 없으면 `미수락`, `PARTIAL`, `BLOCKED` 또는 `unknown`을 유지한다.
4. 기준일과 확인한 Git revision을 갱신하고 `git diff --check`와 모든 상대 링크를 검증한다.

세부 요구사항을 Map에 복제하지 않는다. Map에는 현재 상태, stable ID, 근거와 다음 전환만 둔다.
