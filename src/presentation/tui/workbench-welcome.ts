import { truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";
import { colors } from "./theme";

const INTRO_DURATION_MS = 2_400;
const INTRO_FRAME_MS = 40;
const WWW_WORDMARK = Object.freeze([
	"██╗    ██╗██╗    ██╗██╗    ██╗",
	"██║    ██║██║    ██║██║    ██║",
	"██║ █╗ ██║██║ █╗ ██║██║ █╗ ██║",
	"██║███╗██║██║███╗██║██║███╗██║",
	"╚███╔███╔╝╚███╔███╔╝╚███╔███╔╝",
	" ╚══╝╚══╝  ╚══╝╚══╝  ╚══╝╚══╝ ",
]);
const STOPS: ReadonlyArray<readonly [number, number, number]> = [
	[85, 174, 182],
	[120, 167, 198],
	[208, 161, 95],
	[220, 230, 232],
];

function colorAt(position: number): readonly [number, number, number] {
	const clamped = Math.min(1, Math.max(0, position));
	const scaled = clamped * (STOPS.length - 1);
	const index = Math.min(STOPS.length - 2, Math.floor(scaled));
	const fraction = scaled - index;
	const from = STOPS[index] ?? STOPS[0]!;
	const to = STOPS[index + 1] ?? STOPS.at(-1)!;
	return [
		Math.round(from[0] + (to[0] - from[0]) * fraction),
		Math.round(from[1] + (to[1] - from[1]) * fraction),
		Math.round(from[2] + (to[2] - from[2]) * fraction),
	];
}

/** A deterministic diagonal scan; the visible wordmark never changes between frames. */
export function workbenchWelcomeLogoFrame(elapsedMs: number): string[] {
	return artworkFrame(WWW_WORDMARK, elapsedMs);
}

function artworkFrame(artwork: readonly string[], elapsedMs: number): string[] {
	const running = elapsedMs < INTRO_DURATION_MS;
	const progress = running ? Math.max(0, elapsedMs) / INTRO_DURATION_MS : 1;
	const fade = running ? 0.5 + Math.min(1, progress * 5) * 0.5 : 1;
	const scan = running ? progress * 2.2 - 0.15 : -10;
	const height = artwork.length;
	const width = Math.max(...artwork.map((line) => Array.from(line).length));
	return artwork.map((line, row) => Array.from(line).map((character, column) => {
		if (character === " ") return character;
		const diagonal = (column + (height - row) * 1.8) / Math.max(1, width + height * 1.8);
		const base = colorAt(diagonal);
		const distance = Math.abs(diagonal - (scan % 1.2));
		const shine = running && distance < 0.09 ? 0.7 * (1 - distance / 0.09) : 0;
		const red = Math.min(255, Math.round(base[0] * fade + (255 - base[0]) * shine));
		const green = Math.min(255, Math.round(base[1] * fade + (255 - base[1]) * shine));
		const blue = Math.min(255, Math.round(base[2] * fade + (255 - base[2]) * shine));
		return `\u001b[38;2;${red};${green};${blue}m${character}\u001b[39m`;
	}).join(""));
}

function centered(text: string, width: number): string {
	const clipped = truncateToWidth(text, Math.max(0, width));
	return " ".repeat(Math.max(0, Math.floor((width - visibleWidth(clipped)) / 2))) + clipped;
}

export class WorkbenchWelcomeView implements Component {
	private elapsedMs = INTRO_DURATION_MS;
	private startedAt = 0;
	private timer: ReturnType<typeof setInterval> | null = null;

	playIntro(requestRender: () => void): void {
		if (this.timer) return;
		this.startedAt = performance.now();
		this.elapsedMs = 0;
		this.timer = setInterval(() => {
			this.elapsedMs = performance.now() - this.startedAt;
			if (this.elapsedMs >= INTRO_DURATION_MS) this.stop();
			requestRender();
		}, INTRO_FRAME_MS);
		this.timer.unref?.();
		requestRender();
	}

	dispose(): void {
		this.stop();
	}

	invalidate(): void {}

	render(width: number): string[] {
		return [
			...workbenchWelcomeLogoFrame(this.elapsedMs).map((line) => centered(line, width)),
			"",
			centered(colors.accent("bori · Native Project Workbench"), width),
			centered(colors.muted("대화 · 질문별 요약 · 현재 작업을 한 공간에서 봅니다."), width),
		];
	}

	private stop(): void {
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
		this.elapsedMs = INTRO_DURATION_MS;
	}
}
