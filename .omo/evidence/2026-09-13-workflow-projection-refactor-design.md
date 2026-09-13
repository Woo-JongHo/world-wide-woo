# Workflow projection 리팩터링 설계

- 날짜: 2026-09-13
- 대상: `src/core/domain/work/workflow-projection.ts` (1,039행)
- 성격: 읽기 전용 설계 패스. 제품 코드와 테스트는 수정하지 않았다.
- 제약: `core/domain`은 같은 `core/domain`만 참조하며 `core/application`, `core/ports`, `core/runtime`, `core/commit`, `adapters`를 참조하지 않는다.

## 판정

첫 추출은 Native Plan revision의 **감지·해석·검증·상태 정규화**를 하나의 깊은 module로 옮기는 것이다.

- 새 경로: `src/core/domain/work/native-plan-revision.ts`
- 외부에 유지할 interface: `projectWorkFlow`, `projectWorkFlowFromExecutionRun`, 기존 projection type과 `DplanIdentityCollisionError`
- 새 내부 interface: `readNativePlanRevision(activity)` 한 함수와 그 반환 union
- 공개 호환: 기존 `workflow-projection.ts`가 이동한 `WorkStepStatus`를 type re-export하고, parser 오류와 source mismatch를 합쳐 기존 `RevisionValidationCode` union을 그대로 선언한다. `work/index.ts`는 바꾸지 않는다.
- 의존 방향: `workflow-projection.ts -> native-plan-revision.ts -> ../execution/project-activity.ts`
- 첫 추출에서 건드릴 파일: 새 module과 `workflow-projection.ts` 두 개뿐이다. 기존 테스트와 `work/index.ts`, runtime/application/adapters 소비자는 건드리지 않는다.

이 선택은 Native Markdown과 structured Plan의 여러 형식, 수량 제한, 상태 언어, fail-closed 규칙 약 170행을 작은 판별 interface 뒤에 숨긴다. 호출자는 provider envelope의 형태를 알 필요가 없고, dplan 해시·identity reconciliation·activity association은 현재 module에 남아 의미 변경 위험을 피한다.

## 현재 공개 interface와 소비자

`workflow-projection.ts`는 현재 다음 공개 symbol을 소유한다.

- 입력과 결과: `PlanProjectionInput`, `PendingGoalProjectionInput`, `WorkFlowProjectionInput`, `WorkFlowProjection`
- 상태와 화면 계약: `WorkStepStatus`, `WorkStepNarration`, `SemanticWorkStep`
- Plan identity와 추적: `Sha256Hex`, `PlanRevisionRef`, `DerivedPlanIdentity`, `NativePlanSource`, `PlanAssociation`, `PlanRetirement`, `PlanOrphan`, `PlanReconciliation`
- 거부 계약: `PlanOrphanReason`, `JournalIntegrityCode`, `RevisionValidationCode`, `PlanRejection`
- 해시와 오류: `DplanHash`, `DplanIdentityCollisionError`
- 실행 함수: `projectWorkFlow`, `projectWorkFlowFromExecutionRun`

소비 경로는 두 종류다.

1. canonical entry인 `src/core/domain/work/index.ts`가 `export * from "./workflow-projection.js"`로 모두 재노출한다. application, tests, 다수 TUI가 이 경로를 쓴다.
2. `src/core/runtime/execution-run.ts`, `src/core/domain/work/performance.ts`, `src/adapters/inbound/tui/features/trace/workbench-tracer-view.ts`, `test/workflow-projection.test.ts`는 `workflow-projection`을 직접 참조한다.

따라서 첫 추출은 파일 경로나 기존 symbol의 export 위치를 끊어서는 안 된다. `WorkStepStatus`를 새 module로 옮겨도 기존 두 경로 모두에서 계속 import 가능해야 하고, `RevisionValidationCode`의 세 literal은 기존 facade에서 그대로 보여야 한다.

## 현재 module의 책임 지도

