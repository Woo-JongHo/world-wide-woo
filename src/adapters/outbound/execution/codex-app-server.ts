import type { ExecutorPort } from "../../../core/ports/execution/executor-port.js";
import type { RuntimeToolDefinition, RuntimeToolHandler, RuntimeToolResult } from "../../../core/ports/execution/runtime-tool-port";
import type {
	NativeApprovalDecision,
	NativeApprovalKind,
	NativeApprovalRequest,
	NativeApprovalResponse,
	NativeApprovalResolution,
	NativeHarnessEvent,
	NativeRefs,
	NativeRequestId,
	NativeThreadRead,
	NativeThreadList,
	NativeThreadCompact,
	NativeThreadResume,
	NativeThreadSnapshot,
	NativeThreadStart,
	NativeThreadStatus,
	NativeThreadSummary,
	NativeTurnInterrupt,
	NativeTurnSnapshot,
	NativeTurnStart,
	NativeTurnSteer,
	NativeTurnSteerResult,
	NativeUncertainOperation,
} from "../../../core/domain/execution/native-session.js";
import { sanitizeTerminalText } from "../../../core/domain/execution/terminal.js";
import { PRODUCT_VERSION } from "../../../product-version.js";
import { CODEX_EFFORTS, type Effort, type NativeModelOption } from "../../../core/domain/execution/model-settings";
import type { UsageLimitSnapshot, UsageSnapshot } from "../../../core/ports/index.js";

const STDERR_TAIL_CODE_POINTS = 4_096;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

function codexThreadConfig(effort: string | undefined): JsonRecord {
	return compact({
		model_reasoning_effort: effort,
		tools: { update_plan: { enabled: true } },
	});
}

interface JsonRecord {
	[key: string]: unknown;
}

function codexRateWindow(value: unknown, label: string): UsageLimitSnapshot | undefined {
	if (!isRecord(value) || typeof value.usedPercent !== "number" || !Number.isFinite(value.usedPercent)) return undefined;
	const usedPercent = Math.max(0, Math.min(100, value.usedPercent));
	const duration = typeof value.windowDurationMins === "number" && Number.isFinite(value.windowDurationMins)
		? value.windowDurationMins
		: undefined;
	const window = duration === 300 ? "5 Hours" : duration === 10_080 ? "7 Days" : duration ? `${duration} Minutes` : label;
	const remainingPercent = Math.max(0, 100 - usedPercent);
	return {
		label: `${label} ${window}`,
		usedPercent,
		remainingPercent,
		...(typeof value.resetsAt === "number" && Number.isFinite(value.resetsAt) ? { resetsAt: value.resetsAt * 1_000 } : {}),
		status: remainingPercent <= 0 ? "exhausted" : remainingPercent < 20 ? "warning" : "ok",
	};
}

function codexRateLimits(value: unknown): UsageLimitSnapshot[] {
	if (!isRecord(value)) throw new Error("Codex App Server returned an invalid account/rateLimits/read result");
	const byId = isRecord(value.rateLimitsByLimitId) ? value.rateLimitsByLimitId : undefined;
	const selected = byId && isRecord(byId.codex)
		? byId.codex
		: isRecord(value.rateLimits)
			? value.rateLimits
			: byId
				? Object.values(byId).find(isRecord)
				: undefined;
	if (!selected) throw new Error("Codex App Server omitted account rate limits");
	const name = typeof selected.limitName === "string" && selected.limitName.trim()
		? selected.limitName.trim()
		: "Codex";
	return [
		codexRateWindow(selected.primary, name),
		codexRateWindow(selected.secondary, name),
	].filter((limit): limit is UsageLimitSnapshot => limit !== undefined);
}

export interface JsonLineTransport {
	send(line: string): Promise<void>;
	onLine(listener: (line: string) => void): () => void;
	onClose(listener: (error?: Error) => void): () => void;
	close(): Promise<void>;
}

export interface CodexAppServerOptions {
	command?: readonly string[];
	clientName?: string;
	clientTitle?: string;
	clientVersion?: string;
	requestTimeoutMs?: number;
}

export interface NativeMcpServer {
	readonly name: string;
	readonly enabled: boolean;
	readonly status: string;
	readonly tools: readonly string[];
}

/** Read-only result returned by an explicitly addressed App Server MCP tool. */
export interface NativeMcpToolResult {
	readonly content: readonly unknown[];
	readonly structuredContent?: unknown;
	readonly isError?: boolean | null;
}

