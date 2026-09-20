# 첫 제품 마일스톤 문서 Sonnet 교차검토

## Verdict: NEEDS_CHANGES

핵심 구조(장기 비전/첫 마일스톤 분리, 코드-문서 정합성)는 대체로 정직하고 근거가 있으나, 1차 작업 묶음 내부의 순서·의존 관계가 비어 있고 검증 불가능한 사실 주장이 남아 있어 이대로 착수하면 중간에 막히는 지점이 있다.

## Findings (중대도순)

### 1. Medium — B/C 작업 묶음의 실행 순서가 명시되지 않음

- 근거: `docs/WWW_FIRST_PRODUCT_MILESTONE.md`에서 완료 회고 문구 개선(B)과 완료 회고 projection 이동(C)이 같은 기능을 사용자 행동과 구조 이동으로 나눠 담았지만 어느 쪽이 선행하는지 명시하지 않았다.
- 수정안: 완료 회고 문구 개선을 현재 위치에서 먼저 적용하고 구조 이동은 동작 변경 없이 뒤따른다는 순서를 추가한다.

### 2. Medium — 완료 판단과 Planning ID 추정 금지 사이에 ID 발급 트리거가 없음

- 근거: 완료 조건은 관련 Story acceptance와 Evidence 연결을 요구하지만 Development Map의 B/C/D는 아직 Issue 미등록·Story 정의 전 단계다.
- 수정안: B/C 범위가 확정되는 시점에 Planning ID 발급을 요청한다는 트리거를 추가한다.

### 3. Low — Development Map에서 과거 PR 의존 순서 표를 제거한 사유가 없음

- 근거: 기존 PR #27~32 병합 순서 표를 첫 제품 마일스톤 표로 교체했다.
- 수정안: 세부 병합 이력은 Git log로 대체한다는 문장을 남긴다.

### 4. Info — A~D 범위가 첫 작업 묶음으로는 넓음

- 근거: 문서 고정, 사용자 마찰 네 항목, 내부 구조 네 항목, 수락 근거 네 항목이 한 번에 묶였다.
- 수정안: 내부 구조 정리를 별도 착수 단위로 분리해 사용자 마찰·검증과 위험을 구분하는 방안을 고려한다.

## 검증됨

- 문서가 지목한 `ProjectWorkbench`, `workbench-shell.ts`, `workbench-views.ts`, `legacy-session-shell.ts`, `legacy-router-app.ts`, `SessionRuntime`은 실제 존재한다.
- Planning catalog는 `epic.created`와 `story.created`만 보유하며 EP-011·EP-012에 acceptance event가 없다.
- 로컬 `main`은 `origin/main`보다 15 commit 앞서 있다.
- README, CONTEXT, 마일스톤 문서, Development Map은 장기 비전과 현재 범위를 의도적으로 분리하며 새 Planning ID를 추정하지 않았다.

## 남은 위험

- 리뷰 환경에서는 `bun test`가 차단되어 Development Map의 587개 테스트 통과 주장을 독립 대조하지 못했다.
- 리뷰 환경에서는 `gh pr list`가 차단되어 PR #27~34의 원격 상태를 독립 대조하지 못했다.

원문은 Claude Sonnet 5 읽기 전용 CLI 검토 결과를 내용 손실 없이 Markdown 구조로 정리했다.
