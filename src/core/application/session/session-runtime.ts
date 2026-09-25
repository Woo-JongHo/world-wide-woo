import { retryAssistantCall }                             from "@earendil-works/pi-ai";
import type { AssistantMessage, Context, ToolCall }       from "@earendil-works/pi-ai";
import type { WwwSettings }                               from "@/core/domain/execution/model-settings";
import type { WorkbenchConfig }                           from "@/core/domain/execution/workbench-config.js";
import type { WorkNarration }                             from "@/core/domain/work/narration";
import type { PlanningSnapshot }                          from "@/core/domain/work/planning";
import type { SessionEvent }                              from "@/core/domain/execution/session-events";
import type { CommandResultSnapshot, ToolResultSnapshot } from "@/core/domain/execution/output";
import { sanitizeTerminalText }                           from "@/core/domain/execution/terminal";
import type {
	AgentTool,
	ModelAuthStatus,
	ModelClient,
	SessionRepository,
	TerminalCommandExecutor,
	TodoController,
} from "@/core/ports/index.js";
import type {
	ConversationTurn,
	SessionActivity,
	SessionListener,
	SessionPhase,
	SessionSnapshot,
	WorkspaceContext,
} from "@/core/application/session/session-contracts";
import { assistantMessageText, sessionErrorMessage }      from "@/core/application/session/session-event-codec";
import { replaySessionEvents }                            from "@/core/application/session/session-event-replay";
import { buildSessionSystemPrompt }                       from "@/core/application/session/session-system-prompt";
import { SessionToolExecutor }                            from "@/core/application/session/session-tool-executor";

export type {
	ConversationTurn,
	SessionActivity,
	SessionActivityKind,
	SessionListener,
	SessionPhase,
	SessionSnapshot,
	WorkspaceContext,
} from "@/core/application/session/session-contracts";
export { buildSessionSystemPrompt } from "@/core/application/session/session-system-prompt";

const DEFAULT_MAX_AGENT_ROUNDS = 24;

export class SessionRuntime {
	private readonly context        : Context                                             ;
	private readonly toolExecutor   : SessionToolExecutor                                 ;
	private readonly listeners                               = new Set<SessionListener>() ;
	private readonly turns          : ConversationTurn[]     = []                         ;
	private readonly toolExecutions : ToolResultSnapshot[]   = []                         ;
	private readonly narrations     : WorkNarration[]        = []                         ;
	private readonly narratedToolCallIds                     = new Set<string>()          ;
	private phase                   : SessionPhase           = "starting"                 ;
	private draft                                            = ""                         ;
	private activity                : SessionActivity | null = null                       ;
	private error                   : string | null          = null                       ;
	private auth                    : ModelAuthStatus | null = null                       ;
	private abortController         : AbortController | null = null                       ;
	private activeTask              : Promise<void> | null   = null                       ;
	private closed                                           = false                      ;

	constructor(
		settings: WwwSettings,
		private readonly router: ModelClient,
		private readonly store: SessionRepository,
		readonly workspace: WorkspaceContext,
		readonly id: string = crypto.randomUUID(),
		private readonly tools: readonly AgentTool[] = [],
		private readonly todos?: TodoController,
		private planning: PlanningSnapshot | null = null,
		private readonly terminal?: TerminalCommandExecutor,
		private readonly retryPolicy: WorkbenchConfig["retry"] = { enabled: true, maxRetries: 2, baseDelayMs: 500 },
		private readonly maxAgentRounds: number = DEFAULT_MAX_AGENT_ROUNDS,
	) {
		this.selection = { ...settings };
		this.context = {
			systemPrompt : buildSessionSystemPrompt(workspace, settings, tools.map(tool => tool.definition.name), planning),
			messages     : [],
			tools        : tools.map(tool => tool.definition),
		};
		this.toolExecutor = new SessionToolExecutor({
			sessionId: id,
			cwd: workspace.cwd,
			store,
			tools,
			todos,
			state: {
				executions      : this.toolExecutions,
				narrations      : this.narrations,
				narratedCallIds : this.narratedToolCallIds,
			},
			signal: () => this.abortController?.signal,
			onActivity: activity => {
				this.activity = activity;
				this.emit();
			},
			onChange: () => this.emit(),
		});
	}

