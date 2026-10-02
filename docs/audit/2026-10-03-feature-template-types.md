# Feature Template — 타입 순서 정리와 AST 이동 도구 (2026-10-03)

- 작업: §1·§2 정리(7개 기능, 공개 타입 10개 이동)와 재사용 도구 `scripts/reorder-sections.ts`의 저장소 이전
- 검토자: Codex CLI 0.158, gpt-6-astra, 추론 high, 읽기 전용. 2회(줄 단위 도구 74,310 토큰 / AST 도구 88,622 토큰)
- 요청문·원문: `.www/evidence/2026-10-03-feature-template-types/astra-review-{types,tool2}-*.md`
- 동등성 증거(재실행 가능): `bun .www/evidence/2026-10-03-feature-template-types/parity-check.ts .www/evidence/2026-10-03-feature-template-types/move-internal.py` → 함수 이동 48개·타입 이동 11개 사본에서 문장 내용 차이 0

## 1차 검토 — 줄 단위 도구 (적용 결과는 문제없음, 도구 P2 6건·P3 1건)

7개 기능의 적용 차분은 Bun 변환 JavaScript가 전후 동일하고 회귀·혼입이 없었다. 그러나 줄 정규식 기반 도구가 일반 입력에서 깨지는 반례 7개가 재현됐다(타입 뒤 실행문 동반 이동, 템플릿 안 선언 모양, 템플릿 빈 줄 변경, 정규식·나눗셈 판정, 시그니처 객체 타입, 데코레이터 분리, `typeof` 기준 불일치).

**결정:** 지원 구문 제한 대신 TypeScript 7 AST(`source.statements`) 기반으로 다시 작성. 최상위 문장 단위로만 옮기고, 쓴 뒤 재파싱해 계획과 다르면 복원. 장 지도의 타입 후보도 같은 `plan("types")`로 계산.

## 2차 검토 — AST 도구 (직전 7건 해소, 새 P2 3건·P3 2건)

| 지적 | 등급 | 조치 | 테스트 |
|---|---|---|---|
| 재파싱 예외·여러 파일에서 복원 불완전 | P2 | 쓰기와 검증을 하나의 try로 묶고, 실패 시 이미 쓴 파일 전체를 원본으로 복원 | CLI 다중 파일 테스트 |
| 파일 머리 주석·shebang이 첫 선언과 함께 이동 | P2 | 첫 문장 앞 trivia에서 마지막 빈 줄과 pragma(shebang, `@ts-`, eslint, `/// <`, `@jsx`)까지를 파일 헤더로 고정. `"use strict"` 등 지시문은 실행 경계에서 제외 | `keeps file headers such as pragmas and shebangs at the top` |
| 함수·namespace 선언 병합 순서 파괴 | P2 | 같은 이름의 비함수 선언이 있으면 그 함수는 옮기지 않음 | `does not separate a function from a namespace merged with it` |
| CRLF 파일에 LF 삽입 | P3 | 원래 개행 형식으로 구분자 생성 | `keeps CRLF line endings` |
| parity 증거 재실행 불가·이름 비교만 함 | P3 | import 경로 수정, 문장 내용(공백·검사기 끝 쉼표 정규화) 전체 비교, Python 종료 코드 확인 | `parity-check.ts` 재실행 통과 |
| (검토 중 선행 수정) overload 시그니처와 구현 분리 | — | 같은 이름 overload를 구현과 함께 이동, 빈 줄 없이 붙임 | `moves overload signatures together…` |

**결정:** `export default 식별자`는 공개 경계로 취급(`treats export default as a public boundary`). 같은 줄 끝 주석은 줄이 끝날 때만 앞 문장에 귀속하며 스킬 문구를 그 범위로 좁혔다.

## 1차 원문

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
## 2차 원문

**직전 7건은 해소됐습니다. 다만 최신 구현에서 P2 3건·P3 2건을 확인하여, 무조건 통과 판정은 어렵습니다.** 파일 수정·외부 게시·기록은 하지 않았습니다.

검토 중 overload 처리와 테스트가 추가되어 최신 내용을 재검증했습니다. 최종 검토한 `reorder-sections.ts`의 SHA-256은 `0ad315f0…a61cfb4`입니다.

직전 결함의 재검토 결과는 다음과 같습니다.

