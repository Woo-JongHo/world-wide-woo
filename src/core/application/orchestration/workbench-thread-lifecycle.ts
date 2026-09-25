import type { NativeThreadSnapshot, NativeThreadStart } from "@/core/domain/execution/native-session.js";
import type { ExecutorPort }                            from "@/core/ports/execution/executor-port.js";
import type {
	BlockedChatDeliveryState,
	NativeTurnCoordinator,
} from "@/core/application/orchestration/native-turn-coordinator.js";

interface ThreadLifecycleOptions {
	readonly cwd            : string                                               				 	 ;
	readonly model          : () 				 => NativeThreadStart["model"]                       ;
	readonly effort         : () 				 => NativeThreadStart["effort"]                      ;
	readonly approvalPolicy : () 			  	 => NonNullable<NativeThreadStart["approvalPolicy"]> ;
	readonly sandbox        : ()				 => NonNullable<NativeThreadStart["sandbox"]>        ;
	readonly acquireLease   : (threadId: string) => Promise<void>                   				 ;
	readonly bindSources    : (threadId: string) => Promise<void>                   				 ;
	readonly closed         : () 				 => boolean                                          ;
}

export interface ResumedThread {
	readonly resumed  : NativeThreadSnapshot     ;
	readonly read     : NativeThreadSnapshot     ;
	readonly delivery : BlockedChatDeliveryState ;
}

/** Owns provider thread start/resume/read ordering and lease/source binding. */
export class WorkbenchThreadLifecycle {
	public constructor(
		private readonly native: ExecutorPort,
		private readonly turn: NativeTurnCoordinator,
		private readonly options: ThreadLifecycleOptions,
	) {}

	public async resume(threadId: string): Promise<ResumedThread> {
		await this.options.acquireLease(threadId);
		const model = this.options.model();
		const effort = this.options.effort();
		const resumed = await this.native.resumeThread({
			threadId,
			cwd: this.options.cwd,
			...(model === undefined ? {} : { model }),
			...(effort === undefined ? {} : { effort }),
			approvalPolicy : this.options.approvalPolicy(),
			sandbox        : this.options.sandbox(),
			excludeTurns   : true,
		});
		if (resumed.id !== threadId) throw new Error(`Native 재개가 요청한 thread ${threadId} 대신 ${resumed.id}를 반환했습니다.`);
		await this.options.bindSources(resumed.id);
		const read = await this.native.readThread({ threadId: resumed.id, includeTurns: true });
		if (read.id !== resumed.id) throw new Error(`Native thread 조회가 재개한 thread ${resumed.id} 대신 ${read.id}를 반환했습니다.`);
		const delivery = this.turn.deliveryState(read.value);
		if (delivery.state === "unknown") throw new Error("재개한 native thread의 현재 turn 상태를 안전하게 판독할 수 없습니다.");
		return { resumed, read, delivery };
	}

	public async startForDashboard(): Promise<NativeThreadSnapshot | null> {
		const model = this.options.model();
		const effort = this.options.effort();
		const thread = await this.native.startThread({
			cwd: this.options.cwd,
			...(model === undefined ? {} : { model }),
			...(effort === undefined ? {} : { effort }),
			approvalPolicy: this.options.approvalPolicy(),
			sandbox: this.options.sandbox(),
		});
		if (this.options.closed()) return null;
		await this.options.acquireLease(thread.id);
		if (this.options.closed()) return null;
		await this.options.bindSources(thread.id);
		return this.options.closed() ? null : thread;
	}
}
