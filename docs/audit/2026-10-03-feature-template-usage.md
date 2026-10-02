# Feature Template 적용 — usage (2026-10-03)

- 작업 종류: 절 순서 정리(§3·§4)만, 파일 4개(내부 function 39개 이동)
- 검토자: Codex CLI 0.158, gpt-6-astra, 추론 high, 읽기 전용, 100,932 토큰
- 요청문: `.www/evidence/2026-10-03-feature-template/astra-review-usage-prompt.md`
- 결과: P1·P2·P3 없음. 조치 없음.

## 원문

**P1·P2·P3 결함을 발견하지 못했습니다.** 지정된 `work.diff`만 평가했으며, 파일 수정이나 외부 게시·기록은 하지 않았습니다.

- **초기화 순서:** 내부 `function` 선언만 공개 진입점 뒤로 이동했습니다. 상수·클래스의 상대 순서는 유지됩니다. `UsageStripView`의 `Date.now()`는 인스턴스 필드 초기화이며, 클래스 정의 시 실행되는 static 초기화가 아닙니다. 이동으로 인한 TDZ·`extends`·computed key·최상위 호출 문제는 없습니다. 근거: [usage-strip-view.ts:35](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/usage/view/usage-strip-view.ts:35), [www-usage-view.ts:35](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/usage/view/www-usage-view.ts:35), [www-usage.ts:12](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/usage/view/www-usage.ts:12).
- **동작·경계·혼입:** 함수 본문과 공개 계약을 유지했고, 서로 다른 계약의 함수를 합치거나 import 의존성을 바꾸지 않았습니다. `before/` 해시가 기록과 일치하며, 여기에 `work.diff`를 적용한 결과가 현재 4개 파일과 모두 일치합니다. 기존 사용자 변경을 이번 작업으로 오인하지 않았습니다. 근거: [digest-recheck.txt:1](/Users/jonghoPro/woo/00_project/99_www/.www/evidence/2026-10-03-feature-template/usage/digest-recheck.txt:1), [status-before.txt:1](/Users/jonghoPro/woo/00_project/99_www/.www/evidence/2026-10-03-feature-template/usage/status-before.txt:1).
- **형식:** 이번 범위인 §3 공개 선언 → §4 내부 처리 순서를 충족합니다. 파일 위치와 장별 책임은 그대로이며, 형식 적용으로 의미를 해친 부분은 없습니다. 공개/내부 경계는 각각 [usage-strip-view.ts:72](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/usage/view/usage-strip-view.ts:72), [www-usage-catalog.ts:77](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/usage/view/www-usage-catalog.ts:77), [www-usage-view.ts:99](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/usage/view/www-usage-view.ts:99), [www-usage.ts:147](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/usage/view/www-usage.ts:147)입니다.

직접 재검증한 결과 `tsc`, 4개 모듈 import, 파일별 `00`/`06` 검사가 통과했습니다. 아키텍처를 포함한 관련 테스트 5개 파일은 **34 pass / 0 fail**입니다. 전체 테스트는 재실행하지 않았으며, 제공된 전후 실패·오류 목록의 추가·삭제 항목이 모두 0임을 확인했습니다.

바로 고칠 것 / 없음
결정이 필요한 것 / 없음
문제없음 / 이번 차분의 선언 이동·정렬 및 §3·§4 순서