# RPA Skill Receipt Contract

각 RPA Skill은 다음 필드를 가진 Receipt를 남긴다.

```yaml
schemaVersion: "1.0"
receiptId: <uuid>
runId: <uuid>
candidateId: <candidate id 또는 null>
skill: { name: rpa-intake, version: "1.0" }
capability: RPA-INTAKE
status: succeeded | failed | blocked | canceled | uncertain
stage: observe | classify | validate | authorize | execute | verify
# 나머지 필드는 schemas/woo-receipt.schema.json을 따른다.
```

공통 정본은 [Woo Receipt schema](../../schemas/woo-receipt.schema.json)다. 기존 기록은 `PASS → succeeded`, `PARTIAL → uncertain`, `BLOCKED → blocked`로 해석한다. 사실은 `input`과 `evidence`, 결정은 `decision`, 실행 검증은 `validation`과 `result`에 둔다. 다음 Skill은 source revision과 RPA ID 근거가 없거나 이전 Receipt가 `blocked`이면 쓰기 작업을 시작하지 않는다.