	private selection: WwwSettings;

	get settings(): WwwSettings {
		return { ...this.selection };
	}

	updatePlanning(snapshot: PlanningSnapshot): void {
		this.planning = snapshot;
		this.context.systemPrompt = buildSessionSystemPrompt(
			this.workspace,
			this.selection,
			this.tools.map(tool => tool.definition.name),
			this.planning,
		);
	}

	get snapshot(): SessionSnapshot {
		return {
			id          : this.id,
			phase       : this.phase,
			turns       : this.turns.map((turn) => ({ ...turn })),
			draft       : this.draft,
			error       : this.error,
			auth        : this.auth ? { ...this.auth } : null,
			settings    : this.settings,
			cwd         : this.workspace.cwd,
			projectName : this.workspace.projectName ?? "이름 없음",
			projectRoot : this.workspace.root ?? this.workspace.cwd,
			activity    : this.activity ? { ...this.activity } : null,
			tools       : this.toolExecutions.map(snapshot => ({ ...snapshot })),
			narrations  : this.narrations.map(narration => ({ ...narration })),
		};
	}

	subscribe(listener: SessionListener): () => void {
		this.listeners.add(listener);
		try {
			listener(this.snapshot);
		} catch {
			this.listeners.delete(listener);
		}
		return () => this.listeners.delete(listener);
	}

	async initialize(options: { resume?: boolean } = {}): Promise<void> {
		this.auth = await this.router.checkAuth(this.settings);
		if (options.resume) {
			const events = await this.store.readAll(this.id);
			if (events.length === 0) throw new Error(`재개할 세션을 찾을 수 없습니다: ${this.id}`);
			this.restore(events);
			await this.store.append(this.id, {
				category : "system",
				type     : "session.resumed",
				status   : this.auth.configured ? "passed" : "blocked",
				title    : "세션 재개",
				body     : "",
				metadata : { settings: this.settings, auth: this.auth, workspace: this.workspace },
			});
			this.phase = this.error ? "error" : "ready";
			this.emit();
			return;
		}
		await this.store.append(this.id, {
			category : "system",
			type     : "session.started",
			status   : this.auth.configured ? "passed" : "blocked",
			title    : "세션 시작",
			body     : "",
			metadata : { settings: this.settings, auth: this.auth, workspace: this.workspace },
		});
		this.phase = "ready";
		this.emit();
	}

	async updateSettings(settings: WwwSettings): Promise<void> {
		if (this.closed) throw new Error("종료된 세션의 모델 설정은 변경할 수 없습니다.");
		const nextSelection = { ...settings };
		const nextAuth = await this.router.checkAuth(nextSelection);
		await this.store.append(this.id, {
			category : "decision",
			type     : "model.changed",
			status   : nextAuth.configured ? "passed" : "blocked",
			title    : "모델 설정 변경",
			body     : `${settings.provider}/${settings.model}`,
			metadata : { settings, auth: nextAuth },
		});
		this.selection = nextSelection;
		this.auth = nextAuth;
		this.context.systemPrompt = buildSessionSystemPrompt(
			this.workspace,
			nextSelection,
			this.tools.map(tool => tool.definition.name),
			this.planning,
		);
		this.emit();
	}

	async refreshAuth(): Promise<ModelAuthStatus> {
		this.auth = await this.router.checkAuth(this.selection);
		this.emit();
		return { ...this.auth };
	}

