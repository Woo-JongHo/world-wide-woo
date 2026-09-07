---
linear: WOO-720
related: [WOO-679, WOO-686, WOO-687, WOO-688, WOO-689, WOO-690, WOO-691, WOO-692, WOO-718, WOO-719]
record: CHAT-COMPLETION-2026-09-07
status: code-review-approved
---

# Chat 완성 후보 검증

대상은 `woo-chat-completion` 작업트리다. 기준 HEAD는 `e1b188be4a03026523df691c3c5ae32ad8fb8c9e`이며 아래 결과는 그 위의 미커밋 변경을 포함한다. main의 수락 또는 병합 완료를 뜻하지 않는다. 실제 실행의 source-fingerprints로 실행 당시 코드를 대조한다.

## 테스트 목적

대화 생성·완료·중단·재개에서 공개 본문과 동일 실행의 출처를 보존하고, 폭 변경과 긴 출력에서도 읽던 위치를 유지한다. 비공개 envelope와 잘못된 payload가 화면에 섞이거나 이웃 메시지까지 깨뜨리지 않도록 한다.

## 테스트 종류와 유형

자동 Unit·Integration은 정상·경계·오류·회귀를 검사한다. Native 세션과 PTY는 실제 provider 실행, 파일 journal 재개, 키 입력 및 화면을 확인한다. 성능 측정은 동일 환경의 기준 코드와 후보를 비교한다. Sonnet 및 Opus는 별도의 읽기 전용 감사다.

## 기대값과 실패 유형

| 대상 | 기대값 | 실패 유형 |
| --- | --- | --- |
| 중단·재개 | 사용자/응답을 한 번씩 복원하고 받은 부분 본문 보존 | 중복, 유실, 빈 lifecycle 마커 노출 |
| 비정상 payload | 안전한 안내를 표시하고 다음 정상 메시지 표시 | 숨긴 내용 노출, 전체 렌더 중단 |
| 긴 structured delta | 잘린 envelope 이후 추정 본문 노출 억제 | private opener 유실 뒤 tail 누출 |
| Source | 같은 thread의 정확한 activity만 선택 | 다른 실행 혼입, 거절 후 화면 이동 |
| resize·streaming | 과거 위치와 follow 설정 보존 | 최신으로 강제 이동, 엉뚱한 위치 복귀 |
| T-note | thread 범위의 요약 입력, 원본 activity 불변 | 이전 process ID 혼입으로 요약 실패 |

## 테스트 내용과 실제 결과

1. `bun test`: 76개 파일, 670 pass, 0 fail, 4,387 assertions. 원본 `.www/scratchpad/chat-completion-full-test-final.log`. 이후 추가한 T-note scope 검증은 `bun test test/project-workbench-session.test.ts`에서 13 pass, 76 assertions 및 `bun run check` 통과. 전체 실행 수와 후속 부분 실행 수를 합쳐 새로운 전체 결과처럼 계산하지 않는다.
2. `test/chat-render-acceptance.test.ts`: 40·80·120열, 잘못된 role/status, Markdown 예외의 메시지별 격리, 반복 item ID의 turn 구분, streaming/failed/cancelled 공개 본문 검증. `test/workbench-views.test.ts`의 비공개 분석 표시를 기대하던 과거 기대값도 공개 투영 계약에 맞춰 수정했다.
3. `test/chat-scroll-acceptance.test.ts`: 긴 메시지의 줄바꿈 폭을 바꾸면서 과거 anchor와 follow=false 보존, 최신 복귀 후 신규 메시지 follow 확인. 실제 OS 마우스 입력 검증과 구분한다.
4. 실제 Native 재개: `.www/evidence/2026-09-07-chat-resume/replay-1788746530459-result.json`에서 빈 lifecycle 마커가 system 메시지로 남아 실패했다. 알려진 역할의 빈 마커를 제외한 뒤 `replay-1788746662740-result.json`에서 정상 2개와 중단 포함 4개 메시지 복원 PASS. 실패 증거도 보존한다.
5. 실제 PTY: `.www/evidence/2026-09-07-chat-lifecycle-native-pty-after-fix/replay-003/` 정상 완료·폭 변경·Esc 중단 PASS. `.www/evidence/2026-09-07-chat-interaction/replay-001/` 없는 Source ID 거부 → 정상 ID 선택 → Escape 복귀 → 다음 입력 → 중단 → 정상 종료 PASS. runner는 `/tmp/www-tui-qa-env/bin/python` 환경의 pyte를 사용한다.
6. T-note source scope: bound thread ID로 요약 입력 activity의 projectId를 투영하고 원본 객체가 바뀌지 않는지 검사한다. 실제 재개 프레임의 `T-note activities must belong to one project` 오류가 사라진 것도 확인했다. 이것만으로 비동기 요약의 최종 저장 성공 전체를 주장하지 않는다.
7. 동일 5회 측정, 5,000 메시지/94,887 bytes, Apple M1: 기준 render 중앙값 260.216ms → 166.298ms, resize pair 517.744ms → 328.088ms. `.www/evidence/2026-09-07-chat-render-completion/comparison-before.json`, `comparison-after.json`. 이전 짧은 메시지 측정의 개선율과 혼합하지 않는다.
8. Linear 계약: 네 기능 계층과 Chat 전체 본문을 `--scope Chat`으로 검사해 PASS. 계약 테스트 8 pass/11 assertions. 다른 기능의 본문 정규화까지 통과했다고 확대하지 않는다.

