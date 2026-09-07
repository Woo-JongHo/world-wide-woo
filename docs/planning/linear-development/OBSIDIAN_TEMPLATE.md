# Obsidian 상세 기록 템플릿

```yaml
---
linear_id: WOO-000
linear_uuid: <uuid>
unit_id: Code-001
unit_uuid: <uuid>
record_type: requirement | decision | exception | test
source_revision: <git:40-char-sha | worktree:40-char-head:dirty>
updated_at: <ISO-8601>
---
```

본문은 `목적`, `배경과 결정`, `상세 동작`, `예외`, `테스트 방법`, `실제 결과`, `남은 항목` 순서로 쓴다. Linear 본문을 복제하지 않고 해당 결정을 이해하고 재현하는 데 필요한 상세만 기록한다.
