## 변경

- 현재 WwwWorkspace production 렌더 경로에서 긴 streaming draft와 1,000개 이력의 비용을 분리 측정하고 결과를 docs/audit/2026-09-28-chat-render-latency-diagnosis.md에 기록했다. 제품 코드는 변경하지 않았다.
- draft가 durable revision을 바꾸고, 변경된 Markdown 블록이 exact row count와 viewport materialization에서 각각 렌더됨을 계측했다. 첫 표시와 새 폭에서는 전체 durable history의 정확한 행 수 계산이 큰 비용으로 나타났다.

## 영향

- WOO-915의 긴 draft 렌더 지연이 현재 코드에서도 재현되며 반복 Markdown parse/wrap과 행 수 인덱스 재구성이 남아 있음을 좁혔다.
- 실제 Codex 동등성, 특정 느린 세션 frame과의 인과, PTY·terminal pixel 지연은 확인하지 않아 성능 해결 완료로 판정하지 않는다.

## 분류

Validation

## 검증

- WWW_BENCH_REPS=20 WWW_BENCH_COUNTS=1 WWW_BENCH_BUDGET_MS=240000 bun scripts/www-render-benchmark.ts: exit 1 / RED. 37KB draft p95 57.47ms, warm body p95 0.49ms.
- WWW_BENCH_REPS=5 WWW_BENCH_COUNTS=1000 WWW_BENCH_BUDGET_MS=240000 bun scripts/www-render-benchmark.ts: exit 1 / RED. cold body 1,024ms, exact-count build 916.83ms, 37KB draft p95 74.95ms.
- 임시 cache-metrics 계측 8회/조건에서 각 draft update의 renderedBlocks 증가량은 2, durableCountRenderedBlocks 증가량은 1이었다. 별도 테스트 스위트 및 실제 Codex 비교는 실행하지 않았다.
- Live Linear read-back 2026-09-28: WOO-915 is In Progress in World Wide Woo under WOO-679.

## 연결

- Linear: WOO-915 https://linear.app/woo-world/issue/WOO-915/11-긴-채팅-draft의-반복-렌더-지연을-제거한다 (live read-back 2026-09-28; In Progress)
- Audit: docs/audit/2026-09-28-chat-render-latency-diagnosis.md
- Evidence: .www/evidence/2026-09-28-chat-render-latency-diagnosis
