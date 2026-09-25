# TypeScript 그리드 템플릿

예시는 `06_align-tables.ts --write` 출력과 같은 형태다. 이 문서와 검사기 출력이 다르면 **검사기가 기준**이며, 축별 간격·삽입 구분은 [가독성 계약의 작성 시 축 계약](readability-contract.md)을 따른다. 각 역할 구획은 독립된 표이며 다른 구획의 최장값을 가져오지 않는다.

## 비공개 로컬 타입

종결 `;`도 하나의 열이다(규칙 35). `=`와 `;`를 실제 최장 값 기준으로 맞추고 `//` 설명 열을 붙인다.

```ts
type AppOptions      = RunOptions             ; // 애플리케이션 실행 입력
type SessionList     = RecentSessionSummary[] ; // 표시할 세션 목록
type ThreadSelection = string | null          ; // null은 사용자 선택 취소
```

로컬 타입 설명은 선언 옆에서 함께 읽도록 `//` 열을 맞춘다. exported 타입이나 공개 optional 속성은 이 형식을 쓰지 않고 선언 앞의 JSDoc으로 hover 계약을 유지한다.

## 메서드 시그니처 표

`(`는 이름 폭 이후에, `)`는 매개변수 최대 폭 이후에 열을 맞춘다. 빈 매개변수는 `()`로 붙이고 여백은 괄호 밖에 둔다. 반환 타입 `:`는 `)`에 붙인 채로 열만 맞춘다.

```ts
export interface MethodContract {
	runFirst (first: string                ): Promise<void>;
	runSecond(second: number, extra: string): void;
	listAll  ()                             : Promise<string[]>;
}
```

## 선언 표 (declaration-equals)

`:`와 `=`와 종결 `;`가 각각 하나의 열이다. 타입이 없는 선언은 `=`와 `;`만 맞춘다.

```ts
const alpha : string  = "a"  ;
const beta  : number  = 22   ;
const gamma : boolean = true ;
```

## 등록 객체 · enum 멤버 · case 행

```ts
const rails = {
	dashboard : new DashboardRail(get, synthetic),
	workflow  : new WorkflowRail(get, synthetic),
	context   : new ContextRail(get, synthetic),
};

enum Level {
	Low    = 1   ,
	Middle = 22  ,
	High   = 333 ,
}
```

```ts
	switch (input) {
		case "a"  : return "first";
		case "bb" : return "second";
		case "ccc": return "third";
		default: return "rest";
	}
```

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

## 객체 배열 열 명세

표현 기본값을 생략해 행마다 셀 수가 달라지게 두지 않는다. 열 명세와 데이터 행은 분리한다.

```ts
const columns = [
	{ heading : "SOURCE"      , minWidth : 7, weight : 0, align : "left"  },
	{ heading : "DISTRIBUTION", minWidth : 4, weight : 1, align : "left"  },
	{ heading : "SIZE"        , minWidth : 6, weight : 0, align : "right" },
	{ heading : "SHARE"       , minWidth : 6, weight : 0, align : "right" },
] as const;
const rows = sources.map(source => [
	source.code,
	source.distribution,
	source.size,
	source.share,
]);

return renderTable({ columns, rows }, width);
```

이 표는 `{`, 네 개의 `:`, 세 개의 속성 구분 `,`, `}`가 각각 같은 열이어야 한다. 속성 생략이 실제 계약 차이라면 기본값을 채우지 말고 그 행을 다른 표로 분리한다.

## 등록 객체와 지역 계산

```ts
const rails = {
    dashboard : new DashboardRail(get, synthetic),
    workflow  : new WorkflowRail (get, synthetic),
    context   : new ContextRail  (get, synthetic),
};

const widths = columnWidths(width);
const left   = (widths[0] ?? width) - 2;
const middle = (widths[1] ?? width) - 2;
const right  = (widths[2] ?? width) - 2;
```

등록 객체는 `:`·`new`·인자 시작을, 선언 블록은 `=`·계산식 시작을 측정한다. 생성자의 서로 다른 필수 인자는 유지하며, 한 행에 여러 등록 항목을 몰아넣지 않는다.

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

## 함수 지도

기능 구현 파일 상단에 파일 안 함수의 읽기 지도를 둔다. `08_function-map.ts`가 지도와 선언의 drift를 검사한다.

```ts
// GROUP | FUNCTION        | INPUT              | RETURN  | CALLS             | ROLE
// RUN   | runCli           | args, dependencies | Promise | runAstraCommand   | 명령 분기
// ASTRA | runAstraCommand  | args, dependencies | Promise | writeSessions     | Astra 실행
```

GROUP은 파일 안 역할 구획(RUN·LIST·STATE 등)을, INPUT은 매개변수 이름 나열을, CALLS는 파일 안 호출 대상을 뜻한다. drift 검사는 `08_function-map.ts --file <대상 파일>`이며, 골격 생성은 `--scaffold`를 쓴다.
