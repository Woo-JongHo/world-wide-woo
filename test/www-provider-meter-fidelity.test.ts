import { expect, test }           from "bun:test";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
import chalk                      from "chalk";
import { wwwQuotaHudRows }        from "../src/adapters/inbound/tui/features/usage/view/www-usage";
import type { UsageSnapshot }     from "../src/core/ports/observability/usage-monitor-port";

test("provider meter stays compact and fills its interior by remaining percent", () => {
	const level = chalk.level;
	chalk.level = 3;
	try {
		const now = Date.parse("2026-09-22T00:00:00Z");
		const usage: UsageSnapshot[] = [{
			provider: "openai-codex",
			state: "ready",
			fetchedAt: now,
			limits: [{
				label: "5 hours",
				remainingPercent: 42,
				resetsAt: now + (6 * 60 + 33) * 60_000,
				status: "ok",
			}],
		}];

		const row = wwwQuotaHudRows(usage, 120, now, false)[2]!;
		const plain = stripTerminalSequences(row);
		expect(plain).toContain("[  42% 6h 33m  ]");

		const meterStart = plain.indexOf("[")                 ;
		const meterEnd   = plain.indexOf("]", meterStart) + 1 ;
		const meter      = plain.slice(meterStart, meterEnd)  ;
		expect(meter).toHaveLength(16);

		const coloredRuns = [...row.matchAll(/\x1b\[48;2;[^m]+m\x1b\[38;2;[^m]+m\x1b\[1m([^\x1b]*)/gu)];
		expect(coloredRuns[0]?.[1]).toHaveLength(Math.round((meter.length - 2) * 0.42));
	} finally {
		chalk.level = level;
	}
});
