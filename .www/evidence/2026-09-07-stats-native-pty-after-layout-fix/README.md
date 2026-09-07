# Stats 실제 Native · PTY — outcome 표시 수정 후

2026-09-07 KST, 실제 gpt-5.6-sol Native → ProjectWorkbench → runProjectWorkbenchShell, ephemeral thread, 임시 cwd, read-only sandbox에서 수행했다. journal은 메모리 구현이고 외부 quota service는 fixture이므로 restart·quota 수락은 아니다. Python pyte 0.8.2로 ANSI를 실제 80×36 PTY에서 해석했다.

## 관측

- `/stats` 최초 usage unobserved, 정상 요청 뒤 완료 1/1과 관측 tokens 표시.
- 실제 resize 40/80/120열 모두 첫 구분선 이전에 completed/failed/cancelled/active/boundary-only 전체 건수 문구가 나타난다. 각 txt의 헤더 줄을 공백 정규화해 원문과 비교했다.
- 두 번째 요청의 streaming을 확인하고 실제 Esc 입력 후 CANCELLED, completed 1 / cancelled 1 / active 0, 완료율 50%가 나타난다. 완료 시간 평균 분모는 1 completed pair로 유지된다.
- Ctrl+D 정상 종료, steps.json exitCode 0. 원래 재개 전 실행은 resize 중 중단되어 이 결과에 합치지 않았다.

## 한계와 남은 일

이 증거는 정상 완료·중단 집계와 root outcome 건수 가시성에 대한 실제 조작 근거다. 40열에서 일부 성능 캡션은 여전히 말줄임되고 높이 36에서는 하단 설명·요청 목록이 초기 viewport 밖이다. 전체 Stats 수락이나 화면의 모든 조건을 검증했다는 뜻이 아니다. 요청 탐색·과거 세션·재개·keyboard scroll 및 관측 분모 설명 접근성은 추가 확인한다.

`source-fingerprints.json`은 실행 대상 제품 코드/테스트의 SHA-256이다. 원 ANSI, 화면 txt, 실제 이벤트의 공개 참조·종류·상태, 실행 harness를 함께 보존했다. 외부 MCP startup 실패가 화면에 나타났으나 도구를 쓰지 않은 이번 Native 요청과 정상 종료/중단 관측은 완료됐다. Opus 최종 검토는 사용량 제한으로 아직 판정이 없다.
