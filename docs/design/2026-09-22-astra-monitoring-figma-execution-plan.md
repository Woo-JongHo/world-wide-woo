# ASTRA Monitoring Figma 5화면 실행 계획

- 상태: 실행 승인
- 작성일: 2026-09-22
- Goal: Figma의 Dashboard·Context·Cache·Usage·Workflow 디자인을 기존 WWW 구조와 가독성 규칙에 맞춰 구현·검증한다.
- Figma: `Q7kGUdqiaQRJI8CZlPMRX7`, section `50:609`
- 대상 브랜치: `ui/workbench-visual-polish`
- Linear 프로젝트: World Wide Woo (`5639ee1c-a6cd-44cf-9ed6-82ee9c5fc3db`)

> 이 문서는 세션에서 승인한 실행 순서와 선택을 보존한다. 제품 계약의 별도 정본을 만들지 않으며, 고비용 설계 결정은 기존 Linear·Obsidian 계약으로 승격한다.

## 목적

Figma의 다섯 ASTRA Monitoring 화면을 현재 Ink/pi-tui Workbench에 이식한다. 픽셀을 그대로 복제하지 않고 공통 셸, 정보 우선순위, 상태색과 화면별 계측 구조를 터미널 셀 기반의 반응형 UI로 번역한다.

## 확정된 선택

1. 현재 visual-polish 변경은 별도 커밋 후보로 먼저 정리한다. 실제 커밋은 `$woo-commit` Candidate를 제시하고 사용자 승인을 받은 뒤 수행한다.
2. 기존 Ctrl+G 숫자 1–9 배치는 유지한다. Cache와 Usage는 각각 `/cache`, `/usage` 명령으로 연다.
3. Figma Session Overview를 `/dashboard`에 연결한다. 현재 관측 이력 Dashboard는 `/history`로 이동한다.
4. Usage 하단 HUD는 유지하고, 같은 Usage feature에 상세 페이지 Unit을 추가한다.
5. Figma 1440×900의 정보 밀도는 160열 이상의 대형 화면에서 보존한다. 120×32는 표준 축약, 80×24는 컴팩트 축약으로 별도 설계한다.
6. 300px 사이드바는 약 38열로 해석하되, 좁은 화면에서는 숨기고 본문 정보 손실 없이 단일 열로 축소한다.
7. Figma 예시 수치는 제품 데이터로 복제하지 않는다. 관측값이 없으면 `미관측`, `없음`, `연결 대기`처럼 상태를 명시한다.

## 구조 원칙

- `tui/foundation`은 theme, layout, rendering, 공통 표현 원시요소만 소유한다.
- 각 `tui/features/<feature>`는 화면 의미와 데이터 표현을 소유하며 다른 feature 구현을 직접 참조하지 않는다.
- `tui/shell`은 페이지 생성, 내비게이션, 공통 셸과 lifecycle만 조립한다.
- 새 경쟁 셸을 만들지 않고 기존 `AstraWorkspace`, `AstraHeader`, `AstraHud`를 확장한다.
- 공통화는 panel, section, meter, grid처럼 그리는 방법까지만 한다. 다섯 화면의 데이터 계약을 하나의 제네릭 화면으로 합치지 않는다.
- `woo-code-readability`의 한 제품 파일 교대 흐름을 적용한다.

## Figma 구현 계약

### 근거의 우선순위

1. Figma section `50:609`의 다섯 프레임은 화면의 정보 계층, 밀도, 색 역할과 패널 배치의 기준이다.
2. 기존 `figma-context-cache-dashboard-prompt.md`는 터미널 폭, 축소 상태와 데이터 상태 표현의 선행 기준이다.
3. 실제 표시값과 가능한 동작은 현재 core 계약과 adapter가 제공하는 관측값이 최종 기준이다. Figma에만 있는 수치와 조작은 만들지 않는다.

### 네이티브 구현 가능성

