import { randomUUID } from "node:crypto";
import type { ExecutorPort } from "../../application/ports/executor-port.js";
import type {
	NativeApprovalResolution,
	NativeHarnessEvent,
	NativeThreadList,
	NativeThreadRead,
	NativeThreadResume,
	NativeThreadSnapshot,
	NativeTurnInterrupt,
	NativeTurnSnapshot,
	NativeTurnStart,
	NativeThreadStart,
} from "../../domain/native-session.js";

export type PiSessionEvent =
	| { type: "text-delta"; text: string }
	| { type: "reasoning-delta"; text: string };

export interface PiSession {
	prompt(text: string): Promise<void>;
	abort(): void | Promise<void>;
	inspect(): Readonly<Record<string, unknown>>;
	subscribe(listener: (event: PiSessionEvent) => void): () => void;
	close?(): void | Promise<void>;
}

export interface PiSessionInput extends Readonly<Record<string, unknown>> {
	readonly cwd: string;
	readonly provider: string;
	readonly model: string;
	readonly effort: string;
	readonly systemPrompt: string;
	readonly noTools: "all";
	readonly noExtensions: true;
	readonly noSkills: true;
	readonly noPromptTemplates: true;
	readonly noContextFiles: true;
}

export interface PiHarnessSdk {
	createSession(input: PiSessionInput): PiSession | Promise<PiSession>;
}

export interface PiHarnessOptions {
	readonly sdk: PiHarnessSdk;
	readonly provider: string;
	readonly model: string;
	readonly effort: string;
	readonly systemPrompt: string;
}

export class UnsupportedPiOperationError extends Error {
	public readonly code = "unsupported-operation";
	public constructor(operation: string) {
		super(`Pi Phase A does not support ${operation}`);
	}
}

export class PiHarness implements ExecutorPort {
	private readonly listeners = new Set<(event: NativeHarnessEvent) => void>();
	private threadId: string | null = null;
	private session: PiSession | null = null;
	private unsubscribe: (() => void) | null = null;
	private active: { turnId: string; terminal: boolean; interrupted: boolean; started: boolean; text: string } | null = null;
	private closed = false;

	public constructor(private readonly options: PiHarnessOptions) {}

	public async startThread(input: NativeThreadStart): Promise<NativeThreadSnapshot> {
		if (this.closed) throw new Error("Pi harness is closed");
		if (this.threadId) throw new Error("Pi Phase A supports one fresh in-memory thread");
		if (input.model && input.model !== this.options.model) throw new UnsupportedPiOperationError("thread model substitution");
		if (input.effort && input.effort !== this.options.effort) throw new UnsupportedPiOperationError("thread effort substitution");
		const threadId = `pi-thread-${randomUUID()}`;
		const session = await this.options.sdk.createSession({
			cwd: input.cwd,
			provider: this.options.provider,
			model: this.options.model,
			effort: this.options.effort,
			systemPrompt: this.options.systemPrompt,
			noTools: "all",
			noExtensions: true,
			noSkills: true,
			noPromptTemplates: true,
			noContextFiles: true,
		});
		this.threadId = threadId;
		this.session = session;
		this.unsubscribe = this.session.subscribe(event => this.receive(event));
		return { id: this.threadId, value: this.session.inspect(), model: this.options.model, effort: this.options.effort };
	}

	public resumeThread(_input: NativeThreadResume): Promise<NativeThreadSnapshot> { return Promise.reject(new UnsupportedPiOperationError("resumeThread")); }
	public listThreads(_input: NativeThreadList): Promise<readonly never[]> { return Promise.reject(new UnsupportedPiOperationError("listThreads")); }
	public respondToApproval(_input: NativeApprovalResolution): Promise<void> { return Promise.reject(new UnsupportedPiOperationError("approval")); }
	public requestMcp(_input: unknown): Promise<never> { return Promise.reject(new UnsupportedPiOperationError("MCP")); }
	public requestTool(_input: unknown): Promise<never> { return Promise.reject(new UnsupportedPiOperationError("tools")); }