	submit(text: string): Promise<void> {
		const prompt = text.trim();
		if (!prompt) return Promise.resolve();
		if (this.closed) return Promise.reject(new Error("종료된 세션에는 메시지를 보낼 수 없습니다."));
		if (this.activeTask) return Promise.reject(new Error("이미 모델 응답을 처리하고 있습니다."));
		if (!this.auth?.configured) {
			return Promise.reject(new Error(
				`${this.selection.provider} 인증이 필요합니다. Ctrl+O에서 로그인하거나 Ctrl+L에서 인증된 Router를 선택하세요.`,
			));
		}
		const task = this.runTurn(prompt);
		this.activeTask = task;
		void task.then(
			() => {
				if (this.activeTask === task) this.activeTask = null;
			},
			() => {
				if (this.activeTask === task) this.activeTask = null;
			},
		);
		return task;
	}

	runTerminalCommand(command: string): Promise<void> {
		const rawCommand = command.trim();
		if (!rawCommand) return Promise.reject(new Error("사용법: !<terminal command>"));
		const terminal = this.terminal;
		if (!terminal) return Promise.reject(new Error("이 WWW 실행에는 terminal command executor가 연결되지 않았습니다."));
		if (this.closed) return Promise.reject(new Error("종료된 세션에서는 명령을 실행할 수 없습니다."));
		if (this.activeTask) return Promise.reject(new Error("다른 작업을 처리하고 있습니다."));
		const task = this.runDirectTerminalCommand(rawCommand, terminal);
		this.activeTask = task;
		void task.then(
			() => { if (this.activeTask === task) this.activeTask = null; },
			() => { if (this.activeTask === task) this.activeTask = null; },
		);
		return task;
	}

	private async runDirectTerminalCommand(rawCommand: string, terminal: TerminalCommandExecutor): Promise<void> {
		const command        = sanitizeTerminalText(rawCommand, 8_192) ;
		const timestamp      = Date.now()                              ;
		const turnId         = crypto.randomUUID()                     ;
		const itemId         = crypto.randomUUID()                     ;
		const userItemId     = crypto.randomUUID()                     ;
		const displayCommand = `!${command}`                           ;
		this.phase           = "streaming"                                      ;
		this.draft           = ""                                               ;
		this.error           = null                                             ;
		this.activity        = { kind: "tool", label: "Terminal 명령 준비 중" } ;
		this.abortController = new AbortController()                            ;
		this.turns.push({ id: userItemId, role: "user", content: displayCommand, timestamp });
		this.emit();
		try {
			await this.store.append(this.id, {
				category      : "action",
				type          : "turn.started",
				status        : "running",
				title         : "Terminal 턴 시작",
				body          : displayCommand,
				correlationId : turnId,
				turnId,
				metadata: { source: "terminal" },
			});
			await this.store.append(this.id, {
				category      : "action",
				type          : "message.user",
				status        : "passed",
				title         : "사용자 Terminal 명령",
				body          : displayCommand,
				correlationId : turnId,
				turnId,
				itemId: userItemId,
				metadata: { source: "terminal" },
			});
			await this.toolExecutor.recordNarration({
				type      : "toolCall",
				id        : itemId,
				name      : "bash",
				arguments : { command },
			}, turnId);
			const startedAt = Date.now();
			const running: CommandResultSnapshot = {
				id: itemId,
				shell: "bash",
				command,
				cwd    : this.workspace.cwd,
				status : "running",
				stdout : "",
				stderr : "",
				startedAt,
				durationMs: undefined,
				exitCode: undefined,
			};
			this.toolExecutions.push(running);
			this.activity = { kind: "tool", label: "Terminal 명령 실행 중" };
			this.emit();
			await this.store.append(this.id, {
				category      : "command",
				type          : "command.started",
				status        : "running",
				title         : "Terminal 명령 실행",
				body          : command,
				correlationId : turnId,
				turnId,
				itemId,
			});
			let result;
			try {
				result = await terminal.execute(
					rawCommand,
					this.workspace.cwd,
					this.abortController.signal,
					update => {
						const index = this.toolExecutions.findIndex(item => item.id === itemId);
						if (index < 0) return;
						this.toolExecutions[index] = {
							...running,
							stdout: sanitizeTerminalText(update.stdout, 32 * 1_024),
							stderr: sanitizeTerminalText(update.stderr, 32 * 1_024),
						};
						this.emit();
					},
				);
			} catch (error) {
				result = {
					stdout     : "",
					stderr     : sanitizeTerminalText(sessionErrorMessage(error), 32 * 1_024),
					exitCode   : null,
					durationMs : Date.now() - startedAt,
					cancelled  : this.abortController.signal.aborted,
					timedOut   : false,
				};
			}
			const cancelled = result.cancelled || this.abortController.signal.aborted;
			const passed = !cancelled && !result.timedOut && result.exitCode === 0;
			const stderr = result.timedOut
				? `${result.stderr}${result.stderr ? "\n" : ""}명령 실행 시간이 초과되었습니다.`
				: result.stderr;
			const snapshot: CommandResultSnapshot = {
				...running,
				status     : cancelled ? "cancelled" : passed ? "passed" : "failed",
				stdout     : sanitizeTerminalText(result.stdout, 32 * 1_024),
				stderr     : sanitizeTerminalText(stderr, 32 * 1_024),
				durationMs : result.durationMs,
				exitCode   : result.exitCode ?? undefined,
			};
			const index = this.toolExecutions.findIndex(item => item.id === itemId);
			if (index >= 0) this.toolExecutions[index] = snapshot;
			const eventStatus = cancelled ? "blocked" as const : passed ? "passed" as const : "failed" as const;
			await this.store.append(this.id, {
				category      : "command",
				type          : "command.output",
				status        : eventStatus,
				title         : "Terminal 명령 출력",
				body          : [snapshot.stdout, snapshot.stderr].filter(Boolean).join("\n"),
				correlationId : turnId,
				turnId,
				itemId,
			});
			const completedEvent = await this.store.append(this.id, {
				category      : "command",
				type          : "command.completed",
				status        : eventStatus,
				title         : `Terminal 명령 ${passed ? "완료" : cancelled ? "취소" : "실패"}`,
				body          : "",
				correlationId : turnId,
				turnId,
				itemId,
				metadata: { snapshot },
			});
			if (passed) await this.toolExecutor.recordTodoEvidence(completedEvent.id, turnId, itemId);
			await this.recordTurnCompletion(turnId, passed ? "passed" : cancelled ? "blocked" : "failed", cancelled);
		} finally {
			this.abortController = null    ;
			this.phase           = "ready" ;
			this.activity        = null    ;
			this.emit();
		}
	}

