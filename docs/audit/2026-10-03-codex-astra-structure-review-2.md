# Codex Astra 구조 리뷰 검토 — 2차 (2026-10-03)

- 검토자: Codex CLI 0.158, gpt-6-astra, 추론 high, 읽기 전용 샌드박스, 94,732 토큰
- 대상: 1차 조치, 개정한 [Feature Implementation Contract](../workflows/FEATURE_IMPLEMENTATION_CONTRACT.md), `scripts/feature-map.ts`, `woo-feature-template` 스킬
- 요청문: `.www/evidence/2026-10-03-structure-review/astra-review-2-prompt.md`
- 1차 기록: [2026-10-03-codex-astra-structure-review.md](2026-10-03-codex-astra-structure-review.md)

## 반영 결과

| 지적 | 등급 | 조치 | 확인 |
|---|---|---|---|
| context 행의 `… N diff lines omitted`를 생략 표식으로 오인 | P2 | 생략 표식은 0열에서 시작할 때만 인정(`trim` 제거) | `keeps a context row that quotes the omission marker` |
| 범위 없음/생략 뒤 `diff --git` 없는 다음 파일 헤더를 본문으로 집계 | P2 | 결정: 입력 계약을 "파일 하나의 diff"로 명시하고 여러 파일은 `diff --git` 경계만 지원. 추측으로 헤더를 되돌리지 않음 | `file-diff.ts` JSDoc, 계약 미결 항목 |
| 장 지도가 추정을 "해당 없음"으로 단정, 스킬이 9장만으로 테스트 선정 | P2 | `미발견`으로 표기하고 지도 머리에 추정 범위 명시. 외부 효과는 `implements` 선언 파일만. 스킬의 테스트 선정에 변경 파일 importer와 위험 시나리오 추가 | `FEATURE_MAP.md` 머리, 스킬 6단계 |
| 미커밋 변경과 이번 작업의 차분을 분리할 기준점 부족 | P2 | 스킬 2·4·7단계: staged·unstaged·untracked 기록, 작업 직전 사본과 digest, 편집 직전 재대조, `work.diff`를 검토자에게 제공. 기준선에 HEAD·작업 트리 digest·명령 기록 | 스킬, 검토 템플릿 |
| 공개 클래스 이동의 초기화 위험 | P2 | 계약 원칙 6 "실행 순서가 절 순서보다 우선", 스킬에 옮기지 않는 대상 명시, 모듈 초기화 smoke 게이트, 생성기가 `extends`/static 클래스에 경고 표시 | `tags classes whose move can change initialization order` |
| 절 순서 탐지의 거짓 양성·음성 | P3 | 블록 주석 제거, `export const` 화살표·`export default`·`abstract class`·별도 `export { }` 인식, "후보"로 표기하고 0건이 준수 증거가 아님을 명시 | `test/feature-map.test.ts` 3건 |
| 계약에 구현·의존 순서 강제가 남음 | P3 | 원칙 3을 LAYERS.md 방향으로 교체, 작성 절차를 권장으로 낮춤, 절 순서 정리와 중복 해석 이동을 별도 변경 단위로 분리 | 계약, 스킬 범위 절 |
| 검토 템플릿의 "Claude 검증 보고" | 제안 | "실행자 검증 보고"로 변경 | 템플릿 |
| 생성기가 `tsconfig` 검사 대상 밖 | 관찰 | 해소됨: `test/feature-map.test.ts`가 생성기를 import하므로 `tsc` 검사 대상에 들어간다(3차 검토에서 확인). | `tsc --listFilesOnly` |

반영 후 전체 테스트 실패 목록은 1차 반영 후와 같다(93건, 모두 기존 실패).

## 원문

**1차 수정은 대부분 유효하지만, 19개 기능 전체 적용은 아래 P2 항목을 보완한 뒤 진행하는 것이 좋겠습니다.** P1 결함은 확인하지 못했습니다. 파일 수정·외부 게시 없이 검토했습니다.

직접 실행한 결과는 타입 검사 통과, 대상 테스트 **27개 통과**, 아키텍처 테스트 **17개 통과**, 장 지도 `check` 통과입니다.

**1차 조치 판정**

