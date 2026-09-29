## 변경

- Linear Issue·Project Comment·Project Update, Obsidian, Git, Evidence, traceability ledger와 projection의 현재 소유권을 대조했다.
- 기록 작업을 observed부터 reconciled까지 이어지는 RecordingRun 상태기계로 설계했다.
- WES는 새 정본이 아니라 후보·승인·게시·read-back·reconcile의 coordinator이고 WooEntry snapshot은 읽기 전용으로 유지하도록 경계를 정했다.
- 첫 구현 순서를 HUD 확장이 아니라 RecordingRun과 reconcile로 결정했다.

## 영향

- 후보 누락, 중복 게시, read-back 없는 성공 주장과 낡은 Obsidian 링크를 같은 drift 규칙으로 탐지할 수 있다.
- 외부 쓰기는 publication intent 승인 뒤에만 수행하고 재시작 시 receipt를 재생해 중복을 막는다.
- 일반 Chat은 WES 기록 상태가 차단되어도 계속 동작한다.

## 분류

Feature · Refactor · Validation

## 검증

- bun run development-map:check: 37 issues, 통과.
- bun run traceability:check: VAULT_EXPORT_PROVENANCE_MISMATCH로 실패했으며 현존 drift 근거로 보존했다.
- Claude Opus 읽기 전용 감사는 두 번 모두 max turns에 도달해 결과가 없으므로 검토 증거로 채택하지 않았다.
- Linear connector는 재인증이 필요해 신규 이슈 후보의 부모·milestone·중복 판정은 position_unverified로 차단했다.

## 연결

- Linear Issue Candidate: .www/evidence/2026-09-27-wes-recording-orchestration/linear-issue-candidate.json
- Planning: EP-004 WES Context · ST-004-06 Decision·Evidence projection
- Related: WOO-910 7단계 Runtime 통제
- Design: docs/planning/WES_RECORDING_ORCHESTRATION_DESIGN_2026-09-27.md
- Obsidian Candidate: .www/evidence/2026-09-27-wes-recording-orchestration/obsidian-canonical-candidate.json
