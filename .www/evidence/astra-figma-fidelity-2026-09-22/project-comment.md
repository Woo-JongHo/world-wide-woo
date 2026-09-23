## 변경

- Demo Context에 7 KPI, multicolor stacked spectrometer, composition bars, 8-turn change graph, diagnostics, dependency/top items/alerts와 Skills/MCP/Storage rail을 표시했다.
- Workflow 첫 화면에 7-stage pipeline과 역할별 상태·모델·작업을 나란히 배치하고 rail에 stage/agent 상태를 추가했다. active는 running만 집계한다.
- Provider 잔여 바의 16셀 compact 크기를 유지하고 내부 14셀의 remainingPercent만큼 provider 색을 채운다.

## 영향

- 160열 첫 viewport에서 Context 시각 카탈로그와 Workflow 상태를 비교할 수 있다. 검증 높이는 workspace 35~36행, 전체 shell 48행이다.
- Demo는 synthetic fixtures · not live telemetry를 명시하며 shell Demo 상태로만 합성 데이터를 표시한다. Live의 source allocation unavailable과 7개 화면 R/E·Esc 복귀를 유지한다.
- 커밋과 외부 게시 없이 사용자 시각 검토용 diff·이미지·Receipt를 남겼다.

## 분류

Improvement · Fix · Validation

## 검증

- 구현 전 public render seam과 shell /demo 테스트에서 기존 화면의 실패를 확인한 뒤 구현했다.
- bun run check 통과. 관련 및 architecture 98 pass / 0 fail. 전체 bun test 1393 pass / 0 fail, 159개 파일.
- git diff --check 통과. 변경 파일에 새 TODO·skip·only가 없으며 기존 TODO 패널 제목 1건은 정상 UI 문자열로 판정했다.
- 독립 Codex 읽기 전용 검토의 두 발견을 수정·재검토했다. Claude Sonnet 5 교차 검토는 OAuth 만료로 실행되지 않았다.
- 현재 linear-woo 도구가 없어 최신 Activity 중복 조회와 대상 read-back은 미실행이다. expectedBefore는 과거 게시 Receipt의 마지막 확인 ID이며 게시 전에 재조회·재검증해야 한다.

## 연결

- Linear issue: WOO-913 · UUID 8367530b-1a29-4983-994b-c2bf61ac687e
- Figma: Q7kGUdqiaQRJI8CZlPMRX7 · Context 50:967
- Review: docs/reviews/astra-figma-fidelity-2026-09-22.md
- Evidence: .www/evidence/astra-figma-fidelity-2026-09-22/receipt.json
- Branch: dev · HEAD a953dc8aae13573f1c92772efe747008a31940a4 · uncommitted
