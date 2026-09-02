# EP-011 — v0.1.0 Native Project Workbench 실행 Handoff

- 상태: `implementation-candidate`
- 사람 수락: 대기
- 구현 상태: ST-011-06~12 구현됨; ST-011-13은 수동 출시 증거 대기
- 현재 실행 경계: 프로젝트 root의 `www` Workbench
- 제품 범위 정본: [WWW v0.1.0 Architecture Proposal](./WWW_V010_ARCHITECTURE_PROPOSAL.md)
- Planning 정본: [catalog.jsonl](../.www/planning/catalog.jsonl)

이 문서는 다음 실행자가 EP-011을 같은 경계에서 검증·인수하기 위한 전달 문서다. Epic과
Story의 목표·수락 조건은 `.www/planning/catalog.jsonl`과 immutable artifact가
소유한다. 이 문서는 실행 순서, 코드 seam, 검증과 중단 조건만 소유하며 사람 수락이나
구현 완료를 대신하지 않는다.

## 먼저 읽을 것

1. [Architecture Proposal](./WWW_V010_ARCHITECTURE_PROPOSAL.md)
2. [EP-011 artifact](../.www/planning/artifacts/EP-011.md)
3. 현재 실행할 Story artifact
4. 이 Handoff의 해당 Story 행과 공통 중단 조건

`.www/Epics.md`와 `.www/Stories.md`는 사람이 읽는 managed projection이다. 내용이
다투어지면 append-only `catalog.jsonl`을 우선한다.

## 목표와 경계

EP-011은 Codex 네이티브 실행을 App Server로 보존하면서 프로젝트 root에서 다음 세
projection을 한 Workbench로 제공한다.

```text
Codex App Server
       |
ProjectActivity journal
       |
ProjectWorkbench
  |         |         |
Chat     T-notes    Todo.md
```

- WWW는 독립 로컬 CLI/TUI 앱이다. Codex plugin이나 자체 agent runtime이 아니다.
- Chat 원문의 1차 소유자는 Codex native thread다. WWW journal은 관찰 사본이다.
- 사람이 승인한 T-note와 Todo Markdown만 `.www/vault/`의 정본 후보가 된다.
- Git working tree는 현재 편집본, Git commit은 정확한 버전 정본, GitHub는 원격·검토,
  Obsidian은 같은 Markdown을 여는 편집기다.
- Claude Opus와 Gemini는 승인된 packet을 읽기 전용으로 검토한다. 프로젝트를 직접
  탐색하거나 쓰지 않는다.

다음은 EP-011의 비범위다.

- 본사 TUI, 프로젝트 집계, `/dashboard`, `/monitor` 확장
- 실제 RPA collector와 RPA 전용 화면
- 자체 모델 runtime과 자동 모델 재배치
- 자동 commit, push, PR
- cloud sync, 계정 서버, 범용 plugin 생태계

## 현재 측정된 상태

| 항목 | 2026-09-01 기준 사실 | 아직 증명하지 않은 것 |
| --- | --- | --- |
| native Chat | Codex App Server adapter가 start/resume/stream/approval/cancel을 소유 | 실제 macOS 수용 시나리오의 전체 반복 |
| Workbench | Chat·T-notes·Todo 3-pane, source inspector, activity journal 및 serialized command queue 구현 | 사람 사용성 수락 |
| Todo | Native thread별 `.www/todos/<thread>/Todo.md`, range patch, CAS/watch와 `/todo` command 도달성 구현. `.www/vault/Todo.md`는 명시적 promotion 대상 | 실제 Obsidian 동시 편집 수용 |
| T-notes | packet-only direct Codex generator, range capture와 draft/provenance 구현 | 사람 수락 |
| review | Claude Opus·Gemini read-only adapter, exact-digest gate와 `/review` command 도달성 구현 | 외부 provider 실제 호출은 이 문서가 주장하지 않음 |
| release | `0.1.0`, CI 및 release gate/runbook 구현 | Windows Terminal·13단계 실제 E2E·operator evidence |

