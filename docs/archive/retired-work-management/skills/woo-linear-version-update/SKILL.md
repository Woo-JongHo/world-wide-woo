---
name: woo-linear-version-update
description: WWW의 0.0.N 기능 릴리스 경계를 판정하고 함께 반영된 개선·리팩터링·수정·검증을 Linear Project Update로 게시할 때 사용한다.
---

# Linear Version Update

Linear Project의 **Update**를 `0.0.N` 기능 릴리스 기록으로 유지한다. Project Activity의 Comment는 작업 단위의 원본 기록이고, Update는 직전 Update 이후 Comment를 종합한 릴리스 기록이다.

## 릴리스 경계

- 사용자가 관찰할 수 있는 capability가 새로 전달될 때 다음 `0.0.N`을 연다.
- 리팩터링, 코드 정리, 성능·UX 개선, 통제면 수정은 단독으로 번호를 올리지 않고 다음 기능 릴리스에 묶는다.
- 기능 없이 별도 버전을 내야 하는 긴급 수정은 사용자가 그 릴리스 경계를 명시한 경우에만 연다.
- `package.json`, Git tag·PR, Linear Update의 버전은 같은 전달 단위를 가리켜야 한다.

## 실행

1. World Wide Woo Project의 최신 Update와 그 뒤 Project Activity Comment, `package.json` 버전, 기준 commit 또는 이전 릴리스 PR을 읽는다. 완료: 다음 번호와 수집 범위가 하나로 정해진다.
2. 기준 이후 Comment가 가리키는 실제 diff·commit·PR·Linear 이슈를 읽어 `기능`과 `함께 묶인 변경`으로 분류한다. 기능이 없으면 Update를 게시하지 않고 Comment만 이어 간다.
3. 테스트 숫자만 복사하지 말고 보장한 behavior, 실패, skip, 미검증 범위와 Evidence를 수집한다. 완료: 모든 판정이 실제 실행 결과를 가리킨다.
4. 다음 형식의 Project Update를 만든다.

```md
## 전달 기능

- 사용자가 새로 할 수 있게 된 일

## 함께 반영

- 리팩터링·개선·수정과 기능에 필요한 이유

## 검증

- 보장한 behavior와 Evidence
- 미검증 또는 남은 위험

## 연결

- Linear 이슈와 PR
- Obsidian 상세 정본
```

5. Update health는 실제 상태로 정한다. 완료·검증됐으면 `onTrack`, 기능 수락을 막는 미검증이 있으면 `atRisk`, 전달할 수 없으면 `offTrack`이다.
6. 게시 직전에 최신 Update, 그 뒤 Comment와 head를 다시 읽고, 같은 버전 Update가 있으면 새로 만들지 않고 기존 항목을 갱신한다.
7. 게시 뒤 `get_status_updates`로 버전·본문·health를 read-back한다. 완료: Linear Update, package 버전, 연결 이슈·PR이 같은 `0.0.N`을 가리킨다.

## 경계

- 이슈 생성·본문·상태는 `woo-linear-issue-intake`와 `woo-linear-publish`가 소유한다.
- 상세 WHY·계약·시나리오는 Obsidian이 소유한다.
- Comment는 요구·작업·유형·연결·현재 상태를 짧게 남긴다. Update가 Comment 원문을 나열하지 않고 실제 릴리스에 전달된 기능·함께 반영·검증·연결을 종합한다.
- Update는 구현 완료나 테스트 통과를 스스로 증명하지 않고 Git Receipt와 Evidence를 요약한다.
