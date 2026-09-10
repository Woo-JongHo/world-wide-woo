# Vault 정본 세대 대조 기록

날짜: 2026-09-10

## 관측

- manifest 대상: 36개
- Git 정본 후보: `87cd10e`
- 36개 파일을 manifest의 `actualPath`로 복원한 뒤 `actualSha256` 대조: 36/36 일치
- 복원 후 추적성 실행 결과: `LINEAR_DETAILED_BY_CANONICAL_TARGET_REQUIRED` 및 `OBSIDIAN_CONTRACT_INVALID`

## 판정

파일 byte 자체는 복구되었지만 현재 v3 ledger가 요구하는 canonical target 관계와 현재 Obsidian schema 계약을 만족하지 않는다. 따라서 `obsidian-export-manifest.json`은 `BLOCKED`를 유지한다. 새 문서를 생성하거나 digest를 덮어써서 PASS로 만들지 않았다.

## 재현

```sh
git -c core.quotePath=false ls-tree -r --name-only 87cd10e -- .www/vault
bun scripts/traceability.ts check --linear-snapshot .www/evidence/v020-traceability/linear-consistency-final-normalized.json --linear-receipt .www/evidence/v020-traceability/linear-consistency-final-receipt.json --vault-export-manifest .www/evidence/v020-traceability/obsidian-export-manifest.json
```
