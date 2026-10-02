# Feature Template 적용 — chat (2026-10-03)

- 작업 종류: 절 순서 정리(§3·§4)만, 파일 17개(내부 function 94개 이동)
- 검토자: Codex CLI 0.158, gpt-6-astra, 추론 high, 읽기 전용, 98,281 토큰
- 요청문: `.www/evidence/2026-10-03-feature-template/astra-review-chat-prompt.md`
- 1차 실행 실패: 이동 도구가 정규식 리터럴을 코드로 읽어 `result-cards.ts` 문법 오류. 타입 검사 실패 시 자동 복원으로 17개 파일 모두 `before/` digest로 복귀(`chat-failed-run1/`). 정규식 리터럴 모드를 추가하고 임시 사본에서 17개 파일을 먼저 검증한 뒤 재실행
- 남은 후보 1건: 내부 `class BrailleCanvas`(TDZ, 이번 작업 종류 밖) — `chat/remaining.md`

## 반영 결과

| 지적 | 등급 | 조치 |
|---|---|---|
| 최상위 초기화에서 호출하는 함수 선언 3개(`octopusPoints`, `referenceTrail`×2)를 이동해 계약 문언과 불일치 | P3 | 결정: 이동 유지. `function` 선언은 본문까지 호이스팅되므로 동작 위험이 없다(검토자도 회귀 없음 확인). 계약 원칙 6과 스킬 4단계를 "최상위 호출이 참조하는 `const`·`let`·`class`"로 정확히 하고 `function` 예외를 명시 |

## 원문

**P1·P2 결함은 발견하지 못했습니다. P3 계약 불일치 1건이 있습니다.** 지정된 `work.diff`만 평가했으며 파일 수정·외부 게시·기록은 하지 않았습니다.

- **P3 — 최상위 초기화에서 호출하는 함수 3개도 이동했습니다.** [계약:29](/Users/jonghoPro/woo/00_project/99_www/docs/workflows/FEATURE_IMPLEMENTATION_CONTRACT.md:29)는 “최상위 호출이 참조하는 선언은 옮기지 않는다”고 규정합니다. 해당 선언은 [octopusPoints:88](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/chat/view/octopus-scan.ts:88), [lab의 referenceTrail:122](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/chat/view/three-body-lab.ts:122), [orbit의 referenceTrail:56](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/chat/view/three-body-orbit.ts:56)입니다. 각각 같은 파일의 19·20·15행에서 모듈 초기화 중 호출됩니다. 함수 호이스팅과 값 초기화 순서 보존으로 **현재 동작 회귀는 확인되지 않았지만**, 계약 문언에는 맞지 않습니다. 해당 이동을 되돌리거나, 검증된 함수 선언 이동을 허용하는 예외를 계약에 명시해야 합니다.

나머지 검토 결과는 다음과 같습니다.

- **동작·혼입:** `before/`에 차분을 메모리에서 적용한 결과가 현재 17개 파일과 모두 일치했습니다. TypeScript AST로 내부 함수 **94개 전체의 동일성**, 나머지 선언·구문의 동일성과 상대 순서 보존을 확인했습니다. 계약이 다른 코드의 병합이나 새로운 레이어 의존은 없습니다. 앞선 diff 표시·record 통합 변경도 이번 작업에 추가로 혼입되지 않았습니다.
- **초기화:** const·class의 상대 순서가 유지돼 TDZ·`extends`·static·computed key 관련 새로운 초기화 문제는 발견하지 못했습니다. 첫 실패 원인이었던 [result-cards.ts:156](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/chat/view/result-cards.ts:156)의 정규식 포함 함수도 AST가 동일합니다.
- **형식:** 공개 함수·클래스보다 앞선 내부 함수는 모두 정리됐습니다. 장 간 책임 이동은 없습니다. [BrailleCanvas:51](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/chat/view/three-body-braille.ts:51) 유지에는 [remaining.md:3](/Users/jonghoPro/woo/00_project/99_www/.www/evidence/2026-10-03-feature-template/chat/remaining.md:3)에 범위상 이유가 기록돼 있어 수용 가능합니다. §1·§2는 이번 범위 밖이며, 전체 절 순서까지 완전히 정리됐다는 판정은 아닙니다.
- **검증:** 직접 실행한 타입 검사, 아키텍처 테스트 **17개**, 관련 테스트 **25개**, 개별 모듈 import **17개**가 통과했습니다. 전체 테스트는 재실행하지 않았으며, 저장된 전후 실패·오류 목록의 동일성을 확인했습니다. 기존 **95 실패·2 오류**는 남아 있습니다([test-after.txt:101](/Users/jonghoPro/woo/00_project/99_www/.www/evidence/2026-10-03-feature-template/chat/test-after.txt:101)).

바로 고칠 것 / 동작 결함 없음. P3 계약 불일치 1건을 처리해야 합니다.
결정이 필요한 것 / 최상위 호출 대상 함수 3개의 이동 복원 또는 계약 예외 명시.
문제없음 / AST 동일성, 초기화 동작, 레이어 경계, 변경 범위 보존, 기록된 클래스 보류.