### U1. Native Plan revision reader — 첫 추출

현재 함수와 상태:

- `token` (222–228): NFKC, 개행, 바깥 공백, 연속 공백을 canonical identity text로 정규화한다.
- `isParseablePlanEnvelope` (815–817): revision key 충돌 검사 전에 malformed Plan을 제외한다.
- `isPlanRevision` (818–823): `turn/plan/updated`, `turn/plan/public-fallback`, completed `plan` item을 구분한다.
- `RawPlanEntry`, `rawPlanEntries` (824–893): structured plan과 completed Markdown plan을 읽는다.
- `nativePlainNumberedPlanBlock` (895–922): 명시 상태가 없는 2–12개 연속 top-level 번호 목록을 Native Plan으로 읽고 첫 항목만 running으로 둔다.
- `markdownPlanEntry`, `markdownPlanTitle` (924–938): prefix/suffix bracket와 dash status, bold title을 읽는다.
- `planValidationError` (939–949): 항목당 4,096 code point와 blank canonical token을 거부한다.
- `parsePlan` (950–968): 현재는 위 문법 결과에 공개 redaction과 token digest까지 결합한다.
- `markdownPlanStatus` (969–982): 한국어/영어 explicit Markdown status를 엄격히 매핑한다.
- `planStatus` (1019–1028): structured plan의 알려진 status를 매핑하고 나머지는 pending으로 둔다.
- type `WorkStepStatus` (16–21). `RevisionValidationCode` (77–80)는 facade에 남기되 reader가 소유하는 두 parsing code를 조합한다.

상태 규칙:

- `turn/plan/updated`와 `turn/plan/public-fallback`은 `params.plan` array여야 하며 최대 256개다.
- structured entry의 `step`은 모두 string이어야 한다. status가 알려지지 않으면 pending이다.
- completed plan item은 `item.type`을 대소문자 없이 `plan`으로 인식하고 `item.text`가 string이어야 한다.
- numbered H2–H6은 1부터 연속이어야 한다. 존재하면 다른 본문 형식보다 우선한다.
- plain numbered block은 2–12개, 1부터 연속, top-level이어야 한다. heading 뒤 설명 bullet은 단계가 아니다.
- explicit Markdown 항목은 numbered 또는 top-level bullet이어야 하며 status 표기가 필수다. numbered 항목 바로 아래의 공백 들여쓰기 bullet만 상세로 무시한다.
- completed Markdown의 unknown status, 비연속 번호, 애매한 nested bullet, 257번째 항목, 비문자 text는 fail closed다.
- structured empty plan은 유효한 빈 revision이고 completed Markdown empty plan은 `blank_entry`다. 이 차이를 보존해야 한다.
- malformed revision은 journal의 `duplicate_revision_key` 후보에 등록하지 않는다. revision validation이 우선한다.
- identity는 공개 redaction 전의 canonical text를 쓴다. 공개 title의 redaction 결과, status, position은 identity 증거가 아니다.

연결 테스트:

- `test/work-flow.test.ts:43`: completed Markdown 변형과 한/영 status.
- `test/work-flow.test.ts:80`: bullet/numbered 문서 순서.
- `test/work-flow.test.ts:103`, `:115`, `:136`: plain numbered 2–12 수용, top-level 수용, 1/불연속/13 거부.
- `test/work-flow.test.ts:146`, `:161`, `:180`: nested detail 규칙과 malformed fail-closed.
- `test/work-flow.test.ts:369`: malformed revision이 revision-key collision layer에 들어가지 않음.
- `test/work-flow.test.ts:479`: redacted title/status/position은 identity 증거가 아니고 NFKC token은 동일 identity로 유지됨.
- `test/native-plan-wiring.test.ts:306`, `:379`, `:439`, `:594`: 실제 App Server completed Plan item의 heading/list/top-level 형태와 root turn authority.

### U2. dplan identity와 revision reconciliation

현재 함수와 상태:

