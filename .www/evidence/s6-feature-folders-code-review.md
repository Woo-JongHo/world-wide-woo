# S6 기능 폴더 이동 독립 코드 리뷰

- 범위: `features/*`의 controller / view-model / view / registration 물리 이동, registry, architecture gate 및 현재 문서 참조
- 판정: **BLOCK / REQUEST_CHANGES**
- 검토 기준: `LAYERS.md`의 TUI MVC 계약과 요청된 ViewModel·View 경계
- skill 관점: 이 환경의 사용 가능 skill 목록에는 `remove-ai-slops`, `programming`이 없어서 직접 로드하지 못했다. 대신 해당 관점(구현 상수만 확인하는 테스트, 불필요한 추상화·파싱, 미검증 구조 규칙)을 수동 적용했다. registry inventory 테스트는 안정 ID 계약을 검증하므로 slop으로 보지 않았고, 새 구조 gate는 필요한 방향이나 핵심 금지 경계를 빠뜨렸다.

## Findings

### HIGH — ViewModel이 terminal/ANSI 구현을 계속 소유한다

요구한 경계는 `view-model`이 Core Projection을 화면 의미로 변환하고, pi-tui Component·실제 render·ANSI/폭 처리는 `view`가 소유하는 것이다. 그러나 다음 ViewModel 파일들이 pi-tui의 ANSI 줄바꿈 또는 폭 계산을 직접 호출하거나 chalk로 ANSI를 생산한다.

- `approval/view-model/approval-presentation.ts:1,63-79` — `wrapTextWithAnsi`와 색상 적용으로 terminal row를 완성한다.
- `chat/view-model/chat-public-lifecycle.ts:1,18-64` — `wrapTextWithAnsi`, 색상, width 기반 줄바꿈을 수행한다.
- `chat/view-model/conversation-recap-view.ts:1,11-23` — `wrapTextWithAnsi`와 `fit`으로 최종 row를 만든다.
- `monitoring/view-model/request-runtime-view.ts:1-2,14-23,47-59` — chalk ANSI와 pi-tui `visibleWidth`를 직접 사용한다.
- `cache/view-model/www-cache-catalog.ts:1`, `context/view-model/www-context-catalog.ts:1`, `dashboard/view-model/www-dashboard-catalog.ts:1` — chalk로 ANSI 표현을 생성한다.

이 상태는 폴더명만 MVC가 되고 실제 presentation 구현이 ViewModel에 남는 결과다. 위 폭/ANSI/row 생성 코드를 각 feature의 `view/`로 옮기거나, ViewModel이 ANSI 없는 semantic data만 반환하도록 분리해야 한다. 이 경계를 고정하는 architecture test도 추가해야 한다.

### MEDIUM — “모든 MD 최신화” 완료 기준과 현재 문서의 실제 경로가 불일치한다

현재형으로 작성된 문서가 삭제된 flat 경로와 이전 Feature 수를 계속 가리킨다.

- `docs/TUI_CODE_MATRIX.md:18,23,28,45` — 현재 registry를 16개 (`TUI-F001`~`TUI-F016`)로 설명하고, `src/domain`, `src/application`, `src/infrastructure`를 WWW 현재 root로 적는다. 실제 registry는 18 Feature / 39 Unit이며 canonical root는 `src/core`, `src/adapters`다.
- `docs/WWW_OBSERVABILITY_VIEW_ARCHITECTURE.md:28,32` — 삭제된 `features/session/observability-dashboard-view.ts`, `features/monitoring/runtime-monitor-view.ts`를 current renderer로 표기한다.
- `docs/planning/linear-development/BASELINE.md:23,25` 및 `IDENTITY.md:41` — `features/chat/workbench-views.ts`, `features/trace/workbench-tracer-view.ts`라는 더 이상 존재하지 않는 후보 경로를 current implementation으로 표기한다.

과거 증거 `.www/evidence/**`는 immutable receipt라 수정 대상이 아니지만, 위 `docs/**`의 current/candidate 표현은 새 경로로 갱신하거나 역사 기준선임을 명시해야 한다.

## Confirmed

- `features`의 TypeScript 평면 파일은 registry/type 두 개뿐이고, 기능 구현은 `controller`, `view-model`, `view`, `registration`에 한 단계로 배치됐다. 빈 디렉터리는 0개다. `usage/assets`는 `view/www-usage.ts:19`의 `import.meta.url` 동적 경로로 실제 사용되므로 dangling asset이 아니다.
- registry는 18 Feature, 39 Unit이다. 각 feature와 units 파일은 각각 18개이며 ID, productGroup, kind, status 및 parent binding은 `test/tui-feature-registry.test.ts`에서 확인한다. 요청 본문의 “18 unit”은 현 catalog 계약(39 Unit)과 다르다.
- 유일한 controller인 `tnote/controller/tnote-browser-controller.ts:43-57`는 keyboard intent를 처리하고 selection/open transient state만 소유한다. 다만 pi-tui `Component` 구현과 render 위임도 함께 가진다(`:1-2,35-40`); 현재 수는 의도와 맞지만 향후 controller/view 책임을 더 엄격히 나눌 때 후보 지점이다.
- sibling feature import, responsibility direction, inbound→outbound 금지, cycle 금지는 architecture test가 검사한다. Outbound concrete import가 `features/*/view`에 없음을 확인했다. view의 Core application import는 현재 read/projection 또는 parser 유틸 사용이며, 이번 이동에서 Core writer를 호출한 사례는 찾지 못했다.
- `bun test test/architecture.test.ts test/tui-feature-registry.test.ts --reporter=dot` — 25 pass, 0 fail, 3,471 expectations.
- `bun run check` — pass.
- `git diff --check` — pass.
- 전체 `bun test --reporter=dot`도 시작해 외부 contract 테스트 구간까지 실패 출력 없이 진행했지만, 리뷰 세션의 30초 tool wait 밖에서 완료되어 최종 exit summary는 이 리뷰 artifact에 증명으로 사용하지 않는다.

