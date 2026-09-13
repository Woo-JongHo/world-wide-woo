# 함수 인벤토리와 리팩터링 후보

함수별 파일·이름·행수·분기 수·매개변수 수를 TypeScript AST에서 수집했다. 전체 기계 판독 데이터는 inventory.json에 있다.

## 범위와 계산 기준

- src/**와 scripts/** 아래 기준 268개, 현재 269개 파일을 모두 검사했다. 전부 .ts/.tsx이며 현재 비-TypeScript 파일은 0개다.
- 제외: test/**, 두 경로 바깥, 문서·설정, node_modules, 빌드 산출물.
- 기준은 작업 시작 때 깨끗했던 HEAD 50fbfa11d420965a83d1fff1f5b15fdee541e2fa이며, 최종 작업 트리 측정은 2026-09-13T01:12:02.035Z UTC에 수행했다. src/scripts 수정 파일 17개가 포함됐다.
- 함수 선언·표현식·메서드·생성자·접근자·콜백을 각각 기록했다. 중첩 콜백은 자체 레코드로 계산하고, 해당 분기는 바깥 함수 분기에서 제외했다.
- 행수는 AST 시작과 끝을 포함한 물리 행 수다. 분기는 if, 삼항, 반복, catch, switch case, &&/||/??를 각각 1로 센다. 순환 복잡도가 아니라 분기 지점 합계다.
- 우선순위는 분기×4 + 행수/8 + 매개변수 휴리스틱이며 품질 점수가 아니다.

| 스냅샷 | 파일 | 함수 |
|---|---:|---:|
| 기준 HEAD | 268 | 4261 |
| 현재 작업 트리 | 269 | 4281 |
| 변화 | 0 | +20 |

## 복잡도 상위 15개

1. src/core/runtime/request-runtime.ts:126 projectRequestRuntime — 133행, 분기 142, 매개변수 2
2. src/core/application/orchestration/request-controller.ts:82 RequestController.run — 102행, 분기 111, 매개변수 3
3. src/core/application/orchestration/project-workbench.ts:1651 ProjectWorkbench.recordNativeEvent — 147행, 분기 93, 매개변수 1
4. src/adapters/inbound/tui/shell/workbench-shell.ts:707 handleLocal — 270행, 분기 85, 매개변수 1
5. src/adapters/inbound/tui/shell/workbench-shell.ts:1029 <ArrowFunction>@1029 — 168행, 분기 88, 매개변수 1
6. src/adapters/inbound/tui/commands/slash-commands.ts:211 parseWorkbenchShellCommand — 100행, 분기 87, 매개변수 2
7. src/core/runtime/request-runtime.ts:51 applyReport — 73행, 분기 74, 매개변수 4
8. scripts/traceability.ts:156 runTraceability — 190행, 분기 65, 매개변수 1
9. scripts/linear-contract.ts:122 validate — 84행, 분기 64, 매개변수 4
10. src/adapters/inbound/tui/shell/workbench-shell.ts:289 runProjectWorkbenchShell — 917행, 분기 38, 매개변수 1
11. src/core/domain/development/artifact-control.ts:84 validateArtifactCandidate — 58행, 분기 64, 매개변수 2
12. src/adapters/inbound/tui/features/chat/chat-durable-transcript.ts:67 ChatDurableTranscript.render — 202행, 분기 55, 매개변수 2
13. src/core/domain/development/obsidian-contract.ts:154 validateObsidianDocument — 47행, 분기 55, 매개변수 1
14. src/adapters/inbound/tui/features/chat/astra-execution.ts:149 astraToolRows — 35행, 분기 53, 매개변수 3
15. src/core/domain/execution/request-runtime.ts:116 parseRequestStageReport — 28행, 분기 50, 매개변수 1

가장 긴 함수는 workbench-shell.ts의 runProjectWorkbenchShell로 917행이다. 길이 순위는 inventory.json의 topLength에서 확인할 수 있다.

## 핵심 후보 전후 비교

- projectRequestRuntime: 기준 133행/분기 142/매개변수 2 → 현재 133행/분기 142/매개변수 2.
- RequestController.run: 기준 111행/분기 114/매개변수 3 → 현재 102행/분기 111/매개변수 3.
- validateArtifactCandidate: 기준 84행/분기 110/매개변수 2 → 현재 58행/분기 64/매개변수 2.

projectRequestRuntime은 변경 누락이 아니다. core.md의 2-pass reducer 계약을 유지하기 위해 함수 자체를 이번 작업에서 분해하지 않았다. 나머지 두 함수는 분기 지점이 줄었지만 여전히 상위권에 남는다.

## 하드코딩 후보

- 개인·머신 절대 경로 문자열 0건, UUID 문자열 리터럴 0건.
- 프로젝트 ID 후보 중 chat-render-benchmark와 canary는 스크립트 fixture 식별자다. commit receipt의 고정 프로젝트 ID는 이번 후속 수정에서 제거했으며 프로젝트 맥락에서 유도한다.
- 넓은 숫자 휴리스틱 419건에는 일반 폭·길이 비교도 포함된다. 결함 판정이 아니며, 이름이 분명한 상한 후보는 JSON의 policyLikeNumericLiterals에서 확인한다.
- 반복 상태 매핑 1개:
- src/adapters/inbound/tui/features/chat/chat-output-policy.ts:11: pending → PENDING, running → RUNNING, failed → FAILED, cancelled → CANCELLED

후속 코드 변경까지 포함한 최종 측정에는 저장소 루트에서 node .omo/evidence/function-refactor-2026-09-13/audit-functions.mjs 를 실행한다.