| 직전 결함 | 판정·근거 |
|---|---|
| 타입 뒤 실행문까지 이동 | 해소. 세미콜론 없는 객체 타입도 추가 확인했습니다. [test/reorder-sections.test.ts:19](/Users/jonghoPro/woo/00_project/99_www/test/reorder-sections.test.ts:19) |
| 템플릿 안 선언 모양 오인 | 해소. 최상위 AST 문장만 처리합니다. [test/reorder-sections.test.ts:25](/Users/jonghoPro/woo/00_project/99_www/test/reorder-sections.test.ts:25) |
| 템플릿 내부 빈 줄 변경 | 해소. 문장 내부 문자열은 보존됩니다. [test/reorder-sections.test.ts:31](/Users/jonghoPro/woo/00_project/99_www/test/reorder-sections.test.ts:31) |
| 정규식 `}`·여러 줄 나눗셈 | 해소. 함수 전체가 이동합니다. [test/reorder-sections.test.ts:37](/Users/jonghoPro/woo/00_project/99_www/test/reorder-sections.test.ts:37) |
| 시그니처 객체 타입을 본문으로 오인 | 해소. 반환 객체 타입 뒤 다음 줄에서 본문이 시작하는 경우도 확인했습니다. [test/reorder-sections.test.ts:43](/Users/jonghoPro/woo/00_project/99_www/test/reorder-sections.test.ts:43) |
| 데코레이터와 클래스 분리 | 해소. [test/reorder-sections.test.ts:49](/Users/jonghoPro/woo/00_project/99_www/test/reorder-sections.test.ts:49) |
| `typeof` 탐지·이동 불일치 | 해소. 실제 TypeQuery 검사와 같은 계획을 사용합니다. [reorder-sections.ts:154](/Users/jonghoPro/woo/00_project/99_www/scripts/reorder-sections.ts:154), [feature-map.ts:116](/Users/jonghoPro/woo/00_project/99_www/scripts/feature-map.ts:116) |

새로 확인한 결함은 다음과 같습니다. 아래 재현은 실제 TypeScript API와 메모리 가상 파일시스템으로 실행했습니다.

1. **P2 — 재파싱 예외와 여러 파일 처리에서 복원이 불완전합니다.**

   쓰기를 모두 수행한 다음 재파싱하지만, 예외를 잡아 복원하는 경로가 없습니다. 불일치도 해당 파일 하나만 복원하고 즉시 종료합니다. [scripts/reorder-sections.ts:83](/Users/jonghoPro/woo/00_project/99_www/scripts/reorder-sections.ts:83), [scripts/reorder-sections.ts:86](/Users/jonghoPro/woo/00_project/99_www/scripts/reorder-sections.ts:86)

   - 두 번째 파싱에 예외를 주입하자 원본으로 복원되지 않았습니다.
   - shebang이 있는 파일 두 개에 `types`를 적용하자 첫 파일만 복원됐습니다. 두 번째 파일은 **타입 선언 아래에 shebang이 놓인 구문 오류 상태**로 남았습니다.

   모든 쓰기·검증을 복원 가능한 범위로 묶고, 실패 시 이미 쓴 대상 전체를 처리해야 합니다.

2. **P2 — 파일 첫머리 주석·shebang을 첫 문장의 부속으로 이동합니다.**

   첫 AST 문장의 `pos`가 0이어서 `head`가 비고, 파일 헤더가 첫 선언에 붙습니다. [scripts/reorder-sections.ts:128](/Users/jonghoPro/woo/00_project/99_www/scripts/reorder-sections.ts:128)

   다음 입력에 `types`를 적용했습니다.

   ```ts
   // @ts-nocheck
   const x: number = "wrong";
   export type X = string;
   ```

   타입이 첫 줄로 올라가면서 `@ts-nocheck`가 효력을 잃었습니다. **진단 0 → TS2322**, 문장 재비교는 통과했습니다.

   shebang도 같은 이유로 중간으로 이동합니다. 단일 파일 CLI에서는 불일치를 감지해 복원하지만, 정상 입력을 처리하지 못하며 여러 파일에서는 1번 결함으로 이어집니다. 파일 전체에 적용되는 헤더는 선언 주석과 분리해야 합니다.

3. **P2 — 함수와 namespace의 선언 병합 순서를 깨뜨립니다.**

   함수 이동 계획이 같은 이름의 namespace를 고려하지 않습니다. [scripts/reorder-sections.ts:95](/Users/jonghoPro/woo/00_project/99_www/scripts/reorder-sections.ts:95)

   ```ts
   function helper() { return 1; }
   namespace helper { export const x = 2; }
   export function api() { return helper.x; }
   ```

   `functions` 적용 후 `helper` 함수가 namespace 뒤로 이동합니다. **진단 0 → TS2434**가 발생하지만 문장 재비교는 통과합니다. 함수 호이스팅만으로 선언 병합의 유효성까지 보장되지는 않습니다. 병합된 선언은 함께 취급하거나 이동에서 제외해야 합니다.

4. **P3 — CRLF 파일에 LF를 삽입합니다.**

   구분자를 항상 `"\n"` 또는 `"\n\n"`으로 생성합니다. [scripts/reorder-sections.ts:166](/Users/jonghoPro/woo/00_project/99_www/scripts/reorder-sections.ts:166)

   ```tex
   입력: const x = 1;\r\nexport type X = string;\r\n
   출력: export type X = string;\n\nconst x = 1;\r\n
   ```

   재파싱은 통과하지만 개행 형식이 혼합됩니다. 원래 개행 형식을 보존하는 편이 맞습니다.

