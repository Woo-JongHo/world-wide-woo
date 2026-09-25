import type { AssistantMessage, ToolCall, ToolResultMessage } from "@earendil-works/pi-ai";
import type { ToolResultSnapshot }                            from "@/core/domain/execution/output";
import { workNarrationLabel, workNarrationReason }            from "@/core/domain/work/narration";
import type { WorkNarration }                                 from "@/core/domain/work/narration";
import type { AgentTool, SessionRepository, TodoController }  from "@/core/ports/index.js";
import type { SessionActivity }                               from "@/core/application/session/session-contracts";
import {
	assistantMessageText,
	displaySafe,
	runningToolSnapshot,
	sessionErrorMessage,
} from "@/core/application/session/session-event-codec";

interface SessionToolState {
	executions      : ToolResultSnapshot[] ;
	narrations      : WorkNarration[]      ;
	narratedCallIds : Set<string>          ;
}

interface SessionToolExecutorOptions {
	sessionId  : string                              ;
	cwd        : string                              ;
	store      : SessionRepository                   ;
	tools      : readonly AgentTool[]                ;
	todos      : TodoController | undefined          ;
	state      : SessionToolState                    ;
	signal     : () => AbortSignal | undefined       ;
	onActivity : (activity: SessionActivity) => void ;
	onChange   : () => void                          ;
}

export class SessionToolExecutor {
	constructor(private readonly options: SessionToolExecutorOptions) {}

	async execute(toolCall: ToolCall, turnId: string): Promise<ToolResultMessage> {
		await this.recordNarration(toolCall, turnId);
		const startedAt = Date.now();
		const running = runningToolSnapshot(toolCall, this.options.cwd, startedAt);
		this.options.state.executions.push(running);
		this.options.onActivity({ kind: "tool", label: `${toolCall.name} 실행 중` });
		await this.options.store.append(this.options.sessionId, {
			category      : "command",
			type          : "command.started",
			status        : "running",
			title         : `${toolCall.name} 실행`,
			body          : "shell" in running ? running.command : running.input,
			correlationId : turnId,
			turnId,
			itemId: toolCall.id,
			metadata: { snapshot: running },
		});

		const tool = this.options.tools.find(candidate => candidate.definition.name === toolCall.name);
		let execution;
		try {
			execution = tool
				? await tool.execute(toolCall.arguments, this.options.signal() ?? new AbortController().signal)
				: {
					modelContent: `지원하지 않는 도구입니다: ${toolCall.name}`,
					isError: true,
					snapshot: {
						id       : toolCall.id,
						toolName : toolCall.name,
						status   : "failed" as const,
						input    : displaySafe(toolCall.arguments),
						output   : "",
						startedAt,
						durationMs: Date.now() - startedAt,
						error: "지원하지 않는 도구입니다.",
					},
				};
		} catch (error) {
			execution = {
				modelContent: `도구 실행 실패: ${displaySafe(sessionErrorMessage(error))}`,
				isError: true,
				snapshot: {
					id       : toolCall.id,
					toolName : toolCall.name,
					status   : this.options.signal()?.aborted ? "cancelled" as const : "failed" as const,
					input    : displaySafe(toolCall.arguments),
					output   : "",
					startedAt,
					durationMs: Date.now() - startedAt,
					error: displaySafe(sessionErrorMessage(error)),
				},
			};
		}

		const snapshot = { ...execution.snapshot, id: toolCall.id } as ToolResultSnapshot;
		const index = this.options.state.executions.findIndex(item => item.id === toolCall.id);
		if (index >= 0) this.options.state.executions[index] = snapshot;
		else this.options.state.executions.push(snapshot);
		const message: ToolResultMessage = {
			role       : "toolResult",
			toolCallId : toolCall.id,
			toolName   : toolCall.name,
			content    : [{ type: "text", text: execution.modelContent }],
			details    : { snapshot },
			isError    : execution.isError,
			timestamp  : Date.now(),
		};
		await this.options.store.append(this.options.sessionId, {
			category      : "command",
			type          : "command.output",
			status        : execution.isError ? "failed" : "passed",
			title         : `${toolCall.name} 출력`,
			body          : execution.modelContent,
			correlationId : turnId,
			turnId,
			itemId: toolCall.id,
		});
		const completedEvent = await this.options.store.append(this.options.sessionId, {
			category      : "command",
			type          : "command.completed",
			status        : execution.isError ? "failed" : "passed",
			title         : `${toolCall.name} ${execution.isError ? "실패" : "완료"}`,
			body          : "",
			correlationId : turnId,
			turnId,
			itemId: toolCall.id,
			metadata: { snapshot, message },
		});
		if (!execution.isError && toolCall.name !== "todo_write") {
			await this.recordTodoEvidence(completedEvent.id, turnId, toolCall.id);
		}
		this.options.onChange();
		return message;
	}