interface PendingRequest {
	method: string;
	uncertainOnDisconnect: boolean;
	dispatched: boolean;
	resolve: (result: unknown) => void;
	reject: (error: Error) => void;
	timeout: ReturnType<typeof setTimeout>;
}

interface PendingApprovalResponse {
	dispatched: boolean;
	resolve: () => void;
	reject: (error: Error) => void;
}

export class NativeOperationUncertainError extends Error implements NativeUncertainOperation {
	public readonly state = "uncertain" as const;
	public readonly resolution = "manual-reconcile" as const;

	public constructor(public readonly method: string, public readonly requestId: NativeRequestId) {
		super(`${method} (${String(requestId)}) may have been accepted before disconnect; reconcile native state manually`);
		this.name = "NativeOperationUncertainError";
	}
}

export class StdioJsonLineTransport implements JsonLineTransport {
	private readonly lineListeners = new Set<(line: string) => void>();
	private readonly closeListeners = new Set<(error?: Error) => void>();
	private readonly child: Bun.PipedSubprocess;
	private closed = false;
	private stderrTail = "";

	public constructor(command: readonly string[] = ["codex", "app-server", "--stdio"]) {
		if (command.length === 0) throw new Error("App Server command cannot be empty");
		this.child = Bun.spawn([...command], { stdin: "pipe", stdout: "pipe", stderr: "pipe" });
		void this.consume(this.child.stdout, (line) => this.emitLine(line));
		void this.captureStderr(this.child.stderr);
		void this.child.exited.then((exitCode) => {
			const diagnostics = this.stderrTail.trim();
			const error = exitCode === 0
				? undefined
				: new Error(`Codex App Server exited with code ${exitCode}${diagnostics ? `: ${diagnostics}` : ""}`);
			this.emitClose(error);
		});
	}

	public async send(line: string): Promise<void> {
		if (this.closed) throw new Error("Codex App Server transport is closed");
		this.child.stdin.write(`${line}\n`);
		await this.child.stdin.flush();
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
		if (this.closed) return;
		this.closed = true;
		this.child.stdin.end();
		if (this.child.exitCode === null) this.child.kill();
		await this.child.exited;
	}

	private async consume(stream: ReadableStream<Uint8Array>, onLine: (line: string) => void): Promise<void> {
		const reader = stream.getReader();
		const decoder = new TextDecoder();
		let buffer = "";
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });
				let newline = buffer.indexOf("\n");
				while (newline >= 0) {
					const line = buffer.slice(0, newline).trimEnd();
					buffer = buffer.slice(newline + 1);
					if (line) onLine(line);
					newline = buffer.indexOf("\n");
				}
			}
		} catch (error) {
			this.emitClose(error as Error);
		}
	}

	private async captureStderr(stream: ReadableStream<Uint8Array>): Promise<void> {
		const decoder = new TextDecoder();
		try {
			for await (const chunk of stream) {
				this.stderrTail = sanitizeTerminalText(
					`${this.stderrTail}${decoder.decode(chunk, { stream: true })}`,
					STDERR_TAIL_CODE_POINTS,
				);
			}
			this.stderrTail = sanitizeTerminalText(`${this.stderrTail}${decoder.decode()}`, STDERR_TAIL_CODE_POINTS);
		} catch (error) {
			this.emitClose(error as Error);
		}
	}

	private emitLine(line: string): void {
		for (const listener of this.lineListeners) listener(line);
	}

	private emitClose(error?: Error): void {
		if (this.closed) return;
		this.closed = true;
		for (const listener of this.closeListeners) listener(error);
	}
}

export class CodexAppServer implements ExecutorPort {
	private runtimeTools: readonly RuntimeToolDefinition[] = [];
	private runtimeToolHandler: RuntimeToolHandler | null = null;
	private readonly runtimeCalls = new Map<string, { signature: string; response: Promise<RuntimeToolResult> }>();
	private readonly runtimeThreads = new Set<string>();
	private readonly listeners = new Set<(event: NativeHarnessEvent) => void>();
	private readonly pending = new Map<NativeRequestId, PendingRequest>();
	private readonly pendingApprovalResponses = new Map<NativeRequestId, PendingApprovalResponse>();
	private readonly approvals = new Map<NativeRequestId, NativeApprovalRequest>();
	/**
	 * Some notifications (notably turn/plan/updated) carry only a turn id.  Only
	 * bind those notifications when this adapter has observed the turn's owner.
	 */
	private readonly threadIdByTurnId = new Map<string, string>();
	private requestSequence = 0;
	private closing = false;
	private disconnected = false;