| 지적 | 판정 | 근거 |
|---|---|---|
| hunk 본문의 `---`·`+++` 소실 | **P2 해소 — 범위가 있는 정상 hunk 기준.** 본문으로 보존하고 양쪽 범위를 소비합니다. | [file-diff.ts:65](/Users/jonghoPro/woo/00_project/99_www/src/core/domain/execution/file-diff.ts:65) |
| `\ No newline…` 번호 증가 | **P2 해소.** 표식이 행·번호를 소비하지 않습니다. | [file-diff.ts:59](/Users/jonghoPro/woo/00_project/99_www/src/core/domain/execution/file-diff.ts:59) |
| 생략 뒤 번호 추정 | **P2 해소.** 번호와 남은 범위를 함께 `null`로 전환합니다. 단, 생략 표식 판별에는 아래 잔존 결함이 있습니다. | [file-diff.ts:60](/Users/jonghoPro/woo/00_project/99_www/src/core/domain/execution/file-diff.ts:60) |
| ObservationCard의 펼칠 수 없는 접기 | **P2 해소.** `maxRows`를 전달하지 않습니다. | [work-step-components.ts:129](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/chat/view/work-step-components.ts:129) |
| 좁은 폭 초과 | **P2 해소 — 확인한 정수 폭 기준.** 번호→마커 순으로 생략하고 최종 본문을 자릅니다. 폭 0–20, 한글·이모지·탭을 포함한 추가 검사에서도 초과가 없었습니다. | [unified-diff-view.ts:46](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/foundation/rendering/unified-diff-view.ts:46) |
| 접기 개수에 gap 포함 | **P3 해소.** gap을 제외해 계산하며, 10행 뒤 다른 hunk 1행은 `+1 lines`입니다. | [unified-diff-view.ts:33](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/foundation/rendering/unified-diff-view.ts:33) |
| 끊긴 intake 참조 | **P3 해소.** 현재 이름을 참조합니다. | [SKILL.md:8](/Users/jonghoPro/woo/00_project/99_www/.agents/skills/woo-linear-issue-intake/SKILL.md:8) |
| record 주석 | **해소.** Date·Map·인스턴스 허용과 동일 참조 반환을 정확히 설명합니다. | [record.ts:1](/Users/jonghoPro/woo/00_project/99_www/src/core/domain/value/record.ts:1) |
| Core의 gap 표시 문자 | **해소.** Core는 빈 문자열, 표현 계층은 `⋮`를 사용합니다. | [file-diff.ts:51](/Users/jonghoPro/woo/00_project/99_www/src/core/domain/execution/file-diff.ts:51), [unified-diff-view.ts:54](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/foundation/rendering/unified-diff-view.ts:54) |

새 테스트 4개는 실제로 위 동작을 검증합니다. 다만 범위 없는 입력·여러 파일 경계·생략 문구와 같은 실제 본문은 다루지 않습니다. [work-step-card-highlight.test.ts:228](/Users/jonghoPro/woo/00_project/99_www/test/work-step-card-highlight.test.ts:228)

회귀 증거 두 파일은 **94개→93개**, 삭제된 실패 이름은 `dual-repository code readability integration…` 한 건뿐이었습니다. 따라서 **기록된 실패 목록에 새 항목이 없다는 주장**은 확인했습니다. 다만 목록 자체에는 소스 digest·실행 환경·종료 상태가 없어, 정확히 어떤 변경 전 소스에서 실행했는지까지 독립적으로 입증하지는 못합니다. 전체 테스트는 이번에 재실행하지 않았습니다. [test-failures-before.txt:7](/Users/jonghoPro/woo/00_project/99_www/.www/evidence/2026-10-03-structure-review/test-failures-before.txt:7), [검토 기록:6](/Users/jonghoPro/woo/00_project/99_www/docs/audit/2026-10-03-codex-astra-structure-review.md:6)

**남은 결함과 실행 전 보완점은 다음과 같습니다.**

1. **P2 — 실제 context 행을 생략 표식으로 오인합니다.**

   `classifyDiffLine`이 `trim()`한 문자열로 생략을 판별하므로, 정상 unified diff의 context 접두 공백까지 지워집니다. 다음 입력을 직접 실행했습니다.

   ```tex
   @@ -10,3 +10,3 @@
    star
    … 5 diff lines omitted
    end
   ```

   기대 번호는 `10, 11, 12`인데 실제 결과는 `context(10), omitted(null), context(null)`입니다. 파일에 적힌 문장이 표시용 metadata로 바뀝니다. 이는 **잔존 판별 결함이며, 번호를 null로 만드는 조치의 영향까지 받습니다.**

   생략 표식은 본문 접두 문자를 제거하기 전에 구분하거나, 공급자가 전달하는 별도 metadata로 표현해야 합니다. 위 사례를 회귀 테스트에 추가하는 것이 좋겠습니다. [file-diff.ts:22](/Users/jonghoPro/woo/00_project/99_www/src/core/domain/execution/file-diff.ts:22), [file-diff.ts:60](/Users/jonghoPro/woo/00_project/99_www/src/core/domain/execution/file-diff.ts:60)

