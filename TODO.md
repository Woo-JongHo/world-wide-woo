# WWW TODO

## 기준

- WWW는 **World Wide Woo**이며 WES Agent TUI의 제품 Shell이다.
- 화면은 저장 원문이나 모델 Context를 임의로 바꾸지 않는 projection이어야 한다.
- 내부 Agent와 tool executor는 Shell·Router·사용량·출력 계약이 검증된 뒤 연결한다.
- 항목은 실제 동작과 검증이 함께 끝나야 완료한다.

## P0 — 제품 Shell

- [x] 단일 외곽 프레임 안의 왼쪽 1개·오른쪽 상하 2개 viewport
- [x] 넓은 화면의 영역별 독립 ScrollView와 저높이 compact 전환
- [x] Claude 계열 팔레트와 ANSI 폭을 보존하는 WWW 그라데이션
- [x] `🐙` WWW 제품 마크와 World Wide Woo 설명
- [x] 공식 Editor 기반 한글 IME·paste·history·autocomplete
- [x] `/model`, `/effort`, `/login`, `/logout`, `/usage`, `/status`, `/help`, `/exit`
- [x] Codex OAuth와 OpenAI API Provider 구분
- [x] 동일 모델의 유일한 인증 Router 자동 재조정
- [x] OMC형 Codex·Claude 2줄 사용량 HUD
- [x] append-only JSONL 세션과 안전한 종료·재개
- [x] `/commits` Git 작업 트리·최근 Commit 조회
- [x] `/issues` 현재 저장소의 열린 GitHub Issue 조회

## P1 — 출력 계약

- [x] Bash 실행 상태 DTO와 width-safe 결과 카드
- [x] 번호·bullet·검증을 표현하는 완료 요약 카드
- [ ] `command.started → command.output → command.completed` 이벤트 projector 연결
- [ ] stdout/stderr streaming 중 활성 Bash 카드 갱신
- [ ] 명령 취소·실패·exit code·duration의 terminal 상태 보장
- [ ] 완료된 턴의 `CompletionReport` 생성과 transcript 삽입
- [ ] 긴 출력 paging·접기·복사·원문 열기
- [ ] command card golden/PTY snapshot 검증
- [ ] staged file 선택·Commit preview·명시적 승인
- [ ] Issue 생성·수정 preview와 GitHub 제출 승인

## P2 — Agent runtime

- [ ] 단일 활성 Turn 상태기계
- [ ] model → tool call → approval → execution → tool result 반복 루프
- [ ] Bash·read·search·edit 최소 tool set
- [ ] 명령별 cwd·권한·timeout·AbortSignal
- [ ] 위험 작업 승인 overlay와 fail-closed 정책
- [ ] tool-only·thinking-only·부분 응답 보존
- [ ] 중단된 Turn의 cancelled terminal event

## P3 — WES Context

- [ ] Display Policy와 Context Policy 분리
- [ ] category별 show/hide/fold/filter
- [ ] 현재 WES View를 모델 Context로 명시적으로 채택하는 흐름
- [ ] summary·compaction·raw event provenance
- [ ] Decision·Evidence·Todo projection
- [ ] 세션 resume·fork·replay picker

## P4 — 제품 품질

- [ ] 40·70·120·160열 및 10·13·24·42행 matrix snapshot
- [ ] truecolor·256색·무색상 terminal 대비 검증
- [ ] macOS·Linux·Windows smoke test
- [ ] OAuth refresh/login/logout 경합 테스트
- [ ] quota API rate-limit·stale cache·offline 상태
- [ ] session pagination과 장기 메모리 상한
- [ ] command·output·provider error redaction audit

## P5 — 배포

- [ ] GitHub Actions에 typecheck·test·PTY smoke 연결
- [ ] npm/Bun executable 배포 계약
- [ ] 버전·changelog 자동화
- [ ] 설치·로그인·복구 운영 문서
