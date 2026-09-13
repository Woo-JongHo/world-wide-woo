# 문서 연동 확인

## 판정

HUD/Chat 및 기존 function-refactor 변경에 Linear·Obsidian 자동 게시가 실행됐다는 증거가 없다. 이전 HUD 턴에서 직접 실행한 것은 코드·테스트 수정, 로컬 evidence 저장, Linear 프로젝트 읽기뿐이었다. 로컬 문서 diff는 게시 Receipt가 아니다.

## 근거

- `.codex/hooks.json`: UserPromptSubmit/Stop/SessionEnd에 `scripts/work-recording-hook.ts` 등록.
- `scripts/work-recording-hook.ts`: turn 기준점 저장과 변경 대조, Stop block 반환. 외부 API 호출이나 문서 본문 갱신 없음. session_id/turn_id/기준점이 없으면 Stop을 통과시킴.
- `src/core/domain/development/work-recording-gate.ts`: 변경 경로를 감지하면 Candidate 작성·승인·게시를 지시하는 문자열을 반환. 게시 Receipt 자체를 검사하지 않음.
- `.git/woo/recording-hook` 디렉터리는 조사 시 존재하지 않음. 종료 시 삭제되는 구조이므로 이것만으로 미실행을 확정할 수 없으며, 호스트가 호출·수용했다는 실행 증거도 확보하지 못함.
- 기존 function-refactor evidence는 로컬 문서와 테스트 검증 기록. 이번 작업에 해당하는 Linear/Obsidian publish 및 read-back 증거는 없음.
- `docs/ASTRA_EXECUTION_CONSOLE.md`가 Dashboard 시작/HUD 세 줄로 남아 있어 이번 로고 작업에서 Chat 시작/HUD 한 줄/로고 fallback 및 훅의 한계로 직접 수정함. 이것은 자동 동기화가 아닌 로컬 문서 수정이다.

외부 문서 게시나 hook 재설정은 이번 조사에서 실행하지 않았다.
