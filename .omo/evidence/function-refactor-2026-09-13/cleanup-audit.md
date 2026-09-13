# 임시 파일 정리 감사

기준: 2026-09-13, `/Users/jonghoPro/woo/00_project/99_www`, branch `astra/terminal-ui`.
이 감사는 읽기 전용으로 수행했다. 확인 시점에 현재 worktree에는 코드 변경 11개와 미추적 `.omo/evidence/function-refactor-2026-09-13/`가 있다. 이 작업 중 파일은 건드리거나 삭제하지 않는다. 본 문서만 그 evidence 디렉터리에 추가한다.

## 삭제 후보

| 경로 | 크기 | 상태·중복 확인 | 판단 |
|---|---:|---|---|
| `.omo/evidence/astra-dashboard-recap-final-qa/plain-www-after-ctrl-d-screen.txt` | 0 B | ignored evidence 안의 빈 캡처 파일. 같은 디렉터리에 다른 QA 로그가 있음 | 내용 없는 캡처 후보. 증거 기록 형식/생성 절차가 이 빈 파일을 요구하지 않는지 확인한 뒤 삭제 가능. evidence 파일이므로 자동 삭제는 보류. |
| `.scratch-issue-5.md` | 497 B | ignored scratch. Step 라벨 제거는 `CHANGELOG.md`에 완료로 기록되고 회귀 테스트도 존재 | 완료된 이슈 초안 중복 후보. GitHub 원문 또는 이 초안의 보존 필요 여부만 확인하면 삭제 후보. |
| `.scratch-issue-6.md` | 522 B | ignored scratch. T-notes 완료 기록/실시간 상태 분리는 `CHANGELOG.md`에 완료로 기록 | 완료된 이슈 초안 중복 후보. 원문 보존 필요 여부 확인 후 삭제 후보. |
| `.scratch-issue-7.md` | 524 B | ignored scratch. 첫 메시지 접수 피드백은 `CHANGELOG.md`에 완료로 기록 | 완료된 이슈 초안 중복 후보. 원문 보존 필요 여부 확인 후 삭제 후보. |
| `.scratch-issue-4.md` | 514 B | ignored scratch. Dashboard/Monitor 분리 테스트와 `docs/WWW_OBSERVABILITY_VIEW_ARCHITECTURE.md`가 있음 | 내용이 구현/문서와 대부분 겹치는 초안 후보. 외부 이슈 원문 보존 필요 여부 확인 후 삭제 후보. |
| `.scratch-issue-approval-pause.md` | 881 B | ignored scratch. 원격 실행 인계 문서의 #9 계약 및 승인 큐 테스트와 겹침 | 실행 인계 문서가 상세 원문을 대체하는지 확인한 뒤 삭제 후보. |
| `.scratch-issue-multiple-workbenches.md` | 1,111 B | ignored scratch. 원격 실행 인계 문서의 #10 계약 및 lease 테스트와 겹침 | 실행 인계 문서가 상세 원문을 대체하는지 확인한 뒤 삭제 후보. |
| `.scratch-issue-native-delegation.md` | 1,031 B | ignored scratch. 원격 실행 인계 문서의 #8 계약 및 native delegation 코드/테스트와 겹침 | 실행 인계 문서가 상세 원문을 대체하는지 확인한 뒤 삭제 후보. |

위 7개 이슈 파일은 전체 `.scratch-*` 중 5,080 B다. 이름/내용상 임시 초안이며 저장소 내에서 파일명 직접 참조는 찾지 못했다. 다만 초안이 원격 이슈 본문의 유일한 사본일 수 있으므로, 원격 이슈 상태/본문을 대조하지 않은 상태에서 안전 삭제로 단정하지 않는다.

## 보존 권고