- `frame`, `decimal`, `digest`, `revision` (174–220): dplan-v1 길이 framing, 숫자 검증, thread/revision digest.
- `Entry`, `State` (228–250): canonical entry, stable identity, 현재 revision, reconciliation evidence, association history, collision seed.
- `reconcile` (600–765): exact unique, isolated single edit, mint, retirement, association orphan 전환.
- `collisionTitles`, `count`, `lev`, `isEditLike` (766–776, 983–1013): 공개 title collision 차단과 제한 Levenshtein 판정.
- `DplanIdentityCollisionError` (168–173), `seeds` map, revision ordinal.

상태 규칙:

- exact token은 old/new 양쪽에서 unique이고 공개 title collision이 없을 때만 identity를 보존한다.
- unmatched old/new가 각각 정확히 하나일 때만 최대 8자이자 20% 이하 edit를 `isolated_edit`로 보존한다.
- 삭제, duplicate ambiguity, edit ambiguity, replacement는 retirement를 만들고 기존 association을 동일 reason의 orphan으로 정확히 한 번 옮긴다.
- 새 identity는 thread digest, source revision key, token digest, revision ordinal, source position으로 mint한다.
- 동일 full digest가 다른 canonical seed를 가리키면 즉시 `DplanIdentityCollisionError`를 던진다.
- status와 source position은 기존 identity 보존 근거가 아니다.

연결 테스트:

- `test/work-flow.test.ts:201`, `:213`, `:232`: insert/delete/reorder, duplicate/redaction collapse, isolated edit/replacement.
- `test/work-flow.test.ts:378`: replay 결정성과 injected digest collision.
- `test/work-flow.test.ts:389`, `:419`, `:436`: retirement가 action/observation association을 orphan으로 전환하는 규칙.
- `test/work-flow.test.ts:479`: 공개 label/status/position 배제와 NFKC canonical identity.

후속 module 후보는 `src/core/domain/work/dplan-reconciliation.ts`다. 현재 9개 인자와 외부 mutable array를 그대로 export하면 shallow interface가 되므로 그대로 함수 이동하지 않는다. 후속 설계에서는 한 reducer interface가 previous state와 revision event를 받아 `{ states, retirements, orphans, collisionSeeds }`를 값으로 반환해야 한다. U1을 먼저 끝낸 뒤 `Entry`가 새 reader의 canonical entry를 소비하도록 정리한 다음 진행한다.

### U3. journal integrity와 selected-turn window

현재 함수와 상태:

- `validateJournal` (550–598): global sequence prefix, activity ID/sequence/source digest/revision key 무결성.
- `isTurnStart` (1015–1018), `projectWorkFlow`의 start/end/goal 구간 선택 (274–293).
- pending-goal 분기 (265–273).

상태 규칙:

- journal은 sequence 1부터 gap 없이 진행해야 하고 duplicate id/sequence와 invalid `sha256:` digest에서 첫 오류 직전 prefix만 수용한다.
- parseable Plan revision만 duplicate revision key 집합에 들어간다.
- selected turn start는 expected thread와 selected turn을 모두 만족해야 한다.
- selected interval은 같은 expected thread의 다른 turn start에서 끝난다. foreign thread start와 같은-turn lifecycle marker는 경계를 닫지 않는다.
- goal은 selected start 이전의 같은 thread outbound message 중 turn이 없거나 selected turn인 마지막 값이다.
- pending-goal은 같은 thread의 마지막 outbound message만 공개 goal로 투영한다.

연결 테스트:

- `test/work-flow.test.ts:346`: integrity prefix와 foreign revision/source mismatch 우선순위.
- `test/work-flow.test.ts:493`, `:511`, `:519`, `:539`, `:565`: goal 선택, thread 일치, foreign message 배제, sanitization, interval 경계.
- `test/project-workbench*.test.ts`의 pending-goal 경로는 application에서 선택 turn이 없을 때 이 분기를 간접 검증한다.

