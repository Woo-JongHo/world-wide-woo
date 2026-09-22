# TypeScript 그리드 템플릿

이 템플릿은 고정 문자열이 아니라 폭 계산 예시다. 각 역할 구획은 독립된 표이며 다른 구획의 최장값을 가져오지 않는다.

## 비공개 로컬 타입

```ts
type AppOptions      = RunAppOptions;                  // 애플리케이션 실행 입력
type SessionList     = RecentSessionSummary[];         // 표시할 세션 목록
type ThreadList      = readonly NativeThreadSummary[]; // 수정 불가능한 thread 목록
type ThreadSelection = string | null;                  // null은 사용자 선택 취소
```

로컬 타입 설명은 선언 옆에서 함께 읽도록 `//` 열을 맞춘다. exported 타입이나 공개 optional 속성은 이 형식을 쓰지 않고 선언 앞의 JSDoc으로 hover 계약을 유지한다.

## 의존성 인터페이스

```ts
export interface ExampleDependencies {
	// Run — `string`이 이 구획의 Promise 내부 최대 폭이다.
	runFirst  : ( value : FirstInput  ) => Promise< void >;       // 첫 실행
	runSecond : ( value : SecondInput ) => Promise<string>;       // 두 번째 실행

	// List — `SessionList`가 이 구획의 최대 폭이다.
	listSessions : () => Promise<SessionList>;                    // 세션 조회
	listThreads  : () => Promise<ThreadList >;                    // thread 조회

	// Select — 한 행뿐이므로 자기 실제 값이 최소 폭이다.
	selectThread : ( thread : ThreadList ) => Promise<ThreadSelection>; // thread 선택
}
```

`Promise< >` 폭은 역할 구획별로 계산하지만 우측 설명 `//`는 같은 인터페이스 선언 표의 한 열에 둔다. 이때 타입 셀을 늘리지 않고 `;` 뒤 바깥 여백만 사용한다.

## 실행 의존성

최장 인자값이 `threads`라면 `( )` 내부 폭은 7이다. `args`와 `value`만 그 안에서 가운데 정렬한다. 빈 인자는 `()`로 붙이고 `=>`까지의 여백은 괄호 밖에 둔다.

```ts
runApp             : async (options) => action(options),
runAuth            : async ( args  ) => action(args),
listSessions       : async ()        => action(),
selectNativeThread : async (threads) => action(threads),
writeOut           :       ( value ) => action(value),
```

한 줄 본문에 마지막 호출이 있으면 호출의 시작 열까지만 맞추고 값 뒤는 늘리지 않는다.

```ts
runShort : async (value) => { const { run } = await import("module"); return run(value); },
runLong  : async (value) => { const { run } = await import("module"); return run(value, "extra"); },
```

## 검증

역할 구획을 한 번에 섞지 말고 각 줄 범위를 따로 검사한다.

```bash
bun .agents/skills/woo-code-readability/scripts/measure-layout.ts src/cli.ts \
  --lines 52-62 \
  --tokens ':#1|(#1|)#1|=>' \
  --center-cell '(#1' \
  --compact-before '}#2'
```

`center(()=ok`가 아니면 기존 공백을 폭으로 재사용했거나 값이 최소 셀 안에서 가운데 정렬되지 않은 것이다.