	private constructor(
		private readonly transport: JsonLineTransport,
		private readonly requestTimeoutMs: number,
	) {
		transport.onLine((line) => this.receive(line));
		transport.onClose((error) => this.disconnect(error));
	}

	public static async connect(options: CodexAppServerOptions = {}): Promise<CodexAppServer> {
		const transport = new StdioJsonLineTransport(options.command);
		return CodexAppServer.connectTransport(transport, options);
	}

	public static async connectTransport(
		transport: JsonLineTransport,
		options: Omit<CodexAppServerOptions, "command"> = {},
	): Promise<CodexAppServer> {
		const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
		if (!Number.isFinite(requestTimeoutMs) || requestTimeoutMs <= 0) throw new Error("Codex App Server request timeout must be positive");
		const server = new CodexAppServer(transport, requestTimeoutMs);
		await server.request("initialize", {
			clientInfo: {
				name: options.clientName ?? "www",
				title: options.clientTitle ?? "World Wide Woo",
				version: options.clientVersion ?? PRODUCT_VERSION,
			},
			capabilities: { experimentalApi: true, requestAttestation: false },
		}, false);
		await server.notify("initialized");
		return server;
	}

	/** Read the complete visible catalog; never publish a partially read page set. */
	public async listModels(): Promise<readonly NativeModelOption[]> {
		const models = new Map<string, NativeModelOption>();
		const deadline = Date.now() + Math.min(this.requestTimeoutMs, 5_000);
		const cursors = new Set<string>();
		let cursor: string | undefined;
		do {
			const remaining = deadline - Date.now();
			if (remaining <= 0) throw new Error("Native 모델 목록 조회 시간 초과");
			const result = await this.request("model/list", compact({ cursor, limit: 100, includeHidden: false }), false, remaining) as { data?: unknown; nextCursor?: unknown };
			if (!result || !Array.isArray(result.data)) throw new Error("Native 모델 목록 응답 형식 오류");
			for (const value of result.data) {
				if (!value || typeof value !== "object") throw new Error("Native 모델 항목 형식 오류");
				const row = value as Record<string, unknown>;
				if (row.hidden === true) continue;
				if (typeof row.model !== "string" || !/^[\w./:-]+$/u.test(row.model) || !Array.isArray(row.supportedReasoningEfforts)) throw new Error("Native 모델 capability 형식 오류");
				const efforts = [...new Set(row.supportedReasoningEfforts.map((option: { reasoningEffort?: unknown }) => option?.reasoningEffort).filter((effort): effort is Effort => CODEX_EFFORTS.includes(effort as Effort)))];
				if (!efforts.length) throw new Error(`WWW가 지원하지 않는 Native 추론 계약: ${row.model}`);
				const defaultEffort = efforts.find(effort => effort === row.defaultReasoningEffort) ?? efforts[0]!;
				models.set(row.model, { model: row.model, displayName: typeof row.displayName === "string" ? row.displayName : row.model, efforts, defaultEffort });
			}
			if (result.nextCursor != null && typeof result.nextCursor !== "string") throw new Error("Native 모델 cursor 형식 오류");
			cursor = result.nextCursor || undefined;
			if (cursor && (cursors.has(cursor) || cursors.size >= 100)) throw new Error("Native 모델 목록 pagination 오류");
			if (cursor) cursors.add(cursor);
		} while (cursor);
		if (!models.size) throw new Error("Native가 사용 가능한 모델을 반환하지 않았습니다.");
		return [...models.values()];
	}

	/** Uses the same native ChatGPT account as the running Codex session. */
	public async readAccountUsage(): Promise<UsageSnapshot> {
		const fetchedAt = Date.now();
		const result = await this.request("account/read", { refreshToken: false }, false);
		if (!isRecord(result) || !("account" in result)) throw new Error("Codex App Server returned an invalid account/read result");
		if (result.account === null) {
			return {
				provider: "openai-codex",
				state: result.requiresOpenaiAuth === false ? "unsupported" : "auth-required",
				fetchedAt,
				limits: [],
			};
		}
		if (!isRecord(result.account) || typeof result.account.type !== "string") throw new Error("Codex App Server returned an invalid account record");
		if (result.account.type === "apiKey" || result.account.type === "amazonBedrock") {
			return { provider: "openai-codex", state: "unsupported", fetchedAt, limits: [] };
		}
		return {
			provider: "openai-codex",
			state: "ready",
			fetchedAt,
			limits: codexRateLimits(await this.request("account/rateLimits/read", undefined, false)),
		};
	}