2. **P2 — 범위를 잃은 뒤에는 Git 구분자 없는 다음 파일 헤더가 변경 본문으로 집계됩니다.**

   범위 없는 `@@` 또는 생략 표식 이후에는 cursor가 계속 `UNKNOWN_POSITION`입니다. 이 상태에서 다음 파일의 `--- a/b`, `+++ b/b`가 오면 헤더 제외 조건에 들어가지 못합니다. 직접 실행한 두 파일 예제는 실제 추가·삭제 각 2행을 **각 3행**으로 집계했습니다. [file-diff.ts:62](/Users/jonghoPro/woo/00_project/99_www/src/core/domain/execution/file-diff.ts:62), [file-diff.ts:65](/Users/jonghoPro/woo/00_project/99_www/src/core/domain/execution/file-diff.ts:65)

   확인한 범위를 구분하면 다음과 같습니다.

   - `+ changed`: 추가 1행, 번호 `null`로 정상 처리합니다.
   - 범위 없는 단일 `@@`: 번호 `null`, `--- title`·`+++ title` 본문 보존이 정상입니다.
   - 정확한 범위를 가진 여러 파일: `diff --git` 없이도 정상입니다.
   - 파일마다 `diff --git`이 있는 입력: 범위가 없어도 파일 경계를 재설정합니다.
   - **범위 없음/생략 이후 + `diff --git` 없는 다음 파일:** 위 오집계가 발생합니다.

   이 조합이 실제 공급자에서 유입되는지는 **미확인**입니다. 입력을 파일별로 제한할지, 여러 파일을 지원할지 계약을 명시해야 합니다. 무조건 `---`·`+++`를 헤더로 되돌리면 1차 본문 소실 문제가 재발하므로, 파일 경계 정보 없이 추측해서 해결하면 안 됩니다.

3. **P2 — 장 지도가 추정 결과를 “해당 없음”으로 단정하고, 스킬이 그 지도를 검증 대상 선택에 사용합니다.**

   생성기는 기능 파일의 **직접 import**만 수집합니다. 전이 의존성·실제 주입 경로·클래스 내부 책임은 추적하지 않습니다. [feature-map.ts:55](/Users/jonghoPro/woo/00_project/99_www/scripts/feature-map.ts:55)

   실제 누락·과잉 포함 사례가 있습니다.

   - 인증의 입력·조작 장은 “해당 없음”이지만, `auth-overlay.ts`에는 입력 처리와 로그인·취소 흐름이 있습니다. 폴더 위치를 책임 부재로 해석한 결과입니다. [FEATURE_MAP.md:52](/Users/jonghoPro/woo/00_project/99_www/docs/features/FEATURE_MAP.md:52), [auth-overlay.ts:192](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/authentication/view/auth-overlay.ts:192)
   - 인증 외부 효과 목록에서 `credential-store.ts`와 `antigravity-local-auth.ts`는 빠집니다. 각각 조립 함수와 Controller를 통해 실제 사용됩니다. [project-auth.ts:3](/Users/jonghoPro/woo/00_project/99_www/src/adapters/outbound/authentication/project-auth.ts:3), [antigravity-auth.ts:14](/Users/jonghoPro/woo/00_project/99_www/src/adapters/outbound/authentication/antigravity-auth.ts:14)
   - 반대로 cache의 외부 효과에 `codex-app-server-protocol.ts`가 포함됩니다. 이 파일은 해당 Port 파일의 DTO 타입을 import했다는 이유로 “구현체” 후보가 됩니다. 타입 소비와 Port 구현을 구분하지 않습니다. [feature-map.ts:72](/Users/jonghoPro/woo/00_project/99_www/scripts/feature-map.ts:72), [codex-app-server-protocol.ts:15](/Users/jonghoPro/woo/00_project/99_www/src/adapters/outbound/execution/codex-app-server-protocol.ts:15)
   - 인증 검증 장에는 `auth-overlay.test.ts`만 있고, 실제 목록에 포함된 외부 구현의 `auth-service.test.ts`, `antigravity-auth.test.ts`는 없습니다. 테스트 선택이 기능 폴더 직접 import에 한정되기 때문입니다. [FEATURE_MAP.md:57](/Users/jonghoPro/woo/00_project/99_www/docs/features/FEATURE_MAP.md:57), [feature-map.ts:86](/Users/jonghoPro/woo/00_project/99_www/scripts/feature-map.ts:86)

   전체 테스트 비교가 보완망이므로 이것만으로 테스트가 완전히 누락된다고 단정하지는 않습니다. 다만 **“직접 참조 후보 / 미발견”으로 표시하고, 관련 테스트는 변경 파일과 위험 시나리오에서 별도로 선정**해야 합니다. 현재 스킬의 “9장 테스트”를 충분조건으로 삼으면 안 됩니다. [SKILL.md:24](/Users/jonghoPro/woo/00_project/99_www/.agents/skills/woo-feature-template/SKILL.md:24)

