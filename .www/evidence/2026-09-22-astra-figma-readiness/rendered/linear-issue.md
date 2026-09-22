# [Workbench Monitoring] Figma 5화면의 계측 의미와 정보 구조를 일치시킨다

## 목적

Usage·Context·Cache·Workflow·Dashboard가 Figma의 정보 계층을 따르면서도 전체 Context 점유율을 MCP 점유율처럼 보이게 하거나 관측되지 않은 예시 수치를 실제 계측으로 오해시키는 문제를 없앤다.

## 범위

### 포함

- Figma section 50:609의 다섯 화면을 기능, 값의 원천, 시각 표현, 구현 불가 항목으로 분리하고 화면별 projection을 observed·derived·unavailable 상태로 정의한다.
- Context 전체 점유율과 Skills·MCP·Notes 같은 loaded capability 개수를 분리하고 percent와 meter가 같은 분모를 사용하게 한다.
- Usage provider quota, Cache layer telemetry, Workflow request·delegation, Dashboard session summary를 실제 Workbench 계약에 연결한다.
- header·body·rail·footer와 160×42, 120×32, 80×24의 열·행 예산 및 축약 순서를 고정한다.
- Figma 원본과 실제 TUI 캡처를 대조하고 panel 순서·rail 비율·색 역할·overflow를 수락 근거로 남긴다.

### 제외

- Figma 예시 수치를 실제 provider·session·cache 값으로 복제하는 작업
- 현재 원천이 제공하지 않는 per-source Context token, input/output/cached token 분해, cache 24시간 원인 이력, OS system load를 추정하는 작업
- 터미널에서 sub-pixel spacing, 정확한 font metric, 1px rule을 픽셀 단위로 복제하는 작업
- WOO-912가 소유하는 기존 모드·모델·HUD·Sidebar 라벨 정리를 다시 정의하는 작업

## 완료 조건

- 모든 표시 숫자에 source와 계산식이 있고 count·percentage·capacity·status가 같은 meter 의미로 섞이지 않는다.
- Context 화면에서 MCP 서버 수와 전체 Context 점유율이 별도 영역과 라벨로 표현되며 source별 token 기여량은 관측 전까지 bar로 그리지 않는다.
- 다섯 화면의 large viewport 첫 정보 계층이 Figma와 대응하고 120×32와 80×24에서 필수 정보와 조작 경로가 유지된다.
- 실제 TUI 캡처와 Figma 캡처의 차이, 구현 불가 항목, 미관측 상태가 Evidence에 기록된다.
- 관련 행동·구조·golden 테스트, TypeScript, architecture, diff 검사가 통과하고 TODO 자리표시·test.skip·test.only가 없다.

## 연결

- Parent: WOO-674 — Workbench 대화·계획·상태 통합
- Related: WOO-912 — 기존 Workbench UI 표기 정리
- Related: WOO-680 — 반응형 Layout과 focus
- Related: WOO-712, WOO-714 — 관측 범위와 사용량 계산
- Related: WOO-910 — Request Runtime과 Workflow 상태
- Figma: Q7kGUdqiaQRJI8CZlPMRX7 section 50:609
- Audit: docs/audit/2026-09-22-astra-figma-implementation-readiness.md
- Branch: ui/workbench-visual-polish
