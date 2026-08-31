# WWW Stories

각 Story는 하나의 사용자 가치 또는 검증 가능한 제품 동작이다. 완료 표시는 구현과 검증이 모두 끝난 경우에만 사용한다.

## 지속 규칙

- 새 Story는 부모 Epic 구역의 끝에 추가하고 기존 Story를 덮어쓰지 않는다.
- Story ID는 프로젝트 전체에서 재사용하지 않는다.
- 완료·중단된 Story도 삭제하지 않고 checkbox와 증거 이력을 보존한다.
- 내용 변경이 기존 acceptance 의미를 바꾸면 새 Story ID를 발급한다.
- 현재 실행 단계는 `.www/Todo.md`로 projection하고 Story 자체는 장기 이력으로 유지한다.

## EP-001 — 제품 Shell

- [x] ST-001-01 프로젝트 root에 `.www/project.json`과 local session·draft state를 둔다.
- [x] ST-001-02 프로젝트별 session 목록과 `.www` 위치를 표시한다.
- [x] ST-001-03 단일 외곽 프레임에 왼쪽 1개·오른쪽 상하 2개 viewport를 배치한다.
- [x] ST-001-04 넓은 화면의 영역별 독립 ScrollView와 저높이 compact 전환을 제공한다.
- [x] ST-001-05 Claude 계열 팔레트와 ANSI 폭을 보존하는 WWW 그라데이션을 적용한다.
- [x] ST-001-06 `🐙` WWW 제품 마크와 World Wide Woo 설명을 표시한다.
- [x] ST-001-07 공식 Editor 기반 한글 IME·paste·history·autocomplete를 제공한다.
- [x] ST-001-08 `/model`, `/effort`, `/login`, `/logout`, `/usage`, `/status`, `/help`, `/exit`을 제공한다.
- [x] ST-001-09 Provider → Model → 추론 → 확인 계층형 staged atomic Model sheet를 제공한다.
- [x] ST-001-10 현재 작업 경로를 model context와 Session 영역에 표시한다.
- [x] ST-001-11 활성 provider/model/effort를 model context에 주입하고 직접 답변한다.
- [x] ST-001-12 Conversation role과 body를 pane edge에 좌측 정렬한다.
- [x] ST-001-13 실제 request·waiting·thinking·responding·cancelling activity를 표시한다.
- [x] ST-001-14 Ctrl+C 2단계·Ctrl+D·Esc 우선순위와 Composer draft 복원을 제공한다.
- [x] ST-001-15 streaming 중 local/async read·mutation·control Slash concurrency를 분리한다.
- [x] ST-001-16 Codex OAuth와 OpenAI API Provider를 구분한다.
- [x] ST-001-17 동일 모델의 유일한 인증 Router를 자동 재조정한다.
- [x] ST-001-18 Codex·Claude 사용량 HUD를 2줄로 표시한다.
- [x] ST-001-19 append-only JSONL session과 안전한 종료·재개를 제공한다.
- [x] ST-001-20 `/commits`에서 Git 작업 트리와 최근 Commit을 조회한다.
- [x] ST-001-21 `/issues`에서 현재 저장소의 열린 GitHub Issue를 조회한다.
- [x] ST-001-22 프로젝트 단일 `.www/Todo.md`와 Workspace 실시간 진행률을 제공한다.
- [x] ST-001-23 Workspace Pane에는 현재 Todo만 표시하고 project metadata는 `/status`로 분리한다.

## EP-002 — 출력 계약

- [x] ST-002-01 Bash 실행 상태 DTO와 width-safe 결과 카드를 제공한다.
- [x] ST-002-02 실제 read·search·safe Bash lifecycle을 연결한다.
- [x] ST-002-03 번호·bullet·검증을 표현하는 완료 요약 카드를 제공한다.
- [x] ST-002-04 Gajae native syntax와 message·tool·diff·effort semantic highlight를 적용한다.
- [x] ST-002-05 unknown-tool fallback과 textual diff 카드를 제공한다.
- [x] ST-002-06 `command.started → command.output → command.completed` event를 projection한다.
- [ ] ST-002-07 stdout/stderr streaming 중 활성 Bash 카드를 갱신한다.
- [x] ST-002-08 명령 취소·실패·exit code·duration terminal 상태를 보존한다.
- [ ] ST-002-09 완료된 turn의 `CompletionReport`를 transcript에 삽입한다.
- [ ] ST-002-10 긴 출력 paging·접기·복사·원문 열기를 제공한다.
- [ ] ST-002-11 command card golden/PTY snapshot을 검증한다.
- [ ] ST-002-12 staged file 선택·Commit preview·명시적 승인을 제공한다.
- [ ] ST-002-13 Issue 생성·수정 preview와 GitHub 제출 승인을 제공한다.

