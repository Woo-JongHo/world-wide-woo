import { afterEach, describe, expect, test } from "bun:test";
import { access, chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createProjectAgentTools } from "../src/infrastructure/agent-tools";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), "www-agent-tools-"));
	roots.push(root);
	await writeFile(join(root, "hello.txt"), "hello token=top-secret\n\x1b]8;;https://example.test\x07needle\x1b]8;;\x07\n");
	await mkdir(join(root, "folder"));
	await writeFile(join(root, "folder", "nested.txt"), "Needle\n");
	const sshConfigPath = join(root, "ssh-config");
	await writeFile(sshConfigPath, "Host woojongho\n  HostName 100.85.195.37\n  User woojongho\n  Port 22\n");
	return { root, tools: createProjectAgentTools(root, { sshConfigPath }) };
}
function tool(tools: ReturnType<typeof createProjectAgentTools>, name: string) {
	const result = tools.find((candidate) => candidate.definition.name === name);
	if (!result) throw new Error(`Missing ${name}`);
	return result;
}
const signal = () => new AbortController().signal;

describe("project agent tools", () => {
	test("reads UTF-8 files and bounded directory listings", async () => {
		const { tools } = await fixture();
		expect((await tool(tools, "read").execute({ path: "hello.txt" }, signal())).modelContent).toContain("hello");
		expect((await tool(tools, "read").execute({ path: "." }, signal())).modelContent).toContain("folder/");
	});

	test("blocks traversal and symlink escapes", async () => {
		const { root, tools } = await fixture();
		const outside = await mkdtemp(join(tmpdir(), "www-agent-outside-")); roots.push(outside);
		await writeFile(join(outside, "secret.txt"), "secret");
		await symlink(join(outside, "secret.txt"), join(root, "escape"));
		expect((await tool(tools, "read").execute({ path: join(root, "hello.txt") }, signal())).isError).toBe(false);
		for (const path of ["../secret.txt", "escape", join(outside, "secret.txt")]) {
			const result = await tool(tools, "read").execute({ path }, signal());
			expect(result.isError).toBe(true);
		}
	});

	test("searches literal and regex patterns and reports no matches", async () => {
		const { tools } = await fixture();
		expect((await tool(tools, "search").execute({ pattern: "needle" }, signal())).modelContent).toContain("hello.txt");
		expect((await tool(tools, "search").execute({ pattern: "N.*dle", regex: true }, signal())).modelContent).toContain("nested.txt");
		const noMatch = await tool(tools, "search").execute({ pattern: "absent-value" }, signal());
		expect(noMatch.isError).toBe(false);
		expect(noMatch.modelContent).toBe("No matches.");
	});

	test("runs only safe argv commands and preserves command observations", async () => {
		const { root, tools } = await fixture();
		const bash = tool(tools, "bash");
		const pwd = await bash.execute({ command: "pwd", args: [] }, signal());
		expect(pwd.snapshot).toMatchObject({ shell: "bash", cwd: root, status: "passed" });
		expect(pwd.modelContent).toContain(root);
		expect((await bash.execute({ command: "git", args: ["status"] }, signal())).snapshot).toHaveProperty("shell", "bash");
		const ssh = await tool(tools, "ssh_config").execute({ host: "woojongho" }, signal());
		expect(ssh.modelContent).toContain("hostname 100.85.195.37");
		expect(ssh.modelContent).toContain("user woojongho");
	});

	test("fails closed for network SSH, git mutation, and shell syntax", async () => {
		const { tools } = await fixture(); const bash = tool(tools, "bash");
		for (const input of [
			{ command: "ssh", args: ["localhost"] },
			{ command: "git", args: ["commit", "-m", "x"] },
			{ command: "git", args: ["diff", "--no-index", "/etc/passwd", "hello.txt"] },
			{ command: "git", args: ["diff", "--textconv"] },
			{ command: "git", args: ["branch", "publication-corruption"] },
			{ command: "git", args: ["show", "HEAD:.env"] },
			{ command: "git", args: ["log", "-n10", "-p"] },
			{ command: "pwd", args: [";", "whoami"] },
		]) {
			expect((await bash.execute(input, signal())).isError).toBe(true);
		}
	});

	test("handles aborted commands and redacts terminal output", async () => {
		const { root, tools } = await fixture(); const bash = tool(tools, "bash");
		const controller = new AbortController(); controller.abort();
		expect((await bash.execute({ command: "pwd" }, controller.signal)).snapshot).toHaveProperty("status", "cancelled");
		const read = await tool(tools, "read").execute({ path: "hello.txt" }, signal());
		expect(read.modelContent).not.toContain("top-secret");
		expect(read.modelContent).not.toContain("\x1b");
		await writeFile(join(root, "large.txt"), "x".repeat(70_000));
		const large = await tool(tools, "read").execute({ path: "large.txt" }, signal());
		expect(new TextEncoder().encode(large.modelContent).byteLength).toBeLessThanOrEqual(64 * 1024);
	});

	test("blocks common project credential files from read and search", async () => {
		const { root, tools } = await fixture();
		await writeFile(join(root, ".env"), "SECRET_VALUE=never-show");
		const read = await tool(tools, "read").execute({ path: ".env" }, signal());
		expect(read.isError).toBe(true);
		const search = await tool(tools, "search").execute({ pattern: "never-show" }, signal());
		expect(search.modelContent).toBe("No matches.");
	});

	test("keeps the project Todo ledger out of model read and search tools", async () => {
		const { root, tools } = await fixture();
		await mkdir(join(root, ".www"));
		await writeFile(join(root, ".www", "Todo.md"), "- [ ] private planning instruction");
		await mkdir(join(root, ".www", "todos", "session"), { recursive: true });
		await writeFile(join(root, ".www", "todos", "session", "Todo.md"), "- [ ] session private instruction");
		const read = await tool(tools, "read").execute({ path: ".www/Todo.md" }, signal());
		expect(read.isError).toBe(true);
		const sessionRead = await tool(tools, "read").execute({ path: ".www/todos/session/Todo.md" }, signal());
		expect(sessionRead.isError).toBe(true);
		const search = await tool(tools, "search").execute({ pattern: "private planning instruction" }, signal());
		expect(search.modelContent).toBe("No matches.");
		expect((await tool(tools, "search").execute({ pattern: "session private instruction" }, signal())).modelContent).toBe("No matches.");
	});

	test("resolves SSH aliases without evaluating Match exec", async () => {
		const root = await mkdtemp(join(tmpdir(), "www-agent-ssh-config-"));
		roots.push(root);
		const marker = join(root, "escaped");
		const config = join(root, "config");
		await writeFile(config, `Host review\n  HostName 127.0.0.1\n  User reviewer\nMatch host review exec \"touch ${marker}\"\n  Port 2200\n`);
		const tools = createProjectAgentTools(root, { sshConfigPath: config });
		const result = await tool(tools, "ssh_config").execute({ host: "review" }, signal());
		expect(result.modelContent).toContain("hostname 127.0.0.1");
		expect(result.modelContent).toContain("user reviewer");
		expect(result.modelContent).not.toContain("port 2200");
		await expect(access(marker)).rejects.toThrow();
	});

	test("disables repository fsmonitor execution for read-only Git profiles", async () => {
		const { root } = await fixture();
		expect(await Bun.spawn(["git", "init", "--quiet", root]).exited).toBe(0);
		const marker = join(root, "fsmonitor-ran");
		const hook = join(root, "fsmonitor.sh");
		await writeFile(join(root, "tracked.txt"), "tracked\n");
		expect(await Bun.spawn(["git", "-C", root, "add", "tracked.txt"]).exited).toBe(0);
		await writeFile(hook, `#!/bin/sh\ntouch '${marker}'\nexit 0\n`);
		await chmod(hook, 0o700);
		expect(await Bun.spawn(["git", "-C", root, "config", "core.fsmonitor", hook]).exited).toBe(0);
		const tools = createProjectAgentTools(root, { sshConfigPath: join(root, "ssh-config") });
		const result = await tool(tools, "bash").execute({ command: "git", args: ["status", "--short"] }, signal());
		expect(result.isError).toBe(false);
		await expect(access(marker)).rejects.toThrow();
	});
});
