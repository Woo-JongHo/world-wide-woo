import { describe, expect, test } from "bun:test";
import type { JsonLineTransport } from "../src/adapters/outbound/execution/codex-app-server.js";
import { CodexAppServer, NativeOperationUncertainError, StdioJsonLineTransport } from "../src/adapters/outbound/execution/codex-app-server.js";

class FakeJsonLineTransport implements JsonLineTransport {
	public readonly sent: Array<Record<string, unknown>> = [];
	public responseFor = new Map<string, unknown>();
	public responseQueueFor = new Map<string, unknown[]>();
	public hold = new Set<string>();
	private readonly lineListeners = new Set<(line: string) => void>();
	private readonly closeListeners = new Set<(error?: Error) => void>();

	public async send(line: string): Promise<void> {
		const message = JSON.parse(line) as Record<string, unknown>;
		this.sent.push(message);
		if (typeof message.method === "string" && message.id !== undefined && !this.hold.has(message.method)) {
			const queued = this.responseQueueFor.get(message.method);
			const result = queued?.shift() ?? this.responseFor.get(message.method) ?? {};
			queueMicrotask(() => this.emit({ id: message.id, result }));
		}
	}

	public onLine(listener: (line: string) => void): () => void {
		this.lineListeners.add(listener);
		return () => this.lineListeners.delete(listener);
	}

	public onClose(listener: (error?: Error) => void): () => void {
		this.closeListeners.add(listener);
		return () => this.closeListeners.delete(listener);
	}

	public async close(): Promise<void> {
		this.disconnect();
	}

	public emit(message: Record<string, unknown>): void {
		const line = JSON.stringify(message);
		for (const listener of this.lineListeners) listener(line);
	}

	public disconnect(error = new Error("test disconnect")): void {
		for (const listener of this.closeListeners) listener(error);
	}
}

async function connectedFake(): Promise<{ server: CodexAppServer; transport: FakeJsonLineTransport }> {
	const transport = new FakeJsonLineTransport();
	const server = await CodexAppServer.connectTransport(transport);
	return { server, transport };
}

