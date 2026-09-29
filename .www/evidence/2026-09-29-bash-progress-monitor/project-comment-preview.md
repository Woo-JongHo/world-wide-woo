## 변경

- 사용자 후속 설명에 따라 별도 LLM Bash 재해석안을 철회했다. 기존 [www-runtime] WORK.summary를 같은 thread/turn/request의 수락된 Native 보고에서 직접 읽고 최신5개 PROGRESS에 표시한다. Broker의 관련 단계 공개 보고도 같은 수락 경계로 읽는다.
- Chat Bash 원문 카드를 유지하고 붙어 있던 별도 모델 설명을 제거했다. Chat 도구 action narration 스케줄을 중단했다. 기존 plan step narrator는 다른 책임으로 유지한다.
- Chat 최종 응답은 가재코드의 간결성·실제 검증과 일치하는 주장·부분 완료 금지 원칙을 반영했다. 내용이 있는 ### 결과/검증/남은 사항만 사용하고 영어 선택을 지원한다.
- Side REPORT는 완료 Note4필드 대신 현재 질문 상태·경과·도구 관측수·완료 변경 경로수·완료 Task수·단계 보고 모델을 보여준다. 질문 단위 토큰은 미관측으로 표시한다.

## 영향

- 임의의 Native Bash 내장 도구 키를 추가하지 않고 이미 존재하는 requestId/checkpoint/summary 스키마를 재사용한다. 명령 전 commentary는 의도, 명령 후 WORK.summary는 관측 결과이며 PROGRESS가 PLAN 완료 권위를 갖지 않는다.
- 두 번째 모델의 네트워크 재해석 지연을 PROGRESS 경로에서 제거한다. Native 자체 토큰 생성·이벤트 전달·TUI 지연은 남는다. Native 보고 누락 시 미보고로 남기며 추측으로 채우지 않는다.

## 분류

Improvement · Refactor · Validation

## 검증

- 탐색 실측: 실제 Luna 짧은 고정 입력3회 2933/3594/4551ms 성공, 평균3693ms. 실제 TUI·동시부하·p95 측정이 아니다. 이 별도 모델 호출 경로와 임시2slot/8초 큐는 후속 결정으로 회수했다.
- 최종 bun run check·git diff --check 통과. woo-readability 실제 import/table 검사14개 통과. 변경 동작 파일의 TODO/test.skip/test.only 없음.
- 행동 테스트·실제 WWW 재시작·Native WORK 수락 화면·부하측정은 미실행. Sonnet 정적 리뷰는 철회한 임시큐 대상으로 수행되어 최종 구현 수락 근거로 사용하지 않는다. 최종 Sonnet/Opus 감사는 미실행.
- Obsidian은 기존 identity draft 개정 후보를 준비했으나 최신 Vault 대조가 없어 검증·게시 차단 상태다.

## 연결

- [WOO-913](https://linear.app/woo-world/issue/WOO-913/workbench-monitoring-figma-5화면의-계측-의미와-정보-구조를-일치시킨다)
- docs/audit/2026-09-29-bash-progress-monitor.md
- .www/evidence/2026-09-29-bash-progress-monitor/latency-measurement.json
- .www/evidence/2026-09-29-bash-progress-monitor/readability-final.json
- 가재코드 규칙 원본: https://github.com/Yeachan-Heo/gajae-code/blob/7e54f9cbcf712cfa7f633d3c8da58a6d89f7f301/packages/coding-agent/src/prompts/system/system-prompt.md
- Source: request-protocol.ts, native-turn-coordinator.ts, workbench-note-narration.ts, www-execution.ts, www-monitor-view.ts