	private async runTurn(prompt: string): Promise<void> {
		const turnSettings = this.settings;
		this.phase    = "streaming"                                  ;
		this.draft    = ""                                           ;
		this.activity = { kind: "recording", label: "요청 기록 중" } ;
		this.error    = null                                         ;
		const timestamp                                                                    = Date.now()          ;
		const turnId                                                                       = crypto.randomUUID() ;
		const userItemId                                                                   = crypto.randomUUID() ;
		let assistantItemId                                                                = crypto.randomUUID() ;
		let activeToolRound : { assistant: AssistantMessage; callIds: Set<string> } | null = null                ;
		this.turns.push({ id: userItemId, role: "user", content: prompt, timestamp });
		this.context.messages.push({ role: "user", content: prompt, timestamp });
		await this.store.append(this.id, {
			category      : "action",
			type          : "turn.started",
			status        : "running",
			title         : "턴 시작",
			body          : prompt,
			correlationId : turnId,
			turnId,
			metadata: { settings: turnSettings },
		});
		await this.store.append(this.id, {
			category      : "action",
			type          : "message.user",
			status        : "passed",
			title         : "사용자 메시지",
			body          : prompt,
			correlationId : turnId,
			turnId,
			itemId: userItemId,
		});
		this.activity = {
			kind: "waiting",
			label: `${turnSettings.provider}/${turnSettings.model} 응답 대기`,
		};
		this.emit();

		this.abortController = new AbortController();
		try {
			for (let round = 0; round < this.maxAgentRounds; round++) {
				assistantItemId = crypto.randomUUID();
				this.draft = "";
				const result = await this.streamAssistant(turnSettings, turnId, assistantItemId);
				if (this.abortController.signal.aborted) {
					await this.commitCancellation(this.draft, turnId, assistantItemId);
					await this.recordTurnCompletion(turnId, "blocked", true);
					this.error = null;
					this.phase = "ready";
					return;
				}
				const toolCalls = result.content.filter((item): item is ToolCall => item.type === "toolCall");
				const completedResult = toolCalls.length === 0
					? this.toolExecutor.appendLearningSummary(result, turnId)
					: result;
				const content = assistantMessageText(completedResult);
				this.context.messages.push(completedResult);
				if (content.trim()) {
					this.turns.push({
						id: assistantItemId,
						role: "assistant",
						content,
						timestamp: result.timestamp,
						outcome: "completed",
					});
				}
				await this.store.append(this.id, {
					category      : "answer",
					type          : "message.assistant.completed",
					status        : this.error ? "failed" : "passed",
					title         : "모델 응답",
					body          : content,
					correlationId : turnId,
					turnId,
					itemId: assistantItemId,
					metadata: { message: completedResult },
				});
				if (this.error) {
					await this.recordError(this.error, turnId, assistantItemId);
					break;
				}
				if (toolCalls.length === 0) {
					this.phase = "ready";
					await this.recordTurnCompletion(turnId, "passed");
					return;
				}
				activeToolRound = { assistant: result, callIds: new Set(toolCalls.map(call => call.id)) };
				if (round === this.maxAgentRounds - 1) throw new Error("도구 실행 반복 한도에 도달했습니다.");
				for (const [index, toolCall] of toolCalls.entries()) {
					const toolResult = await this.toolExecutor.execute(toolCall, turnId);
					this.context.messages.push(toolResult);
					if (this.abortController.signal.aborted) {
						for (const remaining of toolCalls.slice(index + 1)) {
							this.context.messages.push(await this.toolExecutor.cancelPending(remaining, turnId));
						}
						break;
					}
				}
				activeToolRound = null;
				if (this.abortController.signal.aborted) {
					await this.recordTurnCompletion(turnId, "blocked", true);
					this.error = null;
					this.phase = "ready";
					return;
				}
				this.activity = {
					kind: "waiting",
					label: `${turnSettings.provider}/${turnSettings.model} 후속 응답 대기`,
				};
				this.emit();
			}
			this.phase = "error";
			await this.recordTurnCompletion(turnId, "failed");
		} catch (error) {
			if (activeToolRound) this.discardToolRound(activeToolRound.assistant, activeToolRound.callIds);
			const cancelled = this.abortController.signal.aborted;
			if (cancelled) {
				await this.commitCancellation(this.draft, turnId, assistantItemId);
				this.error = null;
			} else {
				this.error = sessionErrorMessage(error);
				await this.recordError(this.error, turnId, assistantItemId);
			}
			await this.recordTurnCompletion(turnId, cancelled ? "blocked" : "failed", cancelled);
			this.phase = cancelled ? "ready" : "error";
		} finally {
			this.abortController = null ;
			this.draft           = ""   ;
			this.activity        = null ;
			this.emit();
		}
	}

