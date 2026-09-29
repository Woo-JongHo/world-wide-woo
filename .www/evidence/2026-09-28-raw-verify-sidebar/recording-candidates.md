# RAW FIRST VERIFY 기록 후보

상태: 로컬 초안. 원격 게시 전 Linear `linear-woo` 연결의 현재 프로젝트·이슈·Activity와 Obsidian 정본을 재조회해야 한다. 현재 세션에는 해당 MCP가 노출되지 않아 이슈 존재·부모·중복·최신 Comment·문서 identity를 검증하지 못했다. 다른 Linear 계정 커넥터의 결과로 대체하지 않는다.

## Linear Issue Candidate · 위치 미확정

- 제목: TEST/VERIFY 사이드바에 Native가 실제 실행한 테스트와 원문 실패를 표시한다
- 목적: 질문·목표·AI 분류가 아니라 관측된 commandExecution과 테스트 러너 출력을 보여준다.
- 포함: 명령별 실행·재실행, Bun 스위트/파일·테스트 원문, 통과/실패/건너뜀·exit code·소요시간, 잘린 출력과 미관측 값의 명시, Monitor 진입.
- 완료 조건: 실행되지 않은 검사나 관측되지 않은 수치를 만들지 않고, 실패 원문을 보존하며, 좁은 레일에서 필요한 행만 표시한다.
- 위치·처리: 관련 기존 이슈 조회 후 기존 본문 보완 또는 해당 Workbench 기능의 직계 하위 이슈로 결정. 현재 번호·부모는 미확정.
- 승인·게시: 미실행.

## Linear Project Comment Candidate · 미게시

### 변경

- `/test`의 질문별 의미 분류를 제거하고 관측된 테스트 명령·Bun 러너 출력으로 투영했다.
- WWW `/test`를 Monitor 옆 오른쪽 VERIFY 레일로 배치했다. ↑/↓로 실행 명령을 선택하고 Enter/M으로 선택한 실행의 캡처 출력·exit code를 Monitor에서 연다.
- 재실행 시 시도와 이전 실패를 함께 표시하고, 출력이 잘렸거나 수치가 없으면 `—`로 둔다.

### 영향

- 원문 명령·파일·테스트 이름·실패 메시지를 번역하거나 AI가 재해석하지 않는다.
- 현재 파서는 Bun 출력만 스위트·개별 실패 수준으로 구조화한다. 다른 러너는 명령·exit code·관측 소요시간 수준으로 표시한다.

### 분류

Improvement · Verification

### 검증

- `bun run check`: 통과.
- TEST 투영·아키텍처·키맵 28개: 통과.
- WWW 셸 선택 테스트 3개: 통과.
- 전체 `test/www-shell.test.ts`의 `/demo` 테스트 1건은 기존 Chat 표시의 `Stages` 기대값 불일치로 실패.
- import·table 정렬 검사 및 `git diff --check`: 통과.
- Claude Sonnet 독립 읽기 검토: 2분 이상 무응답으로 미실행 판정. Opus 최종 감사도 미실행.

### 연결

- 코드: `src/core/domain/observability/request-test-workspace.ts`, `src/adapters/inbound/tui/features/test/view/www-test-view.ts`, `src/adapters/inbound/tui/shell/workbench-shell.ts`.
- 테스트: `test/request-test-workspace.test.ts`.
- Git: `dev`, HEAD `8486a759746ab2e0748beb1ab9fdd4d250fa6b27`, 미커밋.
- Linear 이슈와 Obsidian 문서: 원격 정본 재조회 전 미확정.

## Obsidian Canonical Candidate · identity 미확정

- 변경할 계약: TEST/VERIFY의 권위는 Native 도구의 관측 결과와 러너 원문이다. 계획·AI 분류·번역은 수치·이름·실패 설명의 출처가 아니다.
- 데이터 흐름: `ProjectActivity` commandExecution → Bun 출력의 확정된 행만 파싱 → 실행/스위트/실패 3단계 → 오른쪽 레일. Monitor는 상세 원문과 기록을 소유한다.
- 미관측: 수치·duration·suite가 없거나 출력이 잘리면 `—`; exit code 0은 테스트 건수 0의 증거가 아니다.
- 수락 증거: 위 검증과 실제 Native 출력 세션에 대한 후속 수동 QA가 필요하다.
- 정본 문서 경로·document_id·Linear UUID·Code-ID: 기존 Vault와 Linear 조회 전 미확정. schema v2 Candidate로 승격 및 게시 보류.

## 정식 Artifact Candidate 초안 판정

- `linear-issue-candidate.json`: WOO-674는 2026-09-21 로컬 기록의 제안 부모일 뿐 현재 Linear 조회로 확인되지 않았다. 기존 이슈·중복 판정 `not-run`.
- `project-comment-candidate.json`: 현재 Project Activity와 최신 Comment ID를 조회하지 못했다. 중복·expectedBefore 판정 `not-run`.
- `obsidian-canonical-candidate.json`: 기존 정본 경로·document_id·Linear UUID·현재 bytes를 조회하지 못했다. 경로는 제안일 뿐이며 identity 판정 `not-run`.
- 세 파일의 digest는 생성했다. `artifact:control validate`는 각각 위 `not-run` 검증을 이유로 **게시 불가**로 판정했다. 따라서 render·외부 publish·read-back과 항목별 승인 요청은 수행하지 않았다.