4. **P2 — 미커밋 변경이 섞인 상태에서 이번 작업만 독립 검토할 기준점이 부족합니다.**

   스킬은 대상의 `git diff`를 확인하지만, 기본 `git diff`에는 **staged 변경과 untracked 파일이 포함되지 않습니다.** 현재 검토 대상에도 untracked 파일이 있습니다. 검토 템플릿은 “해당 작업 차이만 평가”하도록 요구하면서 작업 직전 파일이나 정확한 차분을 제공하지 않습니다. [SKILL.md:19](/Users/jonghoPro/woo/00_project/99_www/.agents/skills/woo-feature-template/SKILL.md:19), [astra-review-prompt.md:10](/Users/jonghoPro/woo/00_project/99_www/.agents/skills/woo-feature-template/references/astra-review-prompt.md:10)

   전체 실행 전, 기능마다 다음을 절차에 넣어야 합니다.

   - staged·unstaged·untracked를 포함한 대상 파일의 작업 직전 내용과 digest 고정.
   - 그 상태 대비 이번 작업의 차분을 검토자에게 제공.
   - 편집 전 원본이 달라졌으면 재대조하여 사용자 동시 변경 보존.
   - 실패 기준선도 같은 소스·의존성·명령에 연결하고 실행 오류와 테스트 미발견을 별도 실패로 처리.

   지금 규칙은 변경 의도를 존중하라는 선언은 있지만, **보존과 검토 범위 분리를 검증할 수단**이 부족합니다.

5. **P2 — 공개 클래스 이동의 초기화 위험을 더 명확히 예외 처리해야 합니다.**

   스킬이 화살표 함수 TDZ와 초기화 값을 언급한 점은 좋습니다. 그러나 공개 클래스를 위로 올리는 지시에는 `extends`, static 필드·블록, computed key, 간접 초기화 호출에 대한 구체적인 확인이 없습니다. [SKILL.md:21](/Users/jonghoPro/woo/00_project/99_www/.agents/skills/woo-feature-template/SKILL.md:21)

   예를 들어 다음 순서에서 공개 클래스만 앞으로 옮기면 static 초기화가 내부 클래스의 TDZ에 걸립니다.

   ```ts
   class Inner { static value = 1; }
   function make() { return Inner.value; }
   export class Public { static value = make(); }
   ```

   메모리 내 실행으로 이동 후 `ReferenceError`를 확인했습니다. **저장소에 이미 이 회귀가 있다는 뜻은 아니며, 전체 적용 시 발생 가능한 위험입니다.**

   “초기화 의존성이 있으면 절 순서보다 실행 순서를 우선한다”를 계약에 명시하고, 변경 모듈의 import·생성 smoke 검증을 추가하는 편이 안전합니다. 이유를 기록하고 이동하지 않을 수 있는 현재 완료 기준은 유지하면 됩니다. [SKILL.md:43](/Users/jonghoPro/woo/00_project/99_www/.agents/skills/woo-feature-template/SKILL.md:43)

6. **P3 — 절 순서 탐지는 보고용으로도 한계 표시가 필요합니다.**

   실제 함수에 메모리 내 입력을 넣어 다음을 확인했습니다.

   | 입력 형태 | 결과 |
   |---|---|
   | 블록 주석 안의 `function helper()` 뒤 공개 함수 | **거짓 양성** |
   | 내부 함수 뒤 `export const publicApi = …` | **거짓 음성** |
   | `function publicApi()`와 별도 `export { publicApi }` | **거짓 음성** |
   | 내부 Base 뒤 공개 파생 클래스 | 경고하지만 그대로 이동하면 위험 |

   `export default`, `abstract class`, 들여쓴 선언도 현재 정규식 범위 밖입니다. 또한 공개 타입·상수의 순서는 검사하지 않으므로 **보고 0건은 전체 절 순서 준수의 증거가 아닙니다.** [feature-map.ts:93](/Users/jonghoPro/woo/00_project/99_www/scripts/feature-map.ts:93)

   AST의 최상위 선언·실제 export를 기준으로 바꾸거나, 현재 보고를 “일부 선언 패턴의 후보”로 명시해야 합니다. 최소한 주석 오인·화살표 함수·별도 export·초기화 예외를 생성기 테스트로 고정하는 것이 좋겠습니다.

