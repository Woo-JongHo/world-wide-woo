# Astra Dashboard·Conversation Recap 최종 수동 QA

기준 커밋은 `1e6f640` (`Astra를 WWW 기본 작업 공간과 대화 요약으로 연결한다`), 브랜치는 `astra/terminal-ui`다. 제품 파일을 수정하지 않고 실제 설치된 `www`와 `ProcessTerminal` 기반 Astra shell을 tmux TTY에서 실행했다. Recap·취소·승인 사례는 결정적 fixture Workbench를 주입해 외부 모델 호출 없이 같은 production shell 입력 경로를 탔다. 아래 게이트도 이 커밋에서 실행했다. 이후 다른 작업의 Windows CI 수정으로 `src/adapters/outbound/persistence/skill-run-store.ts`, `test/request-capability-config.test.ts`, `test/work-recording-hook.test.ts` 변경이 나타났으며, QA 판정과 로그는 그 변경을 포함하지 않는다.

`omo ulw-loop status --json`은 `omo: command not found`로 실행되지 않았다. ULW plan/attempt 디렉터리를 확인할 수 없어 호출자가 지정한 `.omo/evidence/` 아래에 이 matrix를, `.omo/evidence/astra-dashboard-recap-final-qa/`에 실행 산출물을 기록했다.

이전 구현 요약과 로그인 [Astra CLI 기록](2026-09-13-astra-default-cli/README.md), [설치된 www 출력](2026-09-13-astra-default-cli/installed-www.log), [CLI·shell 테스트 로그](2026-09-13-astra-default-cli/cli-astra-tests.log), [Dashboard/theme 기록](2026-09-13-www-dashboard-theme.md), [Recap 구현 요약](2026-09-13-conversation-recap-impl.md), [Recap 테스트 로그](2026-09-13-conversation-recap-tests.log)을 직접 읽어 주장과 연결된 파일·현재 실행 결과를 대조했다. 과거 기록은 그대로 승인 근거로 사용하지 않았다. 현재 `www` 실행, 새 TTY 시나리오, 재실행한 테스트와 전체 게이트 결과가 아래 판정의 근거다.

## manualQa.surfaceEvidence

