---
name: rpa-reconcile
description: RPA 코드·rpa-map·Linear·Obsidian이 변경됐을 때 RPA ID와 revision drift를 검사하고 소유 원본으로 복구할 때 사용한다.
---

# RPA Reconcile

번호는 `07`, Skill ID는 `RPA-RECON`이다. [공통 Receipt 계약](../../../docs/workflows/RPA_RECEIPT_CONTRACT.md)을 사용한다. SQLite는 정본이 아니라 삭제 후 재생성 가능한 검색 투영이다.

1. 변경된 파일과 게시 Receipt에서 RPA ID 및 source revision을 수집한다.
2. 코드, rpa-map, Linear, Obsidian을 각각 다시 읽고 `CODE_ONLY`, `MAP_ONLY`, `LINEAR_ONLY`, `OBSIDIAN_ONLY`, `CONTRACT_MISMATCH`로 분류한다.
   프로젝트·Task Description은 [RPA Description 계약 v1](../../../docs/workflows/RPA_DESCRIPTION_CONTRACT.md)의 `rpa:description check`로 생성 결과와 재조회 본문을 비교한다. WBS 원본, Unit·Step 개수, 기술·코드 연결, 예외·테스트 참조의 차이는 소유 원본으로 되돌린다.
3. 사실은 intake, PTU 계약은 map, 구현은 Git, 작업 상태는 Linear, 공통 상세 계약은 Obsidian이라는 소유권으로 복구 방향을 정한다.
4. 소유 원본이 충돌하거나 덮어쓰기 방향이 불명확하면 사용자 결정을 받고 자동 반영을 멈춘다.
5. 복구 뒤 네 표면과 생성 투영을 다시 읽고 digest, identity, parent, revision, acceptance를 Receipt에 남긴다.

완료는 모든 대상 RPA ID가 같은 계약과 revision chain으로 연결되고 drift가 남지 않은 상태다. 한 표면만 확인한 결과는 `uncertain`, 정본 충돌은 `blocked`다.