	public async startThread(input: NativeThreadStart): Promise<NativeThreadSnapshot> {
		const result = await this.request("thread/start", compact({
			cwd: input.cwd,
			model: input.model,
			config: codexThreadConfig(input.effort),
			approvalPolicy: input.approvalPolicy,
			sandbox: input.sandbox,
			ephemeral: input.ephemeral,
			dynamicTools: this.runtimeTools.length ? this.runtimeTools.map(tool => ({ type: "function", ...tool })) : undefined,
		}), true);
		const snapshot = threadSnapshot(result, "thread/start");
		this.registerThreadTurns(snapshot);
		if (this.runtimeTools.length) this.runtimeThreads.add(snapshot.id);
		return snapshot;
	}

	public registerRuntimeTools(definitions: readonly RuntimeToolDefinition[], handler: RuntimeToolHandler): () => void {
		if (this.runtimeToolHandler || this.runtimeThreads.size) throw new Error("Runtime tools must be registered once before thread creation");
		if (definitions.length === 0 || new Set(definitions.map(d => d.name)).size !== definitions.length || definitions.some(d => !/^[a-zA-Z0-9_-]{1,64}$/u.test(d.name))) throw new Error("Invalid Runtime tool definitions");
		this.runtimeTools = structuredClone(definitions);
		this.runtimeToolHandler = handler;
		return () => { this.runtimeToolHandler = null; };
	}

	private async handleRuntimeTool(id: NativeRequestId, params: JsonRecord): Promise<void> {
		const failure = (reason: string): RuntimeToolResult => ({ success: false, text: JSON.stringify({ state: "rejected", reason }) });
		let result: RuntimeToolResult;
		const { threadId, turnId, callId, tool } = params;
		if (typeof threadId !== "string" || typeof turnId !== "string" || typeof callId !== "string" || !callId || typeof tool !== "string" || params.namespace != null || !this.runtimeToolHandler || !this.runtimeThreads.has(threadId) || !this.runtimeTools.some(d => d.name === tool)) {
			result = failure("RUNTIME_TOOL_UNAVAILABLE");
		} else {
			const owner = this.threadIdByTurnId.get(turnId);
			if (owner !== threadId) result = failure("RUNTIME_TURN_UNBOUND");
			else {
				const key = JSON.stringify([threadId, turnId, callId]), signature = JSON.stringify([tool, params.arguments]);
				const previous = this.runtimeCalls.get(key);
				if (previous && previous.signature !== signature) result = failure("RUNTIME_CALL_ID_CONFLICT");
				else if (!previous && this.runtimeCalls.size >= 2048) result = failure("RUNTIME_CALL_CAPACITY");
				else {
					const response = previous?.response ?? Promise.resolve().then(() => this.runtimeToolHandler!({ threadId, turnId, callId, tool, arguments: params.arguments })).catch(() => failure("RUNTIME_HANDLER_FAILED"));
					if (!previous) this.runtimeCalls.set(key, { signature, response });
					result = await response;
				}
			}
		}
		if (!this.closing && !this.disconnected) await this.transport.send(JSON.stringify({ id, result: { success: result.success, contentItems: [{ type: "inputText", text: result.text }] } }));
	}

	public async resumeThread(input: NativeThreadResume): Promise<NativeThreadSnapshot> {
		const { effort, ...resume } = input;
		const result = await this.request("thread/resume", compact({
			...resume,
			config: codexThreadConfig(effort),
		}), true);
		const snapshot = threadSnapshot(result, "thread/resume");
		this.registerThreadTurns(snapshot);
		// Definitions are restored by the host for previously brokered threads.
		// Workbench keeps legacy requests v1; this is not an isolation attestation.
		if (this.runtimeToolHandler) this.runtimeThreads.add(snapshot.id);
		return snapshot;
	}

	public async readThread(input: NativeThreadRead): Promise<NativeThreadSnapshot> {
		const result = await this.request("thread/read", compact({ ...input }), false);
		const snapshot = threadSnapshot(result, "thread/read");
		this.registerThreadTurns(snapshot);
		return snapshot;
	}