## 코드 연결

| Linear | 구현·검증 |
| --- | --- |
| WOO-686, WOO-687, WOO-691 | workbench-views.ts, chat-render-acceptance.test.ts |
| WOO-688, WOO-690, WOO-691 | project-workbench.ts, project-workbench.test.ts, Native 재개 증거 |
| WOO-689 | dashboard-layout.ts, chat-scroll-acceptance.test.ts, benchmark |
| WOO-718 | workbench-shell.ts, project-workbench-session.ts, Source PTY, session test |
| WOO-692, WOO-720 | 본 문서와 실행 원본 |

## 남은 판정

최종 통합 자동 회귀는 77개 파일, 678 pass, 0 fail, 4,403 assertions 및 타입 검사 PASS다 (`chat-completion-integrated-test.log`, `chat-completion-integrated-check.log`). Sonnet 최초 APPROVE, Opus 최초 REVISE 원문을 scratchpad에 보존했다. Opus B1의 trace 거절 후 화면 이동을 차단했고 E1의 스크롤 fixture를 불균등 길이로 바꿨다. Anchor 비활성화 mutation에서 1 fail, 원복 후 2 pass를 관측했다 (`chat-scroll-anchor-mutation.log`). Opus 재감사는 APPROVE이며 B1/E1 해소를 확인했다. 원문 `.www/scratchpad/chat-opus-rereview.json`. 이는 읽기 전용 코드 감사로 Native 재실행을 대신하지 않는다. 비차단 잔여는 봉투 접두 정책, thread별 T-note 투영의 방어 범위, 손상된 runtime role의 추가 terminal sanitation이다. 실제 provider의 bodyless·failed·late delta 강제 발생, OS IME 조합 및 마우스 입력 수락은 이 기록에서 PASS로 판정하지 않는다. Chat 전체 완료와 PR 병합은 아직 선언하지 않는다.


## PR 및 통합 후속 검증

PR https://github.com/Woo-JongHo/world-wide-woo/pull/46, Chat 구현 커밋 `b35feb9`, CI 러너 교체 `668d5a3`. Linear 계약 보강을 포함한 로컬 전체 검증은 692 pass / 0 fail / 4,420 assertions (77 files), 타입 검사와 Darwin platform gate PASS다. 원본 `chat-and-contract-final-test.log`, `chat-and-contract-final-check.log`. 이 결과는 앞의 678개 실행을 대체 삭제하지 않고 후속 실행으로 남긴다.

macos-13 러너 종료는 GitHub 공식 공지 https://github.blog/changelog/2025-09-19-github-actions-macos-13-runner-image-is-closing-down/ 에서 확인했다. 지원 목록 https://docs.github.com/en/actions/reference/runners/github-hosted-runners 에 따라 macos-15-intel로 전환했고 Opus가 테스트 축과 Intel 아키텍처 보존을 승인했다 (`chat-ci-review.json`). 원격 CI 결과는 별도 확인한다.


## 얇은 Linear와 Code-ID 파일럿

사용자 추가 지시에 따라 Chat 11개 본문을 목적·완료 조건 또는 현재 결과·연결로 줄였다. 줄이기 전 원문은 `Chat/WOO-*.md`에 보존했다. 실제 등록 Vault `archive`의 `01_프로젝트/99_WWW/01_문서`에도 파일을 생성하고 내용을 재조회했다. `.www/vault`는 저장소 사본이고 실제 Vault와 구분한다.

Code-ID 0001~0005를 등록하고 이름 있는 최상위 class/function에 `@codeId`를 선언했다. TypeScript AST로 실제 선언만 읽어 등록 원장·Linear 본문·노트의 code_id를 대조한다. 문자열 예시의 가짜 선언·중복·잘못된 노트/이슈 연결을 거부하는 테스트를 실행했다. 기존 Unit UUID의 SQLite 별칭 연결은 미구현이다.

후속 전체 검증: 693 pass / 0 fail / 4,425 assertions (78 files) 및 타입 검사 PASS. 근거 `chat-code-id-final-test.log`, `chat-code-id-final-check.log`. 실제 Linear readback에서 계층·라벨·상태·마일스톤 보존과 코드 번호 연결을 확인했다. Obsidian 파일 내용은 재조회했으나 앱의 최종 본문 표시는 독립 확인하지 못했다.


최종 고정 SHA·원격 소스·CI 확인: [[2026-09-07-chat-final-gate]].
