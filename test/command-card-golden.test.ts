import      { describe, expect, test               } from "bun:test"                                               ;
import      { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui"                                 ;
import type { CommandResultSnapshot                } from "@/core/domain/execution/output"                         ;
import      { BashResultCard                       } from "@/adapters/inbound/tui/features/chat/view/result-cards" ;

function command(overrides: Partial<CommandResultSnapshot>): CommandResultSnapshot {
	return {
		id         : "golden-command",
		shell      : "bash",
		command    : "printf '안녕\\n'",
		cwd        : "/workspace",
		status     : "running",
		stdout     : "안녕",
		stderr     : "",
		startedAt  : 100,
		durationMs : undefined,
		exitCode   : undefined,
		...overrides,
	};
}

describe("command card golden frames", () => {
	test("running frame retains the complete 32-column layout", () => {
		const lines = new BashResultCard(command({}), 2).render(32);
		expect(lines.every((line) => visibleWidth(line) === 32)).toBe(true);
		expect(stripTerminalSequences(lines.join("\n"))).toMatchSnapshot();
	});

	test("failed frame shows bounded mixed streams and terminal details", () => {
		const lines = new BashResultCard(command({
			status     : "failed",
			stdout     : "one\ntwo\nthree",
			stderr     : "실패",
			exitCode   : 7,
			durationMs : 42,
		}), 2).render(32);
		expect(lines.every((line) => visibleWidth(line) === 32)).toBe(true);
		expect(stripTerminalSequences(lines.join("\n"))).toMatchSnapshot();
	});
});
