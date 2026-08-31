# WWW Project Map

이 문서는 현재 프로젝트의 탐색 지도다. 설계 이유와 불변식은 `PLAN.md`와 `decisions/`가 소유하며 여기에서 복제하지 않는다.

## Entrypoints

- `src/cli.ts` — `www`, auth, session CLI 진입점
- `src/app.ts` — TUI composition root
- `src/presentation/tui/app-shell.ts` — Shell lifecycle과 Slash routing

## Product surfaces

```text
외곽 Frame
├── Workstream          대화 · 공개 narration · Tool card
├── Router              Provider · Model · Effort · Auth
├── Session Todo        현재 session의 Todo만 표시
└── Usage strip         Codex · Claude quota projection
```

Read-only overlay:

- `/monitor`, `/dashboard` — Session·Turn·Tool·Todo monitoring
- `/planning` — Project Planning catalog 상태
- `/epic`, `/story` — 명시적 drafted Planning artifact 저장
- `!<command>` — 현재 cwd에서 사용자 명시적 non-interactive terminal 실행
- `/commits` — Git 작업 트리와 최근 Commit
- `/issues` — 열린 GitHub Issue
- `/model`, `/login` — Router와 인증 설정

## Source topology

```text
src/
├── domain/             순수 type · validation · projection contract
├── application/        runtime orchestration · ports · services
├── infrastructure/     filesystem · provider · git · tool adapters
└── presentation/
    ├── cli/            CLI output
    └── tui/            layout · view · overlay · input routing
```

주요 연결:

- Session event: `domain/session-events.ts` → `application/session-runtime.ts` → `infrastructure/session-store.ts`
- Tool output: `domain/output.ts` → `application/session-runtime.ts` → `presentation/tui/result-cards.ts`
- Work narration: `domain/narration.ts` → `SessionRuntime` → `TranscriptView`
- Monitoring: `domain/monitoring.ts` → `application/session-monitor.ts` → `MonitoringOverlay`
- Todo: `domain/todos.ts` → `application/todo-ledger.ts` → `infrastructure/todo-store.ts` → `WorkspaceTodoView`
- Planning: `domain/planning.ts` → `application/planning-service.ts` → `infrastructure/planning-store.ts`

## Project-local state

```text
.www/
├── Map.md               이 탐색 지도
├── Epics.md             누적 Epic index와 managed projection
├── Stories.md           누적 Story index와 managed projection
├── planning/
│   ├── README.md        Planning Package v1 계약
│   ├── catalog.jsonl    새 Planning artifact event 정본
│   ├── artifacts/       하나의 ID당 하나의 immutable Markdown projection
│   └── <package>/       PRD · Architecture · Initiative manifest
├── todos/<session-id>/  session별 live Todo
├── sessions/            append-only Session event JSONL
├── drafts/              Composer draft
└── runtime/             lease · SQLite mutex · ephemeral state
```

`todos/`, `sessions/`, `drafts/`, `runtime/`은 local runtime state다. Planning artifact와 Map·Epic·Story index는 Git에서 프로젝트 이력으로 관리한다.

## Planning navigation

- Why — package `PRD.md`
- How — package `ARCHITECTURE.md`
- Outcome — catalog Epic record와 immutable `EP-*.md` projection
- Work — catalog Story record와 immutable `ST-*.md` projection
- Runtime — 현재 session `Todo.md`와 evidence event

새 Planning artifact는 기존 파일을 덮어쓰지 않는다. 의미 변경은 새 ID와 `supersedes` 관계로 남긴다.

## Architecture references

- `PLAN.md` — 현재 제품 architecture와 delivery contract
- `decisions/0001-tui-foundation.md` — TUI foundation 결정
- `docs/TUI_CODE_MATRIX.md` — 구현 위치와 외부 비교 지도
