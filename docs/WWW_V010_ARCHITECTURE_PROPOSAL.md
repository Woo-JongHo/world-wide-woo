# WWW v0.1.0 아키텍처 제안

- 상태: 구현 후보 (사람 수락·출시 증거 대기)
- 기준일: 2026-09-01
- 대상: 프로젝트 루트에서 `www`를 실행하는 로컬 CLI/TUI
- 첫 배포 단위: 프로젝트 작업공간
- 후속 배포 단위: 여러 프로젝트를 모으는 본사 TUI
- release 결정: `0.1.0` package/changelog/게이트는 구현됐으나 실제 cross-platform 출시 증거는 아직 없다

## 결정 요약

WWW는 플러그인도, 새 범용 에이전트 런타임도 아니다.

> **WWW는 네이티브 AI 실행기를 훼손하지 않으면서 프로젝트의 대화·이해·현재 실행·RPA 수행 근거를 한 화면에서 보여 주고, Obsidian·Linear·GitHub의 정본을 출처와 함께 연결하는 독립 로컬 TUI 애플리케이션이다.**

v0.1.0의 interactive Chat 기본 실행기는 Codex App Server다. Codex가 Chat 세션, 모델
실행, 도구 호출, 승인, 재개를 소유하고 WWW는 그것을 관찰하고 표현한다. Claude Opus와
Gemini는 읽기 전용 교차검증 작업으로만 호출한다. WWW가 공통 agent loop나 provider
인증을 다시 만들지 않는다.

T-note는 Chat과 다른 안전 경계다. App Server의 detached thread 격리를 실제로
검증했을 때 builtin `commandExecution`이 project 밖 파일을 읽을 수 있어 탈락했다.
그러므로 production T-note는 `@earendil-works/pi-ai`의 `openai-codex` direct
one-message adapter로 생성한다. adapter는 redacted immutable packet과 생성 지시만
받고, project cwd/native thread/tool을 받지 않으며 `toolChoice: "none"`으로 호출한다.
이는 Chat의 native App Server 경로를 대체하지 않는다.

정본은 한 저장소에 몰지 않고 책임에 따라 세 시스템으로 나눈다.

- **Obsidian:** 아이디어, 정리된 내용, 장기 지식, T-note가 승격된 문서와 결정 문서
- **Linear:** Epic/Story/Issue, 작업 상태·우선순위·담당, 수용 기준·테스트 시나리오·판정
- **GitHub:** 코드, diff, commit, PR, release와 그 기술 증거
- **WWW:** 위 세 정본을 만드는 동안 쓰는 local workbench다. 화면 projection, 현재 session 실행 보드, draft, link와 재생성 가능한 cache를 소유하지만 네 번째 정본은 아니다.

v0.1.0은 이 역할과 참조 데이터 계약만 고정한다. Obsidian/Linear API 연동, 인증,
양방향 sync, 충돌 조정은 본체 안정화 뒤의 다음 Epic이다. 세 시스템의 내용을 지금
서로 복제하거나 WWW 로컬 파일을 임시 통합 정본으로 선언하지 않는다.

## 반드시 지킬 제품 원칙

1. **네이티브 우선**
   Codex의 실행·승인·세션 복구 의미를 WWW가 재구현하지 않는다.

2. **표현은 자유롭게, 원문은 보존**
   접기, 구문 강조, 카드화, 요약은 projection이다. 원 이벤트와 출처 참조를 변조하지 않는다.

3. **관찰과 정본을 구분**
   스트리밍 이벤트와 WWW 로컬 파일은 관찰·작업 기록이다. 장기 지식은 Obsidian, 계획과 판정은 Linear, 코드와 기술 증거는 GitHub가 소유한다.

4. **생성과 승인을 구분**
   모델이 만든 T-note는 immutable draft다. 사람의 승인과 Obsidian 승격 전에는 장기 지식이나 결정 정본이 아니다.

5. **승인과 정본 반영을 구분**
   T-note 검토는 Obsidian 승격이 아니고, Todo 완료는 Linear 판정이 아니며, local diff 승인은 GitHub 반영이 아니다. 각 정본의 쓰기·게시에는 별도 사람 승인과 해당 시스템의 절차가 필요하다. Git commit은 기존 `woo-commit` 절차를 따르고 push와 PR도 별도 행위다.

6. **성공과 검토를 구분**
   RPA 프로세스의 exit code 0은 실행 성공일 뿐 업무 결과의 검토·승인을 뜻하지 않는다.

7. **고객 데이터는 기본 비공개**
   원 대화, tool stdout, RPA 로그·입력·스크린샷·영상·비밀정보는 Git에 자동으로 들어가지 않는다. 외부 provider 송신도 commit과 같은 분류·차단 게이트를 먼저 통과한다.

8. **프로젝트 우선**
   본사 대시보드와 범용 `/dashboard`, `/monitor`는 v0.1.0에서 만들지 않는다. 먼저 한 프로젝트의 완결된 흐름을 만든다.

9. **원 대화의 장기 보존을 과장하지 않음**
   대화 원문의 1차 소유자는 native session이다. WWW의 로컬 journal은 관찰 사본이며 native 원본을 대체하지 않는다. 장기 지식은 사람이 승인해 Obsidian으로 승격한 T-note나 결정 문서에 남긴다. `Todo.md`는 그 승격 경로가 아니다.

## 제품 경계

### WWW가 소유한다

