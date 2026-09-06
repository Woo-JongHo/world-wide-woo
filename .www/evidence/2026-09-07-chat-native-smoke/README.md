# Chat 실제 Native 연결 관측 · 2026-09-07

- Linear: [WOO-690](https://linear.app/woo-world/issue/WOO-690), UUID `a417df98-8479-4222-b7e8-170ea4230f97`.
- 제품 코드 기준: `d35b2bbb1f784a0f177c6e80453ce634d6d93d74`, PR #39.
- 실제 모델: `gpt-5.6-sol`, isolated temporary cwd, ephemeral Native thread, read-only sandbox.

## 확인 결과

[어댑터 관측](native-refs-probe.json)은 raw JSON-RPC와 어댑터 event를 대조한다. 이번 실행의 assistant delta 3건은 모두 threadId·turnId·itemId를 포함했고 started/completed에서도 같은 identity가 유지됐다. reasoning delta는 이번 실행에서 관측되지 않았으므로 호환성을 확대 주장하지 않는다.

[Chat 관측](native-chat-probe.json)은 실제 Native → ProjectWorkbench → WorkbenchChatView 경로를 실행했다. 사용자 입력은 snapshot 전 과정에서 최대 1개였고 live draft가 관측된 뒤 완료 답변 하나로 전환됐다. 한글·emoji 답변을 40·80·120열로 렌더링했으며 세 폭 모두 overflow가 0이었다. 각 폭의 실제 plain rows와 최종 Chat identity가 JSON에 있다.

실행 소스는 [어댑터 probe](native-refs-probe.ts), [Chat probe](native-chat-probe.ts)에 보존한다. 프로젝트 root에서 Bun으로 실행할 수 있으며 실제 모델 호출과 새 임시 세션을 만든다. 각 실행의 새 결과는 별도 기록으로 보존해야 한다.

## 한계

이 근거는 실제 모델 및 제품 application/component 연결을 확인한다. in-memory journal을 사용했으며 PTY·키보드·scroll/focus·재개·child thread·실패/취소·장기 세션은 실행하지 않았다. 전체 Native 형태나 TUI 수락 완료를 증명하지 않는다. PR #39의 제품 코드 검토 PASS와 이 관측은 별개 근거다.
