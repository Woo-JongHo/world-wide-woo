# WOO-715 실제 PTY 수락

- 실행: `python3 .www/scratchpad/2026-09-07-stats-enter-pty.py`
- Native probe 종료 코드: `0`
- 실제 80열 Stats 대시보드에서 `↓` 선택 후 Enter로 `REQUEST INVESTIGATION`과 `SOURCE`가 관측됨.
- 두 번째 Enter 후 Source 화면에서 `Activity`와 Source 출력이 관측됨.
- 동일 실행의 요청 상세 → Source 이동 경로를 실제 PTY로 확인했다.
- 이 실행은 80열 기준이며, 기존 Stats PTY 증거에서 40·80·120열 레이아웃도 별도로 확인했다.

## 결과 파일

- `steps.json`
- `03-selected-request-list.txt`
- `04-enter-request-detail.txt`
- `05-enter-source.txt`
