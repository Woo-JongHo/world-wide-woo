---
name: woo-commit
description: 99_www 변경을 의미 단위로 나누고 검증한 뒤, 후보별 사용자 승인에 결박해 로컬 Git commit을 만들 때 사용한다. Push, PR, Merge는 수행하지 않는다.
---

# WWW Commit Control Plane

커밋은 배포가 아니라 되돌릴 수 있는 하나의 의미 단위다. 실제 실행은 `bun run commit:control --` 경계를 통과한다.

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

1. `pwd`, `git status --short --branch`, staged·unstaged·untracked 경로를 확인한다. 기존 dirty 변경은 사용자 작업으로 보존한다. 완료: 모든 변경 경로가 후보 또는 명시적 제외에 있다.
2. 실제 diff를 목적, 공동 rollback, 공동 validation, 하나의 정직한 제목 기준으로 묶는다. 하나라도 다르면 후보를 나눈다. 한 파일에 목적이 섞였으면 부분 stage하지 않고 후보를 보류한다.
3. 후보에 맞는 가장 좁은 검증을 실행한다. 제품 경계나 release에 가까운 변경이면 `npm run check`와 필요한 테스트를 함께 실행한다. 미실행·실패 검증을 통과한 것으로 쓰지 않는다.
4. `.woo/project.yaml`과 `schemas/commit-candidate.schema.json`에 맞는 Candidate를 `.www/runtime/commit/`에 만들고 다음 내용을 제시해 사용자 승인을 받는다.
   - 제목과 선택적 본문
   - 포함할 전체 경로
   - 실행한 검증과 결과
   - 제외한 dirty 경로
5. `authorize --candidate <path> --actor <name>`으로 승인을 Candidate digest에 결박한다. 승인 뒤 변경되면 새 승인을 받는다.
6. `execute --candidate <path> --authorization <path>`로만 stage와 commit을 수행한다. Git Hook이 직접 `git commit`과 staged/message 불일치를 차단한다.
7. 실제 commit object를 재검증하고 공통 Receipt를 남긴다. commit SHA, 제목, 포함 경로, 검증 결과, 남은 dirty 변경과 `not pushed`를 보고한다.

type과 scope는 Candidate/Receipt에 필수지만 `99_www` 제목은 저장소 정책에 따라 한국어 결과 문장을 사용한다. Agent는 type·scope·분할·subject를 Skill 밖에서 결정하지 않는다. Push, PR, Merge, amend, force 또는 이력 재작성은 별도 capability다.
