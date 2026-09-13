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
│   ├── inbound/
│   │   ├── cli/
│   │   └── tui/{foundation,features,commands,shell,legacy}/
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
- TUI Foundation은 Feature와 Shell을 참조하지 않고, Feature 구현은 sibling Feature를 직접 참조하지 않는다.
- TUI Shell은 정적 Feature descriptor와 개별 구현을 조립하며 중앙 registry에 동적 component factory를 두지 않는다. Feature descriptor는 같은 Feature의 readonly `TUI-F###-U##` Unit 목록을 소유하고 registry는 전체 목록·ID lookup·Feature별 lookup만 제공한다.
- TUI Unit catalog는 사용자가 화면·명령 책임을 탐색하기 위한 metadata다. `.woo/units.yaml`이 관리하는 지속 코드 책임 `Code-###` Unit과 수명·정본이 다르므로 TUI Unit을 그 파일에 등록하지 않는다.
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
- TUI Foundation의 상위 계층 참조와 Feature 간 sibling import

내부 path alias를 새로 도입할 때는 Architecture 검사도 같은 변경에서 확장한다.

## 함수 책임과 정책의 소유

CLI의 공개 `runCli`는 안내 출력, 명령 실행과 오류 종료를 조율한다. Astra 옵션 해석과
재개 thread 선택은 내부 함수가 담당하며, 주입된 실행 함수의 receiver와 취소 동작을 보존한다.

승인 화면은 `projectApprovalRequest`의 동일한 표시 투영을 소비한다. 종류별 라벨,
문자열 정제, 길이 제한과 fallback을 각 화면에서 다시 구현하지 않는다. 실행 lane의
provider·model·effort 선택은 session 조립 시 한 번 계산해 Native와 Workbench에 함께 전달한다.
Chat 상태 표식과 동일한 공개 출력·구조화 파싱 한도는 `chat-output-policy.ts`가 소유한다.
서로 다른 화면의 줄 수 제한은 각 화면에 둔다.

Core의 journal 검증, turn 선택, 활동 귀속과 최종 step 조립은 명확한 계산 단계로 분리한다.
승인·실행·journal 기록처럼 순서가 계약인 동작은 호출 순서를 유지하며, 순수 투영과
반복되는 응답 판정만 내부 함수로 모은다.

값은 실제 변경 이유에 따라 소유한다. 배포마다 달라지는 값은 구성에서 받고,
프로토콜 버전·해시 framing·상태명은 해당 계약에, 표시 한도와 기본 문구는 해당 제품 정책에 둔다.
모든 리터럴을 설정으로 옮기거나 함수 길이만을 이유로 전달용 함수를 만들지 않는다.

함수 전수 측정과 유지·변경 판정은
[함수 리팩토링 기록](../.omo/evidence/function-refactor-2026-09-13/scope.md)에 연결한다.

커밋 영수증의 `context.projectId`는 `.www/control-ledger/development/project.json`의
로컬 개발 프로젝트 UUID를 사용한다. 표시 이름이나 Linear UUID와 혼동하지 않는다.
설정 누락·손상은 staging 및 커밋 전에 검증하며 기존 영수증은 다시 쓰지 않는다.
