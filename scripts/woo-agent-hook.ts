#!/usr/bin/env bun
type ToolRequest = { tool?: string; command?: string; args?: string[] };
const request = JSON.parse(await Bun.stdin.text()) as ToolRequest;
const command = [request.command ?? "", ...(request.args ?? [])].join(" ").trim();
const gitMutation = /(?:^|\s)git\s+(?:commit|commit-tree|update-ref|push|merge|rebase|cherry-pick|revert)(?:\s|$)/u;
const allowedWoo = /(?:^|\s)(?:bun|npm)\s+(?:run\s+)?commit:control(?:\s|$)/u.test(command) || /scripts\/woo-commit\.ts(?:\s|$)/u.test(command);
const decision = gitMutation && !allowedWoo
	? { allowed: false, code: "COMMIT_CONTROL_REQUIRED", reason: "Git mutation은 Woo Runtime capability를 통해 실행해야 합니다." }
	: { allowed: true };
console.log(JSON.stringify(decision));
process.exit(decision.allowed ? 0 : 2);
