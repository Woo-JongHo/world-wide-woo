# Codex 독립 함수 추출 리뷰

## 범위와 기준

- 비교 기준: `HEAD` = `50fbfa11d420965a83d1fff1f5b15fdee541e2fa`.
- 검토 대상: 해당 기준점 위의 미커밋 `src/` 9개와 `test/` 2개, 총 11개 파일.
- 시작 스냅샷: `astra/terminal-ui...origin/astra/terminal-ui`에서 위 11개가 수정 상태였고, 이 증거 디렉터리는 untracked였다. Core 두 파일(`project-workbench.ts`, `workflow-projection.ts`)도 이 스냅샷에서 확인한 뒤 검토했다.
- 읽기 전용 감사다. 제품 파일과 테스트 파일은 수정하지 않았다.

## 판정

**실제 결함 없음.** 이번 함수 추출은 기존 동작과 상태 전이를 보존한다. 수정이 필요한 finding은 없다.

### 핵심 대조

- `src/cli.ts`: `writeInformationalOutput`, `parseAstraOptions`, `runAstraCommand`, `resumeAstra`, `dispatchCommand`으로 분리한 뒤에도 help가 version과 dispatch보다 앞서고, `dependencies.runAstra(...)` 호출은 객체 메서드 호출 형태를 유지한다. 추가 테스트가 `this === dependencies`를 검증한다.
- `src/core/application/orchestration/project-workbench.ts`: `projectStreamingText`는 이전의 item identity 교체 시 bounded state 초기화와 tail append 순서를 동일하게 유지한다. `shouldClearTerminalProjection`도 item-scoped 완료, turn terminal, 일반 completed notification의 세 clear 조건을 그대로 보존한다.
- `src/core/domain/work/workflow-projection.ts`: `findLast` 전환은 기존 `slice().reverse().find(...)`와 동등하다. 빈 input, pending goal, selected turn 부재, journal rejection의 결과와 defaults를 유지한다. association action/observation 분기는 공통 helper로만 이동했다.
- `src/adapters/inbound/tui/features/approval/approval-presentation.ts`: `approvalParamText`의 `sanitizeTerminalTextExcerpt(..., 200, "head-tail")`, tab 공백화, trim과 kind별 fallback을 `projectApprovalRequest`에 단일화했다. Overlay와 card가 같은 sanitized presentation을 사용하므로 승인 세부정보 노출/축약 정책이 보존된다.
- `codex-app-server.ts`, `project-workbench-session.ts`, runtime configuration 추출은 기존 effects의 순서와 failure 조건을 바꾸지 않는다. 특히 approval request는 map 저장 뒤 emit, resolution은 map 삭제와 pending resolve 뒤 emit의 순서를 유지한다.

## 명확성·설계 판단

- 새 helper와 작은 projection 타입은 각 중복된 policy를 한 곳에 모으고 호출자가 실제 의도를 드러내므로 과한 abstraction이 아니다.
- 하드코딩된 문자열/상수는 기존 사용자 문구와 한계값을 이름으로 승격한 것이며 새 정책 값이 아니다.
- 수정 파일에서 `TODO`, `FIXME`, `test.skip`, `test.only`, `.only(`를 검색했고 추가 blocker는 없었다. `git diff --check`도 통과했다.

## 검증

- `bun run check` 통과 (`tsc --noEmit`).
- `bun test test/work-flow.test.ts test/cli.test.ts test/codex-app-server.test.ts test/project-workbench.test.ts` 통과: 183 pass, 0 fail, 921 assertions.
- 별도으로 `test/workbench-shell-policy.test.ts`, `test/astra-ui.test.ts`, `test/workbench-views.test.ts`, `test/workflow-projection.test.ts`, `test/work-step-card-highlight.test.ts`, `test/astra-model.test.ts`, `test/astra-shell.test.ts`를 실행해 통과했다.

## 독립성 한계

Claude Sonnet/Opus weekly limit 때문에 반대 provider 감사는 실행되지 않았다. 본 문서는 그 대체 승인이 아니라 추가 Codex 교차검증 기록이다.

## 후속 범위: Runtime transition·Artifact 검증·문서

추가 확정본에서 `src/core/application/orchestration/request-controller.ts`,
`src/core/domain/development/artifact-control.ts`,
`docs/WWW_CODE_ARCHITECTURE.md`만 별도로 재검토했다.

**실제 결함 없음.**

- `appendRuntimeTransition`은 기존 세 분기(`require_delivery`, `replan`, `propose`)의 append → 현재 request 재투영 → 방금 append한 activity의 `protocol.rejected` 탐색 → response 순서를 그대로 보존한다. `acceptedReason`, payload, kind 및 phase도 원래와 같다.
- Artifact 후보 검증은 공통 envelope 검사와 `linear-project-comment`의 kind-specific 검사를 순수 helper로 옮겼다. 기존 오류 누적 순서, legacy 1.0의 조기 반환, Candidate digest 및 `actualBefore` stale 판정은 보존된다.
- `WWW_CODE_ARCHITECTURE.md`의 함수 책임 설명은 현재 코드와 일치한다. 특히 CLI receiver/cancel, 승인 표시 투영의 sanitizer·fallback 단일 소유, 실행 lane 선택 공유, journal/turn/activity 단계 분리와 side effect 순서 보존을 정확히 기술한다.
- 검증: `bun test test/request-controller.test.ts test/artifact-control.test.ts test/project-activity-artifact-control.test.ts test/rpa-artifact-control.test.ts test/artifact-publication-capability.test.ts` 통과 (36 pass, 0 fail, 311 assertions). `git diff --check` 통과.

## 최종 추가 범위: Chat 출력 정책·Commit receipt identity

`chat-output-policy.ts`와 그 네 consumer, `git-commit-control.ts` 및 Commit governance 테스트를 독립 점검했다.

**실제 결함 없음.**

- Chat policy 이동은 status label/color/symbol/surface mapping과 public-output 2,400자, structured parse 64KiB·2,000줄 한계의 값과 적용 지점을 보존한다. 새 policy는 TUI feature 내부에 있고, consumer의 import·re-export도 기존 `workStepStatusPresentation` 공개 경로를 보존한다. 의도하지 않은 표시 문자열 또는 UI 상태 변화는 확인되지 않았다.
- Commit receipt의 `context.projectId`는 더 이상 고정 문자열이 아니라 `.www/control-ledger/development/project.json`의 schema 1 UUID다. `executeCommit`은 staging과 `git commit`보다 먼저 이를 검증하여, 누락/손상 identity가 Git 작업을 만들기 전에 `COMMIT_PROJECT_IDENTITY_*` 오류로 차단된다. receipt 작성에는 같은 preflight에서 고정한 값이 전달된다.
- 기존 receipt reader는 envelope/digest만 검증하고 projectId를 강제하지 않아 기존 `world-wide-woo` receipt도 읽을 수 있다. 새 receipt는 실제 ledger UUID를 기록한다.
- 검증: `bun test test/commit-governance.test.ts test/work-step-card-highlight.test.ts test/workbench-views.test.ts test/astra-ui.test.ts` 통과 (150 pass, 0 fail, 1,458 assertions). `git diff --check` 및 변경 파일의 placeholder 검색도 통과.