초기 기준선은 `bun test` 220개 통과였다. 2026-09-01의 최신 직접 run은 `380 pass`,
`0 fail`, `1965 expect() calls`, `58 files`이며 `bun run check`도 통과했다. 현재 구현의 Story별 판정은
`.www/evidence/ST-011-06.md`~`ST-011-13.md`가 소유한다. ST-011-06~12는 PASS다.
ST-011-09는 App Server 격리 실패 뒤 안전한 생성기로 전환한 실제 production smoke를
포함한다. ST-011-13은 BLOCKED다.
따라서 이 문서는 구현 후보를 설명할 뿐 사람 수락이나 release 완료를 선언하지 않는다.

## 실행 그래프

```text
ST-011-06 Codex native slice
        |
ST-011-07 ProjectActivity journal
       / \
      v   v
ST-011-08 Workbench       ST-011-09 T-notes
      |
ST-011-10 project Todo
      \                 /
       v               v
        ST-011-11 canonical promotion
                    |
                    v
        ST-011-12 external review
                    |
                    v
        ST-011-13 release gate
```

`ST-011-09`의 원 설계인 App Server detached thread는 실제 probe에서 builtin
`commandExecution`이 project 밖 파일을 읽어 격리 조건에 실패했다. 이 경로는 채택하지
않는다. production은 packet만 받는 direct `@earendil-works/pi-ai` `openai-codex`
one-message/no-tools (`toolChoice: "none"`) adapter를 사용한다. `ST-011-11`은 T-note와
Todo 양쪽 입력이 준비된 뒤 구현됐다.

## Story별 실행 계약

| Story | 결과 | 주 소유 seam | 선행조건 | 검증 |
| --- | --- | --- | --- | --- |
| [ST-011-06](../.www/planning/artifacts/ST-011-06.md) | App Server native vertical slice | `src/infrastructure/codex-app-server.ts`, `src/application/native-harness.ts` | lifecycle probe | PASS: adapter + 실제 approval/cancel/resume probe |
| [ST-011-07](../.www/planning/artifacts/ST-011-07.md) | append-only `ProjectActivity` | `src/domain/project-activity.ts`, `src/infrastructure/activity-journal-store.ts` | ST-011-06 | PASS: append/replay/corruption/sequence test |
| [ST-011-08](../.www/planning/artifacts/ST-011-08.md) | Chat·T-notes·Todo 3-pane Workbench | `src/application/project-workbench.ts`, `src/presentation/tui/` | ST-011-06, ST-011-07 | PASS: contract/layout + 실제 PTY stream/resume |
| [ST-011-09](../.www/planning/artifacts/ST-011-09.md) | source-linked packet-only T-note draft | `src/application/t-note-service.ts`, `src/infrastructure/detached-codex-generator.ts`, `src/infrastructure/t-note-store.ts` | ST-011-07 | PASS: safe replacement smoke, packet redaction/provenance/no-tools |
| [ST-011-10](../.www/planning/artifacts/ST-011-10.md) | Native session `Todo.md`와 별도 canonical promotion 대상 | `todos.ts`, `todo-store.ts`, `project-workspace.ts`, Todo view·watcher | ST-011-08 | PASS: fresh/resume thread scope, range patch/CAS/Obsidian/CRLF fixture |
| [ST-011-11](../.www/planning/artifacts/ST-011-11.md) | human-gated Markdown promotion | `src/domain/canonical-document.ts`, `src/application/canonical-promotion.ts`, `src/infrastructure/canonical-document-store.ts` | ST-011-09, ST-011-10 | PASS: digest/stale/approval/path allowlist/atomic write/no-Git-side-effect |
| [ST-011-12](../.www/planning/artifacts/ST-011-12.md) | Claude Opus·Gemini read-only review | `src/domain/review.ts`, `src/application/review-service.ts`, `src/infrastructure/review-adapters.ts` | ST-011-07, ST-011-11 | PASS: deny-by-default redaction, exact-digest approval, no-tool request, provenance |
| [ST-011-13](../.www/planning/artifacts/ST-011-13.md) | v0.1.0 cross-platform release gate | `package.json`, changelog, CI, install/update/rollback runbook | ST-011-06~12 | BLOCKED: darwin platform gate 외 Windows Terminal·13단계 E2E·operator evidence 없음 |