5. **P3 — 제출된 parity 증거는 그대로 재실행할 수 없고, 문장 순서 비교도 불충분합니다.**

   - import가 `../../scripts/reorder-sections`여서 `.www/scripts`를 가리킵니다. 실제 모듈 해석 실패를 확인했습니다. [parity-check.ts:4](/Users/jonghoPro/woo/00_project/99_www/.www/evidence/2026-10-03-feature-template-types/parity-check.ts:4)
   - 비교값은 문장 이름뿐입니다. 변수문은 모두 `VariableStatement`라는 이름이어서 서로 순서가 뒤바뀌어도 검출하지 못합니다. [parity-check.ts:16](/Users/jonghoPro/woo/00_project/99_www/.www/evidence/2026-10-03-feature-template-types/parity-check.ts:16), [reorder-sections.ts:150](/Users/jonghoPro/woo/00_project/99_www/scripts/reorder-sections.ts:150)
   - Python 실행 종료 코드를 확인하지 않고 결과 파일을 읽습니다. [parity-check.ts:22](/Users/jonghoPro/woo/00_project/99_www/.www/evidence/2026-10-03-feature-template-types/parity-check.ts:22)

   따라서 **48개·11개 사본의 차이 0을 이번 검토에서 독립적으로 확인했다고 볼 수 없습니다.**

나머지 요청 경계의 판정입니다.

| 경계 | 판정 |
|---|---|
| 같은 줄의 여러 문장 | 시험한 타입·함수 이동에서 문장 분리와 재파싱 비교가 정상입니다. |
| 끝 주석 뒤 코드 | 코드를 함께 옮기지는 않습니다. 다만 `const x=1; /* x */ export type X=string;`의 주석은 타입과 이동합니다. 연속 블록 주석도 앞 문장에 남지 않습니다. “같은 줄 끝 주석을 함께 이동”한다는 스킬 문구는 지원 범위를 좁혀야 합니다. [reorder-sections.ts:134](/Users/jonghoPro/woo/00_project/99_www/scripts/reorder-sections.ts:134), [SKILL.md:26](/Users/jonghoPro/woo/00_project/99_www/.agents/skills/woo-feature-template/SKILL.md:26) |
| `"use strict"` | 타입이 앞에 삽입되지만, 이번 export가 있는 모듈 사례에서 실행 의미의 회귀는 확인하지 못했습니다. |
| `export default` | 함수 선언 형태는 공개 함수로 처리됩니다. `export default helper` 표현식 형태는 공개 경계로 취급하지 않습니다. 지원 범위 결정 사항입니다. [reorder-sections.ts:138](/Users/jonghoPro/woo/00_project/99_www/scripts/reorder-sections.ts:138) |
| `declare`·overload | 최신 구현에서 일반 overload 묶음은 구현과 함께 이동하고, 별도 `declare function`은 유지됩니다. [reorder-sections.ts:99](/Users/jonghoPro/woo/00_project/99_www/scripts/reorder-sections.ts:99), [test/reorder-sections.test.ts:62](/Users/jonghoPro/woo/00_project/99_www/test/reorder-sections.test.ts:62) |
| namespace·enum | 자체는 이동하지 않습니다. 함수와 namespace의 병합 사례는 위 P2에 해당합니다. |
| 빈 파일 | 빈 상태로 보존됩니다. [reorder-sections.ts:125](/Users/jonghoPro/woo/00_project/99_www/scripts/reorder-sections.ts:125) |
| API 세션 누수 | 정상·실패 경로에서 종료 호출이 대응했습니다. `finally`의 `api.close()`가 활성 snapshot도 정리하므로 별도 누수는 발견하지 못했습니다. [reorder-sections.ts:69](/Users/jonghoPro/woo/00_project/99_www/scripts/reorder-sections.ts:69) |

검증은 `bun run check` 통과, `bun test test/feature-map.test.ts` **6 pass**, 파일 쓰기를 가상화한 기존 reorder 테스트 본문 **9 pass**입니다. 전체 회귀 테스트는 실행하지 않았습니다. 기존 reorder 테스트는 `parse → plan → render`까지만 실행하므로 CLI 복원 결함은 검출하지 못합니다. [test/reorder-sections.test.ts:71](/Users/jonghoPro/woo/00_project/99_www/test/reorder-sections.test.ts:71)

바로 고칠 것: 복원 범위, 파일 헤더 보존, 함수·namespace 병합 보호, CRLF 보존, parity 증거 수정.
결정이 필요한 것: 기본 export 표현식의 공개 경계 처리와 같은 줄 블록 주석의 귀속 규칙.
문제없음: 직전 7건, 최신 일반 overload 묶음, 시험한 다중 문장·빈 파일 처리, API 종료 경로.