| Figma 요소 | pi-tui 변환 | 판정 |
|---|---|---|
| 어두운 전체 배경·영역별 배경 | `Box` 배경 함수와 theme token | 네이티브 구현 가능 |
| 상단 metric card strip | 고정 높이 `HStack` + bordered card | 네이티브 구현 가능 |
| 중앙 다열 panel grid | 중첩 `HStack`·`VStack`과 고정/가변 basis | 네이티브 구현 가능 |
| 300px 우측 sidebar | 대형 약 38–40열 고정, 표준 축약, 컴팩트 본문 병합 | 네이티브 구현 가능 |
| table·progress bar·heatmap | 셀 폭 allocator, block 문자, ANSI 배경색 | 네이티브 구현 가능 |
| 하단 status bar | 1행 고정 `HStack` | 네이티브 구현 가능 |
| 둥근 모서리·픽셀 단위 글자 크기 | box-drawing 문자, bold/dim 계층으로 번역 | 터미널 한계 내 근사 |

외부 이미지 asset은 필요하지 않다. Figma의 표식은 단색 square·bar·text이므로 모두 터미널 네이티브 문자와 색으로 표현한다.

### 공통 셸 변환

| 영역 | 대형 ≥160×42 | 표준 120×32 | 컴팩트 80×24 |
|---|---:|---:|---:|
| Header | Figma형 2행 | 2행 | 1–2행 |
| 요약 card strip | 전체 card | 핵심 card 축약 | 1–2행 summary |
| 본문 | 다열 grid + 38–40열 sidebar | 2열 축약 grid | 단일 열 scroll |
| Footer/HUD | Figma형 1–3행 | 핵심 상태 2–3행 | 핵심 상태 2–3행 |

- 우측 패널 전체는 160열 이상에서 노출한다. 112–159열은 핵심 sidebar만 축약하고, 그보다 좁으면 본문 summary로 병합한다.
- Dashboard·Context·Cache·Usage·Workflow의 우측 패널은 각 화면 데이터의 읽기 전용 투영이다. 기존 Plan·Three Body 패널은 Execution에서만 유지한다.
- 좁은 폭에서 숨긴 우측 정보는 본문 핵심 요약과 중복되도록 구성하며, 보조 세부사항만 생략한다.
- 기존 `AstraHeader`, `AstraNotice`, `AstraHud`, Composer를 유지한다. Figma의 상·하단 바는 이 구성요소의 역할과 색을 조정해 표현한다.

### 화면별 데이터 연결

| 화면 | 주 화면 | 우측 패널 | 실제 데이터 |
|---|---|---|---|
| Dashboard | 세션 요약, 라우터, 토큰·컨텍스트 상태 | 세션 컨텍스트, 시스템 부하, 이동 안내 | `WorkbenchSnapshot`, `UsageSnapshot[]` |
| Context | 컨텍스트 용량·구성, 모델·effort, 스킬·MCP·메모리 | 연결된 스킬·MCP·저장 상태 | `WorkbenchSnapshot`, `UsageSnapshot[]` |
| Cache | 캐시 요약, 계층·항목·효율 상태 | 읽기 전용 진단과 이동 안내 | transcript `CacheDiagnostics` |
| Usage | provider quota, 세션 토큰·컨텍스트 관측 | workbench runtime와 계측 상태 | `UsageSnapshot[]`, `WorkbenchSnapshot.sessionUsage` |
| Workflow | Goal, 요청 단계, delegation·agent 흐름 | 활성 프로세스, pipeline 상태, 이동 안내 | `requestRuntime`, `delegation`, `sessionGoal` |

- Cache의 purge·sync·reset·validate는 현재 제품 명령 계약이 없으므로 조작 버튼으로 구현하지 않는다.
- Usage의 모델별 비용·추세처럼 관측되지 않는 값은 합성하지 않는다. 해당 블록은 `미관측` 또는 `연결 대기` 상태를 표시한다.
- Workflow의 agent 수와 진행 단계는 실제 request/delegation 관측만 사용한다.
- 각 화면은 기존 feature 디렉터리가 의미를 소유하고, shell은 화면 조립과 전환만 담당한다.

### 내비게이션 계약

- `/dashboard`: Figma Session Overview
- `/history`: 기존 관측 이력 Dashboard
- `/context`, `/cache`, `/usage`, `/workflow`: 각 Astra 상세 화면
- Ctrl+G 1–9 슬롯은 유지하며 Cache·Usage는 command-only로 둔다.

## 7단계 실행

### 1. 기존 변경 기준선 확정

