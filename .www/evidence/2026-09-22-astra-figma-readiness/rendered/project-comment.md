## 변경

- Figma의 Usage·Context·Cache·Workflow·Dashboard 다섯 원본 노드와 현재 Workbench 구현·테스트를 다시 대조했다.
- 기능, 값의 원천, 시각 표현, 터미널 근사, 현 계약으로 구현 불가능한 항목을 화면별 표로 정리했다.
- 프리뷰의 Context 64.2%는 MCP 점유율이 아니라 전체 token 사용률이며, MCP 3/3 표시와 같은 시각 흐름에 배치되어 의미가 오독되는 원인을 확인했다.
- 구현 전에 해결할 P0 의미 정확성, P1 정보 구조, P2 캡처·golden 검증 순서를 감사 문서와 새 Linear 이슈 Candidate로 준비했다.
- Context의 전체 window 점유율과 MCP·Skills 개수를 별도 영역으로 분리하고, 관측되지 않은 source별 token bar 7개를 단일 unavailable 상태로 교체했다.
- 12,000-token baseline을 percent에만 차감하던 계산을 제거해 label과 meter가 같은 전체 Native context window 비율을 사용하게 했다.
- 오프라인 preview 전체에 DEMO DATA provenance를 표시하고 Dashboard의 System load 오표기를 Session state로 교정했다.
- Cache의 byte meter를 bounded occupancy가 아닌 observed logical-byte distribution으로 교정하고 capacity limit 미관측을 명시했다.
- Usage Workspace 검증의 오래된 panel label 기대값을 현재 observed/unavailable 정보 구조와 일치시켰다.

## 영향

- 관측되지 않은 수치를 Figma 예시값으로 채우거나 MCP·Context·quota·system load를 같은 의미로 혼동하는 구현을 막는다.
- 문자열 존재 테스트만으로 Figma 구현 완료를 주장하지 않고 실제 TUI 캡처와 viewport별 구조 검증을 수락 조건으로 둔다.
- 기존 WOO-912의 UI 표기 정리 범위와 새 다섯 화면 구현 범위를 분리해 각각 독립적으로 검증할 수 있다.
- Context에서 MCP 서버 수가 전체 token 점유율의 원인처럼 보이지 않고, unavailable은 0%나 빈 meter로 오해되지 않는다.

## 분류

Improvement · Validation

## 검증

- Figma get_design_context로 section 50:609와 다섯 하위 frame을 재조회했다.
- Linear World Wide Woo Project, WOO-674, WOO-912 및 관련 이슈·Project Activity를 read-back했다.
- docs/audit/2026-09-22-astra-figma-implementation-readiness.md에 기능·데이터·시각·불가 항목과 수락 기준을 기록했다.
- Monitoring 관련 7개 test file에서 96 pass, 0 fail, 1,946 assertions를 확인했다.
- TypeScript와 대상 diff 검사가 통과했고 기존 Usage hierarchy label 불일치도 현재 계약으로 교정했다.
- 변경 파일에서 test.skip·test.only와 새 TODO 자리표시가 없음을 확인했다.

## 연결

- Linear parent: WOO-674
- Linear related: WOO-912, WOO-680, WOO-712, WOO-714, WOO-910
- Figma: Q7kGUdqiaQRJI8CZlPMRX7 section 50:609
- Audit: docs/audit/2026-09-22-astra-figma-implementation-readiness.md
- Candidate evidence: .www/evidence/2026-09-22-astra-figma-readiness
- Branch: ui/workbench-visual-polish
