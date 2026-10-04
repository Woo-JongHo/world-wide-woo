import      {
              stripTerminalSequences ,
              truncateToWidth        ,
              visibleWidth           ,
                                       } from "@earendil-works/pi-tui"                        ;
import type { Component                } from "@earendil-works/pi-tui"                        ;
import      { colors                   } from "@/adapters/inbound/tui/foundation/theme/theme" ;
import      { PRODUCT_VERSION          } from "@/product-version"                             ;
import type { OutputLanguage           } from "@/core/domain/execution/output-language"       ;

const W_GLYPH = Object.freeze([
	"██╗    ██╗",
	"██║    ██║",
	"██║ █╗ ██║",
	"██║███╗██║",
	"╚███╔███╔╝",
	" ╚══╝╚══╝ ",
]);
const RELEASE_HIGHLIGHTS: readonly (readonly [string, string])[] = Object.freeze([
	["Run Trace", "실행 전체 경로를 관찰합니다."],
	["Context Profiler", "반복 주입과 과도한 Context 소비를 찾습니다."],
	["Model Usage", "모델이 어디에 배치됐는지 분석합니다."],
]);
const QUICK_START: readonly (readonly [string, string])[] = Object.freeze([
	["/monitor", "실행 추적"],
	["/context", "컨텍스트 분석"],
	["/usage", "모델 사용 분석"],
	["/dashboard", "전체 상태"],
	["/cache", "캐시 분석"],
	["Ctrl+P", "모든 명령 보기"],
]);
const DETAIL_WIDTH = 56;

/** 시간과 무관한 고정 로고 프레임. Welcome은 로딩 화면이 아니라 지속형 홈 화면이다. */
export function workbenchWelcomeLogoFrame(_elapsedMs: number): string[] {
	return W_GLYPH.map(wordmarkRow);
}

export class WorkbenchWelcomeView implements Component {
	private played = false;
	constructor(
		private readonly language: () => OutputLanguage = () => "ko",
	) {}

	playIntro(requestRender: () => void): void {
		if (this.played) return;
		this.played = true;
		requestRender();
	}

	dispose(): void {}
	invalidate(): void {}

	render(width: number, availableHeight = Math.max(4, (process.stdout.rows || 40) - 8)): string[] {
		if (width <= 0 || availableHeight <= 0) return [];
		const columnWidth = width >= 52 ? width : Math.min(DETAIL_WIDTH, width);
		const details     = columns([
			releaseRows(Math.max(24, Math.floor(width / 2) - 1), this.language()),
			quickStartRows(Math.max(24, Math.floor(width / 2) - 1), this.language()),
		], width);
		const rows        = [
			...workbenchWelcomeLogoFrame(0),
			"",
			colors.text("Wooni · Native Project Workbench"),
			colors.muted(`v${PRODUCT_VERSION}`),
			...(availableHeight >= 22 ? ["", ...details, "", colors.muted(this.language() === "en" ? "TIP  Press Space to expand execution details." : "TIP  Space로 선택한 실행의 세부 정보를 펼칠 수 있습니다.")] : []),
		];
		return rows
			.map(row => centered(truncateToWidth(process.env.NO_COLOR ? stripTerminalSequences(row) : row, columnWidth), width))
			.slice(0, Math.floor(availableHeight));
	}
}

function centered(text: string, width: number): string {
	const clipped = truncateToWidth(text, Math.max(0, width));
	return " ".repeat(Math.max(0, Math.floor((width - visibleWidth(clipped)) / 2))) + clipped;
}

function wordmarkRow(row: string): string {
	const gap = "  ";
	return `${colors.accent(row)}${gap}${colors.text(row)}${gap}${colors.warning(row)}`;
}

function sectionHeader(label: string, width: number): string {
	const title = colors.muted(label)                                      ;
	const rule  = "─".repeat(Math.max(0, width - visibleWidth(title) - 1)) ;
	return `${title} ${colors.border(rule)}`;
}

function releaseRows(width: number, language: OutputLanguage): string[] {
	const highlights = language === "en" ? [
		["Run Trace", "Observe the full execution path."],
		["Context Profiler", "Find repeated context and excessive token use."],
		["Model Usage", "See where each model is used."],
	] : RELEASE_HIGHLIGHTS;
	return [
		sectionHeader(`WHAT'S NEW · v${PRODUCT_VERSION}`, width),
		...highlights.flatMap(([title, description]) => [
			`${colors.accent("+")} ${colors.text(title)}`,
			`  ${colors.muted(description)}`,
		]),
		`${colors.text("Enter")}  ${colors.muted(language === "en" ? "View release notes" : "릴리즈 노트 보기")}`,
	];
}

function quickStartRows(width: number, language: OutputLanguage): string[] {
	const commands = language === "en" ? [
		["/monitor", "Execution trace"], ["/context", "Context analysis"], ["/usage", "Model usage"],
		["/dashboard", "Overview"], ["/cache", "Cache analysis"], ["Ctrl+P", "All commands"],
	] : QUICK_START;
	return [
		sectionHeader("QUICK START", width),
		...commands.map(([command, description]) => `${colors.accent(command.padEnd(14))}${colors.muted(description)}`),
	];
}

function columns(groups: readonly string[][], width: number): string[] {
	const gap         = 2                                                               ;
	const columnWidth = Math.floor((width - gap * (groups.length - 1)) / groups.length) ;
	if (columnWidth < 24) return groups.flatMap((group, index) => index ? ["", ...group] : group);
	const height = Math.max(...groups.map(group => group.length));
	return Array.from({ length: height }, (_, row) => groups.map(group => {
		const source = process.env.NO_COLOR ? stripTerminalSequences(group[row] ?? "") : group[row] ?? "" ;
		const cell   = truncateToWidth(source, columnWidth)                                               ;
		return cell + " ".repeat(Math.max(0, columnWidth - visibleWidth(cell)));
	}).join(" ".repeat(gap)));
}
