# v0.2.0 Linear–Code–Obsidian 개발 추적 시스템 계획

상태: 구현 전 승인된 요구를 Sol에 넘기기 위한 실행 계획
실행 모델: Codex `gpt-5.6-sol`
독립 검증: Claude Sonnet 5 읽기 전용
최종 감사: Claude Opus 읽기 전용 고정. 사용할 수 없으면 완료가 아니라 blocker로 기록한다.

## 목표

개발자가 Linear에서 해야 할 일을 짧게 이해하고, `Code-NNN`으로 실제 코드 단위를 찾으며, Obsidian에서 설계·대화·예외·테스트의 상세 기록을 읽을 수 있게 한다. SQLite는 세 시스템의 ID와 실행 증거를 검색하는 로컬 투영이고, `.www/Development-Map.md`는 그 관계를 사람이 읽는 형태로 생성한 화면이다.

```text
Linear Issue
  └─ Code-ID: Code-001
       ├─ code declaration: @Unit Code-001
       ├─ Obsidian note: unit_id: Code-001
       └─ SQLite: Unit UUID ↔ Code-001 ↔ Linear UUID ↔ Obsidian URI
                    └─ generated .www/Development-Map.md
```

완료는 링크 문자열이 존재한다는 뜻이 아니다. 동일한 ID가 정본 원장에 등록되고, 코드 선언·Linear readback·Obsidian 파일·SQLite 투영·Map 생성 결과가 서로 일치해야 한다.

## 릴리스와 마일스톤

- `v0.0.n`: 첫 공개 배포 전의 통합 버전. 사용자에게 보이는 기능 또는 개발 시스템 단위가 main에 수락될 때 하나 증가한다. 문서 오탈자처럼 제품 동작과 계약을 바꾸지 않는 변경은 단독 버전 증가를 요구하지 않는다.
- `v0.1.0`: TUI 첫 공개 배포. Chat·Todo·Tracer·Layout과 필요한 실행·검증만 소유한다.
- `v0.2.0`: Linear–Code–Obsidian 추적 시스템의 첫 완성 버전. 지금 Linear 마일스톤을 만들어 범위를 계획할 수 있지만, `v0.1.0` 완료 전에는 계획 상태로 둔다.
- `v0.2.0` 이슈를 미리 설계하거나 기반 코드를 작성할 수는 있다. 해당 작업은 `v0.1.0` 완료율에 포함하지 않고, `v0.1.0` 필수 작업을 막는 의존성으로 만들지 않는다.
- 저장소는 npm 배포·Git tag·GitHub Release가 없다. v0.2 통합 후보는 아래 증분을 모두 반영한 `0.0.15`로 검증한다. `0.1.0`은 공개 배포 게이트를 모두 통과할 때만 부여한다.

Linear에는 다음 마일스톤을 추가한다.

```text
v0.2.0 — Development Traceability
목적: Linear의 작업, 코드의 Unit, Obsidian의 상세 기록과 실행 증거를 하나의 ID 그래프로 연결한다.
완료: 템플릿 생성 → ID 등록 → 코드/문서 연결 → SQLite 투영 → Map 생성 → CI 검증이 한 흐름으로 동작한다.
경계: TUI v0.1.0 기능 완성도와 출시 판정은 포함하지 않는다.
```

## 정본과 책임

| 대상 | 소유하는 내용 | 저장하지 않는 내용 |
| --- | --- | --- |
| Linear | 계층, 목적, 결과, 포함·제외 범위, 관측 가능한 완료 조건, 현재 상태 | 구현 상세, 긴 테스트 로그, 대화 기록 |
| Code | 실제 객체·서비스·함수의 책임과 `@Unit Code-NNN` 선언 | Linear 본문, Obsidian 상세 문서의 복제 |
| Obsidian | 설계 이유, 대화 결정, 예외, 테스트 방법·결과·실패 분석 | 실시간 Linear 상태의 사본 |
| immutable control ledger | Unit UUID, `Code-NNN`, Linear UUID, Obsidian URI, 관계와 provenance | 사람이 편집하는 설명 본문 |
| SQLite | 원장을 재구축·검색하기 위한 로컬 인덱스 | 유일한 정본 |
| Development-Map.md | 원장과 투영에서 생성한 현재 관계·무결성·다음 조치 | 수동 편집한 새 관계 |

`Code-NNN`은 사람이 읽는 안정 ID다. 내부 Unit UUID를 대체하지 않는다. 원장이 `unit_uuid ↔ Code-NNN`의 일대일 별칭을 소유한다. 파일 이동은 같은 Unit이면 ID를 유지하고, 의미상 책임이 분리될 때만 새 ID를 발급한다. `Code-000`은 예시용이며 발급하지 않는다. 삭제된 ID는 tombstone으로 남기고 재사용하지 않는다.

## Linear 계약

기능 부모는 목적·공통 완료 조건·연결만 가진다. 번호 기능 이슈는 다음 순서를 고정한다.

1. `목적`
2. `결과`
3. `범위`의 `포함`과 `제외`
4. `동작`
5. `완료 조건`
6. `연결`

연결은 다음 형태다.

