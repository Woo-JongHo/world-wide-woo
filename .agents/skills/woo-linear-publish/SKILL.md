---
name: woo-linear-publish
description: 승인된 Linear Artifact Candidate를 생성·수정·이동으로 반영하고 대상과 부모를 재조회해 Woo Receipt로 검증할 때 사용한다.
---

# Linear Publish

[Artifact 제어 계약](../../../docs/workflows/ARTIFACT_CONTROL_CONTRACT.md)과 [Linear 제목 계층 규칙](../woo-linear-title-hierarchy/SKILL.md)을 적용한다.

RPA Project·Task Description Candidate는 [RPA Description 계약 v1](../../../docs/workflows/RPA_DESCRIPTION_CONTRACT.md)을 읽는다. `linear-project`는 Project Description을, `linear-issue`의 `rpa-task-v1`은 해당 Task Description을 대상으로 한다. 고정 렌더 결과를 게시하고 같은 엔진으로 read-back을 비교한다. Update 이관은 기존 이력 보존을 확인한 뒤 Description을 교체하는 순서다.

1. Candidate를 `artifact:control validate`와 현재 대상의 `--actual-before`로 검증하고 렌더 결과와 digest를 사용자에게 제시한다. 완료: 승인 내용과 digest가 정확히 하나다.
2. 승인 직전에 대상·부모·중복 후보를 재조회한다. `expectedBefore`가 달라졌으면 실행을 멈추고 Candidate를 다시 만든다.
3. 승인된 필드만 Linear에 한 번 반영한다. 응답이 불확실할 때 create를 반복하지 않고 조회로 존재 여부를 판정한다.
4. 대상과 양쪽 부모를 재조회해 UUID·Project·parentId·제목·본문·상태·Milestone을 대조한다. 완료: 초안과 read-back이 같고 계층 계약이 통과한다.
5. 공통 Woo Receipt에 실제 ID·URL·검증 근거를 남긴다. read-back이 없거나 다르면 `uncertain`이다.

이 스킬의 승인은 Linear Candidate 하나에만 적용된다. Obsidian, GitHub, commit 변경은 각각 별도 승인 경계를 사용한다.
