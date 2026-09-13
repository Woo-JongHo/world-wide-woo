# WWW Dashboard 시작 화면 및 theme 검증 기록

작업 경로: `/Users/jonghoPro/woo/00_project/99_www`  
브랜치: `astra/terminal-ui`  
기록 시각: 2026-09-13

| 성공 기준 | 실제 시나리오 | 실행 | 이진 관측값 | 캡처 산출물 |
|---|---|---|---|---|
| Astra 첫 화면이 WWW Dashboard다 | `design: "astra"` shell을 `ready` workbench fixture로 시작한다 | `bun test test/astra-shell.test.ts --reporter=dot` | 메모리 terminal 출력에 `WWW Dashboard`와 `현재 Workbench snapshot`이 있다; 종료 코드 0 | 이 문서와 해당 테스트의 assertion |
| Dashboard가 실제 workbench snapshot을 투영한다 | `working` fixture의 thread, live activity, goal, chat/activity count를 렌더한다 | `bun -e '…WwwDashboardView(() => snapshot).render(80)…'` 및 `bun test test/entry-dashboard-view.test.ts --reporter=dot` | 아래 캡처에 `작업 진행 중`, `preview-thread`, live activity, goal, `대화 2 · 대기 0 · 활동 6`이 있다; 종료 코드 0 | 아래 실제 renderer 출력 |
| Astra와 기본 foundation의 기본 텍스트가 흰색이다 | 두 palette token을 직접 읽는다 | `bun test test/entry-dashboard-view.test.ts --reporter=dot` | `palette.foreground === #ffffff`, `astraPalette.text === #FFFFFF`; 종료 코드 0 | 테스트 assertion |
| 기존 feature 경계와 Code-ID가 유지된다 | feature registry와 architecture 및 Code-ID validator를 실행한다 | `bun test test/architecture.test.ts test/tui-feature-registry.test.ts test/workbench-views.test.ts --reporter=dot`; `bun scripts/code-id.ts` | 101 pass / 0 fail; `Code-ID 5개: 등록·대표 선언·파일·문서 연결 통과` | 아래 검증 요약 |

## 실제 Dashboard renderer 캡처

```text
WWW Dashboard
현재 Workbench snapshot

SESSION
작업 진행 중
thread preview-thread · revision 1

NOW
재개 시나리오를 테스트하는 중
목표 · 현재 요청을 검증한다

WORK
대화 2 · 대기 0 · 활동 6
계획 1/3 · Todo 0/0

HEALTH
승인 대기 없음
차단된 Todo 없음
오류 없음
Linear Dashboard 미연결
```

## 전체 관련 회귀 검증

```text
bun test test/entry-dashboard-view.test.ts test/astra-shell.test.ts test/astra-ui.test.ts test/architecture.test.ts test/tui-feature-registry.test.ts test/workbench-views.test.ts --reporter=dot
151 pass
0 fail
3828 expect() calls

bun run check
$ tsc --noEmit
exit 0

git diff --check
exit 0

bun scripts/code-id.ts
Code-ID 5개: 등록·대표 선언·파일·문서 연결 통과 (SQLite 연결 검사는 아님)
```