## EP-003 — Agent Runtime

- [x] ST-003-01 bounded model → tool result → follow-up model loop를 제공한다.
- [x] ST-003-02 transient Provider retry와 실제 activity 상태를 제공한다.
- [ ] ST-003-03 단일 활성 Turn 상태기계를 완성한다.
- [ ] ST-003-04 model → tool call → approval → execution → result 반복을 완성한다.
- [x] ST-003-05 sandboxed Bash·read·search 최소 tool set을 제공한다.
- [ ] ST-003-06 preview·approval을 포함한 edit tool을 제공한다.
- [x] ST-003-07 명령별 cwd·권한·timeout·AbortSignal을 보장한다.
- [x] ST-003-08 evidence-linked `todo_write` lifecycle과 project Todo owner 인계를 제공한다. *(ST-003-12의 session 격리로 대체됨)*
- [ ] ST-003-09 위험 작업 승인 sheet와 fail-closed 정책을 제공한다.
- [ ] ST-003-10 tool-only·thinking-only·부분 응답을 보존한다.
- [x] ST-003-11 중단된 Turn의 cancelled terminal event와 transcript 표지를 보존한다.
- [x] ST-003-12 Todo를 `.www/todos/<session-id>/Todo.md`로 session별 격리한다.
- [x] ST-003-13 새 Todo 항목을 `now` 또는 `after` 위치에 안전하게 배치한다.

## EP-004 — WES Context

- [ ] ST-004-01 Display Policy와 Context Policy를 분리한다.
- [ ] ST-004-02 category별 show/hide/fold/filter를 제공한다.
- [ ] ST-004-03 현재 WES View를 모델 Context로 채택하는 흐름을 제공한다.
- [ ] ST-004-04 summary·compaction·raw event provenance를 제공한다.
- [x] ST-004-05 Project Todo projection을 제공한다.
- [ ] ST-004-06 Decision·Evidence projection을 제공한다.
- [ ] ST-004-07 session resume·fork·replay picker를 제공한다.

## EP-005 — 제품 품질

- [ ] ST-005-01 40·70·120·160열 및 10·13·24·42행 matrix snapshot을 검증한다.
- [ ] ST-005-02 truecolor·256색·무색 terminal 대비를 검증한다.
- [ ] ST-005-03 macOS·Linux·Windows smoke test를 제공한다.
- [ ] ST-005-04 OAuth refresh/login/logout 경합을 검증한다.
- [ ] ST-005-05 quota rate-limit·stale cache·offline 상태를 검증한다.
- [ ] ST-005-06 session pagination과 장기 memory 상한을 검증한다.
- [ ] ST-005-07 command·output·provider error redaction을 audit한다.

## EP-006 — 배포

- [ ] ST-006-01 GitHub Actions에 typecheck·test·PTY smoke를 연결한다.
- [ ] ST-006-02 npm/Bun executable 배포 계약을 확정한다.
- [ ] ST-006-03 version·changelog 자동화를 제공한다.
- [ ] ST-006-04 설치·로그인·복구 운영 문서를 제공한다.

## EP-007 — Monitoring Dashboard

- [x] ST-007-01 Session snapshot에서 phase·turn·tool·Todo 관측값을 결정론적으로 projection한다.
- [x] ST-007-02 `/monitor`와 `/dashboard`에서 read-only monitoring overlay를 연다.
- [x] ST-007-03 성공·실패·취소 Tool 집계와 현재 activity를 실시간 갱신한다.
- [x] ST-007-04 프로젝트 장기 Dashboard와 session monitoring의 정본 경계를 분리한다.

## EP-008 — Work Narration UX

- [x] ST-008-01 실제 Tool 이름과 입력에서 안전한 작업 설명을 생성한다.
- [x] ST-008-02 Tool card 사이에 시작·완료 중간 과정을 시간 순서대로 표시한다.
- [x] ST-008-03 사용자와 WWW 메시지 영역을 미세한 배경색으로 구분한다.
- [x] ST-008-04 숨겨진 chain-of-thought 대신 공개 가능한 activity·evidence만 표시한다.

## EP-009 — 01_www Adapt-In

- [x] ST-009-01 MAP·Architecture·Planning Package·Work Ledger·Harness 경계를 inventory한다.
- [x] ST-009-02 canonical/projection 경계를 Monitoring infrastructure 첫 목표에 적용한다.
- [ ] ST-009-03 Why/How/Outcome/Work를 분리한 project-local Planning Package v1을 설계한다.
- [ ] ST-009-04 framer·executor·reviewer·governor·verifier 역할과 권한 경계를 단계적으로 도입한다.
- [ ] ST-009-05 01_www 자동화는 재현 증거와 promotion 기준을 통과한 capability만 흡수한다.
