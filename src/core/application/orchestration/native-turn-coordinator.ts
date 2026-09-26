import type {
	NativeApprovalPolicy,
	NativeCollaborationMode,
	NativeSandboxMode,
	NativeSandboxPolicy,
	NativeThreadStart,
	NativeTurnStart,
	NativeTurnSteer,
} from "@/core/domain/execution/native-session.js";
import type {
	WorkbenchChatQueueItem,
	WorkbenchCollaborationMode,
	WorkbenchPermissionMode,
	WorkbenchResumeCoverage,
} from "@/core/domain/work/workbench.js";
import { record } from "@/core/application/orchestration/workbench-projections.js";

export type BlockedChatDeliveryState =
	| { readonly state: "in-progress"; readonly turnId: string }
	| { readonly state: "idle" }
	| { readonly state: "unknown" };

interface NativeThreadInput {
	readonly cwd            : string                      ;
	readonly model          : NativeThreadStart["model"]  ;
	readonly effort         : NativeThreadStart["effort"] ;
	readonly approvalPolicy : NativeApprovalPolicy        ;
	readonly sandbox        : NativeSandboxMode           ;
}

interface NativeTurnInput {
	readonly threadId          : string                      ;
	readonly text              : string                      ;
	readonly cwd               : string                      ;
	readonly model             : NativeThreadStart["model"]  ;
	readonly effort            : NativeThreadStart["effort"] ;
	readonly approvalPolicy    : NativeApprovalPolicy        ;
	readonly sandboxPolicy     : NativeSandboxPolicy         ;
	readonly collaborationMode : NativeCollaborationMode     ;
}

interface NativeSteerInput {
	readonly threadId  : string ;
	readonly turnId    : string ;
	readonly messageId : string ;
	readonly text      : string ;
}

interface BlockedChat {
	readonly id: string;
	readonly content: string;
}

/** Owns Native Chat FIFO state and exact provider input construction. */
export class NativeTurnCoordinator {
	private readonly pending: WorkbenchChatQueueItem[] = [];
	private blocked: BlockedChat | null = null;

	public get queue(): readonly WorkbenchChatQueueItem[] {
		return this.pending;
	}

	public get head(): WorkbenchChatQueueItem | undefined {
		return this.pending[0];
	}

	public get blockedChat(): BlockedChat | null {
		return this.blocked;
	}

	public get deliveryBlocked(): boolean {
		return this.blocked !== null;
	}

	public enqueue(item: WorkbenchChatQueueItem): number {
		this.pending.push(item);
		return this.pending.length;
	}

	public shiftHeadIf(messageId: string): boolean {
		if (this.pending[0]?.id !== messageId) return false;
		this.pending.shift();
		return true;
	}

	public markUncertain(message: BlockedChat): void {
		this.blocked = message;
	}

	public clearUncertain(): BlockedChat | null {
		const blocked = this.blocked;
		this.blocked = null;
		return blocked;
	}

	public threadInput(input: NativeThreadInput): NativeThreadStart {
		return {
			cwd: input.cwd,
			...(input.model === undefined ? {} : { model: input.model }),
			...(input.effort === undefined ? {} : { effort: input.effort }),
			approvalPolicy: input.approvalPolicy,
			sandbox: input.sandbox,
		};
	}

	public turnInput(input: NativeTurnInput): NativeTurnStart {
		return {
			threadId : input.threadId,
			text     : input.text,
			cwd      : input.cwd,
			...(input.model === undefined ? {} : { model: input.model }),
			...(input.effort === undefined ? {} : { effort: input.effort }),
			approvalPolicy    : input.approvalPolicy,
			sandboxPolicy     : input.sandboxPolicy,
			collaborationMode : input.collaborationMode,
		};
	}

	public steerInput(input: NativeSteerInput): NativeTurnSteer {
		return {
			threadId            : input.threadId,
			expectedTurnId      : input.turnId,
			clientUserMessageId : input.messageId,
			text                : input.text,
		};
	}

	public resumeCoverage(resuming: boolean, processAttachedAt: string): WorkbenchResumeCoverage {
		return {
			mode: resuming ? "partial-local-journal" : "fresh",
			processAttachedAt,
			priorProviderHistoryHydrated: false,
		};
	}

	public sandboxPolicy(mode: WorkbenchPermissionMode, cwd: string): NativeSandboxPolicy {
		if (mode === "all") return { type: "dangerFullAccess" };
		return {
			type                : "workspaceWrite",
			writableRoots       : [cwd],
			networkAccess       : true,
			excludeTmpdirEnvVar : false,
			excludeSlashTmp     : false,
		};
	}

	public collaboration(mode: WorkbenchCollaborationMode, model: string, effort: string | null, goal = false): NativeCollaborationMode {
		const planning = mode === "plan";
		return {
			mode: planning ? "plan" : "default",
			settings: {
				model,
				reasoning_effort: effort,
				developer_instructions: [
					...(planning ? [
						"plan mode에서는 실행용 update_plan을 호출하지 마세요.",
						"사용자가 검토할 계획 문서를 공개 응답으로 작성하고, 아직 실행하지 마세요.",
					] : [
						"여러 단계가 필요한 실행 작업이면 실행 전에 update_plan으로 간결한 체크리스트를 등록하고 실제 진행에 맞춰 상태를 갱신하세요.",
						"단순 질문이나 한 단계 작업에는 계획을 만들지 마세요.",
						"묶인 도구 실행 전에는 공개 commentary로 한국어 목적을 설명하고, 결과 뒤에는 확인한 관측을 짧게 설명하세요.",
						"도구 성공이나 turn 종료만으로 계획 항목을 완료 처리하지 말고, 해당 단계의 결과를 확인한 뒤 native 계획 상태를 변경하세요.",
					]),
					"Native Plan의 각 항목은 80자 이내의 간결한 한 문장으로 작성하고, 한 항목에 여러 행동을 나열하지 마세요.",
					...(goal ? ["이 요청은 사용자가 정한 Goal입니다. 먼저 Goal을 실행 가능한 Native Plan으로 분해하고, 관측된 Plan을 Todo로 동기화한 뒤 각 단계를 실행하세요."] : []),
				].join(" "),
			},
		};
	}

	public deliveryState(value: Readonly<Record<string, unknown>>): BlockedChatDeliveryState {
		const status = record(value.status);
		const turns = value.turns;
		if (!status || typeof status.type !== "string" || !Array.isArray(turns)) return { state: "unknown" };
		if (status.type === "idle") return { state: "idle" };
		for (let index = turns.length - 1; index >= 0; index -= 1) {
			const turn = record(turns[index]);
			if (!turn) continue;
			const turnStatus = typeof turn.status === "string" ? turn.status : record(turn.status)?.type;
			if (turnStatus !== "inProgress") continue;
			return typeof turn.id === "string" && turn.id
				? { state: "in-progress", turnId: turn.id }
				: { state: "unknown" };
		}
		return { state: "unknown" };
	}
}