	public async listThreads(input: NativeThreadList): Promise<readonly NativeThreadSummary[]> {
		if (!input.cwd) throw new Error("Native thread list requires a cwd");
		if (input.limit !== undefined && (!Number.isSafeInteger(input.limit) || input.limit < 1)) {
			throw new Error("Native thread list limit must be a positive integer");
		}
		const result = await this.request("thread/list", compact({
			cwd: input.cwd,
			limit: input.limit,
			sortKey: "updated_at",
			sortDirection: "desc",
		}), false);
		if (!isRecord(result) || !Array.isArray(result.data)) {
			throw new Error("Codex App Server returned an invalid thread/list result");
		}
		return result.data.map((thread, index) => threadSummary(thread, index));
	}

	/** The App Server owns summary generation and replacement of its thread context. */
	public async compactThread(input: NativeThreadCompact): Promise<void> {
		if (!input.threadId.trim()) throw new Error("Native thread compaction requires a thread id");
		await this.request("thread/compact/start", { threadId: input.threadId }, true);
	}

	public async listMcpServers(): Promise<readonly NativeMcpServer[]> {
		const servers: NativeMcpServer[] = [];
		const visitedCursors = new Set<string>();
		let cursor: string | undefined;
		do {
			const result = await this.request("mcpServerStatus/list", compact({
				detail: "toolsAndAuthOnly",
				limit: 100,
				cursor,
			}), false);
			if (!isRecord(result) || !Array.isArray(result.data) ||
				(result.nextCursor !== undefined && result.nextCursor !== null && typeof result.nextCursor !== "string")) {
				throw new Error("Codex App Server returned an invalid mcpServerStatus/list result");
			}
			servers.push(...result.data.map((server, index) => mcpServer(server, servers.length + index)));
			cursor = typeof result.nextCursor === "string" && result.nextCursor.length > 0
				? result.nextCursor
				: undefined;
			if (cursor && visitedCursors.has(cursor)) {
				throw new Error("Codex App Server returned a repeated mcpServerStatus/list cursor");
			}
			if (cursor) visitedCursors.add(cursor);
		} while (cursor);
		return servers;
	}

	public async setMcpServerEnabled(name: string, enabled: boolean): Promise<void> {
		if (!name) throw new Error("MCP server name is required");
		await this.request("config/value/write", {
			keyPath: `mcp_servers."${escapeConfigKeySegment(name)}".enabled`,
			value: enabled,
			mergeStrategy: "upsert",
		}, true);
		await this.request("config/mcpServer/reload", undefined, true);
	}

	public async reloadMcpServers(): Promise<void> {
		await this.request("config/mcpServer/reload", undefined, true);
	}

	/**
	 * Calls one configured MCP tool through the App Server's documented boundary.
	 * The caller supplies the already-owned Native thread so tool authorization and
	 * lifecycle remain attributable to that session.
	 */
	public async callMcpTool(input: {
		server: string;
		threadId: string;
		tool: string;
		arguments?: unknown;
	}): Promise<NativeMcpToolResult> {
		if (!input.server.trim() || !input.threadId.trim() || !input.tool.trim()) throw new Error("MCP tool call requires server, thread, and tool");
		const result = await this.request("mcpServer/tool/call", compact({
			server: input.server,
			threadId: input.threadId,
			tool: input.tool,
			arguments: input.arguments,
		}), false);
		if (!isRecord(result) || !Array.isArray(result.content)) throw new Error("Codex App Server returned an invalid MCP tool result");
		return {
			content: result.content,
			...("structuredContent" in result ? { structuredContent: result.structuredContent } : {}),
			...(typeof result.isError === "boolean" || result.isError === null ? { isError: result.isError } : {}),
		};
	}

	public async startTurn(input: NativeTurnStart): Promise<NativeTurnSnapshot> {
		const result = await this.request("turn/start", compact({
			threadId: input.threadId,
			input: [{ type: "text", text: input.text }],
			cwd: input.cwd,
			model: input.model,
			effort: input.effort,
			approvalPolicy: input.approvalPolicy,
			sandboxPolicy: input.sandboxPolicy,
			collaborationMode: input.collaborationMode,
			additionalContext: input.additionalContext,
		}), true);
		const snapshot = turnSnapshot(result, input.threadId);
		this.threadIdByTurnId.set(snapshot.id, input.threadId);
		return snapshot;
	}

