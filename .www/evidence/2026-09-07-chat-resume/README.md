# Native Chat 재개 실제 수락 검증 · 2026-09-07

## 시험 정보

- 목적: 실제 `createProjectWorkbenchSession → CodexAppServer → File ActivityJournalStore` 경로에서 Native thread를 닫고 다시 열어 Chat 순서·개수·본문·공개 refs·활동 기록이 보존되는지 확인한다.
- 유형: 실제 provider 통합 수락 검증. 임시 workspace를 만들고 종료 뒤 제거했으며, Native thread는 `ephemeral: false`로 유지했다.
- 버전: 실행 시 작업 트리는 `woo-chat-completion`이며 제품 파일에 다른 작업자의 미커밋 변경이 있었다. 따라서 commit SHA를 주장하지 않고 결과 JSON의 `sourceFingerprints` SHA-256만 기준으로 삼는다.
- 모델/정책: `gpt-5.6-sol`, low, Native `approvalPolicy: never`, `sandbox: read-only`. 요청은 도구·파일 작성을 금지했다.
- 실행: `sh .www/evidence/2026-09-07-chat-resume/run-native-chat-resume.sh`.

## 절차와 기대값

1. 새 임시 workspace에서 정상 요청을 보낸다. 사용자 1개와 완료 assistant 1개가 같은 thread에 기록되어야 한다.
2. 세션과 Codex App Server 연결을 닫고 같은 thread id로 새 session을 연다. local activity journal만으로 두 메시지가 같은 순서와 본문으로 한 번씩 복원되어야 하며, `thread/resume-local-reconciled`가 있어야 한다.
3. 재개 snapshot을 실제 `WorkbenchChatView`로 80열 렌더링한다. 완료 본문이 프레임에 있어야 한다.
4. 같은 thread에서 장문 요청의 live draft를 기다린 뒤 취소한다. cancelled assistant는 partial 본문을 유지해야 한다.
5. 다시 닫고 같은 thread를 재개한다. 총 4개 메시지와 cancelled partial 1개가 복원되고, 80열 프레임에 `중단됨`이 있어야 한다.

## 실제 결과

[`2026-09-07-chat-resume-result.json`](2026-09-07-chat-resume-result.json)은 2026-09-07T01:50:50.348Z에 `passed`를 기록했다.

- 정상 요청: 동일 Native thread에서 user 1개와 assistant `재개 정상 확인` 1개가 완료됐다.
- 첫 재개: 동일 thread id, Chat 2개, 순서 `user → assistant`, 완료 본문 1개가 복원됐다. local journal reconciliation 공개 ref도 기록됐다.
- 중단: live draft 뒤 취소되어 assistant 1개가 `cancelled`, `partial: true`, 공개 본문 `1.`로 남았다. Native terminal event는 `interrupted`였다.
- 두 번째 재개: Chat 4개와 cancelled partial 1개가 복원됐다. 저장된 실제 Chat 프레임에는 완료 본문과 `bori  중단됨`이 모두 있다.
- 결과는 item·turn·thread의 공개 refs와 type/status만 보존한다. reasoning의 내용은 저장하지 않는다.

## 실패와 한계

이번 실행의 수락 assertion 실패는 없다. 이 결과는 한 thread와 두 turns의 표본이며, PTY 키보드/scroll/focus/IME, 네트워크 단절 중 resume, approval UI, provider가 부분 본문 없이 interrupted terminal을 보내는 경계는 검증하지 않는다. 재개 화면의 대화는 Native history를 hydrate한 것이 아니라 local activity journal에서 복원한다는 범위를 `thread/resume-local-reconciled` 공개 activity로 확인했다.

재개 frame에는 `질문 요약 자동 생성 보류`와 `T-note activities must belong to one project`가 함께 표시됐다. 이 검증은 T-note를 요청하지 않았고 Chat 재개 assertion에는 영향이 없지만, 별도 제품 결함 후보로 scratchpad에 재현 조건을 기록했다.