7. **P3 — 개정 계약에 구현 순서·의존 순서 강제가 일부 남아 있습니다.**

   장 순서를 읽기 순서로 한정하고, 입력·외부 효과 장과 위험 기반 검증을 추가한 변경은 적절합니다. 이름 권고와 함수 지도의 게이트 제외도 반영됐습니다. [계약:20](/Users/jonghoPro/woo/00_project/99_www/docs/workflows/FEATURE_IMPLEMENTATION_CONTRACT.md:20), [계약:45](/Users/jonghoPro/woo/00_project/99_www/docs/workflows/FEATURE_IMPLEMENTATION_CONTRACT.md:45), [계약:63](/Users/jonghoPro/woo/00_project/99_www/docs/workflows/FEATURE_IMPLEMENTATION_CONTRACT.md:63)

   다만 다음 문장은 충돌합니다.

   - “앞 장은 뒷 장을 모른다”: 2장 application이 3장 ports를 사용하는 정상 의존 방향과 맞지 않습니다. 장 번호 대신 `LAYERS.md`의 방향만 적용해야 합니다. [계약:26](/Users/jonghoPro/woo/00_project/99_www/docs/workflows/FEATURE_IMPLEMENTATION_CONTRACT.md:26)
   - “정의부터 쓴다”: 읽기 순서 한정과 달리 구현 순서를 다시 강제합니다. 권장 예시로 낮추는 편이 맞습니다. [계약:69](/Users/jonghoPro/woo/00_project/99_www/docs/workflows/FEATURE_IMPLEMENTATION_CONTRACT.md:69)
   - 절 순서 정리와 중복 해석 이동을 한 절차에 묶었습니다. 후자는 호출 계약·참조·상태 공유까지 바꿀 수 있으므로 별도 변경 단위와 검증으로 분리하는 편이 좋습니다. [SKILL.md:22](/Users/jonghoPro/woo/00_project/99_www/.agents/skills/woo-feature-template/SKILL.md:22)

**생성기 `check`의 실행 안정성은 현재 확인 범위에서 문제없습니다.** 저장소 밖 `/tmp`에서 실행해도 통과했고, 그래프 순회 순서를 뒤집어도 출력이 같았습니다. 절대 기준 경로와 명시적 정렬이 있어 cwd·파일 열거 순서에 따른 변동은 확인되지 않았습니다. 다른 OS·Bun 버전까지 검증한 것은 아닙니다. [feature-map.ts:33](/Users/jonghoPro/woo/00_project/99_www/scripts/feature-map.ts:33), [feature-map.ts:138](/Users/jonghoPro/woo/00_project/99_www/scripts/feature-map.ts:138)

다만 `check`는 **현재 알고리즘으로 재생성한 문자열과 일치하는지**만 검사합니다. import 분석도 정규식이라 주석·문자열의 가짜 import를 포함하고 side-effect import는 놓칠 수 있습니다. 정확성 검증과 최신성 검증을 구분해야 합니다. 생성기 자체는 현재 `tsconfig`의 검사 대상에도 포함되지 않습니다. [feature-map.ts:40](/Users/jonghoPro/woo/00_project/99_www/scripts/feature-map.ts:40), [import-graph.ts:18](/Users/jonghoPro/woo/00_project/99_www/test/architecture/import-graph.ts:18), [tsconfig.json:15](/Users/jonghoPro/woo/00_project/99_www/tsconfig.json:15)

AGENTS 등록과 스킬 링크는 정상입니다. 검토 템플릿의 `Claude 검증 보고` 필드는 실행자가 고정되지 않은 절차와 맞도록 `실행자 검증 보고`로 바꾸면 됩니다. [AGENTS.md:10](/Users/jonghoPro/woo/00_project/99_www/AGENTS.md:10), [astra-review-prompt.md:11](/Users/jonghoPro/woo/00_project/99_www/.agents/skills/woo-feature-template/references/astra-review-prompt.md:11)

**바로 고칠 것:** context의 생략 표식 오인, 지도 미발견의 단정 표현, 작업 직전 차분 고정, 클래스 초기화 예외·검증 절차.
**결정이 필요한 것:** 범위 없는 여러 파일 diff의 지원 계약, 장 지도의 추적 범위, 절 순서 정리와 중복 해석 이동의 분리.
**문제없음:** 확인한 1차 수정 대부분, 헤더 없는 `+ changed`, 정상 범위·Git 경계 처리, 정수 폭 계약, 현재 환경의 지도 생성 결정성.