	public async steerTurn(input: NativeTurnSteer): Promise<NativeTurnSteerResult> {
		const result = await this.request("turn/steer", {
			threadId: input.threadId,
			expectedTurnId: input.expectedTurnId,
			clientUserMessageId: input.clientUserMessageId,
			input: [{ type: "text", text: input.text }],
		}, true);
		const turnId = result && typeof result === "object" && !Array.isArray(result)
			? (result as Readonly<Record<string, unknown>>).turnId
			: undefined;
		if (typeof turnId !== "string" || !turnId.trim()) {
			throw new Error("turn/steer response omitted turnId");
		}
		if (turnId !== input.expectedTurnId) {
			throw new Error(`turn/steer targeted ${turnId}, expected ${input.expectedTurnId}`);
		}
		return { turnId };
	}

	public async interruptTurn(input: NativeTurnInterrupt): Promise<void> {
		await this.request("turn/interrupt", { ...input }, true);
	}

	public respondToApproval(input: NativeApprovalResolution): Promise<void> {
		const requestId = approvalResolutionRequestId(input);
		const approval = this.approvals.get(requestId);
		if (!approval) {
			return Promise.reject(new Error(`Unknown native approval: ${String(requestId)}`));
		}
		if (this.pendingApprovalResponses.has(requestId)) {
			return Promise.reject(new Error(`Native approval response already pending: ${String(requestId)}`));
		}
		return new Promise<void>((resolve, reject) => {
			const pending: PendingApprovalResponse = { dispatched: false, resolve, reject };
			this.pendingApprovalResponses.set(requestId, pending);
			void this.transport.send(JSON.stringify({ id: requestId, result: nativeApprovalResponse(approval, input.response) })).then(
				() => {
					pending.dispatched = true;
				},
				(error) => {
					this.pendingApprovalResponses.delete(requestId);
					reject(error as Error);
				},
			);
		});
	}

