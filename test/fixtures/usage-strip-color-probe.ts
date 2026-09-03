import { UsageStripView } from "../../src/presentation/tui/usage-strip-view";

const view = new UsageStripView();
view.update([
	{
		provider: "openai-codex",
		state: "ready",
		fetchedAt: 1,
		limits: [
			{ label: "5 hours", remainingPercent: 9, status: "exhausted" },
			{ label: "7 days", remainingPercent: 25, status: "warning" },
			{ label: "7 days (Spark)", remainingPercent: 80, status: "ok" },
		],
	},
	{ provider: "anthropic", state: "ready", fetchedAt: 1, limits: [] },
]);

process.stdout.write(view.render(65).join("\n"));
