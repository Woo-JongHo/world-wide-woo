import { ProcessTerminal, TUI, type Component, truncateToWidth, visibleWidth } from "@gajae-code/tui";
import chalk from "chalk";

interface SessionEvent {
	category: string;
	title: string;
	body: string;
	status: string;
	metadata?: Record<string, unknown>;
}

const fixture = process.argv[2] ?? "../fixtures/session-events.jsonl";
const events = (await Bun.file(fixture).text())
	.trim()
	.split("\n")
	.map((line) => JSON.parse(line) as SessionEvent);

const accent = chalk.cyanBright;
const muted = chalk.gray;
const green = chalk.greenBright;
const yellow = chalk.yellowBright;

function fit(text: string, width: number): string {
	const clipped = truncateToWidth(text, width);
	return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

function panel(title: string, body: string[], width: number, focused = false): string[] {
	const inner = Math.max(1, width - 4);
	const top = `╭─ ${focused ? accent("●") : "○"} ${accent(title)} ${"─".repeat(Math.max(0, inner - visibleWidth(title) - 4))}╮`;
	return [
		fit(top, width),
		...body.map((line) => `│ ${fit(line, inner)} │`),
		`╰${"─".repeat(width - 2)}╯`,
	];
}

class WesScreen implements Component {
	private focus = 0;
	constructor(
		private readonly stop: () => void,
		private readonly rerender: () => void,
	) {}

	invalidate(): void {}

	handleInput(data: string): void {
		if (data === "q" || data === "\u0003") this.stop();
		if (data === "\t") {
			this.focus = (this.focus + 1) % 2;
			this.rerender();
		}
	}

	render(width: number): string[] {
		const w = Math.max(40, width);
		const conversation: string[] = [];
		const execution: string[] = [];
		const results: string[] = [];
		for (const event of events) {
			if (event.category === "user" || event.category === "assistant") {
				conversation.push(`${accent(event.title)}  ${event.body}`, "");
			}
			if (event.category === "command") {
				const cwd = String(event.metadata?.cwd ?? "");
				execution.push(`${accent("$ " + event.title)}  ${muted(cwd)}`, ...event.body.split("\n"), green("✓ exit 0"), "");
			}
			if (["action", "decision", "evidence"].includes(event.category)) {
				const style = event.category === "decision" ? yellow : event.category === "evidence" ? green : accent;
				results.push(`${style(event.title.padEnd(10))} ${event.body}`);
			}
		}
		return [
			...panel("WES Session", [`project 99_www  │  branch main  │  status prototype`], w),
			...panel("Conversation", [...conversation, ...Array(Math.max(0, 6 - conversation.length)).fill("")], w, this.focus === 0),
			...panel("Live Execution", [...execution, ...Array(Math.max(0, 10 - execution.length)).fill("")], w, this.focus === 1),
			...panel("Result", results, w),
			...panel("Composer", [`${accent(">")} ${muted("메시지 입력")}`, muted("tab: pane  q: quit")], w),
		];
	}
}

const terminal = new ProcessTerminal();
const tui = new TUI(terminal);
const stop = () => {
	tui.stop();
	process.exit(0);
};
const screen = new WesScreen(stop, () => tui.requestRender());
tui.addChild(screen);
tui.setFocus(screen);
tui.start();
