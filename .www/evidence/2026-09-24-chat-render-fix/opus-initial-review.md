도구를 쓰지 않고, 주신 diff·파일 내용만 손으로 추적한 정적 판정입니다. 실행/설치/테스트는 하지 않았고, 아래 "미확인"으로 표시한 항목은 주어지지 않은 코드에 의존해서 판정이 불가능한 것들입니다.

---

## A. 구체 버그 / 반례

### A-1. (가장 중요) heading 캐시는 gate된 지표에서 이득만 보고, 비용은 ungated 지표로 밀려 있다

`AstraExecutionHeading.activitySummary`는 캐시 미스마다 `executionActivitySummary`(2×N 선형 패스) **외에** `isDeeplyImmutableHeadingData(activities)`를 돌립니다. 이건 N개 activity와 각 `payload`/`nativeRefs`까지 재귀하면서 원소마다 `Object.isFrozen` + `Reflect.ownKeys` + `getOwnPropertyDescriptor`를 호출합니다. N=1000이면 수천 번의 descriptor 조회로, **캐시가 절약하려는 2×N 패스보다 비싼 순증 비용**입니다.

그런데 benchmark 배치가 정확히 반대입니다:

- `warmBody`(gate: p95 > 16ms)는 `snapshot.activities` 참조가 **불변**이라 매 프레임 캐시 히트 → 스캔 비용 0.
- `durableAppendFirstFrame`(activities 배열이 매번 새로 생기는, 실제 streaming append 경로)은 매번 전체 deep scan을 지불하는데 `"target": "Diagnostic only: ... no acceptance threshold is assigned."` — **gate 없음**.

즉 현재 게이트 조합은 이 변경의 이득만 측정하고 비용은 측정에서 제외합니다. GREEN이 나와도 append 경로의 순증을 부정하지 못합니다.

### A-2. 캐시가 프로덕션에서 작동한다는 근거가 없다

`isDeeplyImmutableHeadingData`는 배열이 아닌 노드에 대해 `Object.getPrototypeOf(value) !== Object.prototype`이면 즉시 `false`입니다. `payload` 안에 `Date`/`Map`/클래스 인스턴스가 하나라도 있거나, activities가 deep-freeze되지 않으면 캐시는 **영구히 꺼지고 deep scan 비용만 매 렌더 지불**됩니다. test와 benchmark는 둘 다 `deepFreeze`를 직접 호출해 이 조건을 인위적으로 만들어 줍니다(benchmark `fixture()`의 `assert(Object.isFrozen(...))`). 프로덕션 snapshot 생성 경로가 실제로 deep-freeze하는지는 주신 자료에 없습니다 — **미확인, 그러나 확인 전까지는 최적화가 실측된 적이 없다고 봐야 합니다.**

### A-3. `invalidate()` 호출 빈도에 따라 캐시가 통째로 무의미해질 수 있다

`invalidate()`가 `activityCache = null`을 하므로, pi-tui 레이아웃 엔진이 프레임마다 `Component.invalidate()`를 부른다면 캐시는 한 번도 히트하지 않습니다(WeakSet 덕에 재스캔은 면하지만 `executionActivitySummary`는 매번 재실행 = 변경 전과 동일). 테스트는 `invalidate()`를 명시적으로 1회만 부르므로 이 시나리오를 전혀 커버하지 않습니다. **미확인 / 필수 확인 항목.**

### A-4. benchmark `finally`가 원인 예외를 가린다

```ts
} finally {
  terminal.input("\x03"); terminal.input("\x03"); await tick();
  assert(closed && terminal.stopped, ...);
}
```
`MemoryTerminal.input` 초기값은 `() => { throw new Error("terminal not started"); }`입니다. `runProjectWorkbenchShell`이 `start()` 전에 던지면 `finally`가 새 예외를 던져 **실제 실패 원인을 덮습니다.** `assert(closed && ...)`도 같은 문제입니다. 실제 회귀를 진단 불가능하게 만드는 구체 버그입니다.

### A-5. `linear-issue`의 result/behavior 반쪽 지정이 오류 2개를 낸다

