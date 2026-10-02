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
