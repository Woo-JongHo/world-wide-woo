# Codex Astra 구조 리뷰 검토 — 1차 (2026-10-03)

- 검토자: Codex CLI 0.158, gpt-6-astra, 추론 high, 읽기 전용 샌드박스, 91,778 토큰
- 대상: 2026-10-03 Claude 변경(record 통합, 스킬 정리, Chat 코드 변경 표시, Feature Implementation Contract 초안)
- 요청문: `.www/evidence/2026-10-03-structure-review/astra-review-1-prompt.md`
- 회귀 증거: `.www/evidence/2026-10-03-structure-review/test-failures-before.txt`(변경 전 소스, 94건), `test-failures-after.txt`(반영 후, 93건). 차이는 고친 `dual-repository code readability integration` 1건뿐이다.

## 반영 결과

| 지적 | 등급 | 조치 | 확인 |
|---|---|---|---|
| hunk 본문의 `--- `/`+++ `를 파일 헤더로 버림 | P2 | 헤더는 hunk 밖에서만 인정하고, `@@ -a,b +c,d @@` 범위로 hunk 끝을 계산 | `keeps hunk body lines that look like file headers` |
| `\ No newline at end of file`이 번호를 증가 | P2 | `\`로 시작하는 표식은 행·번호를 만들지 않음 | `does not number the no-newline marker…` |
| 생략 뒤 번호를 추정 | P2 | 생략 뒤 양쪽 번호와 남은 범위를 `null`로 전환, 다음 `@@`에서 복구 | 같은 테스트 |
| ObservationCard는 접기만 있고 펼치기 없음 | P2 | 펼칠 수단이 없는 경로에서는 접지 않음 | `shows the whole diff in observation cards…` |
| 좁은 폭에서 행 폭 초과 | P2 | 폭 3 미만은 테두리만, 본문 폭이 부족하면 번호→마커 순으로 생략 | `…keeps every row inside narrow widths`(폭 1·2·3·8) |
| 접기 개수에 구분 행 포함 | P3 | 내용 행만 세고 잘린 끝의 구분 행은 제거 | 같은 테스트(`… +1 lines`) |
| 끊긴 `woo-issue-intake` 참조 | P3 | `woo-linear-issue-intake`의 안내를 `woo-github-issue-intake`로 수정 | `grep` 잔존 0 |
| `isRecord` 주석 "일반 객체"가 부정확 | 제안 | "`null`·배열을 제외한 객체, Date·Map 포함"으로 수정 | — |
| `asRecord`는 복사하지 않음(기존 `workflow-projection`은 얕은 복사) | 관찰 | 주석에 "같은 참조, 복사하지 않음" 명시. 현재 호출은 읽기 전용 | — |
| Core가 `⋮` 표시 문자를 소유 | 제안 | `gap` 행의 문자를 표현 장으로 이동 | — |
| 논문 형식을 파일 존재·구현 순서로 강제 | 결정 | 읽기 순서로만 채택, 입력·외부 효과·저장/복구 장 추가, 검증은 위험 순서, 이름은 권고, 함수 지도는 게이트에서 제외, 장 지도는 생성 투영 | [Feature Implementation Contract](../workflows/FEATURE_IMPLEMENTATION_CONTRACT.md) |

## 원문

**record 통합과 책임 분리는 대체로 적절하지만, diff 표시는 수정이 필요합니다. “논문 형식”은 설명 순서로만 부분 채택하고, 모든 기능·파일에 강제하는 제안은 보류하는 편이 좋겠습니다.**

지정된 Claude 변경만 평가했습니다. 제외 디렉터리는 탐색하지 않았고 소스·문서를 수정하지 않았습니다. 직접 실행한 `tsc --noEmit`과 관련 테스트 두 파일은 **40개 통과, 실패 0개**였습니다. Claude의 “전체 93개 실패가 작업 전과 동일”이라는 주장은 변경 전 실행 증거가 없어 확인하지 못했습니다.

**1. 결함 — 심각도 순**

P1급 결함은 확인하지 못했습니다. 아래는 재현하거나 코드 경로로 확인한 문제입니다.

1. **P2 — hunk 본문을 파일 헤더로 오인해 삭제합니다.**
   `classifyDiffLine`은 위치와 무관하게 `--- `·`+++ `를 metadata로 분류하고, 새 파서는 이를 버립니다. 예컨대 실제 내용 `-- title`을 `++ title`로 바꾸는 정상 patch의 `--- title`, `+++ title` 행이 모두 사라지고, 다음 context 번호도 틀어집니다. 기존 분류 문제에 더해 이번 변경으로 **본문 소실**이 발생합니다. 파일 헤더와 hunk 본문을 파서 상태로 구분해야 합니다.
   근거: [file-diff.ts:20](/Users/jonghoPro/woo/00_project/99_www/src/core/domain/execution/file-diff.ts:20), [file-diff.ts:48](/Users/jonghoPro/woo/00_project/99_www/src/core/domain/execution/file-diff.ts:48).

2. **P2 — `\ No newline at end of file`이 줄 번호를 증가시킵니다.**
   `@@ -1 +1 @@`, `-old`, EOF 표식, `+new`를 입력하면 `new`가 **1번 대신 2번**으로 나옵니다. 표식을 context로 처리하면서 양쪽 번호를 증가시키기 때문입니다. 이 표식은 번호를 소비하지 않는 metadata로 처리해야 합니다.
   근거: [file-diff.ts:25](/Users/jonghoPro/woo/00_project/99_www/src/core/domain/execution/file-diff.ts:25), [file-diff.ts:70](/Users/jonghoPro/woo/00_project/99_www/src/core/domain/execution/file-diff.ts:70).

3. **P2 — 생략 표시 이후 확정할 수 없는 번호를 표시합니다.**
   `10번 context → … 5 diff lines omitted → context`가 `10 → 생략 → 11`로 나옵니다. 생략된 행의 추가·삭제 구성을 모르므로 다음 번호를 계산할 수 없습니다. 생략 이후 양쪽 번호를 `null`로 만들고 다음 유효 hunk에서 복구해야 합니다.
   근거: [file-diff.ts:56](/Users/jonghoPro/woo/00_project/99_www/src/core/domain/execution/file-diff.ts:56).

4. **P2 — ObservationCard에는 접기만 있고 펼치기가 없습니다.**
   `wwwToolRows`는 `expanded`에 따라 제한을 해제하지만, `fileChangeRows`는 항상 10행으로 제한합니다. `ObservationCardOptions`에도 확장 상태가 없습니다. 13행 입력에서 마지막 3행이 숨겨지고, 해당 카드 경로에서는 펼칠 수 없음을 확인했습니다. 확장 상태를 연결하거나 이 경로에서는 제한을 제거해야 합니다.
   근거: [work-step-components.ts:45](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/chat/view/work-step-components.ts:45), [work-step-components.ts:132](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/chat/view/work-step-components.ts:132), 비교 대상 [www-execution.ts:677](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/chat/view/www-execution.ts:677).

5. **P2 — 좁은 폭에서 렌더 폭 계약을 위반합니다.**
   번호 1000인 행을 `width=8`로 렌더하면 실제 폭은 **9**입니다. 번호·마커를 확보한 뒤 본문 폭을 최소 1로 강제하여 발생합니다. 접기 요약도 `width=1`에서 폭 3을 반환합니다. 최종 행 전체가 지정 폭 안에 들어오도록 번호 축소·생략 또는 최종 clipping이 필요합니다. 앱 전체가 반드시 종료된다는 것까지는 확인하지 않았습니다.
   근거: [unified-diff-view.ts:34](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/foundation/rendering/unified-diff-view.ts:34), [unified-diff-view.ts:39](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/foundation/rendering/unified-diff-view.ts:39), [unified-diff-view.ts:29](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/foundation/rendering/unified-diff-view.ts:29).

6. **P3 — 접기 개수에 인공 구분 행까지 포함됩니다.**
   첫 hunk 10행 뒤 두 번째 hunk의 본문 1행이 있으면 `… +2 lines`로 표시됩니다. 파서가 삽입한 `gap`까지 세기 때문입니다. 본문 행 수와 표시용 구분 행 수를 분리해야 합니다.
   근거: [file-diff.ts:51](/Users/jonghoPro/woo/00_project/99_www/src/core/domain/execution/file-diff.ts:51), [unified-diff-view.ts:23](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/foundation/rendering/unified-diff-view.ts:23).

7. **P3 — 스킬 이름 변경 후 호출 한 곳이 끊겼습니다.**
   Linear intake가 여전히 삭제된 `woo-issue-intake`를 안내합니다. `woo-github-issue-intake`로 수정해야 합니다. 이번 rename으로 생긴 참조 누락입니다.
   근거: [woo-linear-issue-intake/SKILL.md:8](/Users/jonghoPro/woo/00_project/99_www/.agents/skills/woo-linear-issue-intake/SKILL.md:8).

추가로 확인한 정상 동작은 다음과 같습니다.

- **여러 hunk:** 각 anchor에서 old/new 번호가 정상 재설정됩니다. **번호 없는 `@@`:** 이전 번호를 이어 쓰지 않고 `null`로 전환합니다. [file-diff.ts:49](/Users/jonghoPro/woo/00_project/99_www/src/core/domain/execution/file-diff.ts:49)
- **null/undefined/{}:** 검토한 호출부의 optional chaining·nullish fallback은 의미를 보존합니다. `{}` 기본값도 명시적으로 유지했고, `runtime-monitor`의 `isRecord` 전환도 정확합니다. [request-test-workspace.ts:36](/Users/jonghoPro/woo/00_project/99_www/src/core/domain/observability/request-test-workspace.ts:36), [runtime-monitor.ts:157](/Users/jonghoPro/woo/00_project/99_www/src/core/domain/observability/runtime-monitor.ts:157)
- **완전히 동일한 통합은 아닙니다:** `workflow-projection`의 기존 helper는 얕은 복사를 했지만 새 helper는 원본을 반환합니다. 현재 사용은 읽기뿐이라 정상 JSON 회귀는 확인하지 못했습니다. 상속 필드·getter가 있는 객체에서 차이가 날 가능성은 **추측이며 실제 유입은 미확인**입니다. [record.ts:8](/Users/jonghoPro/woo/00_project/99_www/src/core/domain/value/record.ts:8), [workflow-projection.ts:827](/Users/jonghoPro/woo/00_project/99_www/src/core/domain/work/workflow-projection.ts:827)

**2. 구조 판단**

- **`core/domain/value`: 조건부로 적절합니다.** 외부 의존성이 없는 공통 값 판별이라는 좁은 책임이고, 명시된 소유 규칙·허용 목록도 일치합니다. 범용 편의 함수 저장소로 넓히지 않는 것이 중요합니다. 다만 “일반 객체”라는 주석은 부정확합니다. 실제로 Date·Map·클래스 인스턴스도 통과하므로 “null·배열을 제외한 객체”라고 명시하는 편이 안전합니다. [LAYERS.md:79](/Users/jonghoPro/woo/00_project/99_www/LAYERS.md:79), [architecture.test.ts:21](/Users/jonghoPro/woo/00_project/99_www/test/architecture.test.ts:21), [record.ts:3](/Users/jonghoPro/woo/00_project/99_www/src/core/domain/value/record.ts:3)
- **diff 해석을 `core/domain/execution`에 둔 결정: 허용 가능합니다.** 변경 의미·통계를 순수 함수로 정의하고, ANSI와 폭 처리를 foundation에 둔 의존 방향은 맞습니다. 다만 `gap.text="⋮"`와 영문 생략 문구 해석은 표시·입력 형식이 섞인 부분입니다. Core에는 변경 행·위치·불완전 여부를 두고, 구분 기호와 문구는 표시 경계에서 결정하는 대안을 권합니다. 이는 강제 경계 위반보다는 책임 정밀화 제안입니다. [file-diff.ts:13](/Users/jonghoPro/woo/00_project/99_www/src/core/domain/execution/file-diff.ts:13), [file-diff.ts:51](/Users/jonghoPro/woo/00_project/99_www/src/core/domain/execution/file-diff.ts:51), [LAYERS.md:71](/Users/jonghoPro/woo/00_project/99_www/LAYERS.md:71)
- **스킬 병합: 적절합니다.** PR read-back과 Obsidian 검증 계약이 유지되고, 검증 전용 요청의 쓰기 금지도 명시했습니다. Development Map을 생성 명령으로만 갱신하도록 한 방향도 파생 표의 소유권과 맞습니다. 위 끊긴 참조만 보완하면 됩니다. [woo-github-pr/SKILL.md:20](/Users/jonghoPro/woo/00_project/99_www/.agents/skills/woo-github-pr/SKILL.md:20), [woo-obsidian-publish/SKILL.md:19](/Users/jonghoPro/woo/00_project/99_www/.agents/skills/woo-obsidian-publish/SKILL.md:19), [development-map/SKILL.md:13](/Users/jonghoPro/woo/00_project/99_www/.agents/skills/development-map/SKILL.md:13)

**3. 논문 형식 제안 평가**

실제 기능 세 가지에 대입하면 적용 범위의 차이가 드러납니다.

| 기능 | 맞는 부분 | 빠지거나 과도한 부분 |
|---|---|---|
| diff 표시 | 정의 → 해석 → 표현 순서가 자연스럽습니다. | 기존 Chat Unit 내부 변경입니다. 세부 기능마다 새 registration을 요구하면 metadata를 중복합니다. [chat.units.ts:6](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/chat/registration/chat.units.ts:6) |
| 인증 | 계약과 화면을 구분하는 설명은 유효합니다. | 사용자 입력·취소, outbound 로그인 효과가 빠졌습니다. `1→4→5` 테스트만으로는 인증 실패·취소를 검증할 수 없습니다. [auth-overlay.ts:220](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/authentication/view/auth-overlay.ts:220), [auth-service.ts:32](/Users/jonghoPro/woo/00_project/99_www/src/adapters/outbound/authentication/auth-service.ts:32) |
| 세션 복원 | 정의·흐름·경계 설명은 유효합니다. | 핵심은 저장 순서·동시 append·replay 불변식입니다. 표시 단계보다 이 검증이 우선입니다. [session-event-replay.ts:23](/Users/jonghoPro/woo/00_project/99_www/src/core/application/session/session-event-replay.ts:23), [session-store.test.ts:40](/Users/jonghoPro/woo/00_project/99_www/test/session-store.test.ts:40) |

채택한다면 다음처럼 바꾸겠습니다.

- **장 순서는 문서의 읽기 순서로만 사용합니다.** 구현 순서·파일 존재 조건으로 강제하지 않습니다. registration은 “기존 Feature/Unit 연결”로 바꾸고, 해당 없는 책임은 문서에서만 설명합니다. 빈 폴더 금지 계약도 유지합니다. [LAYERS.md:70](/Users/jonghoPro/woo/00_project/99_www/LAYERS.md:70)
- **입력/controller, outbound 효과, 저장·복구·취소를 추가합니다.** 검증은 고정된 `1→4→5` 대신 불변식·경계·사용자 동작을 따라 배치합니다. 기존 설계 계약에도 상태 흐름·영속성·통합·복구가 이미 있습니다. [DESIGN_DOCUMENT_CONTRACT.md:45](/Users/jonghoPro/woo/00_project/99_www/docs/workflows/DESIGN_DOCUMENT_CONTRACT.md:45)
- **함수 이름은 권고로 제한합니다.** 세션의 `replaySessionEvents`, 인증의 `login/logout`처럼 실제 행위를 드러내는 이름을 `parse/project/render`에 맞춰 바꿀 이유가 없습니다. `§4 개별 처리`와 `§5 helper`도 구별 기준이 불명확하므로 합치는 편이 낫습니다.
- **함수 지도는 생성 가능한 탐색 자료로 둡니다.** 현재 `08_function-map.ts`는 RETURN 의미를 검사하지 않고, CALLS도 실제 호출 AST를 검사하지 않습니다. 특히 `source.text.includes(call)`은 지도 자체에 적힌 이름으로도 충족됩니다. 클래스 메서드도 현재 선언 수집 대상에 없습니다. 이 검사기를 설계 정확성의 게이트로 삼으면 과도한 보장을 하게 됩니다. [08_function-map.ts:64](/Users/jonghoPro/woo/00_project/99_www/.agents/skills/woo-code-readability/scripts/typescript/08_function-map.ts:64), [08_function-map.ts:113](/Users/jonghoPro/woo/00_project/99_www/.agents/skills/woo-code-readability/scripts/typescript/08_function-map.ts:113)
- **새 계약은 기존 정본을 연결하는 지침으로 제한합니다.** 기능별 내용을 다시 복제하지 말고 기존 `Implementation Map`에 코드·테스트 링크를 둡니다. 게이트도 registration·test 파일의 존재보다 의존 방향과 실제 행동 검증을 확인해야 합니다. [DESIGN_DOCUMENT_CONTRACT.md:11](/Users/jonghoPro/woo/00_project/99_www/docs/workflows/DESIGN_DOCUMENT_CONTRACT.md:11), [DESIGN_DOCUMENT_CONTRACT.md:51](/Users/jonghoPro/woo/00_project/99_www/docs/workflows/DESIGN_DOCUMENT_CONTRACT.md:51)

**바로 고칠 것:** diff 본문·번호 처리, ObservationCard 확장, 좁은 폭, 접기 개수, 끊긴 스킬 참조.
**결정이 필요한 것:** Core diff 모델의 표시 책임 분리, 논문 형식의 문서 한정 채택과 검사 범위.
**문제없음:** 확인한 정상 입력의 record 통합, 여러 hunk·번호 없는 `@@`, 의존 방향, 스킬 병합의 기본 방향.