```md
- Code-ID: Code-001
- GitHub: [#46](https://github.com/Woo-JongHo/world-wide-woo/pull/46)
- Obsidian: [상세 기록](obsidian://open?vault=...&file=...)
```

Code-ID에는 GitHub 링크를 걸지 않는다. Linear 계층은 `parentId`가 소유하고 라벨은 검색·분류만 보조한다. 예외 처리와 테스트는 기능 부모의 직계 하위 컬렉션으로 하나씩 유지한다. 실행 결과를 확인하지 않은 완료 조건은 체크하지 않는다.

## Obsidian 계약

각 상세 노트는 최소한 다음 frontmatter를 가진다.

```yaml
---
linear_id: WOO-000
linear_uuid: <opaque UUID>
unit_id: Code-001
unit_uuid: <opaque UUID>
record_type: requirement | decision | exception | test
source_revision: <git:40-char-sha | worktree:40-char-head:dirty>
updated_at: <ISO-8601>
---
```

본문은 목적, 배경과 결정, 상세 동작, 예외, 테스트 방법, 실제 결과, 남은 항목을 기록한다. 모든 절을 모든 노트에 강제하지 않고 `record_type`별 템플릿을 적용한다. Linear 본문을 그대로 복사하지 않으며, Linear 링크가 가리키는 실제 Vault 파일을 readback한다.

## Sol 실행 순서

### 1. 현재 변경 분리와 버전 재기준화

- PR #46에서 Chat 기능 코드와 0.2 추적 시스템 파일을 경로·커밋 단위로 분류한다.
- Chat 기능은 v0.1.0 흐름에 남긴다. 커밋 `3036b62`와 그 이후의 Code-ID·Linear 계약 파일럿은 별도 v0.2 작업 브랜치로 옮기고 PR #46에서 제거한다.
- 현재 worktree의 미커밋 21개 추적 시스템 파일은 새 격리 worktree로 옮긴다. main의 사용자 변경은 덮어쓰지 않는다.
- `package.json`을 최종 통합 후보 `0.0.15`로 맞추고 CLI와 Native client가 같은 버전 정본을 읽도록 한다.
- npm·tag·GitHub Release 부재와 이전 `0.1.11`을 재기준화한 이유를 릴리스 원장에 기록한다.

완료 조건: PR #46 diff에는 Chat v0.1.0 범위만 남고, v0.2 브랜치는 독립적으로 빌드되며, `--version`과 Native client version이 같은 값을 반환한다.

### 2. 하나의 Unit 원장으로 통합

- 사용자의 main working tree에 있는 `DevelopmentStore`, `development_sources`, immutable capture envelope를 실제 통합 입력으로 취급하고 [저장 경계](TRACEABILITY_STORAGE_BOUNDARY.md)에 따라 schema v2 관계 원장을 같은 store에 연결한다.
- Unit에 `id`(UUID), `key`(`Code-NNN`), `name`, lifecycle, aliases, locations를 둔다.
- 발급기는 마지막 번호와 tombstone을 확인해 다음 ID를 원자적으로 발급한다.
- `Code-001`~`Code-005`는 기존 `0001`~`0005`와 일대일 migration record를 남긴다.
- 병렬 원장을 만들지 않는다. JSON source envelope가 정본이고 SQLite는 재생성 가능한 투영으로 유지한다.

완료 조건: 중복 key/UUID, ID 재사용, dangling alias, 같은 ID의 다른 의미를 거부하고 기존 다섯 Unit이 손실 없이 조회된다.

### 3. 코드 선언과 AST 검사

- 대표 객체·서비스·최상위 함수에 `@Unit Code-NNN` 주석을 한 번 둔다.
- AST 검사기는 주석이 실제 선언에 붙었는지, 원장의 location/symbol과 일치하는지 확인한다.
- 문자열·Markdown fence·죽은 예시·다른 선언의 주석은 Unit 선언으로 세지 않는다.
- 객체 literal을 Unit으로 허용할지 계약을 정하고, 허용하면 이름 있는 `const` 선언까지 AST 지원을 확장한다.
- 기존 UUID형 `@unit`이 있으면 자동 삭제하지 않고 schema v2 migration에서 별칭 또는 legacy annotation으로 판정한다.

완료 조건: 미등록·중복·잘못된 형식·잘못된 symbol·이동 후 stale location이 CI에서 실패한다.

### 4. Linear·Obsidian 템플릿과 검증기

- `ISSUE_CONTRACT.yaml`과 Linear intake/title hierarchy skill을 위 Linear 계약의 정본으로 맞춘다.
- Linear의 Markdown 정규화와 native PR embed를 fixture로 검증한다.
- Obsidian `record_type`별 템플릿과 frontmatter parser를 만든다.
- Linear readback의 `Code-NNN`과 Obsidian note의 Unit/Linear UUID가 원장과 맞는지 검사한다.
- 외부 UI 직접 편집은 차단할 수 없으므로, 반영 전 draft gate와 반영 후 readback gate를 모두 필수로 둔다.

완료 조건: 누락 절, 순서 오류, 빈 범위, placeholder, 링크형 Code-ID, 잘못된 PR, 존재하지 않는 Vault note, ID 불일치를 거부한다.