| scenario id | criterion reference | surface | exact invocation | verdict | artifactRefs |
|---|---|---|---|---|---|
| S-CLI-DEFAULT | C1 | 설치된 CLI 도움말 | `type -a www; www --help` | PASS — 설치된 실행 경로가 `~/.bun/bin/www`이고 plain `www`의 기본 Astra Console 안내를 출력했다. | A01, P01, P02, P03 |
| S-FIRST-PAINT | C1, C2 | 설치된 `www`의 실제 TTY, 100×30 tmux | `tmux new-session -d -x 100 -y 30 -s astra-dashboard-qa-20260913 -c /tmp/astra-dashboard-qa-20260913 'exec env FORCE_COLOR=3 www'`; 이어 ANSI·plain `tmux capture-pane -e -p -S - -t astra-dashboard-qa-20260913` 및 `tmux capture-pane -p -S - -t astra-dashboard-qa-20260913` | PASS — 실제 첫 화면 상단에 `astra / dashboard`, 본문에 `WWW Dashboard`와 `현재 Workbench snapshot`이 표시됐다. | A02, A03, A04 |
| S-DEFAULT-WHITE | C3 | 설치된 `www`의 ANSI TTY 출력 | `tmux capture-pane -e -p -S - -t astra-dashboard-qa-20260913` | PASS — 기본 헤더·본문 텍스트가 RGB `255,255,255` (`#FFFFFF`) escape sequence로 출력됐다. | A03, A04 |
| S-RECAP-PUBLIC | C4 | production Astra shell, `ProcessTerminal`, 100×30 tmux | `tmux new-session -d -x 100 -y 30 -s astra-recap-qa-20260913 -c /Users/jonghoPro/woo/00_project/99_www 'exec env FORCE_COLOR=3 QA_CASE=recap QA_OBSERVATION_LOG=/Users/jonghoPro/woo/00_project/99_www/.omo/evidence/astra-dashboard-recap-final-qa/recap-observation.json bun .omo/evidence/astra-dashboard-recap-final-qa/manual-tui-harness.ts'`; then `tmux send-keys -t astra-recap-qa-20260913 Escape`, `Tab`, `C-e`, capture-pane | PASS — Recap은 Ctrl+E 전에 숨겨졌고 펼친 뒤 공개 user 문장과 공개 assistant 답만 표시됐다. credential은 `[redacted]`가 됐다. | A06, A07, A08, A20, P04, P05, P06 |
| S-RECAP-BOUNDS | C5 | production Astra shell, `ProcessTerminal`, 160×48 tmux | `tmux new-session -d -x 160 -y 48 -s astra-bounds-qa-20260913 -c /Users/jonghoPro/woo/00_project/99_www 'exec env FORCE_COLOR=3 QA_CASE=bounds QA_OBSERVATION_LOG=/Users/jonghoPro/woo/00_project/99_www/.omo/evidence/astra-dashboard-recap-final-qa/bounds-observation.json bun .omo/evidence/astra-dashboard-recap-final-qa/manual-tui-harness.ts'`; then `Escape`, `Tab`, `C-e`, `tmux capture-pane -p -S - -t astra-bounds-qa-20260913` | PASS — 12개의 500 code point 입력에서 첫 항목과 최근 다섯 항목만 남았고, 6개 생략 문구가 화면에 표시됐다. 관측값은 6개 항목, 항목별 233–234 code point, 합계 1,400 code point다. | A09, A10, A11, A20, P05, P06 |
| S-ESCAPE-NAVIGATION | C6 | 설치된 `www`의 실제 TTY, 100×30 tmux | 실행 중인 `astra-dashboard-qa-20260913`에 `tmux send-keys -t astra-dashboard-qa-20260913 Escape`; 이어 `tmux capture-pane -p -S - -t astra-dashboard-qa-20260913` | PASS — Dashboard에서 Escape 1회 후 앱이 계속 실행되며 `/ execution` 화면으로 돌아왔다. | A04, A05 |
| S-ESCAPE-CANCEL | C6 | production Astra shell, `ProcessTerminal`, 100×30 tmux | `tmux new-session -d -x 100 -y 30 -s astra-work-escape-qa-20260913 -c /Users/jonghoPro/woo/00_project/99_www 'exec env FORCE_COLOR=3 QA_CASE=working QA_OBSERVATION_LOG=/Users/jonghoPro/woo/00_project/99_www/.omo/evidence/astra-dashboard-recap-final-qa/working-escape-observation.json bun .omo/evidence/astra-dashboard-recap-final-qa/manual-tui-harness.ts'`; send `Escape` twice, capture-pane, read observation JSON | PASS — 두 번째 Escape가 `chat.cancel`을 정확히 한 번 전달했고 fixture 상태가 ready로 바뀌었다. | A12, A13, A14, A15, A20 |
| S-ESCAPE-APPROVAL | C6 | production Astra shell, `ProcessTerminal`, 100×30 tmux | `tmux new-session -d -x 100 -y 30 -s astra-approval-escape-qa-20260913 -c /Users/jonghoPro/woo/00_project/99_www 'exec env FORCE_COLOR=3 QA_CASE=approval QA_OBSERVATION_LOG=/Users/jonghoPro/woo/00_project/99_www/.omo/evidence/astra-dashboard-recap-final-qa/approval-escape-observation.json bun .omo/evidence/astra-dashboard-recap-final-qa/manual-tui-harness.ts'`; `tmux send-keys -t astra-approval-escape-qa-20260913 Escape`; capture-pane and read observation JSON | PASS — 승인 선택 sheet가 닫히고 `승인 명령` 입력이 복원됐다. requestId `99`는 계속 대기 중이며 Workbench dispatch는 0회다. | A16, A17, A18, A19, A20 |
| S-REGRESSION-GATES | C1–C6 | Bun CLI, typecheck, Unit·Code-ID·architecture 검증 | `bun test`; `bun test test/cli.test.ts test/astra-shell.test.ts test/astra-ui.test.ts test/conversation-recap.test.ts test/entry-dashboard-view.test.ts test/tui-feature-registry.test.ts`; `bun run check`; `bun scripts/code-id.ts`; `bun run units:check`; `bun test test/architecture.test.ts` | PASS — 전체 테스트 1204/0, 집중 테스트 70/0, typecheck·Code-ID·units·architecture 모두 exit 0. 상세 수치는 `gate-status.json`에 있다. | A21, A22, A23, A24, A25, A26, A27 |

