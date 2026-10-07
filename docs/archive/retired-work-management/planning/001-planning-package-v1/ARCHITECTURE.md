# ARCH-001 — Planning Package v1 Architecture

## Boundaries

```text
Domain          Planning IDs, artifact relations, validation
Application     PlanningService and explicit mutation use cases
Infrastructure  catalog/artifact filesystem, mutex, projection refresh
Presentation    /epic and /story parsing, result notice
Runtime         session Todo and evidence; Planning acceptance를 소유하지 않음
```

## Canonical and projection

- `.www/planning/catalog.jsonl`은 v1에서 생성된 Planning artifact의 순서·relation·본문 event 정본이다.
- `.www/planning/artifacts/<ID>.md`는 catalog에서 생성하는 immutable 사람용 projection이다.
- `.www/Epics.md`와 `.www/Stories.md`의 managed block은 재생성 가능한 projection이다.
- legacy block과 managed marker 밖의 사람 작성 내용은 projection refresh가 수정하지 않는다.

## Mutation

1. SQLite `BEGIN IMMEDIATE` mutex로 project writer를 직렬화한다.
2. 현재 catalog와 legacy index에서 다음 stable ID를 계산한다.
3. 입력과 relation을 검증한다.
4. 새 record가 추가된 catalog를 temp-write·fsync·rename한다.
5. immutable artifact projection을 exclusive-create하고 fsync한다.
6. managed Markdown index projection을 atomic refresh한다.

Catalog 반영 뒤 projection 생성 전에 process가 중단된 경우 다음 initialization이 catalog에서 projection을 재생성한다. 기존 projection이 catalog와 다르면 덮어쓰지 않고 충돌로 차단한다.

## ID

- Epic: `EP-NNN`
- Story: `ST-NNN-NN`, 앞 번호는 parent Epic과 동일
- 기존 ID와 tombstone은 재사용하지 않는다.
- 경로는 identity가 아니며 ID와 catalog relation이 identity를 소유한다.

## Supersede

기존 Story의 title·acceptance 의미를 바꾸지 않는다. 새 Story 파일을 만들고 `supersedes`가 같은 Epic의 기존 Story를 가리킨다. cycle 또는 cross-Epic supersede는 거부한다.

## Authority

Slash command는 사용자의 명시적 저장 surface다. 생성된 artifact는 `drafted` planning intent이며 구현 승인이나 완료가 아니다. Agent Tool 자동 호출은 approval surface가 생기기 전까지 제공하지 않는다.

## Failure policy

- malformed catalog, revision gap, duplicate ID, unsafe path: fail-closed
- symlink/non-regular catalog·artifact·directory: fail-closed
- projection refresh 실패: catalog 정본을 보존하고 오류를 반환; 다음 read에서 재시도 가능
- secret/raw Tool output: 저장 금지
