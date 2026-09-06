# Stats 실제 Native · PTY 관측 — 표시 수정 전

2026-09-07 KST에 실제 Codex Native gpt-5.6-sol, ProjectWorkbench, 실제 runProjectWorkbenchShell을 PTY(초기 80×36)에서 실행했다. 임시 프로젝트, ephemeral thread, read-only sandbox를 사용했다. journal은 메모리 구현이며 usageMonitor는 고정 fixture다. 따라서 세션 재개와 외부 quota 검증은 아니다.

키보드로 `/stats`, Enter, Esc, 종료 Ctrl+D를 보내고 실제 터미널 출력은 pyte 0.8.2로 해석했다. 40/80/120열 resize를 실제 ioctl/SIGWINCH로 수행했다. `steps.json`의 exit 0은 harness 종료 증거이며 화면 수락 PASS를 뜻하지 않는다.

## 확인한 결과

- 최초 화면은 token usage unobserved와 —를 표시했다.
- 정상 Native 요청 후 completed 1/1, tokens 24.7k가 관측되었다.
- 두 번째 요청 streaming 중 Esc 후 Native turn/completed 내부 status interrupted를 관측했다. Stats는 CANCELLED, completion 1/2=50%를 표시했다. 완료된 turn 평균 분모는 1로 유지되었다.
- 긴 thread ID와 Purpose 때문에 헤더의 root outcome 별 건수가 80열에서도 잘린다. 현재 QA는 이 표시 결함 때문에 PARTIAL이며 수정 후 재실행해야 한다.

`terminal.ansi`는 원 출력, txt는 터미널 프레임, events.jsonl은 공개 refs와 이벤트 종류·상태만 수집한 기록이다. 모델 내부 reasoning 원문은 기록하지 않았다. harness 원본의 상대 scratch 경로는 이 실행 당시 경로이며 재실행 시 출력 경로를 새 디렉터리로 지정해야 한다.
