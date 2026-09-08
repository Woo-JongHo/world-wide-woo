import type { ProjectActivity } from "../execution/project-activity.js";

export type WorkActivityClass = "observation" | "action" | "control";

export function classifyWorkActivity(
	activity: ProjectActivity,
): WorkActivityClass {
	if (activity.kind === "file-change") return "action";
	if (activity.kind !== "tool") return "control";
	const item = record(record(activity.payload.params)?.item) ??
		record(activity.payload.params) ?? activity.payload;
	const command = typeof (item.command ?? item.cmd) === "string" ? String(item.command ?? item.cmd) : "";
	if (command) return isReadOnlyShell(command) ? "observation" : "action";
	const tool = typeof (item.tool ?? item.toolName ?? item.name) === "string"
		? String(item.tool ?? item.toolName ?? item.name)
		: "";
	if (!tool) return "action";
	const normalized = tool.replace(/[-_.]/gu, " ").toLowerCase();
	if (
		/\b(?:create|update|delete|remove|write|edit|apply|send|post|put|deploy|execute|run)\b/u
			.test(normalized)
	) return "action";
	if (
		/\b(?:read|get|list|search|find|view|inspect|fetch|query|lookup|show)\b/u
			.test(normalized)
	) return "observation";
	return "action";
}

function isReadOnlyShell(command: string): boolean {
	const value = command.trim().replace(/\b\d?>\s*\/dev\/null\b/gu, "");
	if (!value) return true;
	if (
		/(?:^|\s)(?:rm|mv|cp|mkdir|rmdir|touch|chmod|chown|tee|truncate|install|patch|apply_patch)(?:\s|$)/u
			.test(value) ||
		/\b(?:npm|pnpm|yarn|bun)\s+(?:add|install|remove|uninstall|update)\b/u.test(
			value,
		) ||
		/\bgit\s+(?:add|commit|push|pull|merge|rebase|reset|checkout|switch|restore|clean|tag)\b/u
			.test(value) ||
		/\bfind\b[^\n]*(?:-delete|-exec|-execdir)\b/u.test(value) ||
		/\bsed\b[^\n]*(?:-i\b|--in-place\b)/u.test(value) ||
		/(?:^|[^<])>(?:>|&)?/u.test(value)
	) return false;
	const segments = value.split(/&&|\|\||[;|]/u).map((part) => part.trim())
		.filter(Boolean);
	return segments.length > 0 &&
		segments.every((part) =>
			/^(?:cd\b|pwd\b|ls\b|eza\b|tree\b|rg\b|grep\b|cat\b|head\b|tail\b|wc\b|sort\b|stat\b|file\b|which\b|whereis\b|type\b|find\b|readlink\b|realpath\b|sed\s+-n\b|git\s+(?:status|diff|log|show|rev-parse)\b|bun\s+test\b|echo\b|printf\b|true\b)/u
				.test(
					part.replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=[^\s]+\s+)*/u, "").replace(
						/^\(?\s*/u,
						"",
					).trim(),
				)
		);
}

function record(value: unknown): Readonly<Record<string, unknown>> | undefined {
	return value && typeof value === "object" && !Array.isArray(value)
		? value as Readonly<Record<string, unknown>>
		: undefined;
}