한 Story를 구현할 때 다른 Story의 미래 interface를 미리 확장하지 않는다. 각 Story는
위 seam 중 필요한 최소 파일만 소유하고, 기존 사용자 변경을 되돌리지 않는다.

## 구현과 화면 도달성의 구분

포트와 service의 테스트 통과는 화면에서 사용할 수 있다는 뜻이 아니다. 아래 경로는
별도로 focused/core/UI/hardening evidence로 확인됐다.

| 사용자 입력 | Workbench command | 화면에서 확인하는 결과 |
| --- | --- | --- |
| `/tnote range <from> <to>` | `tnote.capture` | source-linked draft와 provenance |
| `/todo create|add|detail|start|complete|block|reopen|evidence|import-legacy` | `todo.*` | Todo projection, CAS면 `currentSource`와 pending patch |
| `/promote tnote <note-id>` → `/promote confirm <token>` | `promotion.accept/confirm` | confirmation 전 preview/diff, confirmation 뒤 canonical Markdown |
| `/review preview <opus\|gemini> public …` → `/review send <digest>` | `review.preview/send` | exact digest, provider/model/result/provenance |

모든 mutating/local command는 `ProjectWorkbench.dispatch()`의 command queue를 지나므로
같은 순간의 두 `chat.send`가 두 native turn을 만들지 않는다. TUI는 이 결과를 immutable
`actionResult`로 받고 Source pane에서 full diff, review body, CAS의 current/pending 문서를
표시한다. 세부 invocation과 binary observable은 ST-011-06, 08, 10~12 evidence의
`/private/tmp/ep011-core-reachability-evidence.md`,
`/private/tmp/ep011-tui-reachability-evidence.md`,
`/private/tmp/ep011-hardening-evidence.md`에 있다.

## 구현 후 핵심 실행 증거

- 실제 synthetic project PTY에서 Chat은 native `thread/start` 뒤 `WWW_SMOKE_2`를
  stream하고, 종료 뒤 같은 opaque thread ID로 explicit resume됐다. 두 `/exit`는 0으로
  끝났고 activity JSONL이 남았다. 원본: `/private/tmp/www-v010-smoke.9cTlRj/`.
- 실제 App Server approval probe에서 request ID `0` 및 nullable `approvalId:null`을
  받았고 decline 뒤 command가 `declined`이며 sentinel 파일이 생기지 않았다. 별도
  `sleep 30` turn은 `turn/interrupt` 뒤 `interrupted`가 됐다.
- T-note production smoke는 redacted packet digest를 생성하고 packet-only
  `openai-codex` 호출 뒤 draft를 저장했다. 이 generator에는 project cwd, native thread,
  file/shell/MCP tool이 전달되지 않으며 `toolChoice: "none"`이다.

구체 명령·관찰·artifact는 ST-011-06, 08, 09 curated evidence와
`/private/tmp/ep011-appserver-approval-cancel-probe.md`,
`/private/tmp/ep011-tnote-production-smoke.ts`를 따른다.

## 공통 중단 조건

다음 조건에서는 추정 구현으로 넘어가지 않고 해당 Story를 blocked evidence와 함께
멈춘다.

- 실제 App Server가 schema와 다른 event·approval lifecycle을 보인다.
- resume 뒤 item 누락·중복을 결정론적으로 reconcile할 수 없다.
- pending approval의 terminal 상태를 알 수 없어 재전송 안전성을 증명할 수 없다.
- T-note generation이 redacted packet 외 project path/native thread/tool 입력을 받거나,
  `toolChoice: "none"`을 강제하지 못한다.
