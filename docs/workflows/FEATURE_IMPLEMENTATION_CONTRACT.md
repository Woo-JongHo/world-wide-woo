# Feature Implementation Contract

- 상태: draft — Codex Astra 1·2차 검토 반영([1차](../audit/2026-10-03-codex-astra-structure-review.md), [2차](../audit/2026-10-03-codex-astra-structure-review-2.md))
- 적용 대상: `src`에 새 기능을 추가하거나 기존 기능의 책임을 옮기는 변경, 기존 기능을 같은 형식으로 정리하는 작업
- 실행 스킬: [woo-feature-template](../../.agents/skills/woo-feature-template/SKILL.md)
- 관련 정본: [LAYERS.md](../../LAYERS.md)(의존 방향), [가독성 계약](../../.agents/skills/woo-code-readability/references/readability-contract.md)(파일 안의 행·열), [Design Document Contract](DESIGN_DOCUMENT_CONTRACT.md)(설계 문서와 Obsidian `12. Implementation Map`)

## 목적

기능마다 구현 위치와 순서가 다르면 읽는 사람은 기능을 열 때마다 구조부터 다시 해석해야 하고, 같은 규칙이 파일마다 다시 만들어진다. 2026-10-03 구조 리뷰의 관측은 다음과 같다.

| 관측 | 수치 | 원인 |
|---|---|---|
| `unknown` 값 객체 판별 함수 재정의 | 33곳, 실패 반환값 3종(`null`·`undefined`·`{}`) | 판별 규칙의 소유 위치가 없었다 |
| 파일 변경 해석 함수 | 같은 로직 2벌 | 해석 단계가 화면 파일 안에 있었다 |
| 단일 파일 비대 | `project-workbench.ts` 1,647줄 | 조립·흐름·투영이 한 파일에 쌓였다 |

이 계약은 기능을 **논문처럼 읽히게** 하는 형식을 정한다. 논문의 장 순서가 독자에게 어디서 무엇을 찾을지 알려주듯이, 모든 기능은 같은 **읽기 순서**로 설명되고, 모든 파일은 같은 **절 순서**로 쓰인다.

장 순서는 읽기와 설명의 순서다. 파일이 반드시 존재해야 하는 조건이나 구현 순서로 강제하지 않는다. 해당 없는 장은 만들지 않고, 빈 폴더 금지(LAYERS.md)를 유지한다.

## 원칙

1. **같은 역할은 같은 자리에서 찾는다.** 기능이 달라도 "정의"는 항상 같은 장, "화면 데이터"는 항상 같은 장에 있다.
2. **장은 생략할 수 있지만 순서는 바꾸지 않는다.**
3. **의존 방향은 장 번호가 아니라 LAYERS.md가 정한다.** 장 번호는 읽기 순서일 뿐이다(예: 2장 흐름은 3장 경계를 쓴다). 다만 정의는 화면을 모르고, 해석은 색을 모르며, 표현은 원본 데이터를 해석하지 않는다.
4. **규칙은 한 곳이 소유한다.** 두 번째 구현이 필요해지면 복사하지 않는다. 입력·출력·실패 계약이 같은지 확인한 뒤 소유 장으로 올린다.
5. **기능 설명은 생성한다.** 기능별 장 지도는 코드의 직접 import에서 추정한 후보 투영이다. `미발견`은 책임이 없다는 뜻이 아니다. 손으로 쓴 설명을 별도 정본으로 만들지 않고, 설계 판단은 Obsidian 상세 정본이 소유한다.
6. **실행 순서가 절 순서보다 우선한다.** 모듈 초기화에 쓰이는 값, `extends`·static 필드·static 블록·computed key가 있는 클래스, 최상위 호출이 참조하는 `const`·`let`·`class` 선언은 옮기지 않고 이유를 기록한다. `function` 선언은 본문까지 호이스팅되므로 최상위 호출이 참조하더라도 옮길 수 있다.

## 기능 단위: 장 순서

