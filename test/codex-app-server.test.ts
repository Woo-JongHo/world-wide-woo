import { describe, expect, test } from "bun:test";
import type { JsonLineTransport } from "../src/infrastructure/codex-app-server.js";
import { CodexAppServer, NativeOperationUncertainError, StdioJsonLineTransport } from "../src/infrastructure/codex-app-server.js";

class FakeJsonLineTransport implements JsonLineTransport {
	public readonly sent: Array<Record<string, unknown>> = [];
	public responseFor = new Map<string, unknown>();
	public hold = new Set<string>();
	private readonly lineListeners = new Set<(line: string) => void>();
	private readonly closeListeners = new Set<(error?: Error) => void>();

	public async send(line: string): Promise<void> {
		const message = JSON.parse(line) as Record<string, unknown>;
		this.sent.push(message);
		if (typeof message.method === "string" && message.id !== undefined && !this.hold.has(message.method)) {
			const result = this.responseFor.get(message.method) ?? {};
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
	test("performs the JSONL handshake and preserves native thread, turn, item, and approval ids", async () => {
		const { server, transport } = await connectedFake();
		expect(transport.sent.slice(0, 2)).toEqual([
			{
				id: 1,
				method: "initialize",
				params: {
					clientInfo: { name: "www", title: "World Wide Woo", version: "0.1.9" },
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

		const startedThread = await server.startThread({ cwd: "/workspace", model: "gpt-5.6-sol", effort: "low" });
		expect(startedThread).toMatchObject({ id: "thread-native-1", model: "gpt-5.6-sol", effort: "low" });
		expect(transport.sent.find((message) => message.method === "thread/start")?.params).toEqual({
			cwd: "/workspace",
			model: "gpt-5.6-sol",
			config: { model_reasoning_effort: "low" },
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
});