- 프로젝트 식별과 로컬 작업공간
- 세 패널의 상태와 탐색
- native event를 화면용 `ProjectActivity`로 정규화하는 관찰 journal
- Chat, T-notes, 현재 session `Todo.md` 실행 projection
- 출처와 파생 관계
- immutable T-note draft와 사람 승인 후보
- Obsidian·Linear·GitHub opaque ID/provenance link와 로컬 cache
- 실행기 사이의 명시적 handoff packet
- 향후 본사 TUI에 내보낼 최소 `ProjectSummary`
- 실제 runner가 정해진 뒤 추가할 RPA 관찰 경계

### 네이티브 실행기가 소유한다

- 모델 인증과 구독
- thread/session 원본
- turn 실행
- tool call과 approval
- 모델별 기능과 세션 resume
- Codex skill의 발견과 실행

Codex App Server는 공식적으로 인증, 대화 기록, 승인, streamed event를 클라이언트에 제공하고 thread/turn/item 단위를 노출한다. WWW는 이 표면의 클라이언트가 된다. [Codex App Server 공식 문서](https://learn.chatgpt.com/docs/app-server)

### WES가 소유한다

- 어떤 단계에 어떤 모델·역할을 배치할지에 대한 정책
- 감사·재배치 규칙
- 스킬·훅·게이트의 정본
- 커밋 방법론

WWW는 WES를 복제하지 않는다. 선택된 실행 계획과 검토 결과를 보여주고 연결한다. 설치된 App Server schema와 실행 probe에서 `skills/list` 및 skill input이 확인될 때만 native skill 표면을 사용한다. 확인되지 않으면 스킬 실행은 기존 Codex CLI/WES에 남기고 WWW는 결과 참조만 표시한다. 어떤 경우에도 스킬 본문을 WWW 데이터베이스로 복사하지 않는다.

### v0.1.0에서 소유하지 않는다

- OMX·OMO 같은 agent orchestration framework
- 자체 공통 tool loop
- provider별 인증 저장소
- 자동 planner/reviewer/executor 팀
- 범용 plugin marketplace
- 본사 프로젝트 집계
- 실제 RPA collector와 `/rpa` 화면
- 자동 commit, push, PR
- Obsidian/Linear API 인증·sync·remote write·conflict reconciliation

OMX·OMO는 사용하지 않는다. 제품 경계 비교의 근거는 [OSS_POSITIONING.md](./OSS_POSITIONING.md)에 별도로 보존한다.

## 선택한 구조

외부에는 사용하기 쉬운 깊은 모듈 하나를 제공하고, 내부는 실행기·저장소·projection 포트로 나눈다.

```text
CLI: www
  |
  v
ProjectWorkbench
  snapshot() / subscribe() / dispatch() / close()
  |
  +-- NativeHarnessPort
  |     +-- CodexAppServerAdapter       [v0.1 interactive Chat]
  |
  +-- TNoteGeneratorPort
  |     +-- PiDetachedCodexGenerator    [redacted packet only, no tools]
  |
  +-- ReviewAdapterPort
  |     +-- ClaudeReviewAdapter         [읽기 전용 단발 검토]
  |     +-- GeminiReviewAdapter         [읽기 전용 단발 대조]
  |
  +-- ActivityJournalPort               [로컬 관찰 기록]
  +-- CanonicalReferencePort            [세 정본의 opaque ID/link cache; sync 아님]
  +-- future: RpaCollectorPort           [runner 확정 뒤]
  |
  +-- Projections
        +-- Chat
        +-- TNotes
        +-- Todo
        +-- future: RpaRuns
```

UI는 store, JSON-RPC, subprocess를 직접 알지 않는다. `ProjectWorkbench`만 호출한다.

### 외부 인터페이스

```ts
interface ProjectWorkbench {
  snapshot(): Promise<{ sequence: number; state: WorkbenchSnapshot }>;
  subscribe(
    afterSequence: number,
    listener: (change: WorkbenchChange | { kind: "resync-required" }) => void,
  ): Unsubscribe;
  dispatch(command: WorkbenchCommand): Promise<CommandReceipt>;
  close(): Promise<void>;
}

type RecoveryInstruction =
  | {
      kind: "reconcile-native-thread";
      correlationId: string;
      threadId: string;
      turnId?: string;
    }
  | {
      kind: "reload-document";
      path: string;
      expectedRevision: string;
    };

type CommandReceipt =
  | { status: "accepted"; commandId: string }
  | { status: "rejected"; reason: string }
  | { status: "uncertain"; commandId: string; recovery: RecoveryInstruction };
```

`sequence`는 project journal에서 단조 증가한다. `snapshot` 뒤 `subscribe(snapshot.sequence)`를 호출하는 사이에 생긴 변경도 journal에서 재생한다. 보존 범위를 벗어나거나 subscriber가 밀리면 조용히 버리지 않고 `resync-required`를 보낸다. 모든 command와 그 결과 activity는 `correlationId`로 연결한다.

`uncertain`이 필요한 이유는 subprocess나 App Server 연결이 끊겼을 때 “요청이 실행되지 않았다”고 거짓 단정할 수 없기 때문이다. approval 응답은 자동 재전송하지 않는다. 재연결 후 native thread/turn 상태를 읽어 pending이면 다시 사람에게 보여주고 terminal이면 결과를 연결하며, 판정할 수 없으면 수동 확인 상태로 남긴다.

내부 포트는 실제 두 번째 interactive provider나 실제 RPA collector가 생기기 전까지 registry/plugin framework로 일반화하지 않는다. v0.1.0은 Codex adapter와 두 개의 제한된 review adapter만 둔다.

## 데이터 모델

### Project

- Git root와 프로젝트 ID
- WWW workspace 경로
- 선택적인 Obsidian vault 식별자와 Linear workspace/team 식별자
- GitHub repository 식별자
- 연결 가능한 native harness
- redaction policy

### NativeSessionRef

- provider
- provider가 발급한 opaque session/thread ID
- 마지막으로 확인한 turn/item 참조
- resume 가능 상태

WWW ID와 native ID를 합치지 않는다.

### ProjectActivity

- WWW activity ID
- project/session
- 발생 시각
- source provider
- native thread/turn/item 참조
- kind: message, reasoning-summary, command, tool, file-change, approval, progress, error
- 화면용 정규화 payload
- raw payload의 로컬 참조
- 민감도와 redaction 상태
- 연결된 canonical refs: `system`, `kind`, provider가 발급한 opaque ID, 선택적 revision/URL
- link를 만든 시각과 주체, 파생 방향, source activity digest

`ProjectActivity`는 native session의 복제 정본이 아니라 WWW가 관찰한 append-only envelope다.
Obsidian note, Linear work item, GitHub commit/PR/release의 본문을 복제하지 않고 opaque ID와
provenance만 연결한다. 표시용 제목·상태 cache는 재생성 가능하며 stale일 수 있음을 드러낸다.

```ts
type CanonicalRef = {
  system: "obsidian" | "linear" | "github";
  kind: string;
  opaqueId: string;
  revision?: string;
  url?: string;
  linkedAt: string;
  linkedBy: "human" | "www";
  sourceActivityDigest?: string;
};
```

v0.1.0은 이 값의 저장·표시·출처 보존까지만 계약한다. `opaqueId`를 경로나 사람이 읽는
번호에서 재구성하지 않으며, remote object의 존재·최신 상태를 WWW가 추측하지 않는다.

### TNote

- note ID와 revision
- 제목·요약·핵심 결정·미해결점
- WWW source activity ID, native item 참조, 선택 원문 digest
- 생성 모델과 생성 시각
- status: draft, promotion-ready, promoted, superseded
- 사람 승인자와 승인 시각, 승격 뒤 Obsidian `CanonicalRef`
- v0.1 생성 주체: packet-only direct `openai-codex` one-message adapter
- 입력 경계: redacted immutable packet과 생성 지시만; project cwd/native thread/tool은 없음

T-note 파일은 생성 시점부터 immutable draft다. 수정이 필요하면 원본을 덮어쓰지 않고 새
revision을 만든다. `promotion-ready`는 사람 검토가 끝났다는 뜻일 뿐 Obsidian 정본이
아니다. `promoted`는 Obsidian note의 opaque ID와 provenance가 연결된 뒤에만 표시한다.
실제 Obsidian write/auth/sync는 다음 Epic 전까지 수행하지 않는다.

### ProjectTodo

- 모델이 현재 session에서 실시간으로 무엇을 하는지 보여 주는 `Todo.md` 실행 보드
- 인식 가능한 checkbox item에만 `<!-- www:id=TD-... -->` 안정 마커 부착
- item ID, 내용, 실행 상태, 근거 activity를 원문 범위 projection으로 제공
- 모델 내부 계획이나 Codex goal과 별개
- 문서 전체 parse/re-serialize를 금지하고 WWW가 소유한 checkbox/text 범위만 in-place patch
- session 재개·종료 경계를 명시하고 compare-and-swap revision 검사

`Todo.md`는 현재 실행을 관찰·조작하기 위한 session 체크리스트이며 Linear backlog를
대체하지 않는다. 장기 작업, 우선순위, 담당, 수용 기준, 테스트 시나리오와 판정은
Linear가 소유한다. Todo item과 Linear item은 같다고 간주하지 않으며, 연결이 필요하면
별도 `CanonicalRef`로만 참조한다.

### RpaRun

- v0.1.0 구현 대상이 아닌 후속 domain
- run ID, job, environment, 시작·종료 시각
- step과 attempt
- status와 business review status
- artifact reference
- 오류, retry, 이전 run과의 비교
- redaction policy

### ReviewAssignment

- 검토 대상의 redacted immutable packet만 전송
- source refs는 packet 내부 provenance 문자열이며 외부 CLI가 열 수 있는 filesystem path가 아님
- provider/model
- 역할과 요청 이유
- result
- 재배치 판단

### CanonicalPromotion

```text
immutable T-note draft
  -> source/provenance 확인
  -> redact/classify
  -> schema/link 검증
  -> human accept
  -> promotion-ready
  -> [다음 Epic] Obsidian note 생성/연결
  -> Obsidian opaque ID/provenance 기록
```

앞 단계의 결과가 다음 단계를 자동 승인하지 않는다. Linear 작업이나 GitHub 변경은 이
문서 승격 pipeline에 섞지 않고 각각 자기 정본에서 생성·검토한다.

## Codex에서 나온 정보는 어디에 있는가

사용자가 보는 데이터는 세 층으로 구분한다.

| 보이는 것 | 1차 소유자 | WWW가 하는 일 | 지속성 |
|---|---|---|---|
| 사용자·assistant 대화 | Codex native thread item | event를 받아 Chat projection 구성, source ref 저장 | native session에 지속 |
| tool/command/file-change/approval | Codex native item/event | 종류별 카드·강조·접기 | native 상태 + 로컬 관찰 journal |
| “Working…”, 진행 상태 | streamed notification/item state | 실시간 상태 표시, 필요 시 관찰 envelope 저장 | 일부는 일시적이며 native 최종 기록과 다를 수 있음 |
| T-note | WWW immutable draft | 선택 구간을 요약하고 source refs 부착 | 로컬 draft; 사람 승인·후속 연동 뒤 Obsidian 장기 지식으로 승격 |
| Todo | WWW session 실행 보드 | 모델의 현재 실행 항목과 상태 표시 | 로컬 session 범위; Linear backlog가 아님 |
| RPA 원본 로그·artifact | RPA runner/WWW local store | timeline과 요약 projection | 로컬 전용 |
| Epic/Story/Issue, 수용 기준·테스트·판정 | Linear | opaque ID/provenance 연결 | Linear 정본 |
| 코드/diff/commit/PR/release·기술 증거 | GitHub | opaque ID/SHA와 provenance 연결 | GitHub 정본 |

따라서 화면의 답변 문장과 `Completed ...` 같은 진행 표시는 같은 종류가 아니다. 전자는 native conversation item이고, 후자는 streamed 실행 상태일 수 있다. WWW는 둘을 한 문자열 transcript로 눌러 담지 않고 item type과 provenance를 유지한다.

관찰 journal은 ignored `.www/runtime/activity/*.jsonl`의 append-only JSONL이다. streaming
delta 자체가 아니라 normalized activity와 lifecycle 경계를 project sequence와 함께
append한다. UI는 이 관찰 사본을 재생해 projection을 만들며 native 원문을 대체하지
않는다. tool stdout은 화면에 필요한 상한까지만 journal에 넣고 전체 원본은 ignored
artifact로 분리한다. v0.1.0은 자동 삭제하지 않고 용량과 민감도 경고 및 명시적 purge만
제공한다.

한 프로젝트에는 writer lock 하나만 허용한다. 두 번째 WWW는 read-only로 열거나 종료한다. 같은 native thread를 별도 Codex CLI와 동시에 조작하는 것은 v0.1.0에서 지원하지 않으며, 예상하지 못한 native revision 변화가 확인되면 송신을 멈추고 재동기화를 요구한다.

재시작 시 순서는 다음과 같다.

1. App Server에서 native thread를 resume/read한다.
2. 로컬 observation journal과 대조한다.
3. native 원본이 확인되는 항목을 다시 projection한다.
4. native에서 복구되지 않는 일시 관찰은 “WWW 관찰 기록”으로 표시한다.
5. T-note draft와 session Todo는 WWW 로컬 작업공간에서 복구한다.
6. 연결된 Obsidian·Linear·GitHub 객체는 cache가 아니라 opaque ID를 기준으로 표시한다. v0.1.0은 원격 최신화나 정합 조정을 수행하지 않는다.

## TUI 정보구조

### 기본 화면: 프로젝트 Workbench

```text
+----------------------+----------------------+----------------------+
| Chat                 | T-notes              | Todo.md              |
| native item timeline | immutable drafts     | current execution    |
| cards + highlighting | source backlinks     | session projection   |
+----------------------+----------------------+----------------------+
| composer: native chat input                                         |
+---------------------------------------------------------------------+
| provider / session / worktree / approvals / errors / command key    |
+---------------------------------------------------------------------+
```

- Chat: message, reasoning summary, command, tool, diff, approval, progress를 다른 카드로 렌더링한다.
- T-notes: 현재 선택한 activity를 immutable packet으로 만든 뒤, packet-only direct
  `openai-codex` one-message adapter에서 요약한다. adapter에 project 파일 경로, native
  thread, file/shell/MCP tool을 주지 않고 `toolChoice: "none"`을 강제한다. 기존 App
  Server detached-thread 방안은 builtin command tool 격리 실패로 채택하지 않는다.
- Todo: 현재 session에서 모델이 수행 중인 일을 실시간 실행 보드로 보여 준다. Codex의 내부 plan을 그대로 덮어쓰거나 Linear backlog를 흉내 내지 않는다.
- Source inspector: 선택한 카드의 native source ref, raw/normalized 차이, 파생 문서를 확인한다.
- 하이라이팅: 저장 데이터를 수정하지 않는 semantic renderer다.
- approval: composer를 가리지 않는 modal/queue로 표시하며 native approval ID와 응답을 그대로 연결한다.

v0.1.0은 세 pane Workbench와 source inspector를 먼저 완결한다. source 선택은
`/source <activity-id|latest|clear>`, T-note 생성은 `/tnote`로 명시하며 session 재개는
opaque native thread ID를 `www --resume <thread-id>`로 전달한다. 본사 route나 별도
command-palette 전환은 v0.1.0 수용 조건으로 주장하지 않는다.

- Workbench — Chat / T-notes / Todo
- Source — 선택 activity의 근거 검사
- Sessions — native session 선택·재개
- future: RPA — 실제 runner가 정해진 뒤의 run review

Workbench 자체 slash command는 TUI가 처리하지만, 알 수 없는 leading slash/skill input은
native Chat으로 전달한다. 설치된 App Server가 native skill input을 제공하면 adapter가
그 protocol item으로 변환하고, 제공하지 않으면 ordinary text로 전달하면서 unsupported
상태를 명시한다. `/dashboard`와 범용 `/monitor`는 본사 TUI 단계로 미룬다.

### 후속 RPA 화면

이 화면과 collector는 v0.1.0에서 구현하지 않는다. 실제 고객 runner의 이름과 실행 OS를 먼저 확정한 뒤 다음 release의 조건부 track으로 착수한다.

```text
+--------------------+-------------------------+----------------------+
| Runs               | Selected run timeline   | Evidence & Review    |
| status / duration  | step / retry / error    | artifacts / diff     |
| environment        | structured events       | pending / accepted   |
+--------------------+-------------------------+----------------------+
```

runner와 무관하게 유지할 최소 event vocabulary:

- `run.started`, `run.completed`
- `step.started`, `step.completed`
- `artifact.created`
- `error.raised`
- `retry.scheduled`
- `review.requested`, `review.completed`

첫 contract는 UTF-8 JSONL spool을 사용한다. 한 event는 `schemaVersion`, `eventId`, `runId`, nullable `stepId`, `attempt`, UTC `occurredAt`, `emittedAt`, `kind`, `payload`를 갖고 run별 파일에 append한다. WWW는 schemaVersion을 모르면 수집을 중단하고 원본을 보존한다.

첫 collector는 실제 고객 RPA runner 한 종류에 맞춘다. Robot Framework를 이미 쓴다면 Listener interface v3 adapter가 자연스럽다. 그렇지 않으면 같은 event contract를 내보내는 작은 emitter를 만든다. 모니터링만을 위해 RPA framework 자체를 바꾸지 않는다. [Robot Framework Listener interface](https://robotframework.org/robotframework/latest/RobotFrameworkUserGuide.html#listener-interface)

OpenTelemetry의 trace/log conventions는 장래 exporter 경계로만 참고한다. v0.1.0에 collector backend 전체를 들이지 않는다. [OpenTelemetry signals](https://opentelemetry.io/docs/concepts/signals/), [semantic conventions](https://opentelemetry.io/docs/specs/semconv/general/)

## Obsidian·Linear·GitHub 정본 설계

### 책임 분리

| 시스템 | 소유하는 정본 | WWW의 v0.1.0 역할 | WWW가 하지 않는 일 |
|---|---|---|---|
| Obsidian | 아이디어, 정리된 내용, 장기 지식, 승격된 T-note, 결정 문서 | immutable T-note draft와 승격 후보를 만들고 opaque note ref/provenance 계약을 보존 | vault를 `.www` 안에 복제하거나 자동 write/sync하지 않음 |
| Linear | Epic/Story/Issue, 상태·우선순위·담당, 수용 기준·테스트 시나리오·판정 | 관련 activity와 work item의 opaque ref/provenance를 연결할 데이터 계약 정의 | `Todo.md`를 backlog로 승격하거나 원격 상태를 대신 소유하지 않음 |
| GitHub | 코드, diff, commit, PR, release, 기술 증거 | Git/native activity와 commit·PR·release opaque ref/SHA의 provenance를 연결 | 자동 commit, push, PR 또는 release를 하지 않음 |
| WWW local | native 관찰 journal, 화면 projection, immutable draft, session `Todo.md`, link/cache | 세 정본 사이를 탐색하는 workbench 제공 | 네 번째 정본이 되거나 remote 본문을 권위 있게 복제하지 않음 |

정본 경계는 파일 형식이 아니라 업무 책임으로 나눈다. Obsidian note가 GitHub repository에
백업되더라도 장기 지식으로서의 소유자는 Obsidian이고, GitHub PR에 수용 기준이 인용돼도
계획과 판정의 소유자는 Linear다. WWW는 중복된 내용을 보고 어느 쪽이 최신인지 추측하지
않고 명시적인 source ref와 revision만 표시한다.

### 로컬 작업공간

```text
<project>/.www/
├── project.json                 # project와 선택적 canonical system 식별자
├── sessions/                    # native 관찰 journal
├── drafts/t-notes/              # immutable T-note revisions; Obsidian 승격 전
├── todos/<session-id>/Todo.md   # 현재 session 실행 보드; Linear backlog가 아님
├── links/                       # CanonicalRef + provenance envelope
├── cache/                       # 재생성 가능한 표시용 metadata
├── rpa/raw/                     # 원본 실행 데이터
├── artifacts/                   # 이미지·영상·대용량 결과
└── runtime/                     # lock/socket/process state
```

이 디렉터리는 local workbench이며 canonical vault가 아니다. 기본적으로 Git 추적 대상에
올리지 않는다. v0.1.0은 기존 `.www/vault`를 새 정본으로 만들거나 Obsidian vault 위치를
강제하지 않는다. 사용자의 기존 Obsidian·Linear·GitHub 구조는 각 시스템이 소유한다.

### 참조와 승격 계약

- 모든 cross-system link는 provider가 발급했거나 해당 provider adapter가 보존하는 opaque ID를 사용한다.
- 사람이 읽는 Linear 번호, Obsidian 파일 경로, Git branch 이름만으로 identity를 재구성하지 않는다.
- `ProjectActivity`는 source와 파생 대상의 `CanonicalRef`, 연결 시각·주체, 선택적 revision과 digest를 기록한다.
- cache의 제목·상태·URL은 편의를 위한 projection이며 정본 판정에 사용하지 않는다.
- T-note는 immutable local draft다. 사람 검토 후에도 Obsidian 객체가 생성·확인되고 그 opaque ref가 연결되기 전까지 `promotion-ready`일 뿐이다.
- `Todo.md` item은 Linear item이 아니다. 현재 실행에서 장기 작업을 발견해도 v0.1.0은 자동 이관하지 않고 향후 Linear 연동 후보 link만 남긴다.
- 코드와 기술 증거는 GitHub commit SHA, node ID, PR/release ID 등 provider identity로 연결한다. local dirty diff는 아직 GitHub 정본이 아니다.

### v0.1.0 이후 integration Epic

실제 API sync는 본체 안정성이 확인된 뒤 별도 Epic으로 수행한다. 그 Epic은 최소한 다음을
독립적으로 설계·검증해야 한다.

1. Obsidian과 Linear 각각의 인증·권한·revocation
2. create/read/update의 idempotency와 retry 후 `uncertain` 복구
3. webhook/polling 및 offline 상태에서 cache freshness 표시
4. 양방향 편집의 revision 비교, 충돌 탐지, human reconciliation
5. 삭제·이동·merge된 remote object의 tombstone과 link repair
6. redaction, 고객 데이터, audit trail과 최소 권한

v0.1.0의 수용 조건에 remote create/update 성공을 넣지 않는다. 이 release는 native Chat,
3-pane T-note/Todo 경험과 local 안정성, 그리고 향후 adapter가 지킬 역할·데이터 계약을
검증한다.

### 보안

- `.gitignore`는 편의 장치이지 보안 경계가 아니다.
- commit 전 **명시적으로 선택한 코드·기술 증거 경로만** stage 후보로 만들고 secret, 고객 식별자, 금지 확장자, 대용량 artifact를 검사한다.
- 원 artifact를 문서에 넣지 않고 local reference, 요약, digest만 기록한다.
- GitHub 공개 여부와 repository visibility를 WWW가 추측하지 않는다.
- 자동 push를 하지 않는다.

GitHub 역시 비밀정보를 repository에 넣지 말 것을 명시한다. [GitHub 파일 생성 주의사항](https://docs.github.com/en/repositories/working-with-files/managing-files/creating-new-files)

### 외부 provider 송신 경계

- 외부 review에는 filesystem source ref나 project path를 주지 않고 필요한 발췌만 담은 immutable packet을 보낸다.
- packet은 사용자 정책 파일과 deterministic scanner로 `secret`, `customer-restricted`, credential pattern, 금지 식별자를 deny-by-default 검사한다. 차단 결과는 모델이 해제할 수 없다.
- Claude/Gemini review에는 승인된 packet만 전달하고 file, shell, MCP, network-fetch tool을
  주지 않는다. 모델 API 통신은 별도 provider transport다.
- 사용자는 provider, model, 전송될 정확한 byte 수와 preview를 확인하고 송신을 승인한다.
- 결과에는 packet digest, provider/model, 시작·종료 시각을 남긴다.

“읽기 전용”은 쓰기 금지만 뜻하며 유출 방지가 아니다. 위 송신 경계까지 통과해야 review를 실행한다.

WWW는 `woo-commit`을 자동 실행하지 않는다. “Commit 준비”는 GitHub 정본 후보인 코드와
기술 증거의 정확한 목록과 diff만 제시한다. 사용자가 native Codex에서 `woo-commit`을
명시적으로 호출한 뒤, 그 스킬이 다시 승인을 받아 해당 경로만 stage/commit한다.
`git add -A`, push, PR은 이 handoff 계약에 포함되지 않는다. Obsidian 지식이나 Linear
계획을 Git commit으로 대신 확정하지 않는다.

## 여러 모델과 handoff

v0.1.0에서 “여러 모델 지원”은 하나의 공통 runtime으로 섞는다는 뜻이 아니다.

### Codex

- interactive chat의 기본 실행기
- App Server native thread를 유지
- native approval과 skill을 그대로 사용
- T-note는 Chat과 분리된 packet-only direct `openai-codex` one-message adapter가 생성하며
  active Chat thread에는 기록하지 않음

### Claude Opus

- Codex 산출물에 대한 반대 provider 읽기 전용 review
- immutable review packet을 fresh `pi-ai` one-message context에 전달
- context에 file/shell/MCP tool 또는 project cwd를 주지 않고 `toolChoice: "none"`을 강제
- 판정과 근거를 WWW draft로 회수

provider API transport는 packet-only review boundary의 유일한 network 경로다. 실제 외부
호출 성공은 이 설계 문서가 주장하지 않으며, 독립 검토는 Claude Opus 읽기 전용 패스로
별도 수행한다.

### Gemini

- 독립 대조나 다른 관점의 조사
- immutable packet을 같은 no-tools one-message adapter로 전달
- v0.1.0에서는 interactive Chat provider가 아님

Gemini도 project filesystem을 탐색하거나 WWW에 쓰지 않는다.

### handoff packet

- 목적과 역할
- packet 내부 provenance ID와 선택한 최소 발췌
- worktree SHA와 dirty 상태
- 분류·redaction 결과와 사용자 송신 승인
- tool/쓰기 범위: 없음
- 기대 output schema
- 결과의 provider/model/version

구독료나 선호 모델이 바뀌어도 Obsidian으로 승격한 장기 지식, Linear의 계획·판정,
GitHub의 코드·기술 증거와 이를 잇는 project activity schema는 유지된다. native 대화
원문이나 session `Todo.md`의 영구 보존까지 보장한다는 뜻은 아니다.

## Windows

Windows판은 다른 제품은 아니지만 별도 검증 표면이다.

- core/domain은 OS와 terminal을 모르게 한다.
- path, process, PTY, signal, file locking을 adapter 뒤에 둔다.
- shell 문자열 대신 argument array로 subprocess를 실행한다.
- LF/CRLF, case-insensitive path, rename/lock 동작을 테스트한다.
- PowerShell과 Windows Terminal에서 key input, resize, 색상, Unicode를 smoke-test한다.
- 고객 RPA가 Windows에서 돈다면 collector와 artifact path를 Windows에서 먼저 검증한다.

현재 의존성 `@gajae-code/natives`는 `win32-x64` optional binary를 선언하지만, 선언은 WWW의 동작 보장이 아니다. Windows CI와 실제 terminal smoke evidence가 release gate여야 한다.

## v0.1.0 범위

### 포함

1. Codex App Server adapter: start/resume, streamed items, approval, cancel
2. Chat/T-notes/Todo 세 패널과 source inspector
3. 화면용 `ProjectActivity` journal과 provenance
4. T-note 선택 범위 생성, immutable draft, 사람 검토와 `promotion-ready` 상태
5. 현재 session `Todo.md` 실행 보드와 resume 시 복구
6. Obsidian·Linear·GitHub 역할 및 `CanonicalRef`/provenance 데이터 계약
7. Claude Opus 읽기 전용 review assignment
8. Gemini 읽기 전용 cross-check assignment
9. 외부 provider 송신 분류·preview·격리 실행
10. macOS 실사용 검증과 Windows core CI/smoke gate

### 제외

- 본사 TUI와 프로젝트 집계
- 범용 `/dashboard`, `/monitor`
- 실제 RPA collector와 RPA 화면
- 여러 RPA framework의 plugin 생태계
- SQLite/검색엔진/원격 telemetry backend
- 자동 모델 라우팅과 자율 재배치 loop
- 자체 agent runtime
- 자동 Git commit/push/PR
- cloud sync와 계정 서버
- Obsidian/Linear API sync, 인증, remote write와 conflict reconciliation

## 현재 코드와 목표의 차이

| 영역 | 현재 | v0.1.0 목표 | 처리 |
|---|---|---|---|
| 모델 실행 | Codex App Server native Chat adapter | native Chat execution 유지 | 실제 macOS 수용 시나리오 반복은 남음 |
| provider | native harness + packet-only T-note generator + bounded review adapter | 공통 runtime 확대 없음 | Claude/Gemini live network review는 주장하지 않음 |
| TUI | pi-tui 3-pane Workbench, source inspector, action result renderer | 세 projection | PTY stream/resume 및 local command UI 도달성 수집됨 |
| command routing | command queue가 local commands를 직렬화, unknown slash는 native로 전달 | native slash/skill은 adapter 소유 | rapid-send·terminal lifecycle·slash reachability 확인 |
| Todo | local `Todo.md`, `/todo` command surface | 현재 session 실행 보드/range patch/CAS | Linear backlog가 아니며 remote 연동은 다음 Epic |
| T-notes | source-linked packet-only draft/provenance | immutable draft와 promotion-ready | Obsidian 승격 API는 다음 Epic; App Server detached sandbox는 실패·불채택 |
| monitoring | coding session/Todo 중심 | v0.1에서는 확대하지 않음 | 실제 runner 확정 뒤 RPA track |
| canonical refs | human-gated promotion preview와 provenance | Obsidian·Linear·GitHub 역할/opaque ref 계약 | 실제 sync/auth/conflict 조정은 다음 Epic |
| 테스트 | Story별 focused/core/UI/hardening, 최신 전체 `272 pass`/`1343 assertions` | cross-platform acceptance | Windows Terminal·release operator evidence 및 최종 Opus re-review 남음 |

초기 `bun test` 220개 통과는 implementation 전 baseline이었다. 2026-09-01 최신 직접
검증은 `272 pass`, `0 fail`, `1343 expect() calls`, `47 files` 및 `bun run check` PASS다.
현재 결론은 테스트 숫자만이 아니라 Story evidence와 실제 probe가 함께 소유한다. ST-011-06~12는 PASS이며, ST-011-09는 안전한
replacement의 실제 production smoke를 포함한다. ST-011-13은 Windows Terminal 및
operator evidence가 없어 BLOCKED다.

`package.json`과 changelog는 `0.1.0` release 후보로 갱신됐다. 다만 tag, install/update/
rollback operator 실행, macOS 전체 E2E, Windows Terminal smoke가 아직 없으므로 이를
배포 완료나 release 승인으로 해석하지 않는다.

## 구현 순서

### 구현에서 확인된 경계

2026-09-01 설치된 `codex-cli 0.151.0` 표면으로 App Server native Chat adapter를
구현했다. 실제 probe는 initialize, stream, thread start/resume, approval decline 및
turn interrupt를 관찰했다. 연결 중단 뒤 쓰기 요청은 자동 재전송하지 않고
`uncertain/manual-reconcile`로 남긴다.

T-note에 사용하려던 App Server detached thread는 `runtimeWorkspaceRoots`/read-only
sandbox 설정에도 builtin `commandExecution`이 project 밖 sentinel을 읽어 실패했다.
이 실패를 fake transport나 설정 문자열로 덮지 않았다. production은
`PiDetachedCodexGenerator`의 direct one-message, no-tools, packet-only 경계로 바꿨고
실제 openai-codex smoke에서 redacted draft 저장을 확인했다.

Todo, local promotion preview, review adapter, release 문서/CI/gate도 구현됐다. 아직 남은
것은 기능을 넓히는 일이 아니라 실제 사용자·운영 환경의 release 수용 증거다.

구현된 local workflow가 단지 service에 머물지 않도록 `/tnote range`, `/todo …`,
`/promote tnote` → `/promote confirm`, `/review preview …` → `/review send`를 TUI slash
parser에서 `ProjectWorkbench` command queue로 연결했다. 결과는 immutable `actionResult`로
되돌아와 Source pane에 full diff, review body/provenance, CAS `currentSource`와 pending
patch를 표시한다. 관련 focused/core/UI/hardening 증거는 각 Story의 curated evidence가
소유하며, 이 구현 사실은 사람 수락이나 최종 Opus re-review PASS를 뜻하지 않는다.

현재 `/promote tnote` 명칭은 local draft 검토·preview 흐름을 가리킨다. v0.1.0에서는
Obsidian remote write를 수행하거나 정본 승격 완료를 뜻하지 않으며, 결과 상태는
`promotion-ready`로 해석한다. command rename과 실제 Obsidian adapter는 다음 integration
Epic에서 migration compatibility와 함께 다룬다.

### 후속 RPA 조건부 track

- 실제 고객 runner 이름과 실행 OS를 먼저 결정
- JSONL event contract fixture와 replay test
- runner가 실제로 도는 OS에서 collector/run review 수용 시나리오
- run success와 human review 상태 분리
- accepted run summary의 해당 정본(Obsidian 지식/Linear 판정/GitHub 증거) 연결

## v0.1.0 수용 시나리오

v0.1.0 core는 한 end-to-end 시나리오로 증명한다. RPA는 runner가 확정된 후 그 runner의 실제 OS에서 별도 시나리오로 증명한다.

1. 사용자가 Git project root에서 `www`를 실행한다.
2. 기존 Codex thread를 고르거나 새 thread를 시작한다.
3. composer에서 turn을 보내고 message/tool/progress를 종류별로 본다.
4. tool approval을 native ID와 함께 승인·거절하고, 별도 turn을 cancel해 terminal 상태를 확인한다.
5. `/source` 등 Workbench command와 알 수 없는 leading slash의 native 전달을 구분해 확인한다.
6. 특정 activity 범위를 선택해 redacted immutable packet만 받는 no-tools direct
   `openai-codex` T-note draft를 만든다. Chat의 native thread나 project 파일은 입력으로
   전달하지 않는다.
7. 출처를 확인하고 사람 승인 후 T-note를 `promotion-ready`로 표시하되 Obsidian 정본으로 가장하지 않는다.
8. `Todo.md`에서 모델의 현재 실행 상태가 실시간으로 보이고, Linear backlog·수용 기준·테스트 판정을 복제하지 않는지 확인한다.
9. fixture로 만든 Obsidian·Linear·GitHub opaque ref가 `ProjectActivity`에 provenance와 함께 연결되고 표시 cache를 정본으로 오인하지 않는지 확인한다.
10. 전송 preview를 승인한 packet만 Claude Opus 또는 Gemini에 보내고 격리·무도구 실행 및 provenance를 확인한다.
11. Git diff에 코드·기술 증거 후보만 포함되고 raw/draft/artifact가 stage 후보에서 배제됐는지 확인한다.
12. 사용자가 native Codex에서 `woo-commit`을 명시 호출해 선택 경로만 로컬 commit하고, WWW가 push하지 않았는지 확인한다.
13. 재실행 후 native thread, journal, immutable T-note draft, session Todo, canonical refs가 각각 올바른 로컬 소스에서 복구되는지 확인한다.

## 출시 게이트

- native thread resume 후 item 누락·중복이 없음
- approval 의미가 Codex native 동작과 일치함
- snapshot/subscribe 경합에서 sequence 누락이 없고 overflow는 resync로 드러남
- renderer를 꺼도 source payload/ref를 확인할 수 있음
- 모델 생성 draft가 자동으로 tracked/committed되지 않음
- T-note revision이 immutable이고 승인 전·후의 draft를 덮어쓰지 않음
- Todo의 비정형 Markdown을 round-trip에서 보존하며 session 실행 보드로만 동작함
- Todo가 Linear backlog, 수용 기준, 테스트 시나리오·판정을 소유한다고 표시하지 않음
- Obsidian·Linear·GitHub opaque ref와 provenance가 보존되고 표시 cache가 stale일 수 있음을 드러냄
- v0.1.0이 Obsidian/Linear remote write, sync, auth, conflict reconciliation 성공을 주장하지 않음
- staged secret/customer-data 검사가 실패를 막음
- 외부 provider 송신 payload도 같은 분류 검사를 통과하고 사람이 preview를 승인함
- Claude/Gemini review adapter가 project cwd와 tool 없이 packet-only no-tools context를 만듦
- T-note generator가 redacted packet 외 project path/native thread/tool을 받지 않고
  `toolChoice: "none"`을 강제함
- App Server detached T-note는 실제 builtin tool 격리 실패 때문에 release 경로가 아님
- macOS 실제 시나리오와 Windows smoke evidence가 있음
- 변경 파일에서 placeholder, skipped/only test, 미구현 분기가 없음

## 나중의 본사 TUI

프로젝트 앱이 안정된 뒤 `00_project`에서 실행하는 본사 TUI를 만든다.

본사는 각 프로젝트의 raw transcript나 고객 artifact를 직접 읽지 않는다. 각 프로젝트가 명시적으로 내보낸 redacted `ProjectSummary`만 수집한다.

```text
HQ TUI
  -> project registry
  -> sanitized ProjectSummary
  -> project 선택
  -> 해당 root에서 ProjectWorkbench open
```

“본사에서 프로젝트를 선택한다”는 것은 별도 복제 화면을 여는 것이 아니라 그 프로젝트 root에서 `www`를 실행한 것과 같은 `ProjectWorkbench`를 여는 의미다.

## 최종 판정

가장 합리적인 구성은 다음 조합이다.

- **제품 형태:** 독립 로컬 CLI/TUI 앱
- **기본 실행:** Codex App Server
- **UI:** 현재 pi-tui 자산을 재사용한 3-pane workbench
- **가공:** provenance를 보존하는 `ProjectActivity`와 projection
- **기억:** immutable T-note draft와 현재 session `Todo.md`; 장기 지식은 Obsidian
- **RPA:** 실제 runner 확정 뒤 JSONL contract와 전용 review route를 추가하는 후속 track
- **여러 모델:** native session과 읽기 전용 handoff adapter
- **정본:** Obsidian 장기 지식·결정 / Linear 계획·수용·테스트 판정 / GitHub 코드·기술 증거
- **방법론:** WES와 개인 skill을 복제하지 않고 호출·표시

이 경계를 지키면 WWW가 네 번째 정본으로 비대해지지 않는다. 모델 구독이 바뀌어도
Obsidian의 장기 지식, Linear의 계획과 판정, GitHub의 코드와 기술 증거는 각 소유
시스템에 남고, Codex의 native 기능이 발전해도 WWW가 그것을 다시 따라 만드는 비용을
줄일 수 있다. Obsidian·Linear의 실제 연동은 본체 안정화 뒤 별도 Epic에서 천천히 붙인다.
