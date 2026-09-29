## 변경

- Monitor 상단을 요청 상태·모델·도구·실패·재시도·토큰·컨텍스트를 함께 읽는 요약 스트립으로 재구성했다.
- 요청 시작 시각을 기준으로 7단계와 최근 도구 활동을 배치하는 RUN TRACE WATERFALL을 추가했다.
- 단계별 도구 활동을 묶는 TRACE TREE와 runtime이 공개한 decision.created 이벤트만 표시하는 DECISIONS TIMELINE을 추가했다.
- 실패·차단 이벤트를 시각·단계·관측된 사유로 표시하고 기존 Render Health·계층 성능·최근 이벤트를 유지했다.
- 미관측 값은 0이나 추정치로 만들지 않고 대시 또는 미관측 문구로 남겼다.

## 영향

- 사용자는 현재 요청의 상태뿐 아니라 단계별 시간 배치와 도구 활동, 공개 결정, 실패 지점을 한 화면에서 읽을 수 있다.
- 사적 추론이나 추정 원인을 표시하지 않고 runtime이 실제로 내보낸 공개 이벤트만 사용한다.
- 직접적인 새 화면 수락 테스트와 실제 TUI 검증은 아직 남아 있어 구현 완료와 사용자 수락을 구분한다.

## 분류

Feature · Improvement · Validation

## 검증

- runtime-monitor·observability view·telemetry duration 관련 테스트 23개가 통과했다.
- bunx tsc --noEmit과 대상 파일 git diff --check가 통과했다.
- 변경 파일과 관련 테스트에서 TODO, test.skip, test.only 자리표시를 찾지 못했다.
- AGENTS.md가 지정한 가독성 스크립트는 로컬 symlink 대상에 필요한 파일이 없어 실행하지 못했다.
- RUN TRACE WATERFALL·TRACE TREE·DECISIONS TIMELINE·ACTIVE FAILURES를 직접 고정하는 수락 테스트와 독립 리뷰는 아직 수행하지 않았다.

## 연결

- Linear: WOO-675 · UUID 28bc3ec6-f98d-421e-9398-8721f5c50724
- Code: src/adapters/inbound/tui/features/monitoring/view/www-monitor-view.ts
- Design input: docs/design/prompts/WWW_FIGMA_MONITOR_PROMPT.md
- Evidence: .www/evidence/2026-09-28-monitor-trace-view
- Branch: dev · HEAD 5269ee3bf49ebf563e15cfcef5c5c595f33d2922 · uncommitted
