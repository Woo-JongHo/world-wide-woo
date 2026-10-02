**재사용 도구에서 P2 6건, 탐지에서 P3 1건을 재현했습니다. 이번 7개 기능 적용에서는 회귀나 차분 혼입을 발견하지 못했습니다.** 파일 수정·외부 게시·기록은 하지 않았습니다.

1. **P2 — 타입 뒤 실행문까지 함께 이동합니다.**
   [scripts/reorder-sections.ts:83](/Users/jonghoPro/woo/00_project/99_www/scripts/reorder-sections.ts:83)는 세미콜론 토큰이 아니라 줄 끝이 `;`인지 확인합니다. 다음 정상 입력에서 타입과 `log.push()`를 함께 상단으로 옮깁니다.

   ```ts
   const log: string[] = [];
   export type Row = string; // row
   log.push("ready");
   export const result = log;
   ```

   실행 결과가 `["ready"]`에서 초기화 전 접근 `ReferenceError`로 바뀝니다. 세미콜론 없는 객체 타입도 동일합니다. `var`와 optional chaining으로 구성한 반례에서는 오류 없이 실행 결과만 달라졌습니다. **비어 있지 않은 줄이 모두 보존되므로 순수 이동 검사는 통과합니다.**

2. **P2 — 문자열·주석·중첩 범위 안의 선언 모양을 실제 선언으로 취급합니다.**
   [scripts/reorder-sections.ts:108](/Users/jonghoPro/woo/00_project/99_www/scripts/reorder-sections.ts:108)는 각 줄을 정규식으로 검사하며, 그 줄이 최상위 코드인지 확인하지 않습니다. 템플릿 문자열 안의 `function example() {}`를 `functions` 명령이 문자열 밖으로 꺼내는 반례를 재현했습니다. 변환 전후 구문 검사는 모두 통과하지만 반환 문자열에서 해당 내용이 사라집니다. `declarationEnd` 내부의 문자열 처리는 **선언 시작점의 오인식**을 막지 못합니다.

3. **P2 — 빈 줄 정리가 템플릿 문자열 값을 변경합니다.**
   [scripts/reorder-sections.ts:135](/Users/jonghoPro/woo/00_project/99_www/scripts/reorder-sections.ts:135)는 이동 부근뿐 아니라 유지되는 영역 전체의 연속 빈 줄을 합칩니다. 뒤쪽 타입 하나를 이동했을 뿐인데 템플릿 값이 `"a\n\n\nb"`에서 `"a\n\nb"`로 바뀌었습니다.
   [scripts/reorder-sections.ts:152](/Users/jonghoPro/woo/00_project/99_www/scripts/reorder-sections.ts:152)는 빈 줄을 비교에서 제외하므로 이를 검출하지 못합니다. 빈 줄 수정도 코드와 문자열의 구분이 필요합니다.

4. **P2 — 정규식과 나눗셈 판정에 문맥이 부족합니다.**
   [scripts/reorder-sections.ts:157](/Users/jonghoPro/woo/00_project/99_www/scripts/reorder-sections.ts:157)는 현재 줄의 직전 문자만 주로 확인합니다.

   - 함수 내부 `if (s) /}/.test(s);`에서 정규식의 `}`를 함수 종료로 계산합니다. 함수 일부만 이동해 `Unexpected }`가 발생했습니다.
   - `return (12` 다음 줄이 `/ 3);`인 정상 나눗셈에서는 `/`를 정규식 시작으로 처리하여 `unbalanced declaration`을 던졌습니다.

   전자는 잘못된 결과를 반환하고, 후자는 정상 입력을 거부합니다.

5. **P2 — 함수 시그니처의 객체 타입을 본문으로 오인합니다.**
   [scripts/reorder-sections.ts:78](/Users/jonghoPro/woo/00_project/99_www/scripts/reorder-sections.ts:78)에서 어떤 `{`든 `opened`를 설정하고, 83줄에서 깊이가 0이면 선언을 끝냅니다. 따라서 다음 배치에서 첫 줄만 이동합니다.

   ```ts
   function helper<T extends {}>
   (value: T): T { return value; }
   ```

   반환 타입이 `function helper(): { x: number }`이고 본문 `{ ... }`가 다음 줄에 시작하는 경우도 재현했습니다. 두 입력 모두 변환 전에는 정상이고 변환 후에는 구문 오류입니다.