	public async readThread(input: NativeThreadRead): Promise<NativeThreadSnapshot> {
		if (this.closed || !this.threadId || input.threadId !== this.threadId || !this.session) throw new Error("Pi thread is not loaded");
		return {
			id: this.threadId,
			value: {
				...this.session.inspect(),
				status: { type: this.active ? "inProgress" : "idle" },
				turns: this.active ? [{ id: this.active.turnId, status: "inProgress" }] : [],
			},
		};
	}

	public async startTurn(input: NativeTurnStart): Promise<NativeTurnSnapshot> {
		if (this.closed || !this.threadId || input.threadId !== this.threadId || !this.session) throw new Error("Pi thread is not loaded");
		if (this.active) throw new Error("Pi turn is already active");
		if (input.model && input.model !== this.options.model) throw new UnsupportedPiOperationError("mid-session model changes");
		if (input.effort && input.effort !== this.options.effort) throw new UnsupportedPiOperationError("mid-session effort changes");
		const turnId = `pi-turn-${randomUUID()}`;
		this.active = { turnId, terminal: false, interrupted: false, started: false, text: "" };
		setTimeout(() => this.beginTurn(turnId, input.text), 0);
		return { id: turnId, threadId: this.threadId, value: {} };
	}

	private beginTurn(turnId: string, text: string): void {
		if (this.closed || !this.active || this.active.turnId !== turnId || !this.session) return;
		this.active.started = true;
		this.emit("turn/started", turnId, {});
		if (this.active.interrupted) {
			this.finalizeTurnOnce(turnId, "turn/interrupted", {});
			return;
		}
		const promptSettlement = Promise.resolve().then(() => this.session!.prompt(text));
		void promptSettlement.then(
			() => this.finalizeTurnOnce(turnId, this.active?.interrupted ? "turn/interrupted" : "turn/completed", {}),
			error => this.finalizeTurnOnce(turnId, this.active?.interrupted ? "turn/interrupted" : "turn/failed", {
				error: error instanceof Error ? error.message : "Pi session failed",
			}),
		);
	}

	public async interruptTurn(input: NativeTurnInterrupt): Promise<void> {
		if (!this.active || input.threadId !== this.threadId || input.turnId !== this.active.turnId || !this.session) throw new Error("Pi turn is not active");
		this.active.interrupted = true;
		if (this.active.started) await this.session.abort();
	}

	public subscribe(listener: (event: NativeHarnessEvent) => void): () => void {
		if (this.closed) return () => undefined;
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	public async close(): Promise<void> {
		if (this.closed) return;
		this.closed = true;
		this.unsubscribe?.();
		this.unsubscribe = null;
		this.listeners.clear();
		try {
			if (this.active) await this.session?.abort();
		} finally {
			this.active = null;
			await this.session?.close?.();
		}
	}

	private receive(event: PiSessionEvent): void {
		if (this.closed || !this.active?.started || event.type !== "text-delta" || !event.text) return;
		this.active.text += event.text;
		this.emit("item/agentMessage/delta", this.active.turnId, { delta: event.text }, `pi-message-${this.active.turnId}`);
	}

	private finalizeTurnOnce(turnId: string, method: string, params: Readonly<Record<string, unknown>>): void {
		if (this.closed || !this.active || this.active.turnId !== turnId || this.active.terminal) return;
		this.active.terminal = true;
		if (this.active.text) {
			const itemId = `pi-message-${turnId}`;
			this.emit("item/completed", turnId, {
				item: { id: itemId, type: "agentMessage", text: this.active.text },
			}, itemId);
		}
		this.emit(method, turnId, params);
		this.active = null;
	}

	private emit(method: string, turnId: string, params: Readonly<Record<string, unknown>>, itemId?: string): void {
		if (this.closed || !this.threadId) return;
		const refs = itemId ? { threadId: this.threadId, turnId, itemId } : { threadId: this.threadId, turnId };
		const event: NativeHarnessEvent = { type: "notification", method, refs, params };
		for (const listener of this.listeners) listener(event);
	}
}
