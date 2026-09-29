# 2026-09-29 Linear 기록 현황 감사

> **후속 처리 완료:** 아래는 게시 전 감사 스냅샷이다. 미확정 73건은 과거 Project Comment로 게시하고 전체 read-back을 확인했다. 현재 결과는 [기록 회수 보고서](2026-09-29-linear-recording-backfill.md)를 참조한다. Issue·Update 후보는 별도 범위다.

## 범위와 기준

- `.www/evidence`의 `rg --files .www/evidence` 출력 859경로를 조사했다. 명령은 기본 rg ignore 규칙을 따르며, 무시 경로까지 포함한 pathlib 진단치 1,058개는 공식 집계에 쓰지 않았다. 원본 경로 목록은 `evidence-file-list.txt`다.
- JSON `kind=linear-*` 객체를 기준으로 후보/기록을 대조했다: Project Comment 103, Issue 15, Project Update 3, 총 121개. 처음 파일명에 `candidate`가 있는 경로만 셌을 때 빠진 4건(`woo-907/908/909.json`, `update-0.0.17.json`)을 추가했다.
- Linear 프로젝트 UUID `5639ee1c-a6cd-44cf-9ed6-82ee9c5fc3db`의 전체 댓글 33건, Update 6건과 WWW 이슈 145건을 대조했다. 각 페이지 `hasNextPage=false`. 원본 live 스냅샷은 `live-comments.json`, `live-updates.json`, `live-issue-identities.json`.
- Comment 판정은 receipt ID, exact preview body, live body 속 Evidence 경로를 우선했다. 여러 후보가 한 통합 Comment에 연결되면 간접/통합 기록으로 분리했다. receipt가 없는 후보도 자동으로 미게시 처리하지 않았다.

## Project Comment 현황

| 분류 | 수 | 해석 |
|---|---:|---|
| Renderer 본문과 Comment receipt ID가 live 일치 | 17 | 직접 게시 확인 |
| Renderer 본문이 live 일치, Comment receipt 없음 | 2 | 직접 게시 확인, 로컬 receipt 연결 불완전 |
| 다른 후보 Comment의 Evidence 경로와 일치 | 11 | 통합/간접 기록 확인 |
| Renderer 본문·Evidence 경로 미일치 | 73 | 현재 live에서 후보와 연결되는 기록을 찾지 못함. 과거 통합/다른 문구 기록 가능성을 배제하지 않아 미게시 의심/상태 미확정으로 둠 |

전체 103개 Comment Candidate 본문을 `renderArtifactCandidate`로 만들어 대조했다. 73건은 live comments 전수(33건, `hasNextPage=false`)에 렌더 본문/후보 Evidence 경로가 없고, Comment용 receipt도 연결되지 않았다. 따라서 “현재 live에서 근거를 못 찾음”까지가 판정이며 완전한 미게시 확정은 아니다. Issue receipt를 Comment receipt로 잘못 센 CLI Readability와 Workbench Visual Polish 두 건은 Comment 게시 근거에서 제외해 미확정 73건에 남겼다.

로컬 기록에서 `prepared-not-published` 또는 `published=false`가 명시된 대표 후보는 WOO-911의 `2026-09-24-readability-import-columns`, `2026-09-24-readability-import-declarations`, `2026-09-24-woo-code-readability-maintain`, `2026-09-24-woo-commit-message-contract`; 신규 이슈·위치 확인 대기 경계가 있는 `2026-09-21-gmbkorea-dashboard`, `2026-09-27-wes-recording-orchestration`, `2026-09-28-raw-verify-sidebar`다. 이들은 live에서 이후 통합 기록이 잡히지 않아 **로컬 미게시 명시 + 현재 live 연결 없음**으로 우선 확인할 항목이다. Comment 상시 권한은 유지되지만, 신규 Issue/Obsidian 기록은 각각의 승인 경계가 별도다.

73개 전체 후보별 경로·렌더 일치·증거 링크·receipt kind·recording decision은 `live-reconciliation.json`에서 확인한다. 외부 쓰기는 수행하지 않았다.

## Issue와 Update 후보

- Issue 후보 15건. 기존 issue identity가 연결된 후보 5건, 후보 제목과 일치하는 live issue가 있는 경우 6건, 현재 제목 identity가 없는 새 이슈 후보 4건으로 분리했다. 제목 일치는 본문/상태 전체 동등성 판정이 아니다.
- `WOO-907/908/909`와 `woo-907-entry-dashboard` 목적 문장은 live description에 포함되고 현재 상태/부모도 기존 기대와 일치한다: WOO-907 In Progress/WOO-676, WOO-908 Todo/WOO-674, WOO-909 Todo/WOO-679. 신규 issue가 필요한 증거가 아니라 목적/상태 확인 및 별도 receipt 완전성 검토 대상이다.
- Commit Message Contract, GMBKOREA Dashboard, WES, RAW Verify 신규 이슈 후보는 동일 제목이 없다. recording decision과 issue position/Obsidian 경계를 같이 확인해야 한다.
- Project Update 3건은 6개 live update와 receipt/evidence 경로를 대조했다. 자세한 행은 `live-reconciliation.json`에 있다.

## 없는 Linear candidate 폴더

candidate JSON이 없는 관련 폴더는 11개다. 초기 Linear 상태 스냅샷·드래프트/역사적 receipt(`2026-09-06-*`, `2026-09-08-*`, `v020-traceability`), 기존 후보에 딸린 rendered output(`2026-09-22-*/rendered`), RPA readback/verification evidence로 나뉜다. 특히 RPA readback/receipt가 있다는 이유만으로 Project Comment 기록 여부를 단정하지 않았다. 각 경로는 `local-inventory.json`의 `foldersWithoutLinearCandidate`에 있다.

## 수집 예외

- JSON 파싱 오류는 Linear candidate로 식별된 파일에서 발견되지 않았다. 초기 탐색기의 Markdown `obsidian-recording-decision.md`를 JSON으로 열려던 오판은 오류 집계에서 제거했다.
- 별도 진단에서 발견된 benchmark 로그의 다중 JSON(`benchmark-clean.json`, `benchmark-audited.json`)은 Linear 후보 문서가 아니므로 후보 파싱 오류/미게시 근거로 세지 않는다.
- `live-reconciliation.json`의 상태명은 증거 분류다. live에서 보이지 않는다는 사실과 Candidate 작성만으로 Linear 게시/미게시를 단정하지 않고 receipt 및 recording decision과 함께 읽어야 한다.

## 조회 자료 위치

수집 JSON·조회 스냅샷은 `.www/scratchpad/2026-09-29-linear-recording-audit/`에 보관했다. 사용자의 현황 우선 확인 요청에 따른 읽기 감사이며, 이번에는 미게시 후보의 외부 게시·이슈 생성·기존 이슈 변경을 수행하지 않았다.
