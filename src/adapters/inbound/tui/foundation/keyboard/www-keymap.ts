import { matchesKey } from "@earendil-works/pi-tui";
import type { KeyId } from "@earendil-works/pi-tui";

// Www 키맵 단일 원본. 바인딩을 키가 아니라 동작 이름(action)으로 소유하고,
// F키 테이블·Ctrl+G 뷰 테이블·HelpView·실행 문서의 키보드 표는 모두 여기서 파생한다.
// 셸 전역 리스너(workbench-shell)는 이 맵의 keyId만 소비하며, test/www-keymap.test.ts가
// 맵·도움말·문서의 정합을 고정한다. 모달 오버레이 내부의 입력 키는 각 컴포넌트가 소유한다.

export type WwwKeyAction =
	| "page.execution"
	| "page.plan"
	| "page.monitor"
	| "page.stats"
	| "page.dashboard"
	| "page.map"
	| "page.context"
	| "page.test"
	| "page.workflow"
	| "plan.sidebar"
	| "views.switcher"
	| "command.palette"
	| "browse.toggle"
	| "scroll.move"
	| "transcript.expand"
	| "runtime.mode.cycle"
	| "navigate.back"
	| "interrupt.or.exit"
	| "session.exit";

export type WwwFunctionKey = "f2" | "f3" | "f4" | "f5" | "f6" | "f7" | "f8" | "f9";
export type WwwViewNumber = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";

export interface WwwKeyBinding {
	readonly label        : string         ;
	readonly command?     : string         ;
	readonly functionKey? : WwwFunctionKey ;
	readonly viewNumber?  : WwwViewNumber  ;
	/** 셸 전역 입력 리스너가 직접 소비하는 pi-tui keyId. 에디터가 소유하는 키(keys 종료 등)는 비운다. */
	readonly keys?: readonly string[];
	/** 문서·도움말 동기화 검증에 쓰는 표기 라벨. */
	readonly doc: readonly string[];
}

export const WWW_KEYMAP: Readonly<Record<WwwKeyAction, WwwKeyBinding>> = {
	"page.execution"  : { label: "실행 · 질문 요약", command: "/chat", functionKey: "f2", viewNumber: "1", doc: ["Ctrl+G → 1"] },
	"page.plan"       : { label: "Plan", command: "/todo", functionKey: "f3", viewNumber: "2", doc: ["Ctrl+G → 2"] },
	"page.monitor"    : { label: "Progress", command: "/monitor", functionKey: "f4", viewNumber: "3", doc: ["Ctrl+G → 3"] },
	"page.stats"      : { label: "통계", command: "/stats", functionKey: "f5", viewNumber: "4", doc: ["Ctrl+G → 4"] },
	"page.dashboard"  : { label: "세션", command: "/dashboard", functionKey: "f6", viewNumber: "5", doc: ["Ctrl+G → 5"] },
	"page.map"        : { label: "개발 지도", command: "/map", functionKey: "f7", viewNumber: "6", doc: ["Ctrl+G → 6"] },
	"page.context"    : { label: "Context · 사용량", command: "/context", functionKey: "f8", viewNumber: "7", doc: ["Ctrl+G → 7"] },
	"page.test"       : { label: "질문별 Test", command: "/test", functionKey: "f9", viewNumber: "8", doc: ["Ctrl+G → 8"] },
	"page.workflow"   : { label: "Workflow · Subagents", command: "/workflow", viewNumber: "9", doc: ["Ctrl+G → 9"] },
	"plan.sidebar"    : { label: "넓은 실행 화면의 계획 사이드바 열기/닫기", keys: ["ctrl+b"], doc: ["Ctrl+B"] },
	"views.switcher"  : { label: "화면 선택", keys: ["ctrl+g"], doc: ["Ctrl+G"] },
	"command.palette" : { label: "명령 찾기. Enter는 입력란에 넣기만 하며 실행하지 않음", keys: ["ctrl+p"], doc: ["Ctrl+P"] },
	"browse.toggle"   : { label: "빈 입력에서 본문 읽기로, 읽기에서 입력으로 전환", keys: ["tab"], doc: ["Tab"] },
	"scroll.move": {
		label : "읽기 모드에서 본문 이동. 세션 목록의 ↑↓는 선택 이동",
		keys  : ["up", "down", "j", "k", "pageUp", "pageDown", "home", "end", "g", "G"],
		doc   : ["↑↓, j/k", "PgUp / PgDn", "Home / End, g/G"],
	},
	"transcript.expand"  : { label: "읽기 모드에서 도구 출력 펼치기/접기. 입력 중에는 기존 줄 끝 이동", keys: ["ctrl+e"], doc: ["Ctrl+E"] },
	"runtime.mode.cycle" : { label: "협업·권한 모드 순환", keys: ["shift+tab"], doc: ["Shift+Tab"] },
	"navigate.back"      : { label: "모달·상세·읽기 상태에서 돌아가기. 실행 화면의 입력 상태에서는 현재 실행 중단", keys: ["escape"], doc: ["Esc"] },
	"interrupt.or.exit"  : { label: "실행 중 응답 중단. 500ms 안에 다시 누르면 종료", keys: ["ctrl+c"], doc: ["Ctrl+C"] },
	"session.exit"       : { label: "입력이 비었을 때 안전하게 종료", doc: ["Ctrl+D"] },
};

