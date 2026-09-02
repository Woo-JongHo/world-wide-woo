---
name: woo-commit
description: 99_www 변경을 의미 단위로 나누고 검증한 뒤, 후보별 사용자 승인에 결박해 로컬 Git commit을 만들 때 사용한다. Push, PR, Merge는 수행하지 않는다.
---

# WWW Commit

커밋은 배포가 아니라 되돌릴 수 있는 하나의 의미 단위다.

## 메시지

제목은 변경 유형이 아니라 **완성된 결과를 말하는 한국어 문장**으로 쓴다.

```text
네이티브 실행 흐름을 채팅에 복원한다
```

- `feat:`, `fix:`, `perf(scope):`, `chore:` 또는 대괄호 유형 표식을 붙이지 않는다.
- 한 제목에는 한 목적만 담고 72자 이내로 쓴다.
- 이유나 검증을 남겨야 할 때만 짧은 본문을 추가한다. 제목을 본문에서 반복하지 않는다.

```text
네이티브 실행 흐름을 채팅에 복원한다

이유: 완료 전 활동이 생략되어 현재 작업을 알 수 없었다.
검증: bun test test/workbench-views.test.ts PASS
```

## 절차

1. `pwd`, `git status --short --branch`, staged·unstaged·untracked 경로를 확인한다. 기존 dirty 변경은 사용자 작업으로 보존한다.
2. 실제 diff를 목적, 공동 rollback, 공동 validation, 하나의 정직한 제목 기준으로 묶는다. 하나라도 다르면 후보를 나눈다. 한 파일에 목적이 섞였으면 부분 stage하지 않고 후보를 보류한다.
3. 후보에 맞는 가장 좁은 검증을 실행한다. 제품 경계나 release에 가까운 변경이면 `npm run check`와 필요한 테스트를 함께 실행한다. 미실행·실패 검증을 통과한 것으로 쓰지 않는다.
4. 다음 내용을 후보 하나로 제시하고 사용자 승인을 받는다.
   - 제목과 선택적 본문
   - 포함할 전체 경로
   - 실행한 검증과 결과
   - 제외한 dirty 경로
5. 승인된 후보의 경로만 `git add -- <paths>`로 stage한다. `git diff --cached --name-only`가 승인 경로와 정확히 같고, 후보 경로에 unstaged hunk가 없는지 다시 확인한다.
6. 승인된 메시지 그대로 로컬 commit을 만든다. commit object의 제목과 경로를 다시 읽어 후보와 대조한다.
7. commit SHA, 제목, 포함 경로, 검증 결과, 남은 dirty 변경과 `not pushed`를 보고한다.

승인은 후보의 메시지·경로에만 적용된다. 승인 뒤 내용이 바뀌면 새 후보로 다시 승인받는다. Push, PR, Merge, amend, force 또는 이력 재작성은 별도 요청 없이 수행하지 않는다.

