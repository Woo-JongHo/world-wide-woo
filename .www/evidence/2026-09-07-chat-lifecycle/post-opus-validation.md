# WOO-688 Opus REVISE 후 검증

<!-- @linear WOO-688 | 6336cca1-a828-45b9-ac62-cbaa3b35b7d8 -->

검증 대상은 `cced4a8` 위의 미커밋 보완 diff다. 1차 Opus 판정의 D1(실패·중단 partial 정제), D2(불균형 private envelope), D3(non-item terminal duplicate/late overwrite)와 실제 Native·PTY에서 확인한 `userMessage` 오분류 및 nested `turn.status` 오분류를 회귀로 고정했다.

## 명령과 결과

- `bun test test/redaction.test.ts test/project-workbench.test.ts test/workbench-views.test.ts`
  - exit 0
  - `168 pass / 0 fail / 1518 assertions / 3 files`
- `bun test`
  - exit 0
  - `657 pass / 0 fail / 4330 assertions / 74 files`
- `bun run check`
  - exit 0 (`tsc --noEmit`)
- `git diff --check`
  - exit 0

## 직접 검사

변경한 제품 코드와 관련 테스트에서 `test.skip`, `test.only`, `describe.skip`, `describe.only`, `FIXME`, `XXX`, 미구현 예외를 찾지 못했다. 검색된 `TODO.md`, `TODO 0/0`은 기존 제품 파일명과 해당 UI 부재 assertion이고, `placeholder`는 실제 미수신 안내 회귀의 테스트 이름이다. 구현 자리표시자가 아니다.

## 경계

자동 검증은 실제 Native 관측 shape를 옮긴 fixture와 TUI projection을 포함한다. 이후 같은 실제 Native·PTY 시나리오를 재실행해 정상 사용자 메시지 오인 제거와 Esc 중단의 partial 보존·`중단됨` 표시를 확인했다. 원본은 `../2026-09-07-chat-lifecycle-native-pty-after-fix/`에 있다. 1차 Opus는 `REVISE`였으며 보완 diff에 대한 최종 Opus 감사는 아직 실행하지 않았다.