### 5. SQLite 그래프 투영과 조회

- 기존 `development_sources`와 같은 `DevelopmentStore`·`development/index.sqlite`·transaction 경계에 Unit key alias와 Linear/Obsidian/GitHub 관계를 `traceability_*` 조회 테이블로 정규화한다.
- 모든 투영은 immutable source envelope digest에서 재구축한다.
- `issue`, `unit`, `run`, `note` 중 하나의 ID로 관련 Unit·이슈·기록·테스트·PR·노트를 조회한다.
- stale/corrupt 상태에서는 빈 정상 결과로 가장하지 않고 무결성 오류와 rebuild 방법을 반환한다.

완료 조건: SQLite 파일을 삭제한 뒤 원장만으로 같은 logical digest를 재생성하고, 네 진입점의 조회 결과가 같은 관계 그래프를 가리킨다.

### 6. Development Map 생성

- `.www/Development-Map.md`는 수동 편집 문서가 아니라 생성 projection으로 고정한다.
- 기존 Initiative·Epic·Story·Evidence 열을 유지하고 Linear·Code Unit·Obsidian·PR·Run 상태 열을 추가한다.
- Map에는 상세 요구를 복제하지 않고 stable ID, 현재 무결성, 근거 링크, 다음 전환만 표시한다.
- `bun run development-map:build`와 `bun run development-map:check`를 제공한다. check는 재생성 diff가 있으면 실패한다.

완료 조건: Chat 파일럿을 Issue → Code → Obsidian → test evidence 방향과 역방향으로 찾을 수 있고, 깨진 edge가 Map에 명시된다.

### 7. 강제 경로와 수락

- `bun run traceability:check` 하나로 Linear snapshot 계약, Unit AST, Obsidian frontmatter, 원장 무결성, SQLite rebuild, Map freshness를 검사한다.
- CI에서 typecheck·단위 테스트와 함께 실행한다.
- AGENTS의 짧은 pointer가 Linear 작성, Unit 발급, Obsidian 기록, Map 갱신 시 해당 skill을 불러오게 한다.
- Chat 한 기능을 vertical slice로 이관하고, 의도적으로 링크 하나씩을 끊는 mutation fixture로 각 gate가 실제 red가 되는지 확인한다.
- Sol이 구현·자체 검증한 뒤 Sonnet이 코드와 실제 시나리오를 읽기 전용 검토한다. 수정 후 Opus가 정본 충돌·가짜 완료·우회 경로를 최종 감사한다.

완료 조건: 새 기능 하나를 템플릿으로 생성하면 Linear draft, Unit 발급과 코드 주석, Obsidian 상세 노트, SQLite edge, Development Map이 생성되고, 어느 하나라도 빠지면 merge gate가 실패한다.

## 작업 단위와 버전

| 수락 단위 | 예상 개발 버전 | 비고 |
| --- | --- | --- |
| 버전 재기준화와 PR 범위 분리 | `0.0.11` | 공개 배포가 아닌 기준선 |
| Unit 원장·AST 연결 | `0.0.12` | 첫 독립 기능 증분 |
| Linear·Obsidian 템플릿/검증 | `0.0.13` | 두 번째 증분 |
| SQLite 그래프·Map 생성 | `0.0.14` | 세 번째 증분 |
| 전체 CI와 Chat vertical slice | `0.0.15` | v0.2 기능 후보 완성 |
| TUI 첫 공개 배포 | `0.1.0` | 별도 v0.1.0 게이트 충족 시 |
| 추적 시스템 공개 배포 | `0.2.0` | v0.1.0 이후, 위 수락 단위 재검증 시 |

버전 번호는 PR 생성 시 올리는 값이 아니라 수락되어 main에 들어가는 제품 단위다. 같은 단위를 고치는 후속 커밋은 새 버전을 만들지 않는다. 두 독립 기능을 한 PR에 묶지 않는다.

## 범위 밖

- Linear와 Obsidian의 양방향 실시간 동기화
- 외부 도구 본문의 자동 덮어쓰기와 충돌 자동 해결
- SQLite를 정본으로 승격
- TUI v0.1.0 완료 조건을 v0.2 작업으로 대체
- 모든 기존 이슈와 문서를 한 번에 자동 이관

## Sol 인수인계 시작점

1. 기준은 `origin/main`이고 새 v0.2 격리 worktree에서 시작한다.
2. `/Users/jonghoPro/woo/00_project/99_www-pr-chat-completion`의 미커밋 변경은 구현 정본이 아니라 파일럿 입력이다. diff를 읽어 재사용 여부를 판단하되 그대로 커밋하지 않는다.
3. 첫 PR은 “버전 재기준화와 PR #46 범위 분리”만 소유한다.
4. 각 후속 PR은 위 작업 단위 하나와 대응하는 `0.0.n` 하나를 소유한다.
5. Linear v0.2.0 마일스톤과 이슈 계층은 로컬 계약 초안이 통과한 뒤 만들고, 생성 직후 MCP readback으로 parent·milestone·labels·본문을 검증한다.
