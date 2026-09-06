# Linear ↔ Code Map

이 원장은 Linear 요구와 현재 저장소 snapshot의 코드·테스트·Evidence 위치를 양방향으로 찾기 위한 얇은 관계 지도다. 제목, 본문, 진행 상태, 테스트 실행 결과, review, acceptance는 복제하지 않는다. Map에 관계가 있다는 사실은 구현 완료나 수락 완료를 뜻하지 않는다.

`traceability.json`은 schema v1 current map이다. Linear Issue는 WOO 표시 ID, UUID, URL을 함께 보존하고 code/test/evidence는 저장소 상대 경로를 쓴다. Unit과 Linear Issue는 서로 다른 identity지만 schema v1에는 Unit kind가 없으므로 Unit을 발급하거나 WOO 번호로 대체하지 않았다.

## 조회

저장소 root에서 실행한다.

```sh
bun scripts/code-map.ts WOO-690
bun scripts/code-map.ts src/application/project-workbench.ts
bun scripts/code-map.ts a417df98-8479-4222-b7e8-170ea4230f97 --json
bun scripts/code-map.ts --check
bun scripts/code-map.ts --check --json
```

Issue 조회는 연결된 code/test/evidence를, repository path 조회는 연결된 Issue를 보여준다. UUID와 Linear URL도 query로 쓸 수 있다. `--check`는 schema, 중복 identity, 관계 방향, dangling endpoint, 저장소 경로 존재, `@linear` 등록·exact path 연결, production code 선언 1개 이상을 오프라인에서 검사한다. 원격 Linear 존재·권한·현재 상태는 별도 read-back으로 확인한다.

## current snapshot과 미연결

현재 Map은 base commit `d35b2bbb1f784a0f177c6e80453ce634d6d93d74` 위의 `woo-695-code-map` 작업 트리에서 실제 존재하는 경로만 등록한다. WOO-679 Chat, WOO-681 Tracer, WOO-682 Todo, WOO-677 Stats를 포함해 이 snapshot에 존재하는 기존 관계는 유지했다. Monitor/Dashboard에는 새 기능, 새 관계, 새 annotation을 추가하지 않았다.

등록된 Issue가 관계 0개일 수 있다. 이는 Issue identity는 알려졌지만 이 snapshot에 연결할 실제 구현·테스트·Evidence 위치가 없다는 뜻이다. 예를 들어 WOO-696(SQLite), WOO-697(개발 기록), WOO-698(Obsidian)은 이 PR에서 미연결로 조회된다. 계획된 이슈를 구현된 관계로 꾸미지 않는다.

## dirty observation archive

`observations/2026-09-06-dirty-worktree-traceability.json`은 원본 dirty worktree에서 관측된 schema v1 graph의 별도 archive다. 43개 Linear Issue, 46개 code, 30개 test, 2개 evidence, 171개 link를 보존한다. 이 archive의 경로가 현재 PR tree에 존재한다는 뜻은 아니며 `--check` 입력도 아니다. provenance와 해석은 [구현 receipt](../evidence/2026-09-07-code-map-implementation/receipt.md)에 기록했다.

SQLite projection, Unit schema migration과 발급 규칙, Development Session/Run/Record/Document 연결, 제품 전용 Obsidian Vault는 WOO-695 전체 목적에서 남아 있는 후속 범위다. 이 v1 Map은 그 완료를 주장하지 않는다.