후속 module 후보는 `src/core/domain/work/workflow-journal-window.ts`다. 이 module은 U1의 `readNativePlanRevision`에 한 방향으로 의존하고, dplan revision key 생성은 U2에서 제공하는 순수 identity 함수에 의존해야 한다. U1/U2 전에 추출하면 parser와 digest helper를 역참조해 cycle을 만들 가능성이 높다.

### U4. activity association reducer와 final workflow 조립

현재 함수와 상태:

- `projectWorkFlow`의 interval loop (309–440): revision 적용, invalid barrier, source mismatch, 단일 running step association, public fallback backfill.
- `emitOrphan` closure와 `State.association`의 actions/observations/sources.
- final `SemanticWorkStep`/`WorkFlowProjection` 조립 (441–529).
- `isPublicPlanRevision` (531–533).

상태 규칙:

- control activity는 association과 orphan 대상이 아니다.
- Plan 이전 activity는 `pre_plan`, invalid Plan 뒤 다음 valid Plan 전 activity는 `invalid_revision`이다.
- expected thread/selected turn이 다르면 `source_mismatch`다.
- current revision에 running 항목이 정확히 하나일 때만 action/observation을 연결한다.
- revision이 바뀔 때 기존 open association interval의 endSequence를 새 revision sequence로 닫는다.
- 첫 revision 또는 public fallback은 source activity와 revision 사이의 기존 활동을 단일 running target에 backfill할 수 있다. `public-user-request` missing plan은 단계가 하나뿐이면 그 단계를 target으로 허용한다.
- 최종 count/summary/current step은 현재 revision의 step만으로 계산한다. current는 running 우선, 없으면 pending이다.
- source authority는 마지막 revision이 public fallback이면 `public-plan-document`, 아니면 `native-checklist`다.

연결 테스트:

- `test/work-flow.test.ts:250`, `:269`, `:315`: pre-plan/ambiguous running orphan, revision interval, equal-status interval.
- `test/work-flow.test.ts:346`: source mismatch.
- `test/work-flow.test.ts:389`, `:419`, `:436`: association retirement 전환.
- `test/native-plan-wiring.test.ts:117`, `:216`, `:306`, `:379`, `:439`: public fallback authority와 earlier activity backfill.
- `test/workbench-views.test.ts`, `test/workbench-tracer-view.test.ts`, `test/workspace-todo-view.test.ts`: final projection shape 소비.

이 책임은 현재 `projectWorkFlow`의 핵심 deep implementation이므로 첫 추출 대상으로 삼지 않는다. parser와 reconciliation을 먼저 낮은 의존 leaf로 만든 뒤 reducer의 입력 상태가 안정된 다음 분리한다.

### U5. 공개 narration projection

현재 함수와 상태:

- `FALLBACK_NARRATION` (8–13), `narration` (777–787), `technicalNarration` (805–813).
- `activitySummary` (788–804), `publicText` (1035–1039), local `record`.
- 입력 summary는 association의 마지막 action/observation 최대 8개에서 만든다.

상태 규칙:

- narrator 값이 없으면 Plan title을 `what`으로 쓰고 source를 `plan`으로 둔다.
- inline command, command/args/path label, shell command, path/file name, CLI option이 narration에 나타나면 고정 fallback으로 치환한다.
- tool arguments/command/tool name도 bounded redaction을 거쳐 공개 input summary가 된다.
- 사용자 goal과 step title도 terminal control/secret/path/customer identifier redaction과 1,200 code-point bound를 공유한다.

연결 테스트:

- `test/work-step-card-highlight.test.ts:282`: model narration의 what/why 유지.
- `test/work-step-card-highlight.test.ts:403`: semantic fallback 유지.
- `test/work-step-card-highlight.test.ts:421`: inline command와 filename-only narrator text 거부.
- `test/project-workbench.test.ts:1113`: narrator input summary가 private path를 노출하지 않음.
- `test/work-flow.test.ts:539`: goal 공개 redaction.

