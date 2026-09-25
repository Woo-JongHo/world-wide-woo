# 채팅 렌더 지연 후속 이슈 Intake

- 요청: 현재 CMux의 심한 채팅 렌더 지연을 다시 진단하고, 이슈로 추적하며, 확정 원인을 수정해 실제 세션까지 수락한다.
- 처리: WOO-679 아래 독립 후속 하위 이슈 1개 생성 Candidate.
- 위치: World Wide Woo (`P-WOO-15`) → Workbench (`WOO-674`) → Chat (`WOO-679`) → `11. 긴 채팅 draft의 반복 렌더 지연을 제거한다`.
- 대조: 2026-09-24T12:51:15+09:00에 WOO-679 본문과 직계 하위 전체, WOO-689 본문, 프로젝트의 `렌더링`·`성능` 검색 결과를 활성·완료·취소·보관 포함으로 조회했다. 모든 목록은 `hasNextPage=false`였다.
- 중복 판정: WOO-689는 durable transcript graph/count repair와 exact height·scroll을 완료했지만 초기 렌더·긴 draft·실제 provider·IME·terminal·사용자 WWW session을 제외했다. 이번 수락 단위는 재현된 긴 draft의 steady renderer 병목이므로 완료 이슈 본문 보완이 아닌 독립 후속이다. cold/resize 진단과 시스템 부하는 측정 경계로 남기고 자원 예산 구현을 이 이슈의 필수 범위로 늘리지 않는다.
- 가이드: `ISSUE_CONTRACT.yaml`, `ISSUE_TEMPLATE.md`, `DEVELOPMENT_FLOW.md`, `ARCHITECTURE.md`, `docs/audit/2026-09-24-chat-render-system-diagnosis.md`를 적용했다.
- 메타데이터: WOO-679의 v0.1.0 Milestone 유지. 기존 검색 라벨 `TUI`, `Chat`, `Bug`, `perf` 재사용. 새 capability나 공개 계약 변경은 아직 없으므로 Obsidian Candidate는 만들지 않는다. 추정 높이 등 계약 변경이 필요하면 구현 전에 별도 Decision으로 승격한다.
- 상태: 실제 수락 전 `Todo`. 외부 게시와 상태 변경은 이 Candidate에 포함하지 않았다.

## 계층 계약 게이트

게시 렌더와 `NEW-CHAT-11` draft description을 byte-for-byte 대조해 일치시켰다. `parentId`도 live snapshot과 같은 `WOO-679` 식별자로 넣어 신규 이슈를 실제 Chat 하위 검증 대상에 포함했다. 일반 `linear-issue` Candidate에 선택적 `result`·`behavior`를 추가해 기존 4절 렌더는 유지하고, 두 필드가 함께 있으면 `목적/결과/범위/동작/완료 조건/연결` 순서로 렌더하도록 호환 수정했다.

현재 live snapshot의 기존 오류는 draft 적용 전후 모두 28개로 같고 신규 오류는 0개다. 따라서 `NEW-CHAT-11` 자체는 계층 본문 계약을 통과하며, 전체 Chat gate의 exit 1은 기존 WOO-689·718·753·754·843·909 drift가 소유한다. 이번 게시를 위해 그 기존 이슈를 임의 수정하지 않는다. 상세 비교는 `issue-contract-validation.txt`에 보존했다.