	public subscribe(listener: (event: NativeHarnessEvent) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	public async close(): Promise<void> {
		if (this.closing) return;
		this.closing = true;
		await this.transport.close();
		this.disconnect();
	}

	private request(method: string, params: JsonRecord | undefined, uncertainOnDisconnect: boolean, timeoutMs = this.requestTimeoutMs): Promise<unknown> {
		if (this.disconnected) return Promise.reject(new Error("Codex App Server is disconnected"));
		const id = ++this.requestSequence;
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				const pending = this.pending.get(id);
				if (!pending) return;
				this.pending.delete(id);
				pending.reject(pending.dispatched && pending.uncertainOnDisconnect
					? new NativeOperationUncertainError(method, id)
					: new Error(`Codex App Server ${method} timed out after ${timeoutMs}ms`));
			}, timeoutMs);
			const pending: PendingRequest = { method, uncertainOnDisconnect, dispatched: false, resolve, reject, timeout };
			this.pending.set(id, pending);
			const request = params === undefined ? { id, method } : { id, method, params };
			void this.transport.send(JSON.stringify(request)).then(
				() => {
					pending.dispatched = true;
				},
				(error) => {
					this.pending.delete(id);
					clearTimeout(timeout);
					reject(error as Error);
				},
			);
		});
	}

	private notify(method: string): Promise<void> {
		if (this.disconnected) return Promise.reject(new Error("Codex App Server is disconnected"));
		return this.transport.send(JSON.stringify({ method }));
	}

	private receive(line: string): void {
		let message: unknown;
		try {
			message = JSON.parse(line);
		} catch {
			this.disconnect(new Error("Codex App Server emitted invalid JSONL"));
			return;
		}
		if (!isRecord(message)) return;
		if (isRequestId(message.id) && typeof message.method !== "string") {
			this.receiveResponse(message.id, message);
			return;
		}
		if (typeof message.method !== "string") return;
		const params = isRecord(message.params) ? message.params : {};
		if (isRequestId(message.id) && message.method === "item/tool/call") {
			void this.handleRuntimeTool(message.id, params).catch(error => this.disconnect(error as Error));
			return;
		}
		const kind = isRequestId(message.id) ? approvalKind(message.method) : undefined;
		if (isRequestId(message.id) && kind) {
			this.receiveApprovalRequest(message.id, kind, params);
			return;
		}
		if (message.method === "serverRequest/resolved" && isRequestId(params.requestId)) {
			this.receiveApprovalResolution(params.requestId, params);
			return;
		}
		this.emit({ type: "notification", method: message.method, refs: this.refsFrom(params), params });
	}

	private receiveApprovalRequest(id: NativeRequestId, kind: NativeApprovalKind, params: JsonRecord): void {
		const callbackId = kind === "command" && (typeof params.approvalId === "string" || params.approvalId === null)
			? params.approvalId
			: null;
		const approval: NativeApprovalRequest = {
			requestId: id,
			id,
			callbackId,
			kind,
			refs: this.refsFrom(params, id, callbackId),
			availableDecisions: approvalDecisions(kind, params.availableDecisions),
			params,
		};
		this.approvals.set(id, approval);
		this.emit({ type: "approval-requested", approval });
	}

	private receiveApprovalResolution(requestId: NativeRequestId, params: JsonRecord): void {
		this.approvals.delete(requestId);
		const pending = this.pendingApprovalResponses.get(requestId);
		if (pending) {
			this.pendingApprovalResponses.delete(requestId);
			pending.resolve();
		}
		this.emit({ type: "approval-resolved", requestId, approvalId: requestId, refs: this.refsFrom(params, requestId) });
	}

	private receiveResponse(id: NativeRequestId, message: JsonRecord): void {
		const pending = this.pending.get(id);
		if (!pending) return;
		this.pending.delete(id);
		clearTimeout(pending.timeout);
		if (message.error !== undefined) {
			pending.reject(new Error(`Codex App Server ${pending.method} failed: ${errorText(message.error)}`));
			return;
		}
		pending.resolve(message.result);
	}

	private disconnect(error = new Error("Codex App Server disconnected")): void {
		if (this.disconnected) return;
		this.disconnected = true;
		for (const [id, pending] of this.pending) {
			clearTimeout(pending.timeout);
			const failure = !this.closing && pending.dispatched && pending.uncertainOnDisconnect
				? new NativeOperationUncertainError(pending.method, id)
				: error;
			pending.reject(failure);
		}
		this.pending.clear();
		for (const [id, pending] of this.pendingApprovalResponses) {
			const failure = !this.closing && pending.dispatched
				? new NativeOperationUncertainError("approval/response", id)
				: error;
			pending.reject(failure);
		}
		this.pendingApprovalResponses.clear();
	}

	private emit(event: NativeHarnessEvent): void {
		for (const listener of this.listeners) listener(event);
	}

	private registerThreadTurns(snapshot: NativeThreadSnapshot): void {
		const turns = snapshot.value.turns;
		if (!Array.isArray(turns)) return;
		for (const turn of turns) {
			if (!isRecord(turn) || typeof turn.id !== "string") continue;
			this.threadIdByTurnId.set(turn.id, snapshot.id);
		}
	}

	private refsFrom(
		params: JsonRecord,
		approvalRequestId?: NativeRequestId,
		approvalCallbackId?: string | null,
	): NativeRefs {
		const refs = refsFrom(params, approvalRequestId, approvalCallbackId);
		if (refs.threadId !== undefined) {
			if (refs.turnId !== undefined) this.threadIdByTurnId.set(refs.turnId, refs.threadId);
			return refs;
		}
		if (refs.turnId === undefined) return refs;
		const threadId = this.threadIdByTurnId.get(refs.turnId);
		return threadId === undefined ? refs : { ...refs, threadId };
	}
}

function threadSnapshot(result: unknown, method: string): NativeThreadSnapshot {
	if (!isRecord(result) || !isRecord(result.thread) || typeof result.thread.id !== "string") {
		throw new Error(`Codex App Server returned an invalid ${method} result`);
	}
	return {
		id: result.thread.id,
		value: result.thread,
		...(typeof result.model === "string" ? { model: result.model } : {}),
		...(typeof result.reasoningEffort === "string" || result.reasoningEffort === null
			? { effort: result.reasoningEffort as string | null }
			: {}),
	};
}

function turnSnapshot(result: unknown, threadId: string): NativeTurnSnapshot {
	if (!isRecord(result) || !isRecord(result.turn) || typeof result.turn.id !== "string") {
		throw new Error("Codex App Server returned an invalid turn/start result");
	}
	return { id: result.turn.id, threadId, value: result.turn };
}

