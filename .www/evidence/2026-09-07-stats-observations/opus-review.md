# Stats Opus 읽기 전용 검토 기록

최초 REVISE와 재검토 사용량 제한을 각각 보존한다. 최종 PASS가 아니다.

## 2026-09-07-stats-opus.json

Receipt UUID: 55b59f28-8278-41f6-b6a6-da46a4f8c6c0

Model usage: claude-opus-5

## 판정: REVISE

읽기 전용 검사(코드·실제 소비 경로·fixture). 테스트/명령 실행은 하지 않았으므로 `624 pass / check 0`은 **미검증**이다 — 아래는 코드 경로 대조로 확인한 결함이다.

### D1 (블로커) `observedTotalTokens: null`은 실제 앱에서 도달 불가 — "미관측 vs 관측 0" 수락은 fixture에서만 성립
- `project-workbench.ts:1475`가 `sessionUsage: this.usageTracker.snapshot(...)`를 **항상** 채운다. `session-usage-tracker.ts:45-60`의 `snapshot()`은 `totalTokens: number`(모델합+unattributed)를 무조건 반환하고, `WorkbenchSessionUsage.totalTokens`(workbench.ts:61) 타입에도 null이 없다.
- 따라서 `session-stats.ts:145`의 `?? null`은 실제 경로에서 절대 null이 되지 않고, 화면의 `"Token usage unobserved."` / `"usage unobserved"` 분기(view 52·61·68·89행)는 **죽은 코드**다.
- 더 나쁜 쪽: 트래커는 재개 세션에서 미관측 상태를 **이미 알고 있다**(`new SessionUsageTracker(Boolean(options.resumeThreadId))` → `observedThreadTotalTokens = null`, tracker:16). 그런데 `snapshot()`이 그것을 0으로 평탄화하므로, resume 직후 `/stats`는 `"0 observed tokens · no attributed model or namespace usage."`를 출력한다. 이는 PR 기록이 재현 항목으로 적은 "미관측이 관측 0처럼 보인다"와 **같은 화면**이다.
- 증거 격차: `test/session-stats.test.ts:9`의 `snapshot()` 헬퍼는 `sessionUsage`를 아예 생략한다 — 앱이 만들지 않는 형태다. 그래서 26-27행 테스트는 통과하지만 실제 수락을 증명하지 않는다.
- 필요한 수정: `WorkbenchSessionUsage`에 미관측 표현(`totalTokens: number | null` 또는 `observed: boolean`)을 두고 트래커의 `observedThreadTotalTokens === null`을 배선. 그 뒤 workbench 스냅샷을 입력으로 쓰는 테스트를 추가.

### D2 실행 중이면 실패·취소가 헤더에서 사라짐 (기존 대비 후퇴)
- `sessionReviewState`는 running > failed > cancelled 우선이라, 실패 2건 뒤 새 turn이 도는 세션은 `ACTIVE · ◐ 5/8`만 보인다. 변경 전 `completionText`는 `failedRootTurns > 0`을 먼저 검사해 `✗ FAILED`를 표시했다.
- 게다가 `lifecycle.failedRootTurns / cancelledRootTurns / activeRootTurns`는 대시보드 어디에도 렌더되지 않는다(view 전체 grep 확인). 실패 3 / 취소 1 / 완료 5는 모두 `5/8`로 뭉개진다. "failure·cancelled 구별"이라는 목표가 상태 라벨 한 칸으로만 충족된다.
- fixture도 이 경우를 못 잡는다: view 테스트는 `state: "FAILED"`인데 `failedRootTurns: 0, 8/8 completed`인 모순 스냅샷을 렌더할 뿐이다.

### D3 `TOKENS / ROOT TURN` 분자 표기 누락 (이 PR의 주제와 정확히 같은 결함)
- 값은 `interactiveTokens` 합 ÷ completed root turn(session-stats.ts:169-171)인데, 캡션은 `"N completed root turns"`뿐이다. 같은 화면의 KPI `TOKENS`는 detached·unattributed까지 포함한 총합("observed total")이다.
- 자체 fixture로 확인되는 불일치: total 1,000 / interactive 100 / completed 2 → 화면은 `TOKENS 1.0k`와 `TOKENS / ROOT TURN 50 · 2 completed root turns`. 사용자가 50×2=100≠1,000을 보고 분자를 오해한다. 캡션을 `interactive tokens ÷ N completed root turns`로 명시해야 한다.

### 확인된 것(문제 없음)
- `pairedDurations`/`pairedApprovalDurations`의 `started.delete(id)`: 미짝 terminal 재사용 제거 정상. approval refs에 `threadId`가 실려(`serverRequest/resolved` params, codex-app-server.test:287) rootActivities 필터에 걸러지지 않음.
- `startedAt` 폴백 제거 → terminal-only turn이 elapsed 0ms로 평균 오염되던 문제 실제 해소. `turn/started`·`turn/completed`·`turn/interrupted`는 실제 저널에 존재(pi-harness:126-134, project-workbench:471/668)하므로 상태 기계는 실 경로에서 동작.
- `snapshot.activities`는 thread 스코프(`visibleActivities`, project-workbench:1511)라 span·requests 분모가 타 세션으로 새지 않음.
- coverage 삼항 우선순위는 의도대로(`(a || b) ? ...`). 변경 파일에 `TODO`/`test.skip`/`test.only` 없음.

### 한계·주의
- `coverage: "unknown"`도 실제 앱에서 도달 불가(`resumeCoverage`가 항상 존재). 빈 세션 view 테스트의 `"EMPTY · coverage unknown"` 기대는 실제로는 `coverage fresh`이며, 이 assertion은 거짓 확신을 준다.
- 재개 중 in-progress turn은 재개 시각으로 `turn/started`를 다시 기록(project-workbench:467-473)하므로, 원본 start가 로컬 저널에 없으면 duration이 과소 측정된다. coverage 표기로 일부 공시되나 수치 자체는 보정되지 않음.
- 이전 프로세스가 turn 중간에 죽어 남은 고아 `turn/started`는 영구히 `ACTIVE`로 표시된다(D2와 결합 시 실패 은폐).
- `PAIRED TOOL TIME`은 병렬 tool 구간을 단순 합산하므로 `JOURNAL SPAN`을 초과할 수 있다(캡션에 미공시, 낮은 우선순위).

**요약: D1은 이 PR의 핵심 수락 주장(미관측 vs 관측 0)이 실제 앱 경로에서 성립하지 않는다는 것이므로 병합 전 배선 필요. D2·D3는 화면 정합 결함. 자동 검증 수치는 본 패스에서 재현하지 않았다.**

## 2026-09-07-stats-opus-final.json

Receipt UUID: e93091fb-a9a9-491b-b6bb-0ee55a7f3e6b

Model usage:

You've hit your session limit · resets 3:20am (Asia/Seoul)