후속 module 후보는 `src/core/domain/work/work-step-narration.ts`다. `WorkStepNarration`을 이 module로 옮기고 기존 facade에서 type re-export할 수 있다. 다만 `publicText`는 goal/title에도 쓰이므로 narration 전용 module에 숨기면 소유가 어긋난다. 공개 text projection을 별도 module로 만들기보다 `work-step-narration.ts`가 redaction 함수를 직접 사용하고, workflow의 goal/title도 기존 domain redaction/terminal 함수를 직접 사용하는 편이 cycle과 얕은 utility module을 피한다.

### U6. ExecutionRun compatibility facade

현재 `projectWorkFlowFromExecutionRun` (540–548)은 `ExecutionRunState.activities` 또는 명시적 global journal을 `projectWorkFlow`에 넘기는 호환 adapter다. 이것은 projection 규칙을 소유하지 않는 얕은 pass-through지만 직접 경로 소비자와 테스트가 있으므로 첫 추출에서 없애거나 이동하지 않는다.

- 연결 테스트: `test/workflow-projection.test.ts:7`.
- 호환 원칙: 함수명, 기본 narrations/input/journalActivities, empty projection 동등성을 유지한다.
- 추후 정리는 공개 deprecation 기간 또는 모든 직접 소비자 전환과 함께 별도 작업으로 한다.

## 첫 추출의 새 module interface

```ts
// src/core/domain/work/native-plan-revision.ts
import type { ProjectActivity } from "../execution/project-activity.js";

export type WorkStepStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type NativePlanRevisionValidationCode =
  | "non_string_entry"
  | "blank_entry";

export interface NativePlanRevisionEntry {
  /** NFKC/whitespace canonical text used for identity hashing. Never redacted. */
  readonly identityText: string;
  /** Original parsed step text. The facade applies bounded public redaction. */
  readonly sourceTitle: string;
  readonly status: WorkStepStatus;
}

export type NativePlanRevisionRead =
  | { readonly kind: "not-plan-revision" }
  | {
      readonly kind: "invalid-plan-revision";
      readonly code: NativePlanRevisionValidationCode;
    }
  | {
      readonly kind: "valid-plan-revision";
      readonly entries: readonly NativePlanRevisionEntry[];
    };

/** Recognizes and fail-closed decodes one provider activity without hashing or presentation. */
export function readNativePlanRevision(
  activity: ProjectActivity,
): NativePlanRevisionRead;
```

이 interface는 세 가지 caller 질문을 한 번에 답한다: Plan인가, 유효한가, 어떤 canonical 단계인가. 별도의 `isPlanRevision` → `validate` → `parse` 호출 순서를 공개하지 않아 ordering constraint를 없앤다. 해시 구현, thread/turn 선택, public redaction, reconciliation state는 interface 밖에 남긴다.

reader는 문법 오류인 `non_string_entry | blank_entry`만 소유한다. `source_turn_mismatch`는 selected-turn reducer의 규칙이므로 기존 facade가 아래처럼 public union을 합성한다.

```ts
export type RevisionValidationCode =
  | "source_turn_mismatch"
  | NativePlanRevisionValidationCode;
```

## `workflow-projection.ts` 적용 방식

상단은 새 reader와 type을 import하고 기존 경로에서 type을 다시 export한다.

```ts
import {
  readNativePlanRevision,
  type NativePlanRevisionValidationCode,
  type WorkStepStatus,
} from "./native-plan-revision.js";

export type {
  WorkStepStatus,
} from "./native-plan-revision.js";

export type RevisionValidationCode =
  | "source_turn_mismatch"
  | NativePlanRevisionValidationCode;
```

main interval loop는 activity마다 reader 결과를 얻는다.