/** Ctrl+G 뷰 선택 테이블 — [숫자, 명령, 라벨]. HelpView와 스위처가 소비한다. */
export const WWW_VIEWS = Object.entries(WWW_KEYMAP)
	.filter((entry): entry is [WwwKeyAction, WwwKeyBinding & { command: string; viewNumber: WwwViewNumber }] =>
		entry[0] in WWW_KEYMAP && entry[1].viewNumber !== undefined && entry[1].command !== undefined)
	.sort(([, a], [, b]) => a.viewNumber.localeCompare(b.viewNumber))
	.map(([, binding]) => [binding.viewNumber, binding.command, binding.label] as const);

/** 보조 F키 테이블 — [키, 명령, 라벨]. 셸의 F키 루프가 소비한다. */
export const WWW_KEYS = Object.entries(WWW_KEYMAP)
	.filter((entry): entry is [WwwKeyAction, WwwKeyBinding & { command: string; functionKey: WwwFunctionKey }] =>
		entry[0] in WWW_KEYMAP && entry[1].functionKey !== undefined && entry[1].command !== undefined)
	.sort(([, a], [, b]) => a.functionKey.localeCompare(b.functionKey))
	.map(([, binding]) => [binding.functionKey, binding.command, binding.label] as const);

/** HelpView가 이 순서대로 전역 키를 나열한다. */
export const WWW_HELP_ACTIONS = [
	"views.switcher",
	"command.palette",
	"browse.toggle",
	"scroll.move",
	"transcript.expand",
	"plan.sidebar",
	"runtime.mode.cycle",
	"navigate.back",
	"interrupt.or.exit",
	"session.exit",
] as const satisfies readonly WwwKeyAction[];

/** 스크롤 이동의 별칭 키 그룹. 셸이 그대로 소비한다. */
export const WWW_SCROLL_KEYS = {
	down     : ["down", "j"],
	up       : ["up", "k"],
	pageDown : ["pageDown"],
	pageUp   : ["pageUp"],
	home     : ["home", "g"],
	end      : ["end", "G"],
} as const;

/** 문서 표에는 없지만 문서 본문에서 보증해야 하는 표기. */
export const WWW_DOC_EXTRA = ["F2–F9"] as const;

/** KeyId 유니온에 없는 시프트 문자(G)만 raw 비교하고, 나머지는 matchesKey가 Kitty 시퀀스까지 처리한다. */
export function matchesWwwKey(data: string, key: string): boolean {
	return key.length === 1 && key !== key.toLowerCase() ? data === key : matchesKey(data, key as KeyId);
}

export function matchesWwwAction(data: string, action: WwwKeyAction): boolean {
	return (WWW_KEYMAP[action].keys ?? []).some(key => matchesWwwKey(data, key));
}