## manualQa.adversarialCases

| scenario id | criterion reference | adversarial class | expected behavior | verdict | artifactRefs |
|---|---|---|---|---|---|
| A-SECRET-BOUNDARY | C4 | credential 및 private envelope 누출 | known credential은 redact하고 assistant analysis, tool payload, system 메시지는 Recap에 포함하지 않으며 공개 answer는 보인다. | PASS — 터미널 화면에서 `[redacted]`와 공개 answer를 확인했고 private sentinel은 화면·TTY transcript에서 검색되지 않았다. | A07, A08, A20, P06 |
| A-OVERSIZED-UNICODE | C5 | 항목 수·Unicode 길이 초과 | 12개 장문 메시지에서 첫 요청과 최근 5개를 보존하고 6개, 항목당 280, 전체 1,400 code point 상한을 넘지 않는다. | PASS — 화면과 observation JSON이 모두 상한·생략 수·선택 순서를 확인했다. | A09, A10, A11, A20 |
| A-ESCAPE-LIVE-WORK | C6 | 실행 중 Escape 중복 취소 | Dashboard 복귀 키와 실행 취소 키를 구분하고 실행 화면에서 Escape 한 번은 cancel 한 번만 보낸다. | PASS — 첫 키는 실행 화면 이동, 두 번째 키는 `chat.cancel` 단 1회였다. | A12, A13, A14, A15, A20 |
| A-ESCAPE-PENDING-APPROVAL | C6 | Escape가 승인 결정을 대신함 | Escape는 sheet만 닫고 입력을 복원하며 승인 대기 상태를 유지한다. `approval.resolve`는 호출하지 않는다. | PASS — requestId `99`가 유지되고 dispatch 목록은 비어 있었다. | A16, A17, A18, A19, A20 |

## manualQa.artifactRefs

모든 PASS는 아래 표의 존재하며 0바이트가 아닌 산출물을 하나 이상 참조한다.