- App Server detached T-note가 다시 제안되면 builtin tool의 실제 격리 실패를 먼저
  재검증하지 않고 production 경로로 채택한다.
- `.www/vault` ignore/re-include가 Home·Todo·accepted T-note를 실제로 stage 가능하게
  만들지 못한다.
- Obsidian 외부 변경과 WWW write 경합에서 원문 또는 pending patch가 사라진다.
- 외부 provider packet에서 secret·고객 식별자·로컬 path가 송신 전에 제거되지 않는다.
- Windows에서 path, process, CRLF, rename/file-lock 또는 terminal 입력이 검증되지 않는다.

중단은 실패를 숨기는 상태가 아니다. 재현 명령, 관찰 결과, 영향을 받은 acceptance를
기록한 뒤 다음 설계 결정을 요청한다.

## 증거와 완료 규칙

- 각 Story는 해당 artifact의 acceptance를 claim 단위로 나누고 test·실행·화면 증거를
  연결한다.
- 원시 실행 로그는 ignored runtime/scratch에 둘 수 있지만 완료를 주장하는 요약과
  재현 명령은 Git 추적 문서에 남긴다.
- 변경 파일에서 placeholder, `test.skip`, `test.only`, 껍데기 test와 미구현 분기를
  직접 검색한다.
- `bun test`와 `bun run check`를 통과해도 실제 App Server, macOS TUI, Windows smoke가
  필요한 claim을 대신하지 않는다.
- 작성자와 검토자를 분리한다. 현재 계획의 독립 검토는 Claude Opus 읽기 전용 패스로만
  수행한다.
- 사람의 명시적 수락 전에는 Epic·Story를 완료 또는 accepted로 표시하지 않는다.

## 알려진 Planning ID 특성

현재 `FilePlanningStore`는 새 Story suffix를 parent Epic 안에서만 계산하지 않고 catalog의
기존 Story suffix 최댓값에도 영향을 받는다. 그래서 EP-011의 첫 Story가
`ST-011-06`으로 생성됐다. ID는 이미 append-only catalog에 기록됐으므로 임의로
`01`부터 재번호화하지 않는다. allocator 의미를 바꾸려면 별도 좁은 수정과 회귀
테스트로 처리한다.

## 독립 검토 상태

- 지정 reviewer: Claude Opus
- 검토 bundle: Architecture Proposal, 이 Handoff, planning catalog, EP-011과
  ST-011-06~13 immutable artifact
- 1차 결과: `VERDICT FAIL`. active turn lifecycle P0, Todo/promotion/review UI 미배선,
  release test/scan, mixed EOL/temp/redaction을 지적했다. 각각 terminal turn lifecycle,
  command queue·TUI dispatch, release hygiene, byte-preserving patch/temp path/phone redaction으로
  수정했고 focused/core/UI/hardening evidence를 남겼다.
- 최종 re-review: **pending**. 1차 지적을 고쳤다는 사실은 Opus의 최종 PASS가 아니다.
- provenance: 실제 요청의 canonical model은 `claude-opus-5`였다. reviewer 출력에 보인
  Fable 표기는 출력 메타데이터 오류로 확인했으며 reviewer 변경으로 취급하지 않는다.
- 처리: Sonnet, Fable, Gemini 또는 Codex 자기검토로 대체하지 않는다. 최종 Opus 결과가
  나오기 전에는 독립 검토 완료를 주장하지 않는다.

## 다음 사람 결정

필요한 후속 결정은 구현 착수가 아니라 수락이다. 사람은 project Workbench 흐름을
수용할지, ST-011-13을 풀 실제 Windows Terminal 및 release-operator 증거를 언제
수행할지 판정한다. 그 전까지 `implementation-candidate`는 출시 완료가 아니다.
