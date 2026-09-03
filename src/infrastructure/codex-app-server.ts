import type { NativeHarnessPort } from "../application/native-harness.js";
import type {
	NativeApprovalDecision,
	NativeApprovalKind,
	NativeApprovalRequest,
	NativeApprovalResolution,
	NativeHarnessEvent,
	NativeRefs,
	NativeRequestId,
	NativeThreadRead,
	NativeThreadList,
	NativeThreadResume,
	NativeThreadSnapshot,
	NativeThreadStart,
	NativeThreadStatus,
	NativeThreadSummary,
	NativeTurnInterrupt,
	NativeTurnSnapshot,
	NativeTurnStart,
	NativeUncertainOperation,
} from "../domain/native-session.js";
import { sanitizeTerminalText } from "../domain/terminal.js";
import { PRODUCT_VERSION } from "../product-version.js";

const STDERR_TAIL_CODE_POINTS = 4_096;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

interface JsonRecord {
	[key: string]: unknown;
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

export class CodexAppServer implements NativeHarnessPort {
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

	public async startThread(input: NativeThreadStart): Promise<NativeThreadSnapshot> {
		const result = await this.request("thread/start", compact({
			cwd: input.cwd,
			model: input.model,
			config: input.effort ? { model_reasoning_effort: input.effort } : undefined,
			approvalPolicy: input.approvalPolicy,
			sandbox: input.sandbox,
			ephemeral: input.ephemeral,
		}), true);
		const snapshot = threadSnapshot(result, "thread/start");
		this.registerThreadTurns(snapshot);
		return snapshot;
	}

	public async resumeThread(input: NativeThreadResume): Promise<NativeThreadSnapshot> {
		const { effort, ...resume } = input;
		const result = await this.request("thread/resume", compact({
			...resume,
			config: effort ? { model_reasoning_effort: effort } : undefined,
		}), true);
		const snapshot = threadSnapshot(result, "thread/resume");
		this.registerThreadTurns(snapshot);
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

	public async interruptTurn(input: NativeTurnInterrupt): Promise<void> {
		await this.request("turn/interrupt", { ...input }, true);
	}

	public respondToApproval(input: NativeApprovalResolution): Promise<void> {
		const requestId = approvalResolutionRequestId(input);
		if (!this.approvals.has(requestId)) {
			return Promise.reject(new Error(`Unknown native approval: ${String(requestId)}`));
		}
		if (this.pendingApprovalResponses.has(requestId)) {
			return Promise.reject(new Error(`Native approval response already pending: ${String(requestId)}`));
		}
		return new Promise<void>((resolve, reject) => {
			const pending: PendingApprovalResponse = { dispatched: false, resolve, reject };
			this.pendingApprovalResponses.set(requestId, pending);
			void this.transport.send(JSON.stringify({ id: requestId, result: input.response })).then(
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

	private request(method: string, params: JsonRecord | undefined, uncertainOnDisconnect: boolean): Promise<unknown> {
		if (this.disconnected) return Promise.reject(new Error("Codex App Server is disconnected"));
		const id = ++this.requestSequence;
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				const pending = this.pending.get(id);
				if (!pending) return;
				this.pending.delete(id);
				pending.reject(pending.dispatched && pending.uncertainOnDisconnect
					? new NativeOperationUncertainError(method, id)
					: new Error(`Codex App Server ${method} timed out after ${this.requestTimeoutMs}ms`));
			}, this.requestTimeoutMs);
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
		if (isRequestId(message.id) && approvalKind(message.method)) {
			const kind = approvalKind(message.method);
			if (!kind) return;
			const callbackId = kind === "command" && (typeof params.approvalId === "string" || params.approvalId === null)
				? params.approvalId
				: null;
			const approval: NativeApprovalRequest = {
				requestId: message.id,
				id: message.id,
				callbackId,
				kind,
				refs: this.refsFrom(params, message.id, callbackId),
				availableDecisions: nativeApprovalDecisions(params.availableDecisions),
				params,
			};
			this.approvals.set(message.id, approval);
			this.emit({ type: "approval-requested", approval });
			return;
		}
		if (message.method === "serverRequest/resolved" && isRequestId(params.requestId)) {
			const requestId = params.requestId;
			this.approvals.delete(requestId);
			const pending = this.pendingApprovalResponses.get(requestId);
			if (pending) {
				this.pendingApprovalResponses.delete(requestId);
				pending.resolve();
			}
			this.emit({ type: "approval-resolved", requestId, approvalId: requestId, refs: this.refsFrom(params, requestId) });
			return;
		}
		this.emit({ type: "notification", method: message.method, refs: this.refsFrom(params), params });
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
	return undefined;
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