describe("CodexAppServer", () => {
	test("reads subscription limits from the active native ChatGPT account", async () => {
		const { server, transport } = await connectedFake();
		transport.responseFor.set("account/read", {
			account: { type: "chatgpt", email: "must-not-leak@example.com", planType: "pro" },
			requiresOpenaiAuth: true,
		});
		transport.responseFor.set("account/rateLimits/read", {
			rateLimits: {
				limitId: "codex",
				limitName: null,
				primary: { usedPercent: 25, windowDurationMins: 300, resetsAt: 1_800_000_000 },
				secondary: { usedPercent: 40, windowDurationMins: 10_080, resetsAt: 1_800_604_800 },
			},
		});

		const usage = await server.readAccountUsage();
		expect(usage).toMatchObject({
			provider: "openai-codex",
			state: "ready",
			limits: [
				{ label: "Codex 5 Hours", usedPercent: 25, remainingPercent: 75, resetsAt: 1_800_000_000_000, status: "ok" },
				{ label: "Codex 7 Days", usedPercent: 40, remainingPercent: 60, resetsAt: 1_800_604_800_000, status: "ok" },
			],
		});
		expect(JSON.stringify(usage)).not.toContain("must-not-leak");
		expect(transport.sent.filter(message => String(message.method).startsWith("account/"))).toEqual([
			expect.objectContaining({ method: "account/read", params: { refreshToken: false } }),
			expect.objectContaining({ method: "account/rateLimits/read" }),
		]);
		await server.close();
	});

	test("reports the native Codex account state without requesting limits when signed out", async () => {
		const { server, transport } = await connectedFake();
		transport.responseFor.set("account/read", { account: null, requiresOpenaiAuth: true });
		await expect(server.readAccountUsage()).resolves.toMatchObject({
			provider: "openai-codex",
			state: "auth-required",
			limits: [],
		});
		expect(transport.sent.some(message => message.method === "account/rateLimits/read")).toBe(false);
		await server.close();
	});

	test("registers host tools and replies to dynamic calls once without admitting changed duplicate arguments", async () => {
		const { server, transport } = await connectedFake();
		let count = 0;
		server.registerRuntimeTools([{ name: "www_runtime_inspect", description: "inspect", inputSchema: { type: "object" } }], async call => { count++; return { success: true, text: JSON.stringify({ request: call.arguments }) }; });
		transport.responseFor.set("thread/start", { thread: { id: "t" } });
		transport.responseFor.set("turn/start", { turn: { id: "turn" } });
		await server.startThread({ cwd: "/tmp" }); await server.startTurn({ threadId: "t", text: "hi" });
		expect((transport.sent.find(m => m.method === "thread/start")?.params as any).dynamicTools).toEqual([{ type: "function", name: "www_runtime_inspect", description: "inspect", inputSchema: { type: "object" } }]);
		const params = { threadId: "t", turnId: "turn", callId: "call", namespace: null, tool: "www_runtime_inspect", arguments: { requestId: "r" } };
		transport.emit({ id: "rpc-1", method: "item/tool/call", params });
		transport.emit({ id: "rpc-2", method: "item/tool/call", params });
		await Bun.sleep(5);
		expect(count).toBe(1);
		expect(transport.sent.find(m => m.id === "rpc-1")).toMatchObject({ result: { success: true, contentItems: [{ type: "inputText", text: expect.any(String) }] } });
		transport.emit({ id: "rpc-conflict", method: "item/tool/call", params: { ...params, arguments: { requestId: "other" } } });
		transport.emit({ id: "rpc-foreign", method: "item/tool/call", params: { ...params, threadId: "foreign" } });
		transport.emit({ id: "rpc-unknown", method: "item/tool/call", params: { ...params, tool: "unknown" } });
		await Bun.sleep(5);
		for (const id of ["rpc-conflict", "rpc-foreign", "rpc-unknown"]) expect(transport.sent.find(m => m.id === id)).toMatchObject({ result: { success: false } });
		expect(count).toBe(1);
		await server.close();
	});
	test("uses the native MCP status protocol and projects runtime status and tool names", async () => {
		const { server, transport } = await connectedFake();
		transport.responseQueueFor.set("mcpServerStatus/list", [
			{
				data: [
				{
					name: "filesystem",
					runtimeStatus: "connected",
					tools: {
						read_file: { name: "read_file", inputSchema: {} },
						write_file: { name: "write_file", inputSchema: {} },
					},
				},
				],
				nextCursor: "next-page",
			},
			{
				data: [{
					name: "paused",
					runtimeStatus: "disabled",
					tools: {},
				}],
				nextCursor: null,
			},
		]);

		await expect(server.listMcpServers()).resolves.toEqual([
			{ name: "filesystem", enabled: true, status: "connected", tools: ["read_file", "write_file"] },
			{ name: "paused", enabled: false, status: "disabled", tools: [] },
		]);
		expect(transport.sent.filter((message) => message.method === "mcpServerStatus/list").map((message) => message.params)).toEqual([
			{ detail: "toolsAndAuthOnly", limit: 100 },
			{ detail: "toolsAndAuthOnly", limit: 100, cursor: "next-page" },
		]);
		await server.close();
	});

	test("projects MCP tool elicitations as approvals and answers with the elicitation protocol", async () => {
		const { server, transport } = await connectedFake();
		const events: unknown[] = [];
		server.subscribe(event => events.push(event));
		transport.emit({
			id: "mcp-approval-1",
			method: "mcpServer/elicitation/request",
			params: {
				threadId: "thread-native-1",
				turnId: "turn-native-1",
				serverName: "linear-woo",
				mode: "form",
				message: 'Allow the linear-woo MCP server to run tool "save_comment"?',
				requestedSchema: { type: "object", properties: {} },
				_meta: { codex_approval_kind: "mcp_tool_call", tool_title: "Save comment" },
			},
		});
		expect(events.at(-1)).toEqual(expect.objectContaining({
			type: "approval-requested",
			approval: expect.objectContaining({
				requestId: "mcp-approval-1",
				kind: "mcp-tool",
				availableDecisions: ["accept", "decline", "cancel"],
			}),
		}));

		const response = server.respondToApproval({ requestId: "mcp-approval-1", response: { decision: "accept" } });
		await Bun.sleep(0);
		expect(transport.sent.at(-1)).toEqual({
			id: "mcp-approval-1",
			result: { action: "accept", content: {}, _meta: null },
		});
		transport.emit({ method: "serverRequest/resolved", params: { requestId: "mcp-approval-1" } });
		await response;
		await server.close();
	});

	test("uses protocol-defined decisions when file-change approval params omit availableDecisions", async () => {
		const { server, transport } = await connectedFake();
		const events: unknown[] = [];
		server.subscribe(event => events.push(event));
		transport.emit({
			id: 0,
			method: "item/fileChange/requestApproval",
			params: {
				threadId: "thread-native-1",
				turnId: "turn-native-1",
				itemId: "item-native-1",
				startedAtMs: 1_788_849_280_280,
				reason: null,
				grantRoot: null,
			},
		});

		expect(events.at(-1)).toEqual(expect.objectContaining({
			type: "approval-requested",
			approval: expect.objectContaining({
				requestId: 0,
				kind: "file-change",
				availableDecisions: ["accept", "acceptForSession", "decline", "cancel"],
			}),
		}));

		const response = server.respondToApproval({ requestId: 0, response: { decision: "accept" } });
		await Bun.sleep(0);
		expect(transport.sent.at(-1)).toEqual({ id: 0, result: { decision: "accept" } });
		transport.emit({ method: "serverRequest/resolved", params: { requestId: 0 } });
		await response;
		await server.close();
	});

	test("preserves a structured v2 command approval decision and returns it unchanged", async () => {
		const { server, transport } = await connectedFake();
		const amendment = { acceptWithExecpolicyAmendment: { execpolicyAmendment: { command: ["bun", "test"] } } };
		let approval: unknown;
		server.subscribe(event => {
			if (event.type === "approval-requested") approval = event.approval;
		});
		transport.emit({
			id: "approval-policy-1",
			method: "item/commandExecution/requestApproval",
			params: {
				threadId: "thread-native-1", turnId: "turn-native-1", itemId: "item-native-1",
				availableDecisions: ["accept", amendment, "decline", "cancel"],
			},
		});
		expect(approval).toEqual(expect.objectContaining({ availableDecisions: ["accept", amendment, "decline", "cancel"] }));
		const response = server.respondToApproval({ requestId: "approval-policy-1", response: { decision: amendment } });
		await Bun.sleep(0);
		expect(transport.sent.at(-1)).toEqual({ id: "approval-policy-1", result: { decision: amendment } });
		transport.emit({ method: "serverRequest/resolved", params: { requestId: "approval-policy-1" } });
		await response;
		await server.close();
	});

	test("writes escaped MCP enablement config and reloads through supported protocol methods", async () => {
		const { server, transport } = await connectedFake();

		await server.setMcpServerEnabled('team."alpha\\beta', false);
		expect(transport.sent.slice(-2)).toEqual([
			{
				id: 2,
				method: "config/value/write",
				params: {
					keyPath: 'mcp_servers."team.\\"alpha\\\\beta".enabled',
					value: false,
					mergeStrategy: "upsert",
				},
			},
			{ id: 3, method: "config/mcpServer/reload" },
		]);

		await server.reloadMcpServers();
		expect(transport.sent.at(-1)).toEqual({ id: 4, method: "config/mcpServer/reload" });
		await server.close();
	});

	test("starts provider-owned thread compaction through the App Server protocol", async () => {
		const { server, transport } = await connectedFake();
		await server.compactThread({ threadId: "thread-native-1" });
		expect(transport.sent.at(-1)).toEqual({
			id: 2,
			method: "thread/compact/start",
			params: { threadId: "thread-native-1" },
		});
		await server.close();
	});

	test("calls an addressed MCP tool through the documented App Server boundary", async () => {
		const { server, transport } = await connectedFake();
		transport.responseFor.set("mcpServer/tool/call", { content: [{ type: "text", text: "{}" }], structuredContent: { ok: true }, isError: false });
		await expect(server.callMcpTool({ server: "linear-woo", threadId: "thread-1", tool: "list_issues", arguments: { project: "project-1" } }))
			.resolves.toEqual({ content: [{ type: "text", text: "{}" }], structuredContent: { ok: true }, isError: false });
		expect(transport.sent.at(-1)).toEqual({ id: 2, method: "mcpServer/tool/call", params: {
			server: "linear-woo", threadId: "thread-1", tool: "list_issues", arguments: { project: "project-1" },
		} });
		await server.close();
	});

	test("performs the JSONL handshake and preserves native thread, turn, item, and approval ids", async () => {
		const { server, transport } = await connectedFake();
		expect(transport.sent.slice(0, 2)).toEqual([
			{
				id: 1,
				method: "initialize",
				params: {
					clientInfo: { name: "www", title: "World Wide Woo", version: "0.0.17" },
					capabilities: { experimentalApi: true, requestAttestation: false },
				},
			},
			{ method: "initialized" },
		]);

		transport.responseFor.set("thread/start", {
			thread: { id: "thread-native-1", turns: [] },
			model: "gpt-5.6-sol",
			reasoningEffort: "low",
		});
		transport.responseFor.set("thread/resume", { thread: { id: "thread-native-1", turns: [] } });
		transport.responseFor.set("thread/read", { thread: { id: "thread-native-1", turns: [{ id: "turn-native-0" }] } });
		transport.responseFor.set("thread/list", {
			data: [{
				id: "thread-native-1",
				updatedAt: 1_788_000_000,
				cwd: "/workspace",
				preview: "opaque thread preview",
				status: { type: "idle" },
				path: "/private/native/rollout.jsonl",
			}],
			nextCursor: null,
			backwardsCursor: null,
		});
		transport.responseFor.set("turn/start", { turn: { id: "turn-native-1", items: [] } });
		transport.responseFor.set("turn/steer", { turnId: "turn-native-1" });

		const startedThread = await server.startThread({ cwd: "/workspace", model: "gpt-5.6-sol", effort: "low" });
		expect(startedThread).toMatchObject({ id: "thread-native-1", model: "gpt-5.6-sol", effort: "low" });
		expect(transport.sent.find((message) => message.method === "thread/start")?.params).toEqual({
			cwd: "/workspace",
			model: "gpt-5.6-sol",
			config: { model_reasoning_effort: "low", tools: { update_plan: { enabled: true } } },
		});
		expect((await server.resumeThread({ threadId: "thread-native-1" })).id).toBe("thread-native-1");
		expect((await server.readThread({ threadId: "thread-native-1", includeTurns: true })).value.turns).toEqual([
			{ id: "turn-native-0" },
		]);
		expect(await server.listThreads({ cwd: "/workspace", limit: 20 })).toEqual([{
			id: "thread-native-1",
			updatedAt: 1_788_000_000,
			cwd: "/workspace",
			preview: "opaque thread preview",
			status: "idle",
		}]);
		expect(transport.sent.find((message) => message.method === "thread/list")?.params).toEqual({
			cwd: "/workspace",
			limit: 20,
			sortKey: "updated_at",
			sortDirection: "desc",
		});
			expect((await server.startTurn({
			threadId: "thread-native-1",
			text: "hello",
			effort: "low",
			approvalPolicy: "never",
			sandboxPolicy: { type: "dangerFullAccess" },
			collaborationMode: {
				mode: "plan",
				settings: { model: "gpt-5.6-sol", reasoning_effort: "low", developer_instructions: null },
			},
			additionalContext: {
				woo_entry_policy: { kind: "application", value: "read-only" },
				woo_entry_snapshot: { kind: "untrusted", value: "{}" },
			},
		})).id).toBe("turn-native-1");
		expect(transport.sent.find((message) => message.method === "turn/start")?.params).toEqual({
			threadId: "thread-native-1",
			input: [{ type: "text", text: "hello" }],
			effort: "low",
			approvalPolicy: "never",
			sandboxPolicy: { type: "dangerFullAccess" },
			collaborationMode: {
				mode: "plan",
				settings: { model: "gpt-5.6-sol", reasoning_effort: "low", developer_instructions: null },
			},
			additionalContext: {
				woo_entry_policy: { kind: "application", value: "read-only" },
				woo_entry_snapshot: { kind: "untrusted", value: "{}" },
			},
		});
		expect(await server.steerTurn({
			threadId: "thread-native-1",
			expectedTurnId: "turn-native-1",
			clientUserMessageId: "message-local-2",
			text: "지금 방향을 바꿔줘",
		})).toEqual({ turnId: "turn-native-1" });
		expect(transport.sent.find((message) => message.method === "turn/steer")?.params).toEqual({
			threadId: "thread-native-1",
			expectedTurnId: "turn-native-1",
			clientUserMessageId: "message-local-2",
			input: [{ type: "text", text: "지금 방향을 바꿔줘" }],
		});

		const events: unknown[] = [];
		server.subscribe((event) => events.push(event));
		transport.emit({ method: "thread/started", params: { thread: { id: "thread-native-1" } } });
		transport.emit({ method: "turn/started", params: { threadId: "thread-native-1", turn: { id: "turn-native-1" } } });
		transport.emit({
			method: "item/completed",
			params: { threadId: "thread-native-1", turnId: "turn-native-1", item: { id: "item-native-1", type: "agentMessage" } },
		});
		transport.emit({
			method: "item/updated",
			params: {
				threadId: "thread-native-1",
				turnId: "turn-native-1",
				id: "delegation-native-1",
				type: "collabAgentToolCall",
				tool: "spawnAgent",
				receiverThreadIds: ["agent-native-1"],
			},
		});
		transport.emit({
			id: "approval-rpc-1",
			method: "item/commandExecution/requestApproval",
			params: {
				threadId: "thread-native-1",
				turnId: "turn-native-1",
				itemId: "item-native-1",
				approvalId: "callback-1",
				availableDecisions: ["accept", "decline"],
			},
		});
		expect(events).toEqual([
			expect.objectContaining({
				type: "notification",
				method: "thread/started",
				refs: { threadId: "thread-native-1" },
			}),
			expect.objectContaining({
				type: "notification",
				method: "turn/started",
				refs: { threadId: "thread-native-1", turnId: "turn-native-1" },
			}),
			expect.objectContaining({
				type: "notification",
				method: "item/completed",
				refs: { threadId: "thread-native-1", turnId: "turn-native-1", itemId: "item-native-1" },
			}),
			expect.objectContaining({
				type: "notification",
				method: "item/updated",
				refs: { threadId: "thread-native-1", turnId: "turn-native-1", itemId: "delegation-native-1" },
				params: expect.objectContaining({
					type: "collabAgentToolCall",
					receiverThreadIds: ["agent-native-1"],
				}),
			}),
			expect.objectContaining({
				type: "approval-requested",
				approval: expect.objectContaining({
					requestId: "approval-rpc-1",
					callbackId: "callback-1",
					refs: expect.objectContaining({
						threadId: "thread-native-1",
						turnId: "turn-native-1",
						itemId: "item-native-1",
						approvalRequestId: "approval-rpc-1",
						approvalCallbackId: "callback-1",
					}),
					availableDecisions: ["accept", "decline"],
					params: expect.objectContaining({ approvalId: "callback-1" }),
				}),
			}),
		]);

		const approval = server.respondToApproval({ requestId: "approval-rpc-1", response: { decision: "accept" } });
		await Bun.sleep(0);
		expect(transport.sent.at(-1)).toEqual({ id: "approval-rpc-1", result: { decision: "accept" } });
		let resolved = false;
		void approval.then(() => {
			resolved = true;
		});
		await Bun.sleep(0);
		expect(resolved).toBe(false);
		transport.emit({
			method: "serverRequest/resolved",
			params: { threadId: "thread-native-1", requestId: "approval-rpc-1" },
		});
		await approval;
		expect(resolved).toBe(true);
		await server.close();
	});

	test("marks a sent mutating request uncertain without retrying it after disconnect", async () => {
		const { server, transport } = await connectedFake();
		transport.hold.add("turn/start");
		const turn = server.startTurn({ threadId: "thread-1", text: "do it" });
		await Bun.sleep(0);
		transport.disconnect();

		await expect(turn).rejects.toBeInstanceOf(NativeOperationUncertainError);
		await expect(turn).rejects.toMatchObject({
			state: "uncertain",
			resolution: "manual-reconcile",
			method: "turn/start",
		});
		expect(transport.sent.filter((message) => message.method === "turn/start")).toHaveLength(1);
	});

	test("binds threadless plan updates only to their observed root or child turn owners", async () => {
		const { server, transport } = await connectedFake();
		const events: unknown[] = [];
		server.subscribe((event) => events.push(event));

		transport.responseFor.set("turn/start", { turn: { id: "turn-root" } });
		await server.startTurn({ threadId: "thread-root", text: "root" });
		transport.responseFor.set("turn/start", { turn: { id: "turn-child" } });
		await server.startTurn({ threadId: "thread-child", text: "child" });
		transport.responseFor.set("thread/resume", {
			thread: { id: "thread-resumed", turns: [{ id: "turn-resumed" }] },
		});
		await server.resumeThread({ threadId: "thread-resumed" });
		transport.responseFor.set("thread/read", {
			thread: { id: "thread-read", turns: [{ id: "turn-read" }] },
		});
		await server.readThread({ threadId: "thread-read", includeTurns: true });

		for (const turnId of ["turn-root", "turn-child", "turn-resumed", "turn-read", "turn-unknown"]) {
			transport.emit({ method: "turn/plan/updated", params: { turnId, plan: [] } });
		}
		transport.emit({
			method: "turn/plan/updated",
			params: { threadId: "thread-explicit", turnId: "turn-root", plan: [] },
		});

		const refsFor = (turnId: string) => (events.find((event) =>
			(event as { type?: string; method?: string; refs?: { turnId?: string } }).type === "notification" &&
			(event as { method?: string }).method === "turn/plan/updated" &&
			(event as { refs?: { turnId?: string } }).refs?.turnId === turnId,
		) as { refs: Record<string, unknown> } | undefined)?.refs;
		expect(refsFor("turn-root")).toEqual({ threadId: "thread-root", turnId: "turn-root" });
		expect(refsFor("turn-child")).toEqual({ threadId: "thread-child", turnId: "turn-child" });
		expect(refsFor("turn-resumed")).toEqual({ threadId: "thread-resumed", turnId: "turn-resumed" });
		expect(refsFor("turn-read")).toEqual({ threadId: "thread-read", turnId: "turn-read" });
		expect(refsFor("turn-unknown")).toEqual({ turnId: "turn-unknown" });
		expect(events.at(-1)).toMatchObject({
			type: "notification",
			method: "turn/plan/updated",
			refs: { threadId: "thread-explicit", turnId: "turn-root" },
		});
		await server.close();
	});

	test("includes a bounded sanitized stderr tail when the App Server process exits", async () => {
		const secret = "sk-test-secret-value";
		const transport = new StdioJsonLineTransport([
			"bun",
			"-e",
			`process.stderr.write("x".repeat(5000) + "\\ndiagnostic authorization: Bearer ${secret}\\n"); process.exit(7);`,
		]);
		const error = await new Promise<Error>((resolve) => {
			transport.onClose((failure) => resolve(failure ?? new Error("missing failure")));
		});
		expect(error.message).toContain("exited with code 7");
		expect(error.message).toContain("[redacted]");
		expect(error.message).not.toContain(secret);
		expect(Array.from(error.message).length).toBeLessThan(4_200);
	});

	test("fails a stalled turn start as uncertain instead of waiting forever", async () => {
		const transport = new FakeJsonLineTransport();
		const server = await CodexAppServer.connectTransport(transport, { requestTimeoutMs: 10 });
		transport.hold.add("turn/start");

		await expect(server.startTurn({
			threadId: "thread-1",
			text: "continue",
			cwd: "/workspace",
			model: "gpt-5.4",
			approvalPolicy: "on-request",
			sandboxPolicy: { type: "workspaceWrite", writableRoots: ["/workspace"], networkAccess: false, excludeTmpdirEnvVar: false, excludeSlashTmp: false },
		})).rejects.toBeInstanceOf(NativeOperationUncertainError);
		await server.close();
	});
});
