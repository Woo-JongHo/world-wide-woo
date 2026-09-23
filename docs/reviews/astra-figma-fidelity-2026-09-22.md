# Astra Context·Workflow Figma 보정 결과

`dev` / `a953dc8aae13573f1c92772efe747008a31940a4`, 연결 이슈 `WOO-913`. 커밋 없이 검토 대기 상태다. 작업 전에 존재한 `.www/workbench.yaml` 변경은 건드리지 않았다.

기준은 [Figma Context 50:967](https://www.figma.com/design/Q7kGUdqiaQRJI8CZlPMRX7?node-id=50-967)의 `get_design_context` 코드와 원본 이미지다. 픽셀 기반 구성을 터미널의 셀·패널·색 역할로 옮겼다.

## 변경

- Context 상단에 7 KPI, 9 source+free의 multicolor stacked spectrometer를 배치했다. 하단에는 composition bars, 8-turn change graph, diagnostics와 dependency/top items/alerts를 두 열로 구성했다. Skills/MCP/Storage rail을 함께 표시한다.
- Demo 화면에 `DEMO DATA · synthetic fixtures · not live telemetry`를 명시한다. byte source 분해는 presentation fixture이고, 합성 모드는 shell의 명시적인 Demo 상태만 활성화한다. Live snapshot의 이름이나 안내 문자열로 활성화되지 않는다.
- Live의 source allocation·item size·change alert 미관측 의미는 유지한다. MCP/Skills 개수는 전체 Context 점유율과 연결하지 않는다. 합성 MB 합계는 40/48 MB, free는 8 MB이며 token KPI와 HUD는 1.23M/1.5M을 사용한다. MB와 token은 서로 다른 단위다.
- Workflow 상단 여백을 줄이고 7-stage pipeline과 역할별 상태·모델·작업을 나란히 표시한다. Rail에 단계와 agent 상태를 추가했다. `active`는 running만 집계하며 pending은 별도 상태로 표시한다.
- Gruvbox의 orange heading, cream foreground, olive success, teal information, pink secondary와 dark bordered panels를 적용했다. cream 역할을 추가하되 기존 흰색 본문 계약을 보존했다.
- Provider 바의 16셀 compact 크기를 유지하고 내부 14셀만 비율 계산에 사용한다. `[  42% 6h 33m  ]`에서 provider 색은 반올림한 6셀을 채운다.

## 검증

| 항목 | 결과 |
|---|---|
| 구현 전 public render + shell 테스트 | 기존 구현에서 5건 실패 확인 |
| Workflow public render | 별도 최초 실패 후 구현 |
| Context 첫 viewport | 160×36, 200×36 workspace에서 전체 카탈로그 식별 |
| Workflow 첫 viewport | 160×35 workspace에서 7단계와 agent 상태 비교 |
| 실제 shell `/demo` | 160×48에서 7개 화면·R/E·Esc·Live 복귀 검증 |
| 좁은 Context | 40·60·80열 폭 경계 및 scroll 내용 유지 |
| `bun run check` | 통과 |
| 관련 테스트 및 architecture | 98 pass / 0 fail |
| 전체 `bun test` | 1,393 pass / 0 fail, 159개 파일 |
| `git diff --check` | 통과 |
| 변경 파일 TODO/skip/only 조사 | 신규 미완성 표식 없음. 기존 `"TODO"` 패널 제목 1건은 정상 UI 문자열 |

아래 이미지는 실제 public `AstraWorkspace` render seam의 ANSI 출력을 셀 단위로 그린 검토용 이미지다. 데스크톱 터미널의 스크린샷은 아니며, shell 조작은 별도 통합 테스트로 검증했다.

- [Context 160×36](../../.www/evidence/astra-figma-fidelity-2026-09-22/context.png)
- [Workflow 160×36](../../.www/evidence/astra-figma-fidelity-2026-09-22/workflow.png)
- [구현 및 테스트 전체 diff](../../.www/evidence/astra-figma-fidelity-2026-09-22/implementation.diff)
- [검증 Receipt 및 파일 digest](../../.www/evidence/astra-figma-fidelity-2026-09-22/receipt.json)
- [구현 전 실패 로그](../../.www/evidence/astra-figma-fidelity-2026-09-22/red.log), [관련 테스트](../../.www/evidence/astra-figma-fidelity-2026-09-22/related.log), [전체 테스트](../../.www/evidence/astra-figma-fidelity-2026-09-22/full-test.log)

## 독립 검토와 제한

Context·Workflow를 저작하지 않은 Codex가 읽기 전용으로 검토했다. 복원된 승인 시트와 남은 scroll 때문에 Live 검증이 화면에 도달하지 못한 테스트 문제, pending agent의 active 집계 문제를 수정하고 재검토했다. [검토 전문](../../.www/scratchpad/astra-fidelity/independent-context-workflow-review.md).

Claude Sonnet 5의 읽기 전용 교차 검토를 시도했으나 OAuth 만료로 실행되지 않았다. 반대 provider 검증과 Fable 최종 감사는 완료로 주장하지 않는다. 지정된 `linear-woo` 도구가 이 세션에 없어 Linear 연결을 재검증하거나 이슈를 갱신하지 않았다.

첫 viewport 검증은 위 높이 기준이다. 더 짧거나 좁은 터미널에서는 스크롤로 나머지 내용을 확인한다. 사람의 최종 시각 수락은 이 diff와 이미지 검토 뒤에 남아 있다.

## 작업 기록 판정

종료 훅의 기록 요구에 따라 기존 [WOO-913 게시 Receipt](../../.www/evidence/2026-09-22-astra-figma-readiness/linear-issue-receipt.json)에서 이슈 UUID와 프로젝트 결속을 확인했다. 새 이슈는 필요하지 않다.

[Project Comment Candidate](../../.www/evidence/astra-figma-fidelity-2026-09-22/project-comment-candidate.json)와 [렌더 본문](../../.www/evidence/astra-figma-fidelity-2026-09-22/project-comment.md)을 준비해 `artifact:control validate`와 `render`를 통과했다. Candidate digest는 `7ea1d903e872c6654fb5522d11ab0a01803da21cdfe2a36517f245a5a0a7bb82`다.

이 통과는 로컬 구조·내용 검증이다. `expectedBefore.latestCommentId`는 기존 게시 Receipt의 마지막 확인 ID이며 현재 최신이라는 의미가 아니다. 지정 Linear 도구가 없는 상태에서 최신 Activity·중복 여부를 확인하거나 게시 승인·외부 쓰기를 수행하지 않았다. 게시 전 현재 대상 조회 후 필요하면 Candidate를 갱신하고 그 digest에 대한 승인을 받아야 한다.

새 Obsidian Candidate는 필요하지 않다고 판정했다. [게시된 Demo 정본 후보](../../.www/evidence/2026-09-22-astra-demo-mvp/obsidian-canonical-candidate.json)의 `DEC-WORKBENCH-002/003/004`와 [게시 Receipt](../../.www/evidence/2026-09-22-astra-demo-mvp/obsidian-publish-receipt.json)가 Native 관측 의미·synthetic-only presentation·R/E·Esc 복귀를 이미 소유하며, 이번 변경은 그 경계 안의 시각 보정이다. [기록 판정 JSON](../../.www/evidence/astra-figma-fidelity-2026-09-22/recording-decision.json)에 근거와 게시 전 미결 항목을 남겼다.
