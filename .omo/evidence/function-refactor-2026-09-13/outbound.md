# Outbound 함수 리팩터링 증거

## 조사 범위

- `src/adapters/outbound/**`의 TypeScript 파일 56개, 총 9,231줄을 파일 목록과 줄 수로 전수 집계했다.
- authentication, development, execution, git, observability, persistence, review, workspace의 모든 책임 폴더를 함수 선언, 클래스 메서드, 긴 파일, 반복 매핑, 외부 효과 순서 기준으로 대조했다.
- 가장 큰 파일은 `execution/codex-app-server.ts` 785줄, `workspace/project-workbench-session.ts` 505줄, `development/development-store.ts` 485줄, `review/review-adapters.ts` 463줄, `execution/agent-tools.ts` 432줄이었다.
- 공개 interface, 프로토콜 요청/응답, 파일 내구성, 승인 상태, lease 해제 순서와 보안 검사를 변경하지 않는 범위만 저작 대상으로 삼았다.

## 변경

### Native 승인 메시지 상태 전이

`execution/codex-app-server.ts`의 `receive`는 JSONL 구문 분석, 응답/요청 분류, runtime tool dispatch, 승인 요청 상태 등록, 승인 해결 상태 정리, 알림 발행을 함께 수행했다. 메시지 분류는 `receive`에 유지하고 승인 요청과 해결의 상태 변경을 각각 `receiveApprovalRequest`, `receiveApprovalResolution`으로 이동했다.

- `approvalKind` 계산을 한 번만 수행한다.
- approval map 등록 뒤 `approval-requested` 발행 순서를 유지한다.
- approval map 삭제, pending response 삭제/resolve, `approval-resolved` 발행 순서를 유지한다.
- 새 공개 export나 가상 adapter seam을 만들지 않았다. 두 함수는 구현 내부 상태 전이만 감춘다.

### 실행 선택 정책의 단일 계산

`workspace/project-workbench-session.ts`는 provider/model/effort fallback을 Native 연결과 Workbench 생성에서 각각 계산했고, Pi lane의 명시값 검증은 그 사이에 섞여 있었다. `resolveExecutionSelection`이 Pi 계약 검증과 fallback을 한 번 수행하며, 같은 결과를 두 소비자에게 전달한다.

- Pi lane은 provider/model/effort 세 값이 모두 명시돼야 한다는 기존 계약을 유지한다.
- 기본 lane은 검증된 Workbench config 값을 사용한다.
- Native 연결이 먼저 완료된 뒤 나머지 리소스를 만드는 기존 실행 순서를 유지한다.
- 설정 키나 범용 abstraction을 추가하지 않았다. 실제로 두 소비자가 공유하는 안정된 정책만 지역화했다.

### Commit receipt의 저장소 identity

`git/git-commit-control.ts`의 성공 receipt가 모든 저장소를 `world-wide-woo`로 기록하던 고정값을 제거했다. commit과 traceability가 함께 쓰는 저장소 identity 정본인 `.www/control-ledger/development/project.json`의 schema v1 UUID를 읽어 기존 `context.projectId` 필드에 기록한다.

- `.woo/project.yaml.project`는 사람용 표시 이름이고 `.www/project.json.name`은 checkout의 로컬 이름이므로 고유 receipt identity로 사용하지 않는다.
- identity 파일 누락, JSON 오류, schema/UUID 오류는 각각 명시적인 `COMMIT_PROJECT_IDENTITY_MISSING` 또는 `COMMIT_PROJECT_IDENTITY_INVALID`로 차단한다.
- identity preflight는 staging과 commit보다 먼저 실행하므로 metadata 오류가 Git 변경 뒤에 발견되지 않는다.
- receipt의 공개 schema와 `context.projectId` 필드 형태는 유지한다. WWW 저장소에서는 현재 정본 UUID `2d9bf52e-3f71-4e58-ac8e-7c8d0b60168f`가 기록되고, 다른 저장소가 WWW로 오기록되지 않는다.

## 조사 후 유지한 주요 함수

- `development/development-store.ts`: traceability projection과 SQLite transaction은 길지만, durable create의 fsync와 transaction 순서가 파일/DB 일관성 계약이다. 별도 변경 없이 기존 테스트 표면을 유지했다.
- `review/review-adapters.ts`: Claude CLI spawn, capped stream, 오류 분류는 이미 함수 seam으로 나뉘며 보안상 출력 상한과 subprocess 종료 순서가 중요해 유지했다.
- `execution/agent-tools.ts`: 경로 containment, 민감 파일 차단, read-only git 판별, 출력 redaction은 책임별 함수가 존재한다. 공통 utils로 이동하면 보안 정책 locality가 낮아져 유지했다.
- `workspace/project-workbench-session.ts`의 전체 조립 함수: 리소스 생성과 역순 release가 한 눈에 추적되는 composition 구현이다. 별도 객체나 다수 forwarding 함수로 분산하지 않고, 실제 중복 정책인 실행 선택만 추출했다.
- persistence store의 JSONL append/rename/fsync 구현: 파일별 schema와 복구 계약이 달라 외형상 반복만으로 합치지 않았다.

## 검증

- `bun test test/codex-app-server.test.ts test/project-workbench-session.test.ts`: 30 pass, 0 fail, 152 assertions.
- `bun run check`: `tsc --noEmit` 통과.
- `bun test test/architecture.test.ts`: 13 pass, 0 fail, 1,582 assertions.
- `bun test test/commit-governance.test.ts`: 10 pass, 0 fail, 24 assertions. 저장소별 UUID 기록과 identity 누락 시 commit 전 차단을 포함한다.
- `git diff --check`: 통과.
- 변경 파일에서 `TODO`, `test.skip`, `test.only`, `describe.skip`, `describe.only`, `it.skip`, `it.only` 자리표시를 추가하지 않았다.

독립 Claude Sonnet 리뷰와 Claude Opus 최종 감사는 이 저작 패스에서 실행하지 않았다. 상위 통합 패스의 별도 읽기 전용 검토 대상으로 남긴다.
