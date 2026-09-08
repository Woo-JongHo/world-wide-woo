# RPA Agent·Skill 문서 검증

기록 시각: 2026-09-08 (Asia/Seoul)

## 시나리오: 네 RPA 스킬의 메타데이터와 미완성 scaffold 검증

Invocation:

```sh
for task_skill in .agents/skills/rpa-intake .agents/skills/rpa-map .agents/skills/rpa-safety .agents/skills/rpa-publish; do
  python3 /Users/jonghoPro/.codex/skills/.system/skill-creator/scripts/quick_validate.py "$task_skill" || exit 1
done
```

Binary observable: 각 대상에서 `Skill is valid!`가 출력되고 exit code 0.

Captured output:

```text
Skill is valid!
Skill is valid!
Skill is valid!
Skill is valid!
```

## 시나리오: Linear 전용 게시 경계와 가짜 완료 표식 부재

Invocation:

```sh
git diff --check -- agents/rpa .agents/skills/rpa-intake .agents/skills/rpa-map .agents/skills/rpa-safety .agents/skills/rpa-publish docs/workflows/RPA_WORKFLOW.md
! rg -n -i 'atlas|hermes|obsidian|sqlite|traceability|\[TODO:|\bTODO\b|test\.skip|test\.only' agents/rpa .agents/skills/rpa-intake .agents/skills/rpa-map .agents/skills/rpa-safety .agents/skills/rpa-publish docs/workflows/RPA_WORKFLOW.md
```

Binary observable: 두 명령 모두 exit code 0이며 출력이 없다. 변경한 RPA Agent·Skill·Workflow 문서에는 Atlas/Hermes, Obsidian·SQLite·공통 추적성 게시, TODO, `test.skip`, `test.only`가 없다.

## 시나리오: 제한된 변경 범위 확인

Invocation:

```sh
git status --short -- agents/rpa .agents/skills/rpa-intake .agents/skills/rpa-map .agents/skills/rpa-safety .agents/skills/rpa-publish docs/workflows/RPA_WORKFLOW.md
```

Binary observable: `agents/rpa/`, 네 `.agents/skills/rpa-*` 디렉터리와 `docs/workflows/RPA_WORKFLOW.md`만 이 작업의 변경 경로로 표시된다.