## Required before approval

1. 위 HIGH의 ViewModel ANSI/pi-tui/chalk/폭 처리를 feature `view/`로 이동하거나 ANSI 없는 ViewModel data 계약으로 교체한다.
2. architecture test에 ViewModel의 pi-tui/chalk/ANSI 및 View의 Outbound concrete import 금지 검사를 추가한다.
3. 현재형 `docs/**` 경로·Feature 수·canonical root를 현 트리에 맞춘다(역사 문서는 역사 기준선을 명시).

## Result

```json
{
  "codeQualityStatus": "BLOCK",
  "recommendation": "REQUEST_CHANGES",
  "reportPath": ".www/evidence/s6-feature-folders-code-review.md",
  "blockers": [
    "ViewModel의 pi-tui/ANSI/chalk/폭 처리 제거 또는 View로 이동 및 gate 추가",
    "현재형 MD 문서의 삭제된 feature 경로·16개 registry·구 root 참조 정정"
  ]
}
```

---

# S6 재검토 — 교정본

- 재검토 범위: 이전 HIGH/MEDIUM 교정, architecture gate 우회 가능성, 현재 문서 경로
- 판정: **CLEAR / APPROVE**
- skill 관점: 사용 가능 skill 목록에 `remove-ai-slops`, `programming`이 없어 직접 로드하지 못했다. 이전과 같이 불필요한 추상화·상수 복제 테스트·형식만 맞춘 테스트 관점으로 수동 검토했다. 이번 교정은 코드 이동과 필요한 boundary gate에 한정되어 있으며 해당 관점 위반을 찾지 못했다.

## 이전 finding 해소 확인

1. **ViewModel terminal 의존 제거 — 해소.** `view-model`은 7개이고 `pi-tui`, `chalk`, ANSI escape, `Component`, foundation import가 모두 0건이다. 이전의 approval/chat lifecycle·recap/monitoring/cache/context/dashboard presentation은 `view/`로 이동했다.
2. **자동 회귀 차단 — 해소.** `test/architecture.test.ts:120-136`은 ViewModel의 pi-tui/chalk/foundation/ANSI/Component를 금지하고, `:138-142`는 View가 allowlisted 읽기용 Core Application 모듈 외를 import하지 못하게 한다. 기존 sibling feature·MVC 역할 방향·inbound→outbound gate도 계속 통과한다.
3. **문서 경로와 규모 — 해소.** `docs/TUI_CODE_MATRIX.md:18-30,45`, `docs/WWW_OBSERVABILITY_VIEW_ARCHITECTURE.md:28,32`, `docs/planning/linear-development/BASELINE.md:23,25`, `IDENTITY.md:41`는 18 Feature/39 Unit, `core/adapters` root 및 새 `view/` 경로를 가리킨다.

## 확인 결과

- `controller=1`, `registration=36`, `view-model=7`, `view=60`; 빈 디렉터리 0개. Feature 평면 TypeScript는 registry/type 두 파일뿐이다. Usage asset은 `usage/view/www-usage.ts:19`의 동적 URL import로 사용된다.
- `features/*/view`에서 Outbound concrete import는 0건이다. 실제 Core Application import는 projection/read/parser만이며 writer 호출은 없다.
- `bun test test/architecture.test.ts test/tui-feature-registry.test.ts --reporter=dot` — **25 pass, 0 fail, 3,518 expectations**.
- `bun run check`, `git diff --check` — pass.

## LOW — allowlist가 파일 단위라 future writer symbol까지 기계적으로 구별하지는 못한다

`test/architecture.test.ts:112-117`은 `core/application/work/t-note-service.ts` 전체를 View read allowlist에 둔다. 현재 View는 그 파일의 `parseCanonicalTNoteReport`와 `parseLegacyCanonicalTNote`만 import하고, writer인 `TNoteService.create()`를 호출하지 않는다. 따라서 현 변경의 경계 위반은 아니다. 다만 같은 module의 `TNoteService` symbol을 향후 View가 import해도 현 import-graph gate만으로는 잡히지 않는다. parser를 별도 read-only module로 분리하거나 symbol-level test를 둘 때 더 강해진다. 이번 S6 수락을 막을 수준은 아니다.

```json
{
  "codeQualityStatus": "CLEAR",
  "recommendation": "APPROVE",
  "reportPath": ".www/evidence/s6-feature-folders-code-review.md",
  "blockers": []
}
```
