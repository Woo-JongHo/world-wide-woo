# Inbound 함수 리팩터링 증거

## 조사 범위

- `src/adapters/inbound/**/*.ts` 101개, 10,343줄을 함수 선언, 파일 크기, 호출 위치 기준으로 조사했다.
- `AGENTS.md`, `LAYERS.md`, 머신 정본 `AGENTS.md`, `woo-entry`, `codebase-design` 계약을 확인했다.
- 긴 조립 함수는 `workbench-shell.ts`(1,200줄대), 호환 shell은 `legacy-session-shell.ts`(600줄대), 명령 파서는 `slash-commands.ts`(400줄대)로 확인했다.
- 중복 정책은 approval의 요청 종류 라벨, 파라미터 정제, fallback과 shell의 runtime mode→dispatch configuration에서 확인했다.

## 변경

- `approval-presentation.ts`에 `projectApprovalRequest`를 두어 승인 요청의 표시 투영을 한 번에 계산한다. command/reason/cwd 정제, kind/detail 라벨, 종류별 fallback을 같은 module implementation 안에 모았다.
- `ApprovalOverlay`와 `approvalCardRows`가 같은 투영을 소비하도록 바꿨다. 두 화면의 별도 정책 분기와 sanitization 복제를 제거했다.
- `workbench-input.controller.ts`에 `workbenchRuntimeConfiguration`을 두어 Shift+Tab runtime mode와 실제 permission/collaboration dispatch 값의 대응을 명시했다. shell 조립 함수의 중첩 삼항 정책을 제거하고 순서가 있는 두 dispatch 동작은 그대로 두었다.
- 기존 approval helper export, `ApprovalOverlay` interface, TUI Feature/Unit ID, 문자열, 선택·승인 동작은 유지했다.
- `chat-output-policy.ts`에 공개 native-tool 출력 2,400자 cap, 구조화 출력 파싱의 64KiB/2,000줄 cap, `CommandStatus`의 라벨·색상·기호·surface 대응을 모았다. projection, step/observation renderer, result card가 같은 정의를 소비한다.
- `result-cards.ts`에 남아 있던 미사용 64KiB/2,000줄 선언은 제거했다. 실제 구조화 출력 검사는 계속 `structuredOutput`에서 동일 값으로 수행한다.

## 유지 판단

- `runProjectWorkbenchShell`은 여전히 크지만 terminal/TUI lifecycle의 지역 상태를 조립한다. 이번 변경에서 이를 다수의 전달 함수나 거대한 context parameter로 쪼개면 interface만 커지고 locality가 나빠진다. 반복되던 runtime 정책만 기존 input controller seam으로 옮겼다.
- `legacy-session-shell.ts`는 명시된 호환 진입점이고, 현재 삭제하거나 신규 seam을 만들 근거가 없었다.
- `slash-commands.ts`의 분기는 각 command grammar를 같은 parser interface 아래 모은다. 명령별 한 줄 forwarding 함수로 분해하지 않았다.
- theme/layout의 `fit`, `section`, 색상 계산은 각 렌더러의 너비·색상 계약에 묶여 있어 소유를 이동하지 않았다.
- Bash tail 10줄, Work Step 10줄, Observation 8줄, Result Card 기본 12줄과 입력 1,200자 cap은 각 화면의 별도 밀도·방향 계약이다. 공개 출력의 공통 2,400자 안전 cap과 의미가 달라 그대로 유지했다.
- `app.ts`, `cli.ts`, core, outbound, 공통 registry/원장은 수정하지 않았다. 동시 작업자가 만든 해당 경로 변경은 건드리지 않았다.

## 검증

- `bun test test/approval-overlay.test.ts test/astra-ui.test.ts test/workbench-views.test.ts`: 138 pass, 0 fail.
- `bun test test/workbench-shell-policy.test.ts test/approval-overlay.test.ts test/workbench-views.test.ts`: 133 pass, 0 fail.
- 변경 후 `bun run check`: 통과.
- 변경 파일에서 `test.skip`, `test.only`와 TODO 자리표시를 검색했다. `workbench-shell.ts`의 제품 UI 라벨 `"TODO"` 한 건 외에 자리표시는 없었다.
- 마지막 Chat 정책 패스 후 `bun test test/result-cards.test.ts test/workbench-views.test.ts`: 100 pass, 0 fail.
- 마지막 `bun run check`는 동시 변경 중인 `test/commit-governance.test.ts:99`의 미정의 `stagedPaths` 한 건으로 실패했다. 변경한 inbound 파일의 이전 typecheck는 통과했고, 마지막 실행에서도 inbound 진단은 없었다.
