# Artifact Control Contract

Linear, Obsidian, GitHub Issue와 GitHub PR은 하나의 제어 흐름을 사용한다.

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
