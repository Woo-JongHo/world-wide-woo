# HUD 및 Chat 진입 수정

- 원인: AstraHud.render가 usage를 rows.push로 추가했고 기존 Astra 테스트가 2행을 기대했다. 기존 WorkbenchBottomHud의 1행 테스트는 별도 구현이다. 과거 수정 횟수나 각 세션의 실패 경위는 확인하지 않았다.
- 변경: Astra HUD 1행 및 폭별 축약, shell 최대 높이·예약 높이 1행, 초기 execution 선택. 좁으면 현재 provider와 +3을 표시하며 /context에서 상세를 확인한다.
- 검증: 관련 4개 파일 98 tests pass, tsc pass. 추가한 Chat 직접 진입 검증을 포함한 shell tests 8 pass. 변경 파일의 skip/only 및 미구현 TODO 없음(TODO는 기존 화면 제목).
- 미검증: 사용자의 실제 터미널 시각 확인, Claude Opus 독립 최종 감사. Opus 실행은 주간 한도 초과로 실패했다(opus-review.txt). 낮은 모델로 대체하지 않았다.
- 로고 및 색상은 검토만 했으며 변경하지 않았다. 흰색 본문 #FFFFFF, 현재 보조 #8D91A5. 밝은 청회색 #B8C0D8을 후보로 제안한다.
- 기존 작업 중 변경을 보존했으며 commit/push 없음.