	private async streamAssistant(
		settings: WwwSettings,
		turnId: string,
		itemId: string,
	): Promise<AssistantMessage> {
		await this.store.append(this.id, {
			category      : "answer",
			type          : "message.assistant.started",
			status        : "running",
			title         : "모델 응답 시작",
			body          : "",
			correlationId : turnId,
			turnId,
			itemId,
		});
		const result = await retryAssistantCall(
			async () => {
				const stream = this.router.stream(settings, this.context, this.abortController?.signal);
				for await (const event of stream) {
					if (event.type === "thinking_delta") {
						this.activity = { kind: "thinking", label: "모델 추론 중" };
						this.emit();
					}
					if (event.type === "text_delta") {
						this.activity = { kind: "responding", label: "응답 작성 중" };
						this.draft += event.delta;
						this.emit();
					}
				}
				return stream.result();
			},
			this.retryPolicy,
			this.abortController?.signal,
			{
				onRetryScheduled: (attempt, maximum) => {
					this.activity = { kind: "waiting", label: `Provider 일시 오류 · 재시도 ${attempt}/${maximum}` };
					this.emit();
				},
				onRetryAttemptStart: () => {
					this.draft    = ""                                                                                ;
					this.error    = null                                                                              ;
					this.activity = { kind: "waiting", label: `${settings.provider}/${settings.model} 다시 연결 중` } ;
					this.emit();
				},
			},
		);
		this.error = result.stopReason === "error"
			? sessionErrorMessage(result.errorMessage ?? "모델 응답 중 오류가 발생했습니다.")
			: null;
		return result;
	}