6. **P2 — 데코레이터와 클래스 사이에 타입을 삽입합니다.**
   [scripts/reorder-sections.ts:43](/Users/jonghoPro/woo/00_project/99_www/scripts/reorder-sections.ts:43)의 삽입 위치는 선행 주석만 포함합니다. `@sealed` → `export class C {}` → `export interface Row { ... }` 순서에 `types`를 적용하면 `@sealed`와 클래스 사이에 인터페이스가 들어갑니다. `Expected "class" but found "interface"`를 재현했습니다. 클래스 자체를 이동하지 않아도 클래스에 붙은 구문을 훼손합니다.

7. **P3 — `typeof` 제외 기준이 탐지와 이동에서 다릅니다.**
   [scripts/feature-map.ts:117](/Users/jonghoPro/woo/00_project/99_www/scripts/feature-map.ts:117)는 선언 첫 줄만 검사합니다. `export type T =` 다음 줄의 `typeof V;`는 후보로 보고하지만 이동 도구는 그대로 둡니다. 반대로 [scripts/reorder-sections.ts:120](/Users/jonghoPro/woo/00_project/99_www/scripts/reorder-sections.ts:120)는 선행 주석까지 검사하므로 `/** typeof example */`가 붙은 일반 타입도 제외합니다. 문자열 리터럴 타입 `"typeof"` 역시 잘못 제외합니다. 실제 TypeQuery 여부를 기준으로 두 도구를 일치시켜야 합니다.

중첩 템플릿, 세미콜론으로 끝나는 일반 overload 묶음, 객체 타입의 `}` 다음 줄에 `& { ... };`가 이어지는 입력은 이번 메모리 검사에서 정상 처리됐습니다. 다만 기존 테스트는 대표적인 정상 사례 위주여서 위 반례를 검출하지 못합니다. [test/reorder-sections.test.ts:9](/Users/jonghoPro/woo/00_project/99_www/test/reorder-sections.test.ts:9)

**이번 적용에 대한 판정은 도구 일반의 판정과 다릅니다.**

- 7개 `work.diff`를 메모리에서 `before/`에 적용한 결과가 **현재 11개 파일과 모두 정확히 일치**했습니다. 해당 파일들에서 `work.diff` 밖 변경이 이번 결과에 섞인 흔적은 없었습니다.
- 11개 파일 모두 Bun 변환 JavaScript가 전후 동일했습니다. 기록된 테스트 실패·오류 목록도 기능별로 새 항목 0이었습니다.
- `delegation-tree-view.ts`의 import 재배치·끝 쉼표와 표 정렬은 차분에 명시되어 있으며, 스킬 5단계 범위입니다. 동작 변경으로 보지 않습니다. [chat/work.diff:61](/Users/jonghoPro/woo/00_project/99_www/.www/evidence/2026-10-03-feature-template-types/chat/work.diff:61), [SKILL.md:28](/Users/jonghoPro/woo/00_project/99_www/.agents/skills/woo-feature-template/SKILL.md:28)
- 읽기 흐름에서는 `WorkspaceTodoLiveContext`와 소비자인 `WorkspaceTodoView` 사이에 `StatusLine`이 놓입니다. 가까이 두는 편을 선호할 수 있지만, 공개 타입을 먼저 둔다는 현 계약에 따른 결과이므로 **과잉 적용 결함으로 판정하지 않았습니다.** [shared-dashboard-views.ts:20](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/dashboard/view/shared-dashboard-views.ts:20)
- 스킬 4단계의 “순수 이동” 조건은 의미 보존의 보장이 아닙니다. 위 반례들을 통과시키는 현재 도구를 필수 편집 경로로 지정하려면, 선언 범위·삽입 위치를 보장하거나 지원하지 않는 입력을 쓰기 전에 거부해야 합니다. [SKILL.md:24](/Users/jonghoPro/woo/00_project/99_www/.agents/skills/woo-feature-template/SKILL.md:24)

직접 실행한 기존 테스트는 **13 pass / 0 fail**, `bunx tsc --noEmit`도 통과했습니다. 전체 회귀 테스트는 재실행하지 않고 제공된 전후 목록을 대조했습니다.

바로 고칠 것: 도구 P2 6건과 해당 회귀 테스트, `typeof` 탐지·이동 기준 불일치.
결정이 필요한 것: AST 기반 이동으로 전환할지, 지원 구문을 제한하고 나머지는 쓰기 전에 거부할지.
문제없음: 이번 7개 기능·11개 파일의 적용 차분에서는 동작 회귀·변경 혼입·명백한 과잉 적용을 발견하지 못함.