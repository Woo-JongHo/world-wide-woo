# TUI Feature Unit catalog 구현 증거

- 일자: 2026-09-13
- 저장소: `/Users/jonghoPro/woo/00_project/99_www`
- 브랜치: `astra/terminal-ui`
- 입력 인벤토리: `.omo/evidence/2026-09-13-tui-unit-inventory.md`
- 시작 상태: 대규모 dirty working tree에서 병렬 TUI 분리 작업 진행 중. 지정된 `*.feature.ts`, 새 `*.units.ts`, registry/type/test와 관련 architecture/identity 문서만 수정했고 타인 변경을 되돌리지 않았다.

## 구현 계약

- `TuiFeatureUnitId`는 `` `${TuiFeatureId}-U${DecimalDigit}${DecimalDigit}` `` 형식이다.
- `TuiFeatureUnitDescriptor`는 `id`, 부모 `featureId`, `key`, `title`, `status`를 readonly로 선언한다.
- Unit status는 `active | legacy | unwired | retired`다. 인벤토리에서 legacy 전용인 Chat 결과 카드, Plan 초안, Repository 두 항목은 `legacy`, shell mount가 확인되지 않은 T-note 읽기는 `unwired`로 보존했다.
- 각 Feature descriptor가 같은 feature 폴더의 readonly Unit 목록을 소유한다.
- `feature-registry.ts`는 `TUI_FEATURES`, `TUI_FEATURE_UNITS`, Unit ID lookup, Feature별 Unit lookup과 retired ID 예약 목록만 소유한다. component factory와 plugin 등록은 추가하지 않았다.
- retired Unit ID는 `TUI_RETIRED_FEATURE_UNIT_IDS`에 남기며 registry 로딩 시 현재 catalog와 충돌하면 실패한다. 현재 retired ID는 없다.
- `TUI-F###-U##`는 UI 화면·조작 탐색 metadata다. `.woo/units.yaml`의 durable `Code-###` Unit과 별도이고 해당 파일을 수정하지 않았다.

## 인벤토리 대조

Markdown 표의 ID·제목을 registry module과 기계적으로 비교했다.

```text
inventory match: 35 Units
```

Feature별 개수는 `2,7,2,4,2,3,3,2,1,1,1,1,1,2,1,2`, 합계 35다. 테스트는 16 Feature, 정확한 35개 ID·제목, ID unique, 부모 prefix 일치, Feature별 U01 연속 번호, Feature별 개수, retired ID 비재사용을 검증한다.

## 검증

| 명령 | 결과 |
|---|---|
| `bunx tsc --ignoreConfig --noEmit --strict --skipLibCheck --target ES2023 --module ESNext --moduleResolution Bundler --types bun src/adapters/inbound/tui/features/feature.types.ts src/adapters/inbound/tui/features/feature-registry.ts test/tui-feature-registry.test.ts` | 통과 |
| `bun test test/tui-feature-registry.test.ts` | 4 pass, 0 fail, 158 assertions |
| `bun test test/tui-feature-registry.test.ts test/architecture.test.ts` | 17 pass, 0 fail, 1,657 assertions |
| `git diff --check -- <catalog source/test/docs>` | 통과 |
| 변경 파일의 `TODO`, `test.skip/.only`, `describe.skip/.only`, `it.skip/.only` 검색 | 없음 |
| `git status --short -- .woo/units.yaml` | 출력 없음, 미수정 |
| `bun run check` | 통과. 최초 실행에서는 동시 분리 중인 Chat renderer 파일이 아직 없어 실패했으나 파일 생성 뒤 같은 명령 재실행 통과 |
| `bun test` | 1,179 pass, 1 fail. catalog 테스트는 통과. 유일한 실패는 동시 생성된 Chat 분리 파일의 `@linear WOO-684`가 기존 traceability manifest에 연결되지 않은 것 |
| `bun test test/tui-feature-registry.test.ts test/architecture.test.ts test/work-traceability.test.ts` | 22 pass, 1 fail. catalog와 architecture는 통과, 동시 생성된 `work-step-components.ts`의 WOO-684 traceability 미연결만 실패 |

전체 check는 통과했다. 전체 suite의 남은 실패는 이 작업의 소유 파일 밖에서 동시 진행 중인 Chat 분리와 traceability 갱신 사이의 시점 차이다. 해당 타인 소유 파일이나 원장을 이 작업에서 수정하지 않았다.

## 진입 확인

로컬 `.www/linear-project.json`은 Woo-World / World Wide Woo UUID를 기록하지만, 현재 세션에 노출된 Linear connector는 그 Project UUID 조회를 `Could not find referenced Project`로 반환했다. 온라인 Linear 연결은 미확인으로 남겼으며 로컬 catalog 구현·검증에는 영향을 주지 않았다.