- 모든 dirty 경로를 visual-polish 커밋 후보 또는 명시적 제외로 분류한다.
- 가장 좁은 검증과 전체 타입 검사를 실행한다.
- `$woo-commit` Candidate를 만들고 사용자에게 제목, 전체 경로, 검증, 제외 경로를 제시한다.
- 명시 승인 전에는 stage나 commit을 수행하지 않는다.

### 2. Figma 구현 계약 고정

- 다섯 프레임의 공통 셸과 화면별 중앙·사이드 패널을 대형·표준·컴팩트 셀 매트릭스로 변환한다.
- 대형에서 Figma 정보 계층을 보존하고, 표준·컴팩트에서 남길 정보와 숨길 보조 정보를 정한다.
- 실제 `WorkbenchSnapshot`, `UsageSnapshot`, `CacheDiagnostics`, request/delegation 데이터와 Figma 표시를 연결한다.
- 경쟁하는 기존 디자인 문서가 있으면 대체하지 않고 관계와 우선순위를 기록한다.

### 3. 공통 셸과 표현 기반 정리

- 기존 theme token에서 orange, olive, mint, dusty-pink 역할을 확정한다.
- 반복되는 meter·panel 표현만 foundation으로 승격한다.
- Header, 하단 HUD/status 영역, 38열 반응형 sidebar의 행·열 예산을 조정한다.
- `astraBodyHeight`와 기존 shell 폭 계약을 함께 갱신한다.

### 4. 내비게이션과 기능 배선

- `/dashboard`를 Figma Session Overview에 연결한다.
- 기존 관측 이력 화면을 `/history`로 옮기고 명령·도움말·문서를 갱신한다.
- `/cache`, `/usage`를 Astra page 전환으로 연결한다.
- Usage 상세 화면을 기존 Usage feature의 별도 Unit으로 등록한다.
- 숫자 1–9 전환기와 기존 슬롯은 변경하지 않는다.

### 5. 다섯 화면 순차 구현

- `Dashboard → Context → Cache → Usage → Workflow` 순서로 구현한다.
- 한 화면의 실제 데이터·빈 상태·좁은 폭을 확인한 뒤 다음 화면으로 이동한다.
- Figma의 정보 계층은 보존하되 제품에 없는 조작이나 수치는 만들지 않는다.

### 6. 파일별 가독성 통일

- 대상 파일 하나마다 반복 행의 기본형과 예외 요소를 판정한다.
- 공개 계약과 구현 세부사항을 분리하고 optional·null·undefined·단언을 감사한다.
- 비교 가능한 3행 이상의 표만 최소 폭으로 정렬한다.
- 필요한 블록에 `measure-layout.ts`와 타입 불확실성 검사를 실행한다.

### 7. 통합 수락

- 키맵, feature registry, slash command, shell 라우팅과 화면 폭 테스트를 실행한다.
- `bun run check`, `test/architecture.test.ts`, 관련 화면 테스트와 `git diff --check`를 통과시킨다.
- 변경 파일에서 `TODO`, `test.skip`, `test.only`를 직접 검색한다.
- MemoryTerminal 기반 대형·120×32·80×24 자동 검증 후 실제 TUI 캡처로 색·밀도·overflow를 확인한다.

## 최소 검증 원칙

- 파일 작업 중에는 해당 파일의 가장 좁은 테스트만 실행한다.
- 키맵·registry·shell 폭처럼 고정 기대값을 바꾸면 관련 테스트를 반드시 실행한다.
- 단계 완료와 커밋 후보 시점에는 타입·아키텍처·diff 위생 검사를 생략하지 않는다.
- 기대값은 실패를 없애기 위해 맞추지 않고, 새 계약의 근거가 있을 때만 갱신한다.

## 완료 조건

- 다섯 화면이 실제 Workbench 데이터 또는 명시적 미관측 상태만 표시한다.
- `/dashboard`, `/history`, `/cache`, `/usage`, `/workflow`가 의도한 화면으로 이동한다.
- 대형 화면에서 Figma의 card·grid·sidebar 계층이 식별되고, 120×32와 80×24에서도 행이 폭을 넘지 않으며 필수 정보가 유지된다.
- core/adapters 및 foundation/feature/shell 의존 경계를 위반하지 않는다.
- 가독성 계약과 필수 검증을 통과하고 기존 미커밋 작업을 덮어쓰지 않는다.
