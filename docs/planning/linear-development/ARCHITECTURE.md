# 제품 코드 구조

상태: 구현 완료. 물리 경로와 의존 규칙의 실행 정본은 [`LAYERS.md`](../../../LAYERS.md)다.

## 목표

WWW의 제품 규칙과 실행 흐름을 외부 도구·저장소·TUI 구현에서 분리한다. 기능을 찾을 때는
`core`에서 의미와 계약을 확인하고, `adapters`에서 입력과 외부 구현을 확인한다.

```text
src/
├── core/
│   ├── domain/       # 순수 상태·값·규칙·projection
│   ├── application/  # use case와 제품 lifecycle
│   ├── ports/        # 외부 실행·저장·조회 계약
│   ├── runtime/      # 실행 reducer·checkpoint·receipt 생성
│   └── commit/       # commit control 계약
├── adapters/
│   ├── inbound/
│   │   ├── cli/
│   │   └── tui/
│   └── outbound/     # executor·store·provider·Git 구현
├── app.ts            # production composition root
├── cli.ts            # 실행 진입점
└── legacy-router-app.ts
```

## 경계

- Domain은 같은 Domain 규칙만 참조한다.
- Application은 Domain과 Port를 사용해 업무 흐름을 조정한다.
- Runtime은 Domain 계약으로 실행 상태와 Receipt를 만든다.
- Inbound Adapter는 Core의 공개 계약만 사용한다.
- Outbound Adapter는 Port를 구현하며 Inbound를 참조하지 않는다.
- `app.ts`가 Core와 Adapter를 조립한다.
- `legacy-router-app.ts`는 `www router` 호환 명령이 명시적으로 소유한다.

## 실행 흐름

```text
User → Inbound → Application → Port → Outbound
                    │
                    ├─ Domain rules
                    └─ Runtime state / receipt
```

Todo·Tracer·Chat·완료 요약은 각자 실행 상태를 추론하지 않고 동일한 Runtime/Domain 계약에서
projection한다. 저장·프로세스·SDK·터미널 구현은 Adapter에만 둔다.

## 변경 규칙

1. 관찰 가능한 결과와 소유 상태를 먼저 정한다.
2. 규칙은 Domain, 흐름은 Application, 외부 요구는 Port에 둔다.
3. CLI/TUI는 Inbound, 외부 실행과 저장은 Outbound에 둔다.
4. `app.ts`에서 구현을 주입한다.
5. Code-ID와 SQLite 투영의 실제 경로를 함께 갱신한다.
6. Architecture test, 관련 행동 테스트, 타입 검사로 경계를 검증한다.

과거 `domain/application/infrastructure/presentation` 및 `tui/system/workflows` 초안은 이
구조로 대체됐다. 해당 이름을 새 최상위 경로로 다시 만들지 않는다.