`{...base, result}` 만 주면 `detailed=true`인데 `keysExactly(content, detailedKeys)`가 7 vs 8로 실패해서 `"정해진 필드만 허용합니다."`가 먼저 쌓이고, 이어서 `"result와 behavior는 함께 지정해야 합니다."`가 쌓입니다. 테스트는 `toContain`이라 통과하지만, 사용자에게는 **"허용되지 않는 필드"라는 틀린 진단**이 함께 나갑니다. `detailed`일 때는 키 집합 검사를 `baseKeys ∪ {result, behavior}`의 부분집합으로 완화하고 쌍 검사만 남기는 게 맞습니다.

### A-6. utils diff — 반례를 찾지 못했음

`simpleTerminalCodeUnitWidth`의 부분집합(ASCII / 2500–257F / AC00–D7A3 / 3400–4DBF / 4E00–9FFF)에 대해 기존 `graphemeWidth`와 폭이 일치하는지, 그리고 `-1` 센티널로 빠져나가는 모든 경우(제어문자, 탭, 서로게이트, 결합기호, VS16, 자모 U+1100·U+D7B0+, 하이픈 밖 기호)를 확인했습니다. 박스드로잉은 East Asian Width가 Ambiguous이고 기존 `eastAsianWidth(cp)`가 옵션 없이 호출되어 1을 반환하므로 fast path의 1과 일치합니다.

`wrapSimpleTerminalLine`을 기존 `wrapSingleLine`+`splitIntoTokensWithAnsi`+`breakLongWord`와 나란히 손으로 돌렸습니다 — 공백 토큰 드롭, 오버플로 시 `trimEnd`, 긴 토큰 chunk 분할 경계, 선행 공백 → `[""]`, 전부 공백 → `[""]`, 마지막 줄 `trimEnd`까지 일치했습니다. 제시된 테스트 벡터(`"가나 다A 漢字"`, `"one   two     three  "`, `"x abc│def"`, `"       "`, `"averyvery..."`)는 모두 손계산과 바이트 단위로 맞았습니다.

`truncateToWidth`의 두 fast path도 기존 slow path와 대조했습니다. 특히 (a) 오버플로 판정 기준이 `> maxWidth`(targetWidth 아님)라는 기존 미묘한 의미론이 `simpleWidth <= maxWidth → return text`로 정확히 보존되고, (b) 잘리는 지점의 `pendingAnsi`를 버리는 동작이 기존 `keepContiguousPrefix=false; pendingAnsi=""`와 같고, (c) OSC 8 닫기를 `getActiveOsc8Close`가 공유 처리하는 것까지 확인했습니다. `"\x1b[31가나"`(malformed CSI)는 `extractAnsiCode`가 null → ESC(0x1b) → `-1` → slow path로 정확히 폴백하며, 테스트 기대값 `"\x1b[3\x1b[0m…\x1b[0m"`은 기존 경로에서 손계산과 일치합니다.

**결론: utils 자체에서는 반례를 못 찾았습니다.** 다만 아래 C-1의 비대칭은 남습니다.

---

## B. 수락 미충족

1. **깨끗한 GREEN이 한 번도 없음.** 마지막 실행이 부하 중 전 wall 지표 RED인 건 무효가 아니라 "미측정"입니다. 그런데 long task의 **CPU 30–47ms**는 부하로 설명되지 않습니다. `warmBodyP95Ms: 16` 기준의 2–3배를 CPU만으로 넘긴 관측이므로, 이건 노이즈가 아니라 미완료 신호로 읽는 게 맞습니다.
2. **gate 공백.** `coldBodyMs`, `unseenWidthBodyMs`, `resizeBody`, `durableAppendFirstFrame`, `journalBumpFirstFrame`, `memory`, `retainedLazyResources` 전부 기록만 되고 판정에 안 들어갑니다. `warmRepeatedResizeBody`는 `ASTRA_BENCH_RESIZE_BUDGET_MS`를 넘겼을 때만 gate이고 기본값은 `null`(리포트에도 `null`로 정직하게 남음). A-1과 겹쳐서 치명적입니다.
3. **production shell replay가 streaming을 한 번도 타지 않음.** stub `dispatch`는 즉시 `{state:"rejected"}`를 반환하고 `subscribe(fn)`는 1회 호출 후 no-op unsubscribe를 돌려줍니다. 즉 shell은 **업데이트를 한 건도 받지 않고** `phase: "working"`에 들어가지 않습니다. 따라서 `idleWrites === 0`은 "ready 상태에서 조용함"만 증명하며, heading의 `astraPulse` 모션 경로나 draft 스트리밍 중의 idle 재도색을 전혀 검증하지 않습니다. CMux의 "180 streaming updates"는 이 harness가 아닌 다른 harness의 증거이고, 그 둘 사이에 연결 근거가 없습니다.
4. **live www 재시작 미완료 (본인 인정).** offline shell + MemoryTerminal은 PTY·픽셀·백프레셔·실제 provider를 대체하지 못합니다(`scope` 문자열에도 명시). 한국어 wrap/절단 변경의 최종 수락은 실제 터미널 렌더 확인이 있어야 합니다.
5. **before/after A-B 부재.** `sourceRevision`이 `ASTRA_BENCH_SOURCE_HASH ?? "not-provided"`라, 저장된 리포트가 어느 커밋 것인지 없이 남을 수 있습니다. 성능 주장을 하려면 동일 머신·동일 조건의 변경 전/후 리포트 쌍이 필요합니다.
6. 자기신고 비범위(Native parity, PTY/pixel/backpressure, provider, snapshot projection)는 그대로 남아 있습니다.

