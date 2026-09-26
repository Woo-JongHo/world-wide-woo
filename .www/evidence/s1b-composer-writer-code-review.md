# S1-B Composer writer 독립 코드 리뷰

- 검토 범위: `workbench-shell.ts` Composer generation 변경, `ComposerDraftController` 주석, persistence adapter, Composer·session 관련 테스트
- 판정: `BLOCK`
- 권고: `REQUEST_CHANGES`
- 검토일: 2026-09-25

## 확인한 계약

Shell Editor만 live text를 변경하고, Core는 제출된 request/queue를 소유하며, persistence는 종료 시 저장·기존 draft 정리만 담당해야 한다. 특히 generation N의 늦은 결과는 N+1의 화면 또는 저장 초안을 복구·삭제해서는 안 된다.

## Findings

### HIGH — 진행 중인 clear와 종료 save의 역전으로 N+1 초안이 삭제될 수 있음

- 위치: `src/adapters/inbound/tui/shell/workbench-shell.ts:573`, `src/adapters/inbound/tui/shell/workbench-shell.ts:500`, `src/adapters/inbound/tui/shell/shell-lifecycle.ts:49-56`
- `composerIsUnchanged()`는 `composerDraft.clear()`를 **시작하기 전**만 확인한다. `clear()`는 비동기 filesystem 작업이며, Shell lifecycle의 `saveDraft()`와 별도의 serialization/await 관계가 없다.
- 재현 순서: (1) generation N dispatch가 `accepted`되어 573행에서 `clear()`를 시작한다. (2) 사용자가 N+1 텍스트를 입력한다. (3) 즉시 종료하면 lifecycle이 N+1을 `save()`한다. (4) 앞서 시작된 N의 `clear()`가 나중에 끝나면 같은 controller path/loaded draft를 제거해 방금 저장된 N+1을 삭제할 수 있다. `FileComposerDraftController.clear()`도 경합 버전이나 expected generation을 받지 않고 파일을 제거한다 (`composer-draft-store.ts:98-102`).
- 영향: 이번 변경의 핵심 수락 기준인 “late accepted from N cannot clear N+1 edits”가 영속 경로에서 깨진다. 프로세스 종료/재시작 뒤 N+1 draft가 사라질 수 있다.
- 필요 조치: clear와 shutdown save를 동일한 Composer writer sequencing 아래 두고, clear 완료 시점에도 generation/버전을 재검증하거나 persistence port에 compare-and-clear(expected draft version)를 제공해야 한다. 관련 비동기 작업을 lifecycle이 안전히 await/취소하는 계약도 필요하다.
- 누락 테스트: `test/tui-shell-characterization.test.ts:112-125`는 새 draft를 작성한 **후** receipt를 resolve하므로 clear 시작 자체를 막는 경우만 확인한다. `clear()`를 deferred로 만든 뒤, accepted → clear 시작 → N+1 입력 → shutdown save → clear 해제 순서를 검증해야 한다.

### LOW — 현재 전체 characterization 파일은 통과하지 않음 (S1-B 외 범위)

- 위치: `test/tui-shell-characterization.test.ts:299`
- `bun test test/tui-shell-characterization.test.ts --timeout 10000` 실행에서 `links every coalesced Native delta to the same terminal frame`가 `terminal-frame-3` 대 `terminal-frame-4`로 실패했다. 이는 S0-E frame coalescing 변경으로 보이며 Composer writer 범위 밖이다. 다만 S1-B 테스트도 같은 파일에 있어 현재 파일 단위 green은 주장할 수 없다.

## 테스트 및 검증

- `bun test test/composer-draft-store.test.ts test/project-workbench-session.test.ts --timeout 20000` — 31 pass / 0 fail
- `bunx tsc --noEmit` — pass
- `bun test test/tui-shell-characterization.test.ts --timeout 10000` — 14 pass / 1 fail (위 LOW, S0-E 범위)

## 테스트 품질 / Skill perspective

`remove-ai-slops`와 `programming` skill은 이 세션의 available skill 목록 및 local skill roots에서 찾을 수 없어 정식 skill-perspective load는 실행하지 못했다. 대신 동일 기준으로 검토했다.

- generation N의 late rejection 및 receipt 전에 이미 N+1이 생긴 accepted를 확인하는 새 테스트는 실제 race 계약을 검증하며 tautology나 removal-only test가 아니다.
- 그러나 clear가 시작된 뒤 발생하는 N+1/종료 저장 경합은 빠져 있어 현재 테스트는 핵심 저장소 계약에 대해 과신을 만든다.
- production 변경 자체는 불필요한 parsing·normalization·typed escape hatch를 추가하지 않았다. 문제는 추상화 부족이 아니라, 기존 `clear/save` 비동기 port에 필요한 sequencing/compare-and-clear 계약이 없다는 점이다.

## 결론

`codeQualityStatus: BLOCK`  
`recommendation: REQUEST_CHANGES`  
`blockers: generation N clear가 시작된 뒤 N+1 입력과 shutdown save가 교차할 때 N+1 persistent draft를 삭제하지 않도록 writer/persistence sequencing과 회귀 테스트를 추가할 것.`
