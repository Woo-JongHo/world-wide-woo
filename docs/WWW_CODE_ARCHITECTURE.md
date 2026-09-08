# World Wide Woo Code Architecture

- 상태: 현재 구조와 이관 결정
- 실행 정본: [`LAYERS.md`](../LAYERS.md)
- 개발 계획: [제품 코드 구조](planning/linear-development/ARCHITECTURE.md)

## 현재 구조

```text
src/
├── core/
│   ├── domain/
│   ├── application/
│   ├── ports/
│   ├── runtime/
│   └── commit/
├── adapters/
│   ├── inbound/{cli,tui}/
│   └── outbound/
├── app.ts
├── cli.ts
└── legacy-router-app.ts
```

기존 최상위 `domain/application/infrastructure/presentation`은 `core/adapters`로 이관했다.
`tui/system/workflows`는 검토 단계의 초안이었으며 현재 목표가 아니다.

평평했던 Core와 Adapter 내부는 책임 폴더로 한 단계 더 분류한다. 정확한 허용 폴더와
배치 규칙은 `LAYERS.md`가 소유한다.

## 책임

| 경계 | 책임 |
| --- | --- |
| `core/domain` | 순수 상태, 값, invariant, projection, 실행 계약 타입 |
| `core/application` | use case, 제품 lifecycle, 상태 조정 |
| `core/ports` | 외부 실행·저장·조회에 필요한 계약 |
| `core/runtime` | 실행 reducer, checkpoint, completion receipt 생성 |
| `core/commit` | commit candidate와 검증 계약 |
| `adapters/inbound` | CLI 명령, TUI 입력·표현 |
| `adapters/outbound` | executor, 저장소, provider, Git, 파일·프로세스 구현 |
| `app.ts` | production 의존 조립 |

Agent·Intent·Skill·Workflow의 실행 코드는 아직 없다. 각각 `core/agents`, `core/intents`,
`core/skills`, `core/workflows`에 들어가지만 실제 책임이 생기기 전에는 빈 폴더를 만들지 않는다.

## 주요 이관 결정

- `ExecutionRun`의 타입은 Domain 계약이고 reducer·checkpoint·Receipt 생성은 Runtime이 소유한다.
- Codex/Pi 실행기는 `adapters/outbound/executors`에 둔다.
- TUI는 `adapters/inbound/tui`, 인증 CLI는 `adapters/inbound/cli`에 둔다.
- `legacy-router-app.ts`는 `www router` 호환 표면이 사용하므로 유지한다.
- Code-ID와 Linear 연결은 이동된 실제 경로로 갱신하고 SQLite 원장을 다시 투영한다.

## 검증

`test/architecture.test.ts`가 다음을 차단한다.

- Core에서 Adapter로 향하는 의존
- Domain에서 Application·Port·Runtime·Commit으로 향하는 의존
- Inbound에서 Outbound로 향하는 직접 의존
- 상대 import cycle
- 옛 최상위 네 디렉터리의 재생성
- TUI의 직접 process 실행

내부 path alias를 새로 도입할 때는 Architecture 검사도 같은 변경에서 확장한다.