- `not-plan-revision`: 기존 `classifyWorkActivity` association 흐름으로 보낸다.
- 나머지 두 kind 모두 먼저 expected thread/turn을 검사한다. 불일치하면 parsing 결과보다 `source_turn_mismatch`를 우선하는 현재 규칙을 유지한다.
- refs가 일치하는 `invalid-plan-revision`: 기존 revision rejection을 추가하고 `invalid = true`로 둔다.
- refs가 일치하는 `valid-plan-revision`: reader entry를 현재 internal `Entry`로 바꾼다.

internal `Entry` 변환은 facade가 소유한다.

```ts
const entries: Entry[] = read.entries.map(entry => ({
  raw: entry.identityText,
  title: publicText(entry.sourceTitle),
  status: entry.status,
  tokenDigest: digest(input.hash, entry.identityText),
}));
```

이 배치가 중요한 이유는 identity가 redaction된 display title로 오염되지 않고, reader가 `DplanHash`나 review/terminal projection에 의존하지 않기 때문이다.

`validateJournal`도 같은 reader를 사용하되 `valid-plan-revision`만 revision key set에 등록한다. 이로써 `test/work-flow.test.ts:369`의 malformed revision precedence가 유지된다.

## cycle과 계층 위험

허용할 그래프:

```text
core/domain/work/workflow-projection.ts
  ├── core/domain/work/native-plan-revision.ts
  │     └── core/domain/execution/project-activity.ts (type only)
  ├── core/domain/work/activity-classification.ts
  ├── core/domain/execution/project-activity.ts
  ├── core/domain/execution/execution-run-contract.ts (type only)
  ├── core/domain/execution/terminal.ts
  └── core/domain/review/redaction.ts
```

금지할 그래프와 이유:

- `native-plan-revision.ts -> workflow-projection.ts`: type-only import여도 source graph cycle이 된다. `WorkStepStatus`와 parser 전용 `NativePlanRevisionValidationCode`를 새 module에 정의하고, facade가 public type을 re-export/합성해야 한다.
- `native-plan-revision.ts -> work/index.ts`: barrel이 다시 `workflow-projection.ts`를 export하므로 즉시 cycle이 된다.
- `native-plan-revision.ts -> core/runtime/*`: `LAYERS.md`와 architecture test가 금지한다.
- `native-plan-revision.ts -> core/application/*`, `core/ports/*`, `adapters/*`: Core Domain 의존 규칙 위반이다.
- `native-plan-revision.ts -> redaction.ts` 또는 `terminal.ts`: 계층상 허용되지만 parsing과 presentation을 다시 결합한다. 첫 추출의 locality를 깨므로 두지 않는다.
- `work/index.ts`에서 새 module과 facade를 둘 다 `export *`: 동일 type 이름 중복/ambiguous export 위험과 내부 seam의 불필요한 공개가 생긴다. index는 facade만 export한다.

현재 `test/architecture.test.ts`는 Core Domain이 application/ports/runtime/commit을 참조하지 않는지, 상대 source cycle이 없는지, Work canonical entry가 adapters/runtime implementation으로 이어지지 않는지 검사한다. 첫 추출 후 이 세 gate를 반드시 다시 통과시킨다.

## 공개 export 호환 방식

호환 기준은 import source와 runtime/type symbol을 모두 유지하는 것이다.

- `src/core/domain/work/workflow-projection.ts`는 기존 runtime 함수/class와 모든 기존 type 이름을 계속 export한다.
- 이동한 `WorkStepStatus`는 facade의 `export type { ... }`로 재노출하고, `RevisionValidationCode`는 facade에서 parsing code와 `source_turn_mismatch`의 union으로 계속 선언한다.
- `src/core/domain/work/index.ts`는 현재 `export * from "./workflow-projection.js"`를 유지한다.
- `native-plan-revision.ts`는 `work/index.ts`에서 직접 export하지 않는다. 첫 추출의 seam은 workflow implementation 내부다.
- `projectWorkFlow`의 인자 순서, optional defaults, empty result 문구, object shape를 바꾸지 않는다.
- `projectWorkFlowFromExecutionRun`의 direct path와 default `journalActivities = run.activities`를 바꾸지 않는다.
- `DplanIdentityCollisionError`의 class identity와 error name/message를 바꾸지 않는다.

