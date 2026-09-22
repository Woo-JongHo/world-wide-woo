## 변경

- /demo 입력 시 Chat·Dashboard·Usage·Context·Cache·Workflow·Plan 7개 화면에 대표 합성 데이터를 표시하도록 구현했다.
- Demo 상태에서 R/E로 이전·다음 화면을 순환하고 Esc로 진입 전 화면과 최신 live snapshot을 복구하도록 연결했다.
- Demo가 활성화된 동안 live snapshot과 usage polling 결과는 별도 보관하고 승인 UI 및 외부 Workbench dispatch가 발생하지 않도록 격리했다.
- 모든 Demo 화면과 하단 안내에 DEMO DATA provenance를 유지하고 /demo 명령을 Astra autocomplete에 추가했다.

## 영향

- 실제 계측 데이터가 충분하지 않은 상태에서도 Figma 기반 MVP 정보 구조와 화면 간 흐름을 한 세션에서 검토할 수 있다.
- 합성값을 live telemetry로 오인하거나 Demo 조작이 실제 세션을 변경하는 위험을 막는다.

## 분류

Feature · Validation

## 검증

- bun test test/astra-shell.test.ts --test-name-pattern '/demo presents': 1 pass, 0 fail, 35 assertions.
- bun test test/astra-shell.test.ts test/astra-ui.test.ts test/astra-ui-preview.test.ts: 77 pass, 0 fail, 2,067 assertions.
- bun test test/architecture.test.ts: 13 pass, 0 fail, 1,800 assertions.
- bunx tsc --noEmit와 대상 git diff --check가 통과했다.
- 변경 범위에서 test.skip·test.only와 새 TODO 자리표시가 없음을 확인했다.
- 독립 읽기 전용 재검토에서 live 데이터 비노출, 승인 UI 복구, 스크롤, usage 합계 정합성을 확인했다.

## 연결

- Linear issue: WOO-913
- Figma: Q7kGUdqiaQRJI8CZlPMRX7 section 50:609
- Evidence: .www/evidence/2026-09-22-astra-demo-mvp
- Branch: ui/workbench-visual-polish