| 장 | 위치 | 소유 책임 |
|---|---|---|
| 0. 연결 | `features/<f>/registration/` | 기존 Feature·Unit과의 연결. 세부 기능마다 새 registration을 만들지 않는다 |
| 1. 정의 | `core/domain/<영역>/` | 타입·불변식·순수 규칙 |
| 2. 흐름 | `core/application/<영역>/` | use case, 상태 전이 |
| 3. 경계 | `core/ports/<그룹>/` | Core가 요구하는 외부 계약 |
| 4. 입력·조작 | `features/<f>/controller/`, `tui/commands/` | 사용자 입력, 취소, 명령 라우팅 |
| 5. 외부 효과 | `adapters/outbound/<종류>/` | 저장·프로세스·네트워크·인증 같은 실제 효과와 복구 |
| 6. 해석 | `features/<f>/view-model/` | Core 투영 → ANSI 없는 화면 데이터 |
| 7. 표현 | `features/<f>/view/`, 여러 기능이 쓰면 `tui/foundation/` | 색·폭·줄바꿈을 포함한 render |
| 8. 조립 | `app.ts`, `tui/shell/` | 구현 주입과 화면 연결 |
| 9. 검증 | `test/` | 불변식, 경계, 사용자 동작, 실패·취소·복구 |

검증은 장 순서를 그대로 따르지 않는다. 그 기능이 깨졌을 때 손실이 큰 순서로 배치한다. 세션 복원은 저장 순서와 replay 불변식, 인증은 실패·취소, diff 표시는 줄 번호 규칙과 폭 계약이 먼저다.

여러 기능이 같은 값 판별 규칙을 쓰면 1장의 공용 소유자인 `core/domain/value`에 둔다. 이 폴더는 "외부 입력 `unknown` 값의 구조 판별"만 소유하며, 범용 편의 함수 저장소로 넓히지 않는다.

## 파일 단위: 절 순서

모든 파일은 위에서 아래로 같은 순서를 가진다. 소비자가 찾는 공개 기능이 먼저 오고, 구현 세부는 아래로 내려간다.

| 절 | 내용 | 확인 |
|---|---|---|
| §0 import | 값 import와 `import type`을 나눈 하나의 표 | `00_normalize-imports.ts` (게이트) |
| §1 공개 타입 | 이 파일이 정의하는 용어. 이름만으로 의미가 드러나지 않으면 `/** JSDoc */` | hover |
| §2 상수 | 정책 값과 정규식 | — |
| §3 공개 함수·클래스 | 소비자가 호출하는 진입점 | `feature-map` 절 순서 후보 |
| §4 내부 처리 | 공개 함수가 부르는 단계와 helper | `feature-map` 절 순서 후보 |

반복되는 선언·필드·호출은 가독성 계약대로 표로 정렬하고 `06_align-tables.ts`(게이트)로 확인한다.

함수 이름은 권고다. 정의는 `parse*`·`classify*`·`is*`, 해석은 `project*`, 표현은 `render*`를 우선 쓴다. 단, 행위를 드러내는 기존 이름(`replaySessionEvents`, `login`)을 형식에 맞추려고 바꾸지 않는다.

함수 지도(`GROUP | FUNCTION | …`)는 탐색 보조 자료다. 필요하면 `08_function-map.ts --scaffold`로 만든다. 현재 검사기는 RETURN 의미와 실제 호출 관계를 검증하지 않으므로 설계 정확성의 게이트로 쓰지 않는다.

## 작성 절차 (권장)

구현 순서는 강제하지 않는다. 다음은 권장 흐름이다.

1. **정의를 먼저 고정하면 쉽다.** 1장에 타입과 순수 규칙, 그 규칙의 테스트를 둔다.
2. **필요한 장만 연다.** 저장·외부 호출·입력이 없으면 2–5장을 만들지 않는다.
3. **해석과 표현을 나눈다.** 같은 해석이 두 화면에 필요하면 6장에 하나만 둔다. 길이 제한 같은 표시 정책 상수는 기능의 `*-policy.ts` 한 곳에 둔다.
4. **조립한다.**
5. **검증 게이트를 통과시키고 독립 검토를 받는다.**

## 검증 게이트

| 게이트 | 명령 | 통과 기준 |
|---|---|---|
| 타입 | `bun run check` | 오류 0 |
| 경계 | `bun test test/architecture.test.ts` | 실패 0 |
| import | `bun <SKILL>/scripts/typescript/00_normalize-imports.ts <파일>` | `changed=0` |
| 표 | `bun <SKILL>/scripts/typescript/06_align-tables.ts --file <파일>` | `misaligned=0` |
| 행동 | `bun test <관련 테스트>` | 새 테스트 통과 |
| 회귀 | `bun test` 실패 목록을 작업 전과 비교 | 새 실패 0 |
| 장 지도 | `bun run feature-map:check` | 생성 결과가 최신(정확성이 아니라 최신성만 확인) |
| 모듈 초기화 | 바꾼 모듈마다 `bun -e 'await import("./src/<파일>")'` | 오류 0 |
| 독립 검토 | Codex Astra 읽기 전용 검토 | P1·P2 결함 0, 또는 사용자에게 남은 결정으로 보고 |