따라서 **WOO-915 In Progress 유지는 옳습니다.** root가 성능 완료를 주장하지 않는다는 점은 증거 상태와 일치합니다.

---

## C. 코드 정합성 (버그 아님)

- **C-1. fast path 커버리지 비대칭.** `truncateToWidth`만 ANSI 포함 fast path(`simpleTerminalWidthWithAnsi`)를 갖고, `visibleWidth`와 `wrapSingleLine`은 순수 simple 경로만 갖습니다. chalk로 스타일된 한국어 행 — 즉 프로덕션의 지배적 문자열 — 은 폭 계산과 wrap에서 여전히 segmenter를 탑니다. 의도된 보수성이라면 그 근거를 코드에 남겨야 하고, 아니라면 `wrapSingleLine`이 주 타깃입니다. (benchmark `runFocusedVerification`의 행들도 `👩🏽‍💻`·`e\u0301`를 넣어 의도적으로 fast path를 무력화하므로, 그 비율은 slow path만 측정합니다.)
- **C-2. 주석 밀도 붕괴.** 주변 `utils.js`는 모든 export와 휴리스틱에 "왜"를 적는 파일인데, 신규 함수 5개에 주석이 0입니다. 특히 `-1` 센티널의 의미, code point가 아닌 **code unit** 기반이라는 점(서로게이트 자동 폴백의 근거), 박스드로잉이 왜 1인지가 설명 없이 매직 레인지로만 남았습니다. `woo-code-readability` 계약과 직접 충돌합니다.
- **C-3. `visibleWidth` fast path가 `widthCache` 조회보다 앞에 있음.** 정확성 문제는 없지만, 긴 한글 행을 반복 조회할 때 기존의 amortized O(1) 캐시 히트가 매번 O(n) 스캔으로 바뀝니다. 지금 최적화하려는 워크로드가 정확히 "긴 한국어 행 반복 렌더"라 방향이 어긋납니다.
- **C-4. `splitIntoTokensWithAnsi` 선두의 중복 스캔.** 일반 width(≥2 정수)에서 여기 도달했다는 건 이미 simple이 아니라는 뜻이라 이 검사는 항상 실패합니다. ESC 시작 행은 1문자에 bail이라 싸지만, 끝에 이모지 하나 있는 긴 한글 행에서는 O(n) 낭비입니다.
- **C-5. `deepFreeze`가 세 군데에 다른 구현으로 존재.** test 헬퍼(자식 먼저 → 순환 시 무한재귀), benchmark(자신 먼저 → 순환 안전), 그리고 heading의 검증판 `isDeeplyImmutableHeadingData`. 같은 개념이 세 벌입니다.
- **C-6. 테스트가 `@earendil-works/pi-tui/dist/utils.js` 서브패스를 직접 import.** "segmenter를 안 탄다"는 주장 전체가 이 내부 경로 결합에 달려 있어서, 패키지 exports map이 바뀌면 조용히 깨집니다. 또한 `wordSegmenter`는 spy하지 않아 그쪽 경로는 검출되지 않습니다.
- **C-7. Artifact schemaVersion 정책 불일치.** `linear-project-comment`는 `schemaVersion`으로 content 형태를 분기하는데, `linear-issue`의 result/behavior는 버전 무관하게 허용됩니다. `"1.0"`이 고정 계약이라면 어긋납니다. 렌더 결과도 4절 → 6절로 바뀌므로, 이 markdown을 되읽는 소비자가 있으면 호환성 영향이 있습니다(주신 자료엔 없음 — **미확인**).
- **C-8.** `failing` 필터의 `|| a !== null && b > a`는 의도대로 동작하지만(`&&` 우선), 괄호 없는 혼합이라 gate 로직으로서 위험합니다.
- **C-9. pi-tui 설치 경로.** git status에 `patches/@earendil-works%2Fpi-tui@0.84.4.patch` **삭제**가 있고 `package.json`/`pnpm-lock.yaml`/`pnpm-workspace.yaml`이 함께 수정됐습니다. 최신 커밋 메시지가 "pi-tui 설치 재현성을 보존한다"라 다뤄진 것으로 보이나, diff만으로는 이 `dist/utils.js` 변경이 clean install에서 재현되는지 판정 불가입니다 — **미확인, 아래 D-6.**

