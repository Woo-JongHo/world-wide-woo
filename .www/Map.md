# WWW Project Map

이 문서는 현재 프로젝트의 탐색 지도다. 설계 이유와 불변식은 `PLAN.md`와 `decisions/`가 소유하며 여기에서 복제하지 않는다.

## Entrypoints

- `src/cli.ts` — `www`, auth, native thread/session CLI 진입점
- `src/app.ts` — TUI composition root
- `src/infrastructure/project-workbench-session.ts` — native harness와 project-local adapter 조립
- `src/presentation/tui/workbench-shell.ts` — 기본 Workbench lifecycle과 local command routing
- `src/presentation/tui/legacy-session-shell.ts` — 기본 경로에서 분리된 SessionRuntime migration archive

## Product surfaces

```text
외곽 Frame
├── Chat                native message · 의미 Step · approval · queue
├── T-notes · Source    immutable T-note · 선택 activity · action result
├── Todo.md             현재 project 실행 보드
└── Composer/Status     native chat 입력 · local command 결과
```

Workbench local command:

- `/source`, `/tnote` — activity 선택과 packet-only T-note 생성
- `/todo` — project Todo 생성·전이·evidence 연결
- `/promote`, `/review` — 사람 승인 기반 local promotion과 제한된 외부 검토
- `/approve`, `/decline`, `/cancel` — native approval/turn 제어

다음 표면은 `legacy-session-shell.ts`에만 남아 있고 기본 `www` 실행 경로에서는 열리지 않는다.

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

- Native Chat: `domain/native-session.ts` → `application/native-harness.ts` → `infrastructure/codex-app-server.ts`
- Workbench: `domain/workbench.ts` → `application/project-workbench.ts` → `presentation/tui/workbench-shell.ts`
- Activity: `domain/project-activity.ts` → `infrastructure/activity-journal-store.ts` → `presentation/tui/workbench-views.ts`
- Todo: `domain/todos.ts` → `application/todo-ledger.ts` → `infrastructure/todo-store.ts` → `shared-dashboard-views.ts`
- T-note: `domain/t-notes.ts` → `application/t-note-service.ts` → `infrastructure/t-note-store.ts`
- Legacy: `application/session-runtime.ts` → `presentation/tui/legacy-session-shell.ts` → `legacy-dashboard-views.ts`

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
├── vault/Todo.md         Git-visible project Todo 정본
├── todos/                legacy session별 Todo
├── sessions/             legacy append-only Session event JSONL
├── drafts/               Composer draft · private T-note JSONL
└── runtime/              writer lease · activity journal · mutex · review provenance
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
- `docs/WWW_V010_ARCHITECTURE_PROPOSAL.md` — EP-011의 제품 범위와 구조 결정
- `docs/WWW_V010_EXECUTION_HANDOFF.md` — EP-011 Story 순서·중단 조건·실행 인계