	private discardToolRound(assistant: AssistantMessage, callIds: ReadonlySet<string>): void {
		const retainedMessages = this.context.messages.filter(message =>
			message !== assistant && (message.role !== "toolResult" || !callIds.has(message.toolCallId)),
		);
		this.context.messages.splice(0, this.context.messages.length, ...retainedMessages);
		const retainedSnapshots = this.toolExecutions.filter(snapshot => !callIds.has(snapshot.id));
		this.toolExecutions.splice(0, this.toolExecutions.length, ...retainedSnapshots);
	}

	private restore(events: readonly SessionEvent[]): void {
		const replayed = replaySessionEvents(this.id, events);
		this.turns.splice(0, this.turns.length, ...replayed.turns);
		this.context.messages.splice(0, this.context.messages.length, ...replayed.messages);
		this.toolExecutions.splice(0, this.toolExecutions.length, ...replayed.toolExecutions);
		this.narrations.splice(0, this.narrations.length, ...replayed.narrations);
		this.narratedToolCallIds.clear();
		for (const id of replayed.narratedToolCallIds) this.narratedToolCallIds.add(id);
		this.error = replayed.error;
	}

	async close(): Promise<void> {
		if (this.closed) return;
		this.closed = true;
		this.abort();
		try {
			await this.activeTask;
		} catch {
			// The failed turn has already persisted its terminal event.
		}
		await this.store.append(this.id, {
			category : "system",
			type     : "session.ended",
			status   : "passed",
			title    : "세션 종료",
			body     : "",
		});
	}

	abort(): boolean {
		if (!this.abortController) return false;
		this.activity = { kind: "cancelling", label: "작업 중단 중" };
		this.emit();
		this.abortController.abort();
		return true;
	}

	private async recordError(message: string, turnId: string, itemId: string): Promise<void> {
		await this.store.append(this.id, {
			category      : "warning",
			type          : "message.assistant.failed",
			status        : "failed",
			title         : "모델 응답 실패",
			body          : message,
			correlationId : turnId,
			turnId,
			itemId,
		});
	}

	private async commitCancellation(content: string, turnId: string, itemId: string): Promise<void> {
		if (content.trim()) {
			this.turns.push({
				id: itemId,
				role: "assistant",
				content,
				timestamp: Date.now(),
				outcome: "cancelled",
			});
		}
		await this.recordCancellation(content, turnId, itemId);
	}

	private async recordCancellation(content: string, turnId: string, itemId: string): Promise<void> {
		await this.store.append(this.id, {
			category      : "answer",
			type          : "message.assistant.cancelled",
			status        : "blocked",
			title         : "모델 응답 중단",
			body          : content,
			correlationId : turnId,
			turnId,
			itemId,
		});
	}

	private async recordTurnCompletion(turnId: string, status: "passed" | "failed" | "blocked", cancelled = false): Promise<void> {
		await this.store.append(this.id, {
			category: "evidence",
			type: "turn.completed",
			status,
			title         : "턴 종료",
			body          : cancelled ? "cancelled" : status === "passed" ? "succeeded" : "failed",
			correlationId : turnId,
			turnId,
			metadata: { outcome: cancelled ? "cancelled" : status === "passed" ? "succeeded" : "failed" },
		});
	}

	private emit(): void {
		const snapshot = this.snapshot;
		for (const listener of this.listeners) {
			try {
				listener(snapshot);
			} catch {
				this.listeners.delete(listener);
			}
		}
	}
}
