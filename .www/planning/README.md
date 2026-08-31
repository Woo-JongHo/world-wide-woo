# Project-local Planning Package v1

WWW의 Planning Package는 하나의 독립적으로 수락 가능한 Product Requirement Boundary를 Why·How·Outcome·Work로 분리한다. 이 계약은 `01_www` Planning Domain의 검증된 경계를 프로젝트 규모에 맞게 Adapt-In한 첫 버전이다.

## Artifact roles

| 질문 | Artifact | 소유하는 것 |
|---|---|---|
| Why | `PRD.md` | 문제, 사용자, 목표, 범위, Non-goal, acceptance |
| How | `ARCHITECTURE.md` | 구조, 경계, 제약, 실패 처리 |
| Outcome | `EP-*.md` | 독립적으로 수락 가능한 결과 |
| Work | `ST-*.md` | 실행 가능한 사용자 가치와 acceptance |
| Runtime | session `Todo.md` | 지금 수행하는 얇은 단계와 evidence |

Epic·Story 완료와 Todo 완료는 같은 의미가 아니다. Todo evidence가 존재해도 Story acceptance를 자동으로 통과시키지 않는다.

## Physical shape

```text
.www/planning/
├── README.md
├── catalog.jsonl
├── artifacts/
│   ├── EP-010.md
│   └── ST-010-01.md
└── <nnn>-<slug>/
    ├── INITIATIVE.json
    ├── PRD.md
    └── ARCHITECTURE.md
```

- Package 경로의 번호는 위치 표시이며 정체성이 아니다.
- `INITIATIVE.json`의 ID가 Package 정체성을 소유한다.
- 하나의 Planning artifact에는 하나의 stable ID와 하나의 immutable Markdown projection만 둔다.
- `catalog.jsonl`은 새 artifact의 순서·관계·본문을 소유하는 append-only event 정본이다.
- `.www/Epics.md`와 `.www/Stories.md`는 기존 이력과 managed projection을 제공한다.

## Append and supersede

- 새 Epic·Story는 catalog 끝에 추가한다.
- Artifact Markdown projection은 생성 후 덮어쓰지 않으며 catalog 내용과 다르면 fail-closed한다.
- 제목·목표·acceptance의 의미가 달라지면 새 ID를 만든다.
- 대체 관계는 새 Story의 `supersedes`로 기록하고 이전 파일을 보존한다.
- ID는 재사용하지 않는다.
- projection이 없거나 오래되어도 catalog에서 재구성할 수 있어야 한다.

## Authority

Planning 생성은 작업 의도를 기록하는 동작이며 구현 승인이나 완료 주장이 아니다.

- `/epic`은 새 Outcome 초안을 저장한다.
- `/story`는 명시한 Epic 아래 새 Work 초안을 저장한다.
- `/story ... --supersedes <ST-ID>`는 이전 Story를 변경하지 않고 대체 Story를 만든다.
- 사용자가 명시적으로 저장 명령을 실행한 경우에만 Planning artifact를 생성한다.
- Agent가 사용자 대신 acceptance·evidence·완료 상태를 만들어내지 않는다.

## Lifecycle in v1

```text
drafted → user-selected for execution → session Todo → evidence
```

독립 reviewer·governor·verifier 역할, 위험도별 planning review, promotion은 EP-009의 후속 Story다. v1은 그 상태를 성공한 것처럼 기록하지 않는다.

## Non-goals

- `01_www` 전체 Governance 또는 5-Tool 체계를 복제하지 않는다.
- Obsidian이나 외부 tracker를 정본으로 만들지 않는다.
- Package 수락과 Story 완료를 자동화하지 않는다.
- 현재 session Todo를 장기 Planning artifact로 승격하지 않는다.
