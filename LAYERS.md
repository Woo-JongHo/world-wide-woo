# WWW 코드 경계

코드 구조를 변경하거나 새 모듈을 배치할 때 이 파일을 먼저 읽는다.

## 정본 트리

```text
src/
├── core/
│   ├── domain/       # development·execution·observability·review·work
│   ├── application/  # development·orchestration·review·routing·session·work
│   ├── ports/        # 외부 실행·저장·조회 계약
│   ├── runtime/      # 실행 상태와 receipt
│   └── commit/       # commit control 계약
├── adapters/
│   ├── inbound/      # cli와 tui/{chat,commands,dashboard,overlays,shell}
│   └── outbound/     # authentication·development·execution·git·observability·persistence·review·workspace
├── app.ts            # production 조립
├── cli.ts            # 실행 진입점
└── legacy-router-app.ts
```

## 의존 방향

```text
Inbound Adapter ──→ Core ←── Outbound Adapter
                         ↑
                      app.ts
```

- `core/domain`은 같은 `core/domain` 안의 규칙만 참조한다. `core/application`, `core/ports`, `core/runtime`, `core/commit`, `adapters`를 참조하지 않는다.
- `core`는 `adapters`를 참조하지 않는다.
- `adapters/inbound`는 `adapters/outbound`를 직접 참조하지 않는다.
- 내부 모듈은 상대 경로로 참조한다. `tsconfig` path alias나 `src/` 절대 import를 추가할 때는 경계 검사도 함께 확장한다.
- `app.ts`가 Core 계약과 Adapter 구현을 조립한다.
- 외부 SDK, 파일, 프로세스, 네트워크, 터미널 구현은 Adapter가 소유한다.

## 내부 분류

- Core Domain은 제품 capability, Core Application은 use case로 분류한다.
- Inbound TUI는 사용자가 보는 화면과 조작 영역으로 분류한다.
- Outbound Adapter는 연결하는 외부 기능의 종류로 분류한다.
- `shared`, `common`, `utils` 폴더는 만들지 않는다. 소유 책임을 하나 선택한다.
- `core/agents`, `core/intents`, `core/skills`, `core/workflows`는 각각 WHEN·분류·HOW·실행 순서의 예약 경계다. 실제 코드가 생길 때만 만든다.

## 배치 순서

1. 사용자에게 보이는 동작과 상태 규칙은 `core/domain`에 둔다.
2. 동작을 수행하는 흐름은 `core/application`에 둔다.
3. 외부 기능이 필요하면 `core/ports`에 계약을 둔다.
4. CLI·TUI는 `adapters/inbound`의 책임 폴더, 외부 실행·저장은 `adapters/outbound`의 연결 종류 폴더에 구현한다.
5. `app.ts`에서 구현을 주입한다.
6. `bun run check`, `bun test test/architecture.test.ts`, 관련 행동 테스트를 통과시킨다.

## 완료 기준

- `src/domain`, `src/application`, `src/infrastructure`, `src/presentation`이 존재하지 않는다.
- 상대 import cycle이 없다.
- Core에서 Adapter로 향하는 import가 없다.
- Inbound에서 Outbound로 향하는 직접 import가 없다.
- 경로 이동 뒤 Code-ID와 추적성 원장이 실제 파일을 가리킨다.