---

## D. 완료에 필수인 추가 행동

우선순위 순입니다. 1–3은 성능 주장 자체의 전제이고, 4–5는 수락 증거, 6–8은 정합성입니다.

1. **프로덕션 `snapshot.activities`가 실제로 deep-freeze + plain-prototype인지 확인.** 아니면 heading 캐시는 프로덕션에서 한 번도 켜지지 않고 deep scan 비용만 남습니다. **권장 대안:** snapshot이 이미 `revision`과 `journalSequence`를 들고 있으므로(benchmark `prepare`가 둘 다 증가시킴), 캐시 키를 `(revision, threadId, activeTurnId)`로 바꾸고 `isDeeplyImmutableHeadingData`/`WeakSet`을 통째로 제거하세요. O(1)이고, 불변성 가정도 필요 없고, C-5의 개념 중복도 사라집니다. 이건 A-1·A-2·C-5를 한 번에 없앱니다.
2. **pi-tui가 `Component.invalidate()`를 프레임당 호출하는지 확인.** 호출한다면 현재 설계로는 캐시가 죽은 코드입니다(1번 대안은 이 문제도 없앰).
3. **`durableAppendFirstFrame`에 임계치 부여**, 그리고 `coldBodyMs`·`unseenWidthBodyMs`·`warmRepeatedResizeBody`(기본 budget 지정)를 gate에 넣거나, 이슈에 "의도적 비수락 항목"으로 명시. 현 상태로는 GREEN이 나와도 append 경로 회귀를 배제하지 못합니다.
4. **조용한 머신에서 `ASTRA_BENCH_SOURCE_HASH`를 채워 변경 전/후 2회 실행**하고 두 리포트를 증거로 첨부. 부하 중 RED 한 장은 판정 근거가 못 됩니다. CPU 30–47ms가 여기서도 재현되면 fast path가 병목이 아니라는 뜻이므로 프로파일 재확보가 먼저입니다.
5. **기존 live www 재시작 후 실제 provider + 실제 터미널에서 확인:** 한국어 스트리밍 출력의 wrap/절단, 박스드로잉 프레임, resize, Home/End, approval overlay. 최소한 `phase: "working"` + draft 스트리밍 상태에서의 idle write 0을 실제 터미널에서 봐야 합니다(현 benchmark는 ready 상태만 증명).
6. **clean clone + install에서 이 `dist/utils.js` 변경이 재현되는지 확인.** 패치 파일이 삭제된 상태라, 재현 안 되면 16,148 oracle differential과 65 tests 증거가 전부 무효가 됩니다.
7. **A-4 수정** — `finally`의 `terminal.input`/`assert`가 원인 예외를 덮지 않게(예: `if (terminal.stopped === false && startedOk)` 가드, 또는 `input`을 no-op 기본값으로).
8. **A-5 수정**(반쪽 지정 시 단일 오류) + **C-2 주석 보강**(센티널 `-1`, code unit 기반, 박스드로잉=1의 근거). C-7은 `linear-issue` markdown 소비자를 확인한 뒤 schemaVersion 정책을 명시적으로 정하세요.

utils와 heading의 **정확성**에 대해서는 반례를 못 찾았습니다. 남은 것은 정확성이 아니라 **그 변경이 실제로 이득인지에 대한 증거**이고, 지금 그 증거는 1·3·4·5가 빠져서 성립하지 않습니다.