## 병렬 구현 안전성

첫 추출은 다른 TUI/application/runtime 작업과 병렬 실행하기에 안전한 최소 변경이다.

- 소유 파일: `src/core/domain/work/native-plan-revision.ts`, `src/core/domain/work/workflow-projection.ts`.
- 읽기만 할 검증 파일: `test/work-flow.test.ts`, `test/workflow-projection.test.ts`, `test/architecture.test.ts`, 필요한 Native wiring test.
- 수정하지 않을 공유 파일: `src/core/domain/work/index.ts`, application/runtime/adapters, package/tsconfig, control ledger.
- 데이터 migration, persistent schema, external provider contract 변경이 없다.
- 모든 해시 framing/revision/reconciliation 코드는 원위치에 둔다.
- 기존 테스트를 helper-level 테스트로 복제하지 않는다. public `projectWorkFlow` interface를 통한 행동 검증을 유지한다.

동시에 다른 agent가 `workflow-projection.ts` 자체를 추출하는 작업은 안전하지 않다. U2–U5는 모두 같은 monolith를 편집하므로 첫 추출이 통합된 뒤 순서대로 진행하거나 별도 branch에서 재base해야 한다. 병렬 가능한 작업은 이 파일을 건드리지 않는 TUI/application/runtime 작업 또는 후속 테스트 시나리오 설계뿐이다.

## 구현 순서

1. `native-plan-revision.ts`에 type, discriminated union, reader를 만든다.
2. 현재 parser helper를 동작 변경 없이 이동한다. local `record`는 새 module 안에 둔다.
3. `workflow-projection.ts`에서 이동한 type을 import/re-export한다.
4. `validateJournal`의 `isPlanRevision && isParseablePlanEnvelope`를 reader의 `valid-plan-revision` 판정으로 교체한다.
5. main interval loop의 `isPlanRevision/parsePlan`을 reader union 처리와 `Entry` materialization으로 교체한다.
6. 기존 parser helper와 중복 type을 원본에서 삭제한다.
7. 변경 파일에서 TODO, `test.skip`, `test.only`, 미구현 분기를 검색한다.
8. 아래 gate를 실행한다.

## 수락과 검증

필수 gate:

```text
bun run check
bun test test/work-flow.test.ts test/workflow-projection.test.ts
bun test test/architecture.test.ts
```

Native completed Plan의 실제 배선까지 확인할 때:

```text
bun test test/native-plan-wiring.test.ts
```

수락 조건:

- 현재 관련 기준 43개 테스트 결과와 동일하게 green이다.
- `projectWorkFlow`의 공개 object가 fixture별 deep equality에서 변하지 않는다.
- structured empty Plan과 Markdown blank Plan의 차이가 유지된다.
- malformed Plan이 duplicate revision key로 잘못 거부되지 않는다.
- NFKC identity, 공개 redaction collapse, isolated edit, injected collision 결과가 변하지 않는다.
- architecture test의 Core Domain 의존 gate와 relative cycle gate가 green이다.
- 기존 `workflow-projection` 및 `work/index` import가 TypeScript check에서 모두 유지된다.

## 기준 실행 증거

변경 전 다음 명령을 실행했다.

```text
bun test test/work-flow.test.ts test/workflow-projection.test.ts test/architecture.test.ts
```

결과: 43 pass, 0 fail, 1,446 assertions. architecture의 relative source cycle 검사도 green이었다.

분석 당시 `workflow-projection.ts`, `work/index.ts`, `test/work-flow.test.ts`, `test/workflow-projection.test.ts`에는 Git diff가 없었다. 저장소 전체에는 별도의 TUI/runtime 관련 기존 변경이 많으므로 구현자는 이 두 소유 파일 밖의 변경을 되돌리거나 포맷하지 않아야 한다.