전체 테스트에 기존 실패가 있으면 통과 개수가 아니라 **실패 목록의 차이**로 판정한다. 시간 표기(`[12.3ms]`)를 제거한 실패 이름 목록을 변경 전 소스와 변경 후 소스에서 각각 저장해 `diff`한다. 변경 전 목록은 검토 기록에 증거로 남긴다.

## 사례: Chat 코드 변경 표시

Edit 카드 아래에 줄 번호, `+`/`-` 배경색, 10줄 접기를 붙인 기능이다.

```text
0. 연결     features/chat/registration/chat.units.ts       기존 Chat Unit
1. 정의     core/domain/execution/file-diff.ts             parseUnifiedDiff, diffStats, classifyDiffLine
2–5.        해당 없음 — 흐름·외부 계약·입력·효과 없음
6. 해석     features/chat/view-model/file-change.ts        projectFileChanges
7. 표현     tui/foundation/rendering/unified-diff-view.ts  renderUnifiedDiff
            features/chat/view/www-execution.ts            wwwToolRows → Edit 카드 (Ctrl+E 펼침)
            features/chat/view/chat-output-policy.ts       CHAT_DIFF_PREVIEW_ROWS = 10
8. 조립     기존 Chat 카드 경로
9. 검증     test/work-step-card-highlight.test.ts          번호 규칙 → 경계 입력 → 폭 계약 → 접기·펼치기
```

| 결정 | 근거 |
|---|---|
| 줄 번호·통계 계산을 `core/domain`에 둔다 | 6장(`view-model`)이 통계를 쓰는데 `view-model`은 `foundation`을 참조할 수 없다. 처음 `foundation`에 두었을 때 아키텍처 테스트가 위반을 잡았다 |
| 구분 기호 `⋮`와 생략 문구는 7장이 정한다 | Core는 행의 종류·번호·원문만 소유한다(Astra 검토) |
| 파일 헤더는 hunk 밖에서만 인정한다 | hunk 본문의 `--- title`은 삭제 행이다(Astra 검토 P2) |
| 생략·범위 없는 `@@` 뒤에는 번호를 표시하지 않는다 | 생략된 행의 구성을 모르므로 번호를 확정할 수 없다(Astra 검토 P2) |
| 펼칠 수 없는 ObservationCard는 접지 않는다 | 접기는 펼칠 수단이 있는 화면에만 적용한다(Astra 검토 P2) |

## 구조 리뷰 방법

| 대상 | 측정 | 판정 |
|---|---|---|
| 스킬 | 다른 스킬·AGENTS·코드의 참조 수, 최근 사용, 제품 코드 의존, 링크 대상 존재 | 참조가 끊겼으면 수정, 다른 스킬의 한 단계와 겹치면 합침, 제품이 실행하는 스킬은 유지 |
| 재사용 | 같은 역할 helper의 정의 수와 반환 계약 | 같은 계약이면 소유 장으로 올림, 다르면 차이를 호출부에 명시 |
| 일관성 | 문서 규칙과 실제 코드, 파일 크기, 250자 초과 줄 | 틀린 쪽을 고침 |
| 경계 | 아키텍처 테스트, 기능 간 직접 import | 위반 0 |

## 미결

- §3·§4 절 순서 정리는 2026-10-03 19개 기능에 적용했다([묶음 1](../audit/2026-10-03-feature-template-batch1.md), [묶음 2](../audit/2026-10-03-feature-template-batch2.md), [usage](../audit/2026-10-03-feature-template-usage.md), [chat](../audit/2026-10-03-feature-template-chat.md)). 남은 후보는 `const` 화살표 helper(test 3건)와 내부 클래스(chat 1건)이며 원칙 6에 따라 유지했다.
- §1·§2(공개 타입·상수 순서) 정리는 별도 작업 종류로 아직 진행하지 않았다.
- 파일 절 순서 검사를 98_Plugin의 AST 기반 검사기로 옮길지 여부. 그 전까지는 `feature-map`이 후보만 보고한다.
- `diff --git` 없이 여러 파일을 담은 범위 없는 diff는 지원하지 않는다(파일 하나의 diff가 입력 계약). 실제 공급자 유입은 미확인.
