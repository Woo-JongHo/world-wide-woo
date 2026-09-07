# World Wide Woo Code Architecture

- 상태: v0.1.0 capability 구조 구현
- 기준: `Different tools. One project. No broken handoffs.`
- 실행 기록: [v0.1.0 Capability Architecture 이관 계획](planning/linear-development/V010_CAPABILITY_MIGRATION_PLAN.md)

## 최상위 탐색 축

```text
src/
├── tui/                       # 입력·표시·탐색·조작
│   ├── auth/
│   ├── chat/
│   ├── layout/
│   ├── observability/
│   ├── overlays/
│   ├── shell/
│   ├── theme/
│   ├── work/
│   ├── workbench/
│   └── legacy/                # 삭제하지 않은 Router 호환 UI
├── system/                    # 공통 실행·기록·통제
│   ├── contracts/             # 순수 계약과 projection, port
│   ├── services/              # 계약만 사용하는 공통 정책
│   ├── adapters/              # 파일·프로세스·provider·SQLite IO
│   └── public.ts              # TUI와 Workflow가 보는 공개 표면
├── workflows/
│   └── tui-development/       # 현재 존재하는 개발 기록 업무 규칙만 소유
│       ├── contracts/
│       ├── adapters/
│       ├── service.ts
│       └── index.ts           # 공개 Workflow entry
├── app.ts                     # 유일한 concrete composition root
├── cli.ts                     # 인자 해석과 지연 진입
└── product-version.ts
```

최상위 `domain`, `application`, `infrastructure`, `presentation`은 더 이상 현재 소스 경로가 아니다. 단순히 세 폴더로 평탄화하지 않고 System 안에서 계약, 서비스, IO adapter seam을 유지한다. 빈 capability 폴더나 범용 Workflow Engine은 만들지 않는다.

## 책임

| 영역 | 소유 | 소유하지 않음 |
| --- | --- | --- |
| TUI | 입력 편집, 화면 크기·색·focus, source 탐색, 공개 명령 호출 | 업무 수락 판정, executor·store 선택 |
| System contracts | runtime-neutral 값, projection, 실패·수명 계약, port | Node/Bun IO, provider 구현 |
| System services | 공통 실행·기록·통제 정책 | concrete adapter, 특정 Workflow |
| System adapters | executor, 파일, 프로세스, provider, 저장소 구현 | Workflow 완료 의미 |
| Workflow | 실제 개발 기록 순서·검증·완료 조건 | executor 프로토콜, 범용 엔진 |
| `app.ts` | concrete 구현 선택과 수명 조립 | 사용자 입력 해석, 새 업무 규칙 |

`ProjectActivity`와 Native Plan projection은 runtime-neutral System 계약이다. 파일 이름에 `workflow`가 포함돼도 특정 업무의 단계 실행 정책이 아니므로 `workflows/`로 옮기지 않는다. 반대로 Development Record, 원장 갱신, Vault 기록, SQLite 재구축과 Map 생성은 실제 `tui-development` Workflow로 묶는다.

## 강제 의존 규칙

```text
tui ───────────────→ system/public.ts
 │                  → workflows/tui-development/index.ts
workflows ─────────→ system/public.ts
system/services ───→ system/contracts
system/adapters ───→ system/contracts · system/services
app.ts ────────────→ concrete adapters · services · Workflow adapters · TUI entries
```

- System 어디에서도 TUI나 Workflow를 import하지 않는다.
- System contracts는 Node/Bun runtime과 adapter를 import하지 않는다. executor port가 요구하는 외부 패키지는 type-only import만 허용한다.
- System services는 adapters를 import하지 않는다.
- Workflow의 서비스와 공개 entry는 `system/public.ts`만 사용한다. Workflow adapter는 해당 Workflow 안에서 격리하며 공개 entry에서 export하지 않는다.
- 현대 TUI는 `system/public.ts`와 Workflow 공개 entry만 사용한다.
- legacy TUI는 격리하며 현대 코드가 import하지 않는다. `app.ts`와 `cli.ts`만 명시적으로 진입할 수 있다.
- concrete adapter 선택과 운영 조립은 `app.ts`만 수행한다.
- 상대 import graph에는 cycle이 없어야 한다.

이 규칙은 [architecture.test.ts](../test/architecture.test.ts)가 파일 경로와 실제 import graph로 검사한다.

## 공개 Interface

`system/public.ts`는 TUI와 Workflow가 필요한 command/read 계약만 export한다. adapter class와 내부 service 구현은 공개하지 않는다. Workbench session 조립은 `ProjectWorkbenchSessionFactories`를 받아 System service가 수명을 통제하고, 운영 factory 등록은 `app.ts`가 수행한다.

`workflows/tui-development/index.ts`는 `DevelopmentService`, command parser, 공개 record type을 export한다. 파일 scanner, Vault writer, SQLite store, Linear snapshot validator 같은 concrete 구현은 `adapters/`에 남고 `app.ts` 또는 개발 CLI adapter가 조립한다.

## Legacy 정책

기존 Multi-provider Router는 `tui/legacy/`에 보존한다. 기능을 삭제하지 않으며 Native Workbench의 기본 경로와 섞지 않는다. legacy UI entry는 주입된 shell session만 실행하고, settings·credential·model router·project session·composer·usage 같은 concrete 조립은 `app.ts`가 담당한다.

## 새 기능 배치

1. 실제 사용자 업무 규칙인지, 여러 업무가 공유하는 실행·기록 계약인지 먼저 판정한다.
2. 순수 값·projection·port는 `system/contracts/`, 공통 정책은 `system/services/`, IO 구현은 `system/adapters/`에 둔다.
3. 특정 업무의 순서·승인·근거 충분성·완료 판단은 해당 `workflows/<name>/`에 둔다.
4. TUI renderer/controller는 공개 entry만 사용한다.
5. 새 concrete 구현은 `app.ts`에서 조립하고 architecture test와 동작 테스트를 함께 갱신한다.
6. 첫 공개 릴리스에서는 실제 업무가 없는 registry, plugin system, 범용 Workflow Engine을 만들지 않는다.

## Traceability

경로 이동은 Unit identity 변경이 아니다. 이름 있는 대표 class/function의 `@Unit Code-NNN`과 UUID는 유지하고 원장의 location만 새 경로로 갱신한다. Linear는 얇은 요구·결과·범위·완료 조건·Code-ID 연결을, 실제 Obsidian Vault는 상세 설계·예외·테스트·이관표를 소유한다. SQLite와 Development Map은 원장과 검증된 원본에서 재구축되는 projection이다.

과거 layer-first 경로와 1차 executor 분리 이력은 Git history 및 이관 계획의 전수 before/after 표로 보존한다.
