# 코드와 Linear ID 연결

`traceability.json`은 ID·관계·위치만 보존하는 연결 원장이다. 요구사항과 현재 업무 상태는 Linear, 코드·테스트는 Git, 특정 실행의 관측 결과는 Evidence가 소유한다.

## 현재 연결

2026-09-06 Chat 범위의 WOO-679, WOO-683, WOO-684, WOO-686~692를 실제 Linear UUID·URL과 코드·테스트·[확인 근거](../evidence/2026-09-06-chat-development/assessment.md)에 연결했다. 기존 code/test 관계를 보존했다.

같은 날 TUI 전체 준비에서 WOO-673~677, WOO-680~682, WOO-693(T-note), WOO-694(Composer)를 추가해 총20개 실제 이슈를 연결했다. [TUI 확인 근거](../evidence/2026-09-06-tui-preparation/assessment.md)와 [코드 대응표](../evidence/2026-09-06-tui-preparation/code-issue-mapping.json)에 범위를 기록했다. 코드에 주석을 추가했으며 제품 동작은 변경하지 않았다.

- `linear-issue → implements → code`: 해당 작업의 구현 위치. 부분 구현도 포함한다.
- `test → verifies → linear-issue`: 요구 일부를 확인하는 기존 테스트 위치. 전체 수락을 뜻하지 않는다.
- `evidence → evidences → linear-issue`: 대상 revision과 관측 결과의 근거.
- WOO-692는 통합 수락 작업이므로 제품 코드 소유 없이 테스트·근거를 연결한다.

Unit ID와 Linear 작업 ID는 별개다. 현재 v1은 Unit kind를 지원하지 않으므로 Unit을 발급하거나 WOO 번호로 대체하지 않았다. 기존 EP/ST도 자동 동치 연결하지 않는다.

## 조회와 검증

실제 함수·컴포넌트·테스트 선언에는 `@linear` 주석으로 WOO 작업 번호를 연결한다. 예를 들어 `createNativeSyntaxHighlightPlugin`은 WOO-686·WOO-691, `ProjectWorkbench.applyDelta`는 WOO-688에 연결돼 있다. UUID·URL은 원장에서 한 번 관리하며 각 함수에 복제하지 않는다.

`rg -n '@linear' src test`로 코드 연결 지점을 찾는다. 무결성 테스트는 src/test의 주석을 읽어 등록되지 않은 이슈와 코드 경로의 연결 누락을 잡는다. 코드 주석은 개발 작업의 연결이며 런타임 메시지·Native item ID로 사용하지 않는다.

주석은 대표 구현 선언에 붙인다. 원장에 연결한 모든 보조 파일에 주석이 있는 것은 아니며, 이 검사는 주석에서 원장으로의 연결을 검사한다.

저장소 root에서 코드에 연결된 작업을 역조회한다.

```sh
bun -e 'import data from "./.www/control-ledger/traceability.json"; import {parseWorkTraceabilityManifest, relatedWorkReferences, referenceKey} from "./src/domain/work/index.ts"; const m = parseWorkTraceabilityManifest(data); for (const r of relatedWorkReferences(m, {kind:"code", id:"src/presentation/tui/syntax-highlighter.ts"})) console.log(referenceKey(r));'
```

WOO-686과 WOO-691이 나온다. 같은 API에 원장에서 읽은 `linear-issue` reference를 주면 코드·테스트·근거를 조회할 수 있다. Linear reference에는 WOO 번호뿐 아니라 UUID·URL도 필요하다.

```sh
bun test test/work-traceability.test.ts
```

이 검사는 schema·중복·잘못된 관계·없는 경로·Chat 연결 누락과 양방향 조회를 검증한다. 원격 Linear 존재는 MCP 재조회로 따로 확인하며, 오프라인 테스트를 온라인 연결 검증으로 취급하지 않는다.

파일 이동 시 reference와 모든 link endpoint를 함께 갱신하고 테스트를 실행한다. `main` 링크만으로 미커밋 코드가 원격에 있다고 주장하지 않으며 Evidence의 파일 fingerprint와 함께 읽는다. `/map`의 Linear 표시나 자동 동기화는 별도 개발 범위다.