| id | kind | description | path |
|---|---|---|---|
| A01 | CLI output | 설치된 www 경로와 `www --help` 출력 | `.omo/evidence/astra-dashboard-recap-final-qa/installed-www-cli.txt` |
| A02 | TTY screen | 설치된 plain `www`의 실제 첫 Dashboard 화면 | `.omo/evidence/astra-dashboard-recap-final-qa/plain-www-tty-screen.txt` |
| A03 | ANSI TTY screen | 실제 기본 텍스트의 RGB 255,255,255 escape 출력 | `.omo/evidence/astra-dashboard-recap-final-qa/plain-www-tty-ansi.txt` |
| A04 | tmux transcript | 설치된 www TTY의 원시 출력 transcript | `.omo/evidence/astra-dashboard-recap-final-qa/plain-www-tty-transcript.raw` |
| A05 | TTY screen | 실제 `www`에서 Dashboard 후 Escape를 누른 실행 화면 | `.omo/evidence/astra-dashboard-recap-final-qa/plain-www-after-escape-screen.txt` |
| A06 | TTY screen | Recap 확장 전 shell 화면 | `.omo/evidence/astra-dashboard-recap-final-qa/recap-after-tab-screen.txt` |
| A07 | TTY screen | 공개 Recap 확장 결과와 redacted credential | `.omo/evidence/astra-dashboard-recap-final-qa/recap-expanded-screen.txt` |
| A08 | tmux transcript | 공개 Recap 입력 경로의 원시 TTY 출력 | `.omo/evidence/astra-dashboard-recap-final-qa/recap-tty-transcript.raw` |
| A09 | TTY screen | 12개 장문 Unicode 메시지의 Recap 및 생략 문구 | `.omo/evidence/astra-dashboard-recap-final-qa/bounds-expanded-screen.txt` |
| A10 | observation JSON | source 12, entries 6, omitted 6, 각 길이, 합계 1,400 및 선택 prefix | `.omo/evidence/astra-dashboard-recap-final-qa/bounds-observation.json` |
| A11 | tmux transcript | Recap 상한 시나리오 원시 TTY 출력 | `.omo/evidence/astra-dashboard-recap-final-qa/bounds-tty-transcript.raw` |
| A12 | TTY screen | working fixture에서 Dashboard→execution 이동 후 화면 | `.omo/evidence/astra-dashboard-recap-final-qa/working-escape-after-first-screen.txt` |
| A13 | TTY screen | Escape cancel 후 ready 화면 | `.omo/evidence/astra-dashboard-recap-final-qa/working-escape-after-second-screen.txt` |
| A14 | observation JSON | Escape 후 `chat.cancel` 정확히 한 번 | `.omo/evidence/astra-dashboard-recap-final-qa/working-escape-observation.json` |
| A15 | tmux transcript | 실행 중 Escape의 원시 TTY 출력 | `.omo/evidence/astra-dashboard-recap-final-qa/working-escape-tty-transcript.raw` |
| A16 | TTY screen | Escape 전 승인 선택 sheet와 미결정 상태 | `.omo/evidence/astra-dashboard-recap-final-qa/approval-escape-initial-screen.txt` |
| A17 | TTY screen | Escape 뒤 대기 승인을 보존하고 입력으로 돌아온 화면 | `.omo/evidence/astra-dashboard-recap-final-qa/approval-escape-after-screen.txt` |
| A18 | observation JSON | requestId 99 유지 및 dispatch 없음 | `.omo/evidence/astra-dashboard-recap-final-qa/approval-escape-observation.json` |
| A19 | tmux transcript | 승인 보류 Escape의 원시 TTY 출력 | `.omo/evidence/astra-dashboard-recap-final-qa/approval-escape-tty-transcript.raw` |
| A20 | QA harness | 실제 production shell·ProcessTerminal에 fixture를 주입하는 재현 harness | `.omo/evidence/astra-dashboard-recap-final-qa/manual-tui-harness.ts` |
| A21 | test log | 전체 Bun suite, 1204 pass / 0 fail | `.omo/evidence/astra-dashboard-recap-final-qa/bun-test-all.log` |
| A22 | test log | 관련 6개 파일, 70 pass / 0 fail | `.omo/evidence/astra-dashboard-recap-final-qa/bun-test-focused.log` |
| A23 | typecheck log | `bun run check`, exit 0 | `.omo/evidence/astra-dashboard-recap-final-qa/bun-check.log` |
| A24 | Code-ID log | 5개 Code-ID 등록·선언·경로·문서 검증 | `.omo/evidence/astra-dashboard-recap-final-qa/code-id.log` |
| A25 | Unit check log | 5 Units, 32 Linear links, valid | `.omo/evidence/astra-dashboard-recap-final-qa/units-check.log` |
| A26 | architecture log | 13 pass / 0 fail | `.omo/evidence/astra-dashboard-recap-final-qa/architecture-test.log` |
| A27 | gate manifest | 정확한 호출, exit code 및 전체 검증 수치 | `.omo/evidence/astra-dashboard-recap-final-qa/gate-status.json` |
| P01 | prior evidence summary | 이전 기본 CLI 진입 요약 | `.omo/evidence/2026-09-13-astra-default-cli/README.md` |
| P02 | prior CLI output | 이전 설치 `www` 도움말 실행 로그 | `.omo/evidence/2026-09-13-astra-default-cli/installed-www.log` |
| P03 | prior test log | 이전 CLI·Astra shell 테스트 로그 | `.omo/evidence/2026-09-13-astra-default-cli/cli-astra-tests.log` |
| P04 | prior evidence summary | 이전 Dashboard/theme 요약과 renderer 캡처 | `.omo/evidence/2026-09-13-www-dashboard-theme.md` |
| P05 | prior evidence summary | 이전 Recap 공개 경계·상한 요약 | `.omo/evidence/2026-09-13-conversation-recap-impl.md` |
| P06 | prior test log | 이전 Recap·Unit registry·Astra UI 테스트 로그 | `.omo/evidence/2026-09-13-conversation-recap-tests.log` |

수집 시 `plain-www-after-ctrl-d-screen.txt`는 baseline에 이미 존재한 추적 0바이트 파일이었다. 캡처 시도가 tmux 종료로 실패해 이를 잘못 삭제했지만 원래 0바이트 상태로 복원했다. 실패한 빈 파일은 어떤 판정의 근거로도 참조하지 않는다.
