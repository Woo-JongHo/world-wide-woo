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
				label: "7 days",
				remainingPercent: 42,
				resetsAt: now + (6 * 60 + 33) * 60_000,
				status: "ok",
			}],
		}];

		const rows = wwwQuotaHudRows(usage, 120, now, false);
		const row = rows[0]!;
		const plain = stripTerminalSequences(row);
		expect(rows).toHaveLength(2);
		expect(plain).toContain("Codex");
		expect(stripTerminalSequences(rows[1]!)).toContain("42% · 6h 33m");
		expect(plain).not.toContain("7d");
		expect(plain).not.toMatch(/[\[\]]/u);

		const coloredRuns = [...row.matchAll(/\x1b\[48;2;[^m]+m\x1b\[38;2;[^m]+m\x1b\[1m([^\x1b]*)/gu)];
		expect(coloredRuns[1]?.[1]).toHaveLength(Math.round((20 - "Codex".length - 1) * 0.42));
		const icon = row.match(/\x1b\[48;2;[^m]+m\x1b\[38;2;[^m]+m\x1b\[1mCodex/u);
		expect(icon).not.toBeNull();
		expect(row.indexOf(icon![0])).toBeLessThan(row.indexOf(coloredRuns[1]![0]));
	} finally {
		chalk.level = level;
	}
});

test("주간 바 아래에 잔여율을 표시하고 추가 구독 자리를 유지한다", () => {
	const now = Date.parse("2026-09-22T00:00:00Z");
	const usage: UsageSnapshot[] = [{
		provider: "openai-codex", state: "ready", fetchedAt: now,
		limits: [
			{ label: "7 days", remainingPercent: 81, status: "ok" },
			{ label: "5 hours", remainingPercent: 24, status: "ok" },
		],
	}];
	const rows = wwwQuotaHudRows(usage, 120, now).map(stripTerminalSequences);
	expect(rows).toHaveLength(2);
	expect(rows[1]).toContain("81% · 기간 —");
	expect(rows[0]).not.toContain("24%");
	expect(rows[0]).not.toContain("5h");
	for (const provider of ["Claude", "Antigravity", "Z.AI"]) expect(rows[0]).toContain(provider);
	for (const row of rows) {
		expect(row.trimEnd().length).toBeLessThan(120);
	}
});

test("100% 막대에서도 로고 칸은 채움색과 분리된다", () => {
	const level = chalk.level;
	chalk.level = 3;
	try {
		const now = Date.parse("2026-09-22T00:00:00Z");
		const usage: UsageSnapshot[] = [{
			provider: "zai", state: "ready", fetchedAt: now,
			limits: [{ label: "7 days", remainingPercent: 100, status: "ok" }],
		}];
		const row = wwwQuotaHudRows(usage, 120, now, true)[0]!;
		const logoBackground = [...row.matchAll(/\x1b\[48;2;([^m]+)m\x1b\[38;2;[^m]+m\x1b\[1m\x1b_Ga=T/gu)].at(-1)?.[1];
		const fillBackground = row.match(/\x1b\[48;2;([^m]+)m\x1b\[38;2;[^m]+m\x1b\[1m +/u)?.[1];
		expect(logoBackground).toBeDefined();
		expect(fillBackground).toBeDefined();
		expect(logoBackground).not.toBe(fillBackground);
		expect(stripTerminalSequences(row)).not.toContain("100%");
	} finally {
		chalk.level = level;
	}
});
