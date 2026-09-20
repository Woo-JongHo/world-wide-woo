# 99_www 맥북·맥미니 보존 병합 계획

작성일: 2026-09-20

## 목표

맥북과 맥미니의 `99_www` 작업을 하나도 버리지 않고 공통 기준에서 대조한 뒤,
구조적으로 양립하는 변경은 병합하고 충돌·선택이 필요한 변경은 근거와 선택지를
남긴다. 원격 작업 디렉터리의 내용을 임의로 초기화하거나 덮어쓰지 않는다.

## 현재 기준

- 공통 기준 커밋: `1d7b451fe8c6abbdae717975d686392ddd212c46`
- 양쪽 브랜치: `dev`
- 양쪽 upstream: `https://github.com/Woo-JongHo/world-wide-woo.git`
- 맥북 원본: 현재 저장소
- 맥미니 원본: `/Users/woojongho/woo/00_project/99_www`
- 양쪽 모두 커밋되지 않은 변경이 있으므로, 원본에서 바로 reset·checkout·stash·merge를
  수행하지 않는다.

## 지금 병합할 수 없는 이유

### 1. 맥미니에서 실제 회귀가 재현된다

같은 테스트 묶음을 실행했을 때 맥북은 통과하지만 맥미니는 다음 두 건이 실패한다.

```text
맥북: bun test test/workbench-config.test.ts test/astra-lazy-row-integration.test.ts
      14 pass, 0 fail

맥미니: 같은 명령
      12 pass, 2 fail
```

- `test/workbench-config.test.ts`: 테스트는 `gpt-6-astra`를 기대하지만 현재
  `.www/workbench.yaml`은 `gpt-5.6-sol`이다.
- `test/astra-lazy-row-integration.test.ts`: lazy `full` frame이 dense oracle과
  달라진다. lazy 결과에는 `Response` 박스가 생기고 dense 결과는 평문 응답이다.

따라서 어느 쪽을 정본으로 볼지 정하지 않은 채 파일을 합치면, 한쪽의 변경을
조용히 버리거나 테스트를 결과에 맞춰 약화시키게 된다.

### 2. 두 작업은 서로 다른 기능 묶음이다

- 맥북: 키맵 단일 소스·OAuth refresh helper·ASTRA lazy/cache/performance·사용량 및
  HUD 관련 변경
- 맥미니: Workflow 페이지(`TUI-F017`)·`/workflow`·Codex native usage·request
  runtime 라벨 변경

대부분은 계층상 양립하지만 `astra-surface.ts`, `workbench-shell.ts`, 인증·사용량
서비스, 설정 파일처럼 같은 파일을 동시에 수정한 곳이 있다. 특히 맥북의 키맵
단일 진입점과 맥미니의 Workflow 9번 페이지를 수동으로 연결해야 한다.

### 3. 설정에는 자동 병합으로 결정할 수 없는 의미 충돌이 있다

현재 확인된 활성 설정 후보는 다음과 같다.

| 항목 | 맥북 | 맥미니 |
|---|---|---|
| 모델 | `gpt-5.6-luna` | `gpt-5.6-sol` |
| effort | `xhigh` | `medium` |
| ZAI User-Agent | `world-wide-woo-usage/1.0` | `OpenCode-Status-Plugin/1.0` |

이 값들은 텍스트 충돌 해결만으로 정본을 판정할 수 없다. 검증 전에는 어느 값도
임의로 승격하지 않는다.

## 검증 가설

실패 원인을 다음 순서로 반증한다.

1. **응답 박스 렌더링 회귀**: 맥미니에서 응답 박스 스타일이 dense/lazy 경로에
   다르게 적용되었을 것이다. 예상 관측은 응답 렌더러 또는 해당 스타일을 맞추면
   lazy 통합 테스트가 green이 되는 것이다.
2. **lazy 전용 렌더러 분기**: `ScrollRowSource` 또는 chunk 렌더링이 dense 경로와
   다른 컴포넌트를 사용할 것이다. 예상 관측은 설정과 무관하게 두 경로의 첫
   divergence가 같은 seam에서 재현되는 것이다.
3. **공유 UI 변경의 영향**: `ChatScrollView`·`AstraInset`·transcript cache 변경이
   두 경로의 출력 계약을 갈라놓았을 것이다. 예상 관측은 최소 Response fixture에서
   해당 공유 컴포넌트 직후부터 출력이 달라지는 것이다.
4. **설정 드리프트는 독립 문제**: 모델을 어느 값으로 두어도 lazy 테스트 실패는
   유지되고 설정 테스트만 별도로 달라질 것이다.
5. **기능 병합 후 추가 회귀**: Workflow 9번 페이지와 키맵 단일 소스를 합친 뒤
   타입·쉘·페이지 라우팅 검증에서 추가 불일치가 드러날 수 있다.

## 실행 순서

1. 양쪽 현재 경로·브랜치·HEAD·status와 공통 기준을 다시 기록한다.
2. `docs/plan.md`와 비교 결과를 보존하고, 원본 작업 디렉터리는 읽기 전용으로
   취급한다.
3. 맥북·맥미니에서 동일한 최소 회귀 테스트를 실행하고 dense/lazy 출력의 첫
   차이를 확인한다.
4. 회귀 테스트를 올바른 public seam에 고정한 뒤, 테스트를 먼저 red로 확인하고
   최소 구현 수정으로 green을 만든다. 출력이 바뀌었다는 이유만으로 oracle을
   약화하지 않는다.
5. 공통 기준의 임시 병합 공간에서 다음 순서로 병합한다.
   - 키맵 단일 소스와 Workflow 9번 페이지·쉘 라우팅
   - OAuth refresh helper와 기존 provider별 오류 처리
   - Codex native usage port·adapter·session 주입
   - ASTRA surface, shell, response renderer의 충돌
6. 설정·User-Agent처럼 의미 선택이 필요한 값은 별도 decision gate로 분리하고,
   테스트와 실제 설정이 같은 계약을 보도록 한다.
7. 병합 후보에 대해 `bun run check`, 관련 targeted tests, 전체 `bun test`,
   `git diff --check`를 실행한다. 환경 권한으로 막힌 테스트와 코드 실패를
   구분해 기록한다.
8. 최종 diff에서 TODO/skip/only/껍데기 테스트와 삭제된 사용자 변경이 없는지
   확인한 뒤, 적용할 파일과 남은 선택을 보고한다. 커밋·push는 별도 승인 없이는
   하지 않는다.

## 보존 규칙

- 삭제·reset·checkout으로 양쪽 원본을 정리하지 않는다.
- 충돌 파일은 양쪽 내용을 비교 가능한 상태로 남긴 뒤 최소 단위로 해결한다.
- 원격 작업 디렉터리에 쓰기 작업이 필요해지면 먼저 패치·백업·대상 파일을
  명시하고, 검증된 변경만 적용한다.
- 현재 설정 후보는 어느 한쪽을 자동으로 우선하지 않는다.
- 변경의 출처가 불명확한 파일은 보류 목록으로 남긴다.

## 성공 조건

- 양쪽의 사용자 변경이 병합 후보 또는 보류 근거로 모두 추적된다.
- 맥미니에서 재현된 두 실패의 원인이 각각 분리되고, 수정 근거가 테스트로
  입증된다.
- `core / adapters` 방향과 TUI feature 경계가 유지된다.
- 병합 후보가 타입 검사·관련 테스트·전체 테스트의 결과와 함께 보고된다.
- 원본 맥북·맥미니 작업 디렉터리에는 승인 없는 파괴적 조작이 없다.
