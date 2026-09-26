import type { ExecutorPort }              from "@/core/ports/execution/executor-port.js";
import type {
	RuntimeToolDefinition,
	RuntimeToolHandler,
	RuntimeToolResult,
} from "@/core/ports/execution/runtime-tool-port";
import type {
	NativeApprovalKind,
	NativeApprovalRequest,
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
	NativeThreadSummary,
	NativeTurnInterrupt,
	NativeTurnSnapshot,
	NativeTurnStart,
	NativeTurnSteer,
	NativeTurnSteerResult,
	NativeUncertainOperation,
} from "@/core/domain/execution/native-session.js";
import { PRODUCT_VERSION }                from "@/product-version.js";
import { CODEX_EFFORTS }                  from "@/core/domain/execution/model-settings";
import type { Effort, NativeModelOption } from "@/core/domain/execution/model-settings";
import type { UsageSnapshot }             from "@/core/ports/observability/usage-monitor-port";
import {
	approvalDecisions,
	approvalKind,
	approvalResolutionRequestId,
	codexRateLimits,
	codexThreadConfig,
	compact,
	errorText,
	escapeConfigKeySegment,
	isRecord,
	isRequestId,
	mcpServer,
	nativeApprovalResponse,
	refsFrom,
	threadSnapshot,
	threadSummary,
	turnSnapshot,
} from "@/adapters/outbound/execution/codex-app-server-protocol.js";
import type {
	JsonRecord,
	NativeMcpServer,
	NativeMcpToolResult,
} from "@/adapters/outbound/execution/codex-app-server-protocol.js";
import { StdioJsonLineTransport }         from "@/adapters/outbound/execution/codex-app-server-transport.js";
import type { JsonLineTransport }         from "@/adapters/outbound/execution/codex-app-server-transport.js";

export { StdioJsonLineTransport } from "@/adapters/outbound/execution/codex-app-server-transport.js";
export type { JsonLineTransport } from "@/adapters/outbound/execution/codex-app-server-transport.js";
export type { NativeMcpServer, NativeMcpToolResult } from "@/adapters/outbound/execution/codex-app-server-protocol.js";

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

export interface CodexAppServerOptions {
	command?          : readonly string[] ;
	clientName?       : string            ;
	clientTitle?      : string            ;
	clientVersion?    : string            ;
	requestTimeoutMs? : number            ;
}

interface PendingRequest {
	method                : string                        ;
	uncertainOnDisconnect : boolean                       ;
	dispatched            : boolean                       ;
	resolve               : (result: unknown) => void     ;
	reject                : (error: Error) => void        ;
	timeout               : ReturnType<typeof setTimeout> ;
}

interface PendingApprovalResponse {
	dispatched : boolean                ;
	resolve    : () => void             ;
	reject     : (error: Error) => void ;
}

export class NativeOperationUncertainError extends Error implements NativeUncertainOperation {
	public readonly state      : "uncertain"       = "uncertain";
	public readonly resolution : "manual-reconcile" = "manual-reconcile";

	public constructor(public readonly method: string, public readonly requestId: NativeRequestId) {
		super(`${method} (${String(requestId)}) may have been accepted before disconnect; reconcile native state manually`);
		this.name = "NativeOperationUncertainError";
	}
}