function threadSummary(value: unknown, index: number): NativeThreadSummary {
	if (!isRecord(value) ||
		typeof value.id !== "string" ||
		typeof value.updatedAt !== "number" ||
		typeof value.cwd !== "string" ||
		typeof value.preview !== "string" ||
		!isRecord(value.status) ||
		!isNativeThreadStatus(value.status.type)) {
		throw new Error(`Codex App Server returned an invalid thread/list item at index ${index}`);
	}
	return {
		id: value.id,
		updatedAt: value.updatedAt,
		cwd: value.cwd,
		preview: sanitizeTerminalText(value.preview, 240),
		status: value.status.type,
	};
}

function mcpServer(value: unknown, index: number): NativeMcpServer {
	if (!isRecord(value) || typeof value.name !== "string" || !isRecord(value.tools)) {
		throw new Error(`Codex App Server returned an invalid mcpServerStatus/list item at index ${index}`);
	}
	const status = typeof value.runtimeStatus === "string" ? value.runtimeStatus : "unknown";
	return { name: value.name, enabled: status !== "disabled", status, tools: Object.keys(value.tools) };
}

function escapeConfigKeySegment(value: string): string {
	return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function isNativeThreadStatus(value: unknown): value is NativeThreadStatus {
	return value === "notLoaded" || value === "idle" || value === "systemError" || value === "active";
}

function refsFrom(params: JsonRecord, approvalRequestId?: NativeRequestId, approvalCallbackId?: string | null): NativeRefs {
	const thread = isRecord(params.thread) ? params.thread : undefined;
	const turn = isRecord(params.turn) ? params.turn : undefined;
	// Collaboration notifications may carry their public item directly instead
	// of under `item`; retain that native identity for later projection.
	const item = isRecord(params.item)
		? params.item
		: params.type === "collabAgentToolCall" || params.type === "subAgentActivity"
		? params
		: undefined;
	return compact({
		threadId: typeof params.threadId === "string" ? params.threadId : typeof thread?.id === "string" ? thread.id : undefined,
		turnId: typeof params.turnId === "string" ? params.turnId : typeof turn?.id === "string" ? turn.id : undefined,
		itemId: typeof params.itemId === "string" ? params.itemId : typeof item?.id === "string" ? item.id : undefined,
		approvalRequestId,
		approvalCallbackId,
		approvalId: approvalRequestId,
	});
}

function approvalKind(method: string): NativeApprovalKind | undefined {
	if (method === "item/commandExecution/requestApproval") return "command";
	if (method === "item/fileChange/requestApproval") return "file-change";
	if (method === "item/permissions/requestApproval") return "permissions";
	if (method === "mcpServer/elicitation/request") return "mcp-tool";
	return undefined;
}

function nativeApprovalResponse(request: NativeApprovalRequest, response: NativeApprovalResponse): unknown {
	if (request.kind !== "mcp-tool" || !("decision" in response)) return response;
	const action = response.decision === "acceptForSession" ? "accept" : response.decision;
	return { action, content: action === "accept" ? {} : null, _meta: null };
}

function approvalResolutionRequestId(input: NativeApprovalResolution): NativeRequestId {
	if (input.requestId !== undefined) return input.requestId;
	if (input.approvalId !== undefined) return input.approvalId;
	throw new Error("Native approval response requires a request id");
}

function nativeApprovalDecisions(value: unknown): NativeApprovalDecision[] {
	if (!Array.isArray(value)) return [];
	return value.filter((decision): decision is NativeApprovalDecision =>
		decision === "accept" ||
		decision === "acceptForSession" ||
		decision === "decline" ||
		decision === "cancel" ||
		isRecord(decision));
}

function approvalDecisions(kind: NativeApprovalKind, advertised: unknown): NativeApprovalDecision[] {
	if (kind === "mcp-tool") return ["accept", "decline", "cancel"];
	const decisions = nativeApprovalDecisions(advertised);
	if (decisions.length > 0) return decisions;
	// Codex App Server v2 command and file-change approval params do not carry
	// availableDecisions. Their response contracts define this fixed decision set.
	if (kind === "command" || kind === "file-change") {
		return ["accept", "acceptForSession", "decline", "cancel"];
	}
	return [];
}

function errorText(error: unknown): string {
	if (isRecord(error) && typeof error.message === "string") return error.message;
	return typeof error === "string" ? error : JSON.stringify(error);
}

function compact<T extends JsonRecord>(value: T): T {
	return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

function isRequestId(value: unknown): value is NativeRequestId {
	return typeof value === "string" || typeof value === "number";
}

function isRecord(value: unknown): value is JsonRecord {
	return !!value && typeof value === "object" && !Array.isArray(value);
}
