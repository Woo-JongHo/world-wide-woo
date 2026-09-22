## 변경

- Provider 구독 HUD를 16칸의 괄호형 상태바로 축소하고 remainingPercent에 비례한 색상 채움과 reset countdown을 함께 표시했다.
- Figma Context node 50:967을 다시 조회해 Gruvbox 색 역할, 7개 KPI, 분석 패널, 우측 레일의 정보 계층을 코드와 재대조했다.
- Context 우측 레일을 LOADED SKILLS, MCP SERVERS, STORAGE METRICS 구조로 바꾸고 skill 활성 상태, MCP 연결·tool 수, 실제 context/cache/journal 기록을 연결했다.
- Figma의 synthetic source별 MB 비율은 Native가 관측하지 않으므로 라이브 값으로 복제하지 않고 미관측 계약을 유지했다.

## 영향

- 구독 잔여량은 과도한 full-color 막대 대신 짧은 숫자 중심 표시로 읽히며 사용량 증가에 따라 채움이 감소한다.
- Context 화면의 우측 영역이 Figma와 같은 기능 묶음과 시각 우선순위를 가지면서도 MCP 개수와 전체 Context 점유율을 혼동하지 않는다.

## 분류

Improvement · Fix · Validation

## 검증

- Astra UI·shell·provider logo 대상 79 tests, 0 fail, 2,122 assertions를 확인했다.
- HUD 테스트가 16칸 괄호형 문구와 42% 잔여량의 부분 채움 배경을 검증한다.
- Context workspace 테스트가 Figma의 세 우측 레일 heading, skill ACTIVE, MCP ONLINE과 80열 main pane landmark를 검증한다.
- bunx tsc --noEmit과 git diff --check가 통과했고 대상 파일에 test.skip·test.only·TODO가 없음을 확인했다.

## 연결

- Linear issue: WOO-913
- Figma: Q7kGUdqiaQRJI8CZlPMRX7 node 50:967
- Evidence: .www/evidence/2026-09-22-astra-context-fidelity
- Branch: ui/workbench-visual-polish