export class CodexAppServer implements ExecutorPort {
	private runtimeTools       : readonly RuntimeToolDefinition[] = []                                                                             ;
	private runtimeToolHandler : RuntimeToolHandler | null        = null                                                                           ;
	private readonly runtimeCalls                                 = new Map<string, { signature: string; response: Promise<RuntimeToolResult> }>() ;
	private readonly runtimeThreads                               = new Set<string>()                                                              ;
	private readonly listeners                                    = new Set<(event: NativeHarnessEvent) => void>()                                 ;
	private readonly pending                                      = new Map<NativeRequestId, PendingRequest>()                                     ;
	private readonly pendingApprovalResponses                     = new Map<NativeRequestId, PendingApprovalResponse>()                            ;
	private readonly approvals                                    = new Map<NativeRequestId, NativeApprovalRequest>()                              ;
	/**
	 * Some notifications (notably turn/plan/updated) carry only a turn id.  Only
	 * bind those notifications when this adapter has observed the turn's owner.
	 */
	private readonly threadIdByTurnId = new Map<string, string>() ;
	private requestSequence           = 0                         ;
	private closing                   = false                     ;
	private disconnected              = false                     ;

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
				name    : options.clientName ?? "www",
				title   : options.clientTitle ?? "World Wide Woo",
				version : options.clientVersion ?? PRODUCT_VERSION,
			},
			capabilities: { experimentalApi: true, requestAttestation: false },
		}, false);
		await server.notify("initialized");
		return server;
	}

	/** Read the complete visible catalog; never publish a partially read page set. */
	public async listModels(): Promise<readonly NativeModelOption[]> {
		const models   = new Map<string, NativeModelOption>()                ;
		const deadline = Date.now() + Math.min(this.requestTimeoutMs, 5_000) ;
		const cursors  = new Set<string>()                                   ;
		let cursor: string | undefined                                       ;
		do {
			const remaining = deadline - Date.now();
			if (remaining <= 0) throw new Error("Native 모델 목록 조회 시간 초과");
			const result = await this.request("model/list", compact({ cursor, limit: 100, includeHidden: false }), false, remaining);
			if (!isRecord(result) || !Array.isArray(result.data)) throw new Error("Native 모델 목록 응답 형식 오류");
			for (const value of result.data) {
				if (!isRecord(value)) throw new Error("Native 모델 항목 형식 오류");
				const row = value;
				if (row.hidden === true) continue;
				if (typeof row.model !== "string" || !/^[\w./:-]+$/u.test(row.model) || !Array.isArray(row.supportedReasoningEfforts)) throw new Error("Native 모델 capability 형식 오류");
				const efforts = [...new Set(row.supportedReasoningEfforts
					.map(option => isRecord(option) ? option.reasoningEffort : undefined)
					.filter(isEffort))];
				const [firstEffort] = efforts;
				if (!firstEffort) throw new Error(`WWW가 지원하지 않는 Native 추론 계약: ${row.model}`);
				const defaultEffort = efforts.find(effort => effort === row.defaultReasoningEffort) ?? firstEffort;
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
			cwd            : input.cwd,
			model          : input.model,
			config         : codexThreadConfig(input.effort),
			approvalPolicy : input.approvalPolicy,
			sandbox        : input.sandbox,
			ephemeral      : input.ephemeral,
			dynamicTools   : this.runtimeTools.length ? this.runtimeTools.map(tool => ({ type: "function", ...tool })) : undefined,
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
		const handler = this.runtimeToolHandler;
		if (typeof threadId !== "string"
			|| typeof turnId !== "string"
			|| typeof callId !== "string"
			|| !callId
			|| typeof tool !== "string"
			|| params.namespace != null
			|| !handler
			|| !this.runtimeThreads.has(threadId)
			|| !this.runtimeTools.some(d => d.name === tool)) {
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
					const response = previous?.response ?? Promise.resolve().then(() => handler({ threadId, turnId, callId, tool, arguments: params.arguments })).catch(() => failure("RUNTIME_HANDLER_FAILED"));
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
			cwd           : input.cwd,
			limit         : input.limit,
			sortKey       : "updated_at",
			sortDirection : "desc",
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
		const servers : NativeMcpServer[] = []                ;
		const visitedCursors              = new Set<string>() ;
		let cursor    : string | undefined                    ;
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
			keyPath       : `mcp_servers."${escapeConfigKeySegment(name)}".enabled`,
			value         : enabled,
			mergeStrategy : "upsert",
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
		server     : string  ;
		threadId   : string  ;
		tool       : string  ;
		arguments? : unknown ;
	}): Promise<NativeMcpToolResult> {
		if (!input.server.trim() || !input.threadId.trim() || !input.tool.trim()) throw new Error("MCP tool call requires server, thread, and tool");
		const result = await this.request("mcpServer/tool/call", compact({
			server    : input.server,
			threadId  : input.threadId,
			tool      : input.tool,
			arguments : input.arguments,
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
			threadId          : input.threadId,
			input             : [{ type: "text", text: input.text }],
			cwd               : input.cwd,
			model             : input.model,
			effort            : input.effort,
			approvalPolicy    : input.approvalPolicy,
			sandboxPolicy     : input.sandboxPolicy,
			collaborationMode : input.collaborationMode,
			additionalContext : input.additionalContext,
		}), true);
		const snapshot = turnSnapshot(result, input.threadId);
		this.threadIdByTurnId.set(snapshot.id, input.threadId);
		return snapshot;
	}

	public async steerTurn(input: NativeTurnSteer): Promise<NativeTurnSteerResult> {
		const result = await this.request("turn/steer", {
			threadId            : input.threadId,
			expectedTurnId      : input.expectedTurnId,
			clientUserMessageId : input.clientUserMessageId,
			input               : [{ type: "text", text: input.text }],
		}, true);
		const turnId = isRecord(result) ? result.turnId : undefined;
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
					reject(toError(error));
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
					reject(toError(error));
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
			void this.handleRuntimeTool(message.id, params).catch(error => this.disconnect(toError(error)));
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

function isEffort(value: unknown): value is Effort {
	return typeof value === "string" && CODEX_EFFORTS.some(effort => effort === value);
}

function toError(value: unknown): Error {
	return value instanceof Error ? value : new Error(String(value));
}