	async cancelPending(toolCall: ToolCall, turnId: string): Promise<ToolResultMessage> {
		const startedAt = Date.now()                                                 ;
		const running   = runningToolSnapshot(toolCall, this.options.cwd, startedAt) ;
		const reason    = "앞선 도구 실행이 중단되어 실행하지 않았습니다."           ;
		const snapshot: ToolResultSnapshot = "shell" in running
			? { ...running, status: "cancelled", stderr: reason, durationMs: 0 }
			: { ...running, status: "cancelled", error: reason, durationMs: 0 };
		this.options.state.executions.push(snapshot);
		const message: ToolResultMessage = {
			role       : "toolResult",
			toolCallId : toolCall.id,
			toolName   : toolCall.name,
			content    : [{ type: "text", text: reason }],
			details    : { snapshot },
			isError    : true,
			timestamp  : Date.now(),
		};
		await this.options.store.append(this.options.sessionId, {
			category      : "command",
			type          : "command.started",
			status        : "running",
			title         : `${toolCall.name} 실행 대기`,
			body          : "shell" in running ? running.command : running.input,
			correlationId : turnId,
			turnId,
			itemId: toolCall.id,
			metadata: { snapshot: running },
		});
		await this.options.store.append(this.options.sessionId, {
			category      : "command",
			type          : "command.completed",
			status        : "blocked",
			title         : `${toolCall.name} 취소`,
			body          : reason,
			correlationId : turnId,
			turnId,
			itemId: toolCall.id,
			metadata: { snapshot, message },
		});
		this.options.onChange();
		return message;
	}

	appendLearningSummary(result: AssistantMessage, turnId: string): AssistantMessage {
		const narration = this.options.state.narrations.filter(entry => entry.turnId === turnId);
		if (narration.length < 2) return result;
		const content = assistantMessageText(result);
		if (["관찰한 사실", "판단과 이유", "남은 격차", "검증"].every(heading => content.includes(heading))) return result;
		const toolById      = new Map(this.options.state.executions.map(tool => [tool.id, tool]))                                 ;
		const actions       = narration.slice(-8).map(entry => `단계 ${entry.step} ${entry.action} (${entry.reason})`).join("; ") ;
		const statuses      = narration.slice(-8).map(entry => toolById.get(entry.toolCallId)?.status ?? "기록됨")                ;
		const statusSummary = [...new Set(statuses)].join(", ")                                                                   ;
		const todos         = this.options.todos?.snapshot?.items ?? []                                                           ;
		const pending       = todos.filter(item => item.status === "pending").length                                              ;
		const blocked       = todos.filter(item => item.status === "blocked").length                                              ;
		const details       = todos.flatMap(item => item.details)                                                                 ;
		const detailPending = details.filter(detail => detail.status === "pending").length                                        ;
		const detailBlocked = details.filter(detail => detail.status === "blocked").length                                        ;
		const detailSummary = details.length > 0 ? ` 세부 pending ${detailPending}개, blocked ${detailBlocked}개입니다.` : ""     ;
		const todoSummary = this.options.todos
			? `현재 Todo pending ${pending}개, blocked ${blocked}개입니다.${detailSummary}`
			: "현재 Todo 상태는 연결되지 않았습니다.";
		const summary = [
			"관찰한 사실: " + actions,
			`판단과 이유: 실제 도구 상태는 ${statusSummary}이며, 위 실행 목적을 기준으로 응답을 정리했습니다.`,
			`남은 격차: ${todoSummary}`,
			"검증: 이 요약은 해당 턴에서 기록된 도구 실행과 상태만 반영했습니다.",
		].join("\n");
		return { ...result, content: [...result.content, { type: "text", text: `\n\n${summary}` }] };
	}

	async recordTodoEvidence(evidenceId: string, turnId: string, itemId: string): Promise<void> {
		if (!this.options.todos) return;
		try {
			await this.options.todos.recordEvidence(evidenceId);
		} catch (error) {
			await this.options.store.append(this.options.sessionId, {
				category      : "warning",
				type          : "warning.recorded",
				status        : "failed",
				title         : "Todo 증거 기록 실패",
				body          : displaySafe(sessionErrorMessage(error)),
				correlationId : turnId,
				turnId,
				itemId,
			});
		}
	}

	async recordNarration(toolCall: ToolCall, turnId: string): Promise<void> {
		if (this.options.state.narratedCallIds.has(toolCall.id)) {
			throw new Error(`중복된 도구 호출 ID입니다: ${toolCall.id}`);
		}
		const timestamp = new Date().toISOString();
		const action = workNarrationLabel(toolCall.name, toolCall.arguments);
		const narration: WorkNarration = {
			id: crypto.randomUUID(),
			turnId,
			toolCallId: toolCall.id,
			timestamp,
			label: action,
			step: this.options.state.narrations.length + 1,
			action,
			reason: workNarrationReason(toolCall.name, toolCall.arguments),
		};
		await this.options.store.append(this.options.sessionId, {
			category      : "action",
			type          : "narration.recorded",
			status        : "running",
			title         : "작업 설명",
			body          : narration.label,
			correlationId : turnId,
			turnId,
			itemId: toolCall.id,
			metadata: { narration },
		});
		this.options.state.narratedCallIds.add(toolCall.id);
		this.options.state.narrations.push(narration);
		this.options.onChange();
	}
}
