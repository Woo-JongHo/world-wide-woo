# Artifact Control Contract

Linear Issue·Project Activity, Obsidian, GitHub Issue와 GitHub PR은 하나의 제어 흐름을 사용한다.

```text
Candidate → Validate → Render → Authorize → Apply → Read-back → Woo Receipt
```

## 정본과 경계

- 구조화된 Candidate가 입력 정본이다. Markdown은 `artifact:control render`가 만드는 결정적 투영이다.
- Candidate 승인은 `candidateDigest` 한 값에만 결박된다. 승인 뒤 내용이나 `expectedBefore`가 달라지면 새 Candidate와 승인이 필요하다.
- `validate`와 `render`는 외부 상태를 바꾸지 않는다. Apply는 표면별 게시 스킬이 소유한다.
- Apply 뒤 대상의 ID, URL, 본문 bytes와 관계를 재조회한다. 재조회가 불가능하거나 다르면 `uncertain`으로 끝낸다.
- Receipt status는 `schemas/woo-receipt.schema.json`의 `succeeded | failed | blocked | canceled | uncertain`만 사용한다.

## Skill 구조

```text
[Skills] WOO-747
├─ [Linear] WOO-894
│  ├─ 01 Candidate 작성 WOO-901
│  ├─ 02 제목·번호·계층 검증 WOO-897
│  └─ 03 승인 게시·재조회 WOO-902
├─ [Obsidian] WOO-892
│  ├─ 01 상세 정본 Candidate 작성 WOO-898
│  ├─ 02 경로·identity·링크·digest 검증 WOO-899
│  └─ 03 승인 게시·재조회 WOO-896
├─ [GitHub] WOO-893
│  ├─ 01 Issue 등록·재조회 WOO-903
│  ├─ 02 Commit 실행 WOO-844
│  ├─ 03 PR 생성·수정 WOO-900
│  └─ 04 PR·Linear 재조회 WOO-904
├─ [Traceability] WOO-895
│  └─ 기존 연결 운영 WOO-749
└─ [RPA] WOO-888
   └─ 기존 01~07
```

## Candidate

공통 필드는 `schemaVersion`, `candidateId`, `kind`, `sourceRevision`, `intent`, `target`, `content`, `links`, `expectedBefore`, `validation`, `candidateDigest`다. Shape는 `schemas/artifact-candidate.schema.json`, 의미 검증과 렌더링은 `src/core/domain/development/artifact-control.ts`가 소유한다.

Project Activity Comment는 `linear-project-comment` Candidate schema `1.1`로 변경·영향·분류·검증·연결을 렌더한다. `expectedBefore.latestCommentId`는 게시 직전 Project Comment 목록의 마지막 ID와 같아야 한다. 기능 릴리스 Update는 `linear-project-update` Candidate로 직전 Update 뒤 Comment ID를 본문 `작업 Comment`에도 남기고 실제 연결을 수집한다. `expectedBefore.latestUpdateId`는 게시 직전 최신 Update ID와 같아야 한다. Comment와 Update 모두 `target.projectId`와 이 직전 identity를 고정해 승인 뒤 대상이 바뀌면 재작성한다. schema `1.0` Comment는 이미 게시된 기록의 검증·렌더 호환에만 사용한다.

RPA 고객 업무 Description은 [RPA Description 계약 v1](RPA_DESCRIPTION_CONTRACT.md)의 고정 프로필을 사용한다. Project는 `kind: linear-project`, Task는 `kind: linear-issue`의 `rpa-task-v1` 프로필이며, 구조화된 map에서 Description 본문을 생성한다. 이 경로는 CLI Candidate 검증·렌더와 게시 스킬에 적용되며 TUI의 자동 외부 실행 기능을 추가하지 않는다.

```bash
bun run artifact:control -- validate --candidate <candidate.json>
bun run artifact:control -- validate --candidate <candidate.json> --actual-before <readback.json>
bun run artifact:control -- render --candidate <candidate.json>
```

`--out`은 새 파일만 생성하며 기존 파일 덮어쓰기를 거부한다. 외부 Apply 권한으로 해석하지 않는다.

## Receipt 판정

| 상황 | status | stage |
| --- | --- | --- |
| Apply와 read-back 일치 | `succeeded` | `verify` |
| 실행된 검증 실패 | `failed` | 실패 단계 |
| 권한·입력·선행 결정 부족 | `blocked` | 중단 단계 |
| 사용자가 실행을 중단 | `canceled` | `authorize` |
| Apply 응답 또는 read-back 불확실 | `uncertain` | `verify` |

과거 RPA 표현은 `PASS → succeeded`, `PARTIAL → uncertain`, `BLOCKED → blocked`로 읽는다. 새 Receipt에는 과거 표현을 쓰지 않는다.
