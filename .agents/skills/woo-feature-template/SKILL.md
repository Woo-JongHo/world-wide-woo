---
name: woo-feature-template
description: 99_www TUI 기능을 Feature Implementation Contract의 장 순서·파일 절 순서로 새로 만들거나 기존 기능을 같은 형식으로 정리할 때 사용한다. 기능 하나 또는 전체 기능을 차례로 처리하며, 단계마다 Codex Astra 독립 검토를 받는다.
---

# Feature Template

[Feature Implementation Contract](../../../docs/workflows/FEATURE_IMPLEMENTATION_CONTRACT.md)가 형식의 정본이다. 이 스킬은 그 형식을 한 기능씩 적용하는 절차만 소유한다. 코드 경계는 [LAYERS.md](../../../LAYERS.md), 파일 안의 행·열은 [woo-code-readability](../woo-code-readability/SKILL.md)를 따른다.

## 범위

- 한 번에 **기능 하나**, 한 변경 단위에는 **한 종류의 작업**만 둔다.
  - **절 순서 정리**: 공개 선언을 내부 처리 위로 올린다. 동작·호출 관계를 바꾸지 않는다.
  - **중복 해석 이동**: 같은 입력·출력·실패 계약의 해석을 소유 장으로 올린다. 호출 계약이 바뀌므로 절 순서 정리와 섞지 않고 별도 단위·별도 검토로 진행한다.
- 바꾸지 않는 것: 동작, 공개 이름, 기능 경계를 넘는 이동, 사용자 미커밋 변경의 내용.
- 다른 기능의 파일을 고쳐야 하면 멈추고 해당 기능 차례로 미룬다.

## 기능 하나의 절차

1. **현황.** `bun scripts/feature-map.ts report <feature>`의 절 순서·타입 순서 후보를 읽는다. 장 지도는 직접 import로 추정한 후보이며 `미발견`은 책임 부재가 아니다.
2. **작업 직전 고정.** `git status --porcelain --untracked-files=all`로 대상 파일의 staged·unstaged·untracked 상태를 기록한다. 대상 파일을 `.www/evidence/<날짜>-feature-template/<feature>/before/`에 복사하고 `shasum -a 256` digest를 남긴다.
3. **기준선.** 같은 소스 상태에서 `bun test` 실패 목록(시간 표기 제거)을 저장한다. 기준선 파일 머리에 `git rev-parse HEAD`, 작업 트리 digest(`git diff HEAD | shasum -a 256`과 untracked 목록), 실행 명령을 적는다. 실행 오류(`# Unhandled error`)는 파일과 첫 `error:` 문장으로 `(error)` 행을 만들어 실패와 함께 전후 비교한다. 테스트 미발견도 별도로 기록한다.
4. **편집.** 보고된 파일을 한 파일씩 고친다. 편집 직전에 digest가 2단계와 같은지 다시 확인해 `digest-recheck.txt`에 남기고, 다르면 사용자가 동시에 바꾼 것이므로 멈추고 재대조한다.
   - §3·§4: `bun scripts/reorder-sections.ts functions <파일>`로 마지막 공개 선언 앞의 내부 `function` 선언을 파일 끝으로 옮긴다.
   - §1·§2: `bun scripts/reorder-sections.ts types <파일>`로 첫 실행 선언 뒤의 공개 `type`·`interface`를 그 앞으로 옮긴다. `typeof`로 값에서 파생한 타입은 값 옆에 둔다.
   - 두 명령은 서로 다른 작업 종류이므로 한 변경 단위에 섞지 않는다. 도구는 TypeScript AST의 최상위 문장을 앞 주석·데코레이터와, 줄이 끝나는 같은 줄 끝 주석과 함께 통째로만 옮긴다. 파일 헤더(shebang·pragma·첫 빈 줄 앞 주석)와 지시문은 옮기지 않고, 선언 병합(같은 이름의 namespace 등)이 있는 함수도 옮기지 않는다. 쓴 뒤 다시 파싱해 계획과 다르면 쓴 파일 전체를 복원한다. 도구가 옮기지 않는 선언은 손으로 옮기지 않는다.
   - **옮기지 않는다**: 모듈 초기화에 쓰이는 값, `extends`·static 필드·static 블록·computed key가 있는 클래스, 최상위 호출이 참조하는 `const`·`let`·`class` 선언. `function` 선언은 본문까지 호이스팅되므로 최상위 호출이 참조해도 옮길 수 있다. 보고에 `초기화 순서 확인 필요`가 붙은 항목은 기본적으로 옮기지 않고 이유를 기록한다.
5. **정렬.** 바꾼 파일마다 `00_normalize-imports.ts --write`, `06_align-tables.ts --file <파일> --write` 뒤 두 검사를 다시 실행해 `changed=0`, `misaligned=0`을 확인한다.
6. **게이트.**
   - `bun run check`, `bun test test/architecture.test.ts`.
   - 모듈 초기화: 바꾼 모듈마다 `bun -e 'await import("./src/<파일>")'`.
   - 관련 테스트: 장 지도 9장 후보에 더해, 바꾼 파일을 import하는 테스트와 그 기능의 위험 시나리오(입력·취소·실패·폭) 테스트를 직접 고른다. 9장 후보만으로 충분하다고 보지 않는다.
   - 회귀: 전체 실패·오류 목록을 3단계 기준선과 비교해 새 항목 0.
   - `bun run feature-map:build`.
7. **작업 차분.** 2단계 사본과 현재 파일의 `diff -u`를 `.www/evidence/<날짜>-feature-template/<feature>/work.diff`로 남긴다. 이 차분이 이번 작업의 전부여야 한다.
8. **독립 검토.** [검토 요청 템플릿](references/astra-review-prompt.md)에 `work.diff` 경로를 넣어 Codex Astra에 검토받는다. P1·P2는 고친 뒤 다시 검토한다. 사용자 결정이 필요한 항목은 멈추고 보고한다.
9. **기록.** 검토 원문과 조치는 `docs/audit/<날짜>-feature-template-<feature>.md`에 둔다.

## 전체 실행

`docs/features/FEATURE_MAP.md`의 절 순서 후보 열이 작은 기능부터 처리한다. 큰 기능(`chat`, `usage`)은 마지막에 둔다.

후보가 3건 이하인 작은 기능들은 기능마다 1–7단계를 따로 마친 뒤, 8단계 독립 검토를 한 번에 묶을 수 있다. 이때도 기능별 `before/`·`work.diff`·기준선은 분리하고, 검토 요청에 기능별 차분 경로를 모두 적는다. 검토에서 한 기능에 P1·P2가 나오면 그 기능만 고쳐 다시 검토한다. 기능 하나가 끝날 때마다 사용자에게 짧게 보고하고 다음 기능으로 넘어간다. 검토가 P1을 내거나 사용자 결정이 필요하면 전체 실행을 멈춘다.

## Codex 실행

```bash
codex exec -m gpt-6-astra -c model_reasoning_effort=high -s read-only -C <repo> \
  -o <scratchpad>/astra-<feature>.md - < <scratchpad>/astra-<feature>-prompt.md
```

백그라운드로 실행하고 완료 알림을 기다린다. `-o` 파일에 Codex 훅의 후속 응답만 남으면 실행 로그에서 마지막 `codex` 블록의 검토 본문을 꺼낸다.

## 완료 기준

기능의 절 순서 후보가 0건이거나 남은 항목마다 옮기지 않은 이유가 기록되어 있고, 게이트를 모두 통과했으며, `work.diff`가 이번 작업만 담고 있고, Astra 검토에 미해결 P1·P2가 없다.