| 경로 | 크기 | 이유 |
|---|---:|---|
| `.scratch-issue-1.md` | 570 B | Todo 세부 단계 및 Chat 설명 요구. 완료/중복 근거를 찾지 못해 현 상태로는 삭제 안전성이 불명확. |
| `.scratch-issue-2.md` | 783 B | WES Context Composer 요구. `PLAN.md` Phase 4 및 원격 실행 인계 문서에 후속 작업으로 남아 있어 유효한 계획 입력. |
| `.scratch-claude-plugin-native-boundary-opus-review-20260901.md` | 1,168 B | 날짜가 붙은 독립 리뷰 산출물로, 단순 임시 출력인지 유일한 감사 기록인지 확인되지 않음. 보존 권고. |
| `.www/scratchpad/` | 500 files, 9,823,648 B | 사용자 메모와 리뷰/작업 자료가 섞여 있음. 중복으로 보이는 항목도 개별 목적을 확인하지 않고 삭제하지 말 것. |
| `.www/evidence/` | 472 files, 8,317,347 B | 테스트/QA 기록. 유효 evidence 보존. |
| `.omo/evidence/` | 89 files, 1,075,004 B | 작업별 검증 증거. 위의 0 B 캡처 외에는 일괄 정리 대상 아님. `function-refactor-2026-09-13/`은 진행 중이므로 변경/삭제 금지. |
| `.www/receipts/`, `.www/runtime/`, `.www/sessions/`, `.www/vault/`, `.www/drafts/`, `.www/todos/` | 각각 38 / 194 / 37 / 47 / 1 / 83 files | 실행 상태, credential/receipt, 세션·사용자 기록으로 간주해 보존. `.www/drafts/`는 4.4 MB 단일 파일이며 내용을 열거나 정리하지 않음. |
| `.gjc/`, `.claude/`, `.git/`, `node_modules/`, `dist/` | 미상/제외 | SDK·호스트 상태와 저장소/빌드 산출물. 이번 정리에서 검사·삭제하지 않음. |

## 범위와 한계

- `.gitignore`는 `.scratch-*`, `*.tmp`, 로그 일부 및 `.www`의 상태 디렉터리를 무시한다. 따라서 ignored라는 사실만으로 폐기 가능성을 뜻하지 않는다.
- 저장소 바깥의 GitHub 이슈 상태/본문은 확인하지 않았다. 이슈 초안 삭제 전 원격 본문과 대조해야 한다.
- 0 B 캡처는 유일한 빈 일반 파일로 확인됐지만 evidence 경로에 있으므로 owner 확인 전 보존한다.
- `.www` 사용자 노트·상태와 기존 유효 evidence는 중복/오래됨을 추정해도 삭제하지 않는 것이 안전하다.

## 최종 삭제 실행

Root가 GitHub #1, #2, #4~#10을 재조회했다. 모두 CLOSED이고 위 이슈 초안 9개 본문이 원격 본문과 trim 이후 정확히 일치했다. 해당 중복 초안과 실패한 0바이트 캡처를 삭제했다. 빈 캡처는 직전 QA에서 실패 산출물로 확인되어 PASS 근거가 아니었다. Opus 리뷰 원문, 사용자 세션/메모, receipts는 유지했다.

```json
[
  {
    "path": ".scratch-issue-1.md",
    "bytes": 570,
    "sha256": "b6bced785ba326aa4f6986985096b767a2d372f5221ccdb964f954785573b646"
  },
  {
    "path": ".scratch-issue-2.md",
    "bytes": 783,
    "sha256": "d68e1b67bfa72be6c9aa119c2e7b7377683f99072995751730064d3d0151244a"
  },
  {
    "path": ".scratch-issue-4.md",
    "bytes": 514,
    "sha256": "d54a4bc411f909f1f26514b0681a594658be98fd6409cc95d6ed9758ae7bd0b5"
  },
  {
    "path": ".scratch-issue-5.md",
    "bytes": 497,
    "sha256": "e4a3e234ec5d0f2f62ade42470115b0465f1e432d1a87124087ed0860dd5f9f0"
  },
  {
    "path": ".scratch-issue-6.md",
    "bytes": 522,
    "sha256": "f3150ef49287a7228f870d3597083985b79d6b9461e5f86dcfdd1313824a2cec"
  },
  {
    "path": ".scratch-issue-7.md",
    "bytes": 524,
    "sha256": "6b1fa207c5a8dbf54d410c661c0eaa7f32c6929b1f4b36cbc0dbb62659264cf5"
  },
  {
    "path": ".scratch-issue-approval-pause.md",
    "bytes": 881,
    "sha256": "9ef565a7714683c7397b60565c7043f9c7bdf6c2ed20de1dcb56c73902133c2a"
  },
  {
    "path": ".scratch-issue-multiple-workbenches.md",
    "bytes": 1111,
    "sha256": "39d15fe7339aff6f5fb8108bd7afe7e100cc311a4daf35b34e8e911e5854fbdf"
  },
  {
    "path": ".scratch-issue-native-delegation.md",
    "bytes": 1031,
    "sha256": "2d556b4623f2fbbcd3b049008046ea352679de100458e1938c49d7fe6947f97e"
  },
  {
    "path": ".omo/evidence/astra-dashboard-recap-final-qa/plain-www-after-ctrl-d-screen.txt",
    "bytes": 0,
    "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  }
]
```
