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
}

interface PendingRequest {
	method: string;
	uncertainOnDisconnect: boolean;
	dispatched: boolean;
	resolve: (result: unknown) => void;
	reject: (error: Error) => void;
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
	private requestSequence = 0;
	private closing = false;
	private disconnected = false;

	private constructor(private readonly transport: JsonLineTransport) {
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
		const server = new CodexAppServer(transport);
		await server.request("initialize", {
			clientInfo: {
				name: options.clientName ?? "www",
				title: options.clientTitle ?? "World Wide Woo",
				version: options.clientVersion ?? PRODUCT_VERSION,
			},
			capabilities: { experimentalApi: false, requestAttestation: false },
		}, false);
		await server.notify("initialized");
		return server;
	}

	public async startThread(input: NativeThreadStart): Promise<NativeThreadSnapshot> {
		const result = await this.request("thread/start", compact({
			cwd: input.cwd,
			model: input.model,
			approvalPolicy: input.approvalPolicy,
			sandbox: input.sandbox,
			ephemeral: input.ephemeral,
		}), true);
		return threadSnapshot(result, "thread/start");
	}

	public async resumeThread(input: NativeThreadResume): Promise<NativeThreadSnapshot> {
		const result = await this.request("thread/resume", compact({ ...input }), true);
		return threadSnapshot(result, "thread/resume");
	}

	public async readThread(input: NativeThreadRead): Promise<NativeThreadSnapshot> {
		const result = await this.request("thread/read", compact({ ...input }), false);
		return threadSnapshot(result, "thread/read");
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

	public async startTurn(input: NativeTurnStart): Promise<NativeTurnSnapshot> {
		const result = await this.request("turn/start", compact({
			threadId: input.threadId,
			input: [{ type: "text", text: input.text }],
			cwd: input.cwd,
			model: input.model,
			approvalPolicy: input.approvalPolicy,
		}), true);
		return turnSnapshot(result, input.threadId);
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

	private request(method: string, params: JsonRecord, uncertainOnDisconnect: boolean): Promise<unknown> {
		if (this.disconnected) return Promise.reject(new Error("Codex App Server is disconnected"));
		const id = ++this.requestSequence;
		return new Promise((resolve, reject) => {
			const pending: PendingRequest = { method, uncertainOnDisconnect, dispatched: false, resolve, reject };
			this.pending.set(id, pending);
			void this.transport.send(JSON.stringify({ id, method, params })).then(
				() => {
					pending.dispatched = true;
				},
				(error) => {
					this.pending.delete(id);
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
				refs: refsFrom(params, message.id, callbackId),
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
			this.emit({ type: "approval-resolved", requestId, approvalId: requestId, refs: refsFrom(params, requestId) });
			return;
		}
		this.emit({ type: "notification", method: message.method, refs: refsFrom(params), params });
	}

	private receiveResponse(id: NativeRequestId, message: JsonRecord): void {
		const pending = this.pending.get(id);
		if (!pending) return;
		this.pending.delete(id);
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
}

function threadSnapshot(result: unknown, method: string): NativeThreadSnapshot {
	if (!isRecord(result) || !isRecord(result.thread) || typeof result.thread.id !== "string") {
		throw new Error(`Codex App Server returned an invalid ${method} result`);
	}
	return { id: result.thread.id, value: result.thread };
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

function isNativeThreadStatus(value: unknown): value is NativeThreadStatus {
	return value === "notLoaded" || value === "idle" || value === "systemError" || value === "active";
}

function refsFrom(params: JsonRecord, approvalRequestId?: NativeRequestId, approvalCallbackId?: string | null): NativeRefs {
	const thread = isRecord(params.thread) ? params.thread : undefined;
	const turn = isRecord(params.turn) ? params.turn : undefined;
	const item = isRecord(params.item) ? params.item : undefined;
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
