import { createHash }             from "node:crypto";
import type {
	ProjectActivity,
	ProjectActivityKind,
	ProjectActivityPhase,
} from "@/core/domain/execution/project-activity.js";
import type { NativeRefs }        from "@/core/domain/execution/native-session.js";
import { ExecutionJournal }       from "@/core/application/orchestration/execution-journal.js";
import type { ExecutionRunState } from "@/core/runtime/execution-run.js";
import { stableJson }             from "@/core/application/orchestration/workbench-projections.js";

interface ActivityJournalPort {
	append(input: {
		projectId    : string                            ;
		kind         : ProjectActivityKind               ;
		phase        : ProjectActivityPhase              ;
		provider     : string                            ;
		nativeRefs   : NativeRefs                        ;
		sourceDigest : string                            ;
		payload      : Readonly<Record<string, unknown>> ;
	}): Promise<{ activity: ProjectActivity; appended: boolean }>;
}

interface JournalCoordinatorOptions {
	readonly projectId                    : string                                                       ;
	readonly activityJournalProjectId?    : string                                                       ;
	readonly provider?                    : string                                                       ;
	readonly developmentObserver?         : { capture(activity: ProjectActivity): void | Promise<void> } ;
	readonly journal                      : ActivityJournalPort                                          ;
	readonly activities                   : ProjectActivity[]                                            ;
	readonly visibleActivities            : ProjectActivity[]                                            ;
	readonly visibleThreadId              : () => string | null                                          ;
	readonly visibleAfterSequence         : () => number                                                 ;
	readonly selectedTurn                 : () => { threadId: string | null; turnId: string | null }     ;
	readonly onAdded                      : (activity: ProjectActivity) => void                          ;
	readonly onDurable                    : (activity: ProjectActivity) => void                          ;
	readonly setDevelopmentRecordingError : (message: string) => void                                    ;
	readonly publish                      : () => void                                                   ;
}

export class WorkbenchJournalCoordinator {
	private readonly runs = new ExecutionJournal({ sha256Hex: input => createHash("sha256").update(input).digest("hex") }, stableJson);

	public constructor(private readonly options: JournalCoordinatorOptions) {}

	public get projectId(): string { return this.options.activityJournalProjectId ?? this.options.projectId; }
	public values(): readonly ExecutionRunState[] { return [...this.runs.values()]; }
	public restore(activities: readonly ProjectActivity[]): readonly string[] { return this.runs.restore(activities); }
	public observe(activity: ProjectActivity): { state: ExecutionRunState; accepted: boolean } | null {
		return this.runs.observe(activity, this.options.activities);
	}

	public selected(): ExecutionRunState | null {
		const { threadId, turnId } = this.options.selectedTurn();
		return threadId && turnId ? this.runs.get(`${threadId}:${turnId}`) ?? null : null;
	}

	public hasCompletionReceipt(run: ExecutionRunState): boolean {
		return this.options.activities.some(activity => activity.payload.method === "execution/completion-receipt"
			&& activity.nativeRefs.threadId === run.threadId
			&& activity.nativeRefs.turnId === run.turnId
			&& activity.payload.receiptId === run.receipt?.receiptId);
	}

	public async append(
		kind: ProjectActivityKind,
		phase: ProjectActivityPhase,
		nativeRefs: NativeRefs,
		payload: Readonly<Record<string, unknown>>,
		publish = true,
		sourceDigest?: string,
	): Promise<ProjectActivity> {
		const digest = sourceDigest ?? digestSource(stableJson({ kind, phase, nativeRefs, payload }));
		const result = await this.options.journal.append({
			projectId: this.projectId,
			kind,
			phase,
			provider: this.options.provider ?? "openai-codex",
			nativeRefs,
			sourceDigest: digest,
			payload,
		});
		const durableActivity = immutable(result.activity);
		if (result.appended && this.options.developmentObserver) {
			try { await this.options.developmentObserver.capture(durableActivity); }
			catch (error) { this.options.setDevelopmentRecordingError(errorMessage(error)); }
		}
		const added = result.appended || !this.options.activities.some(activity => activity.id === result.activity.id);
		if (added) {
			this.options.activities.push(durableActivity);
			const reduction = this.observe(durableActivity);
			if (this.isVisible(durableActivity)) this.options.visibleActivities.push(durableActivity);
			this.options.onAdded(durableActivity);
			if (reduction?.accepted && reduction.state.receipt && !this.hasCompletionReceipt(reduction.state)) {
				await this.appendCompletionReceipt(reduction.state);
			}
		}
		this.options.onDurable(durableActivity);
		if (publish) this.options.publish();
		return durableActivity;
	}

	public async appendCompletionReceipt(run: ExecutionRunState): Promise<void> {
		const receipt = run.receipt;
		if (!receipt || this.hasCompletionReceipt(run)) return;
		const nativeRefs = { threadId: run.threadId, turnId: run.turnId };
		const payload = {
			method           : "execution/completion-receipt",
			receiptId        : receipt.receiptId,
			receiptDigest    : receipt.receiptDigest,
			checkpointDigest : receipt.checkpointDigest,
			receipt,
		};
		await this.append("progress", "completed", nativeRefs, payload, false, digestSource(stableJson({ kind: "progress", phase: "completed", nativeRefs, payload })));
	}

	private isVisible(activity: ProjectActivity): boolean {
		const visibleThreadId = this.options.visibleThreadId();
		return visibleThreadId
			? activity.nativeRefs.threadId === visibleThreadId
			: activity.sequence > this.options.visibleAfterSequence();
	}
}

function digestSource(source: string): string {
	return `sha256:${createHash("sha256").update(source).digest("hex")}`;
}

function immutable<T>(value: T): T {
	return deepFreeze(structuredClone(value));
}

function deepFreeze<T>(value: T): T {
	if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
	for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
	return Object.freeze(value);
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
