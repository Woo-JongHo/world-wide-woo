import type { ProjectActivity } from "../../domain/execution/project-activity.js";
import type { ExecutionHash, ExecutionRunState } from "../../domain/execution/execution-run-contract.js";
import { createExecutionRun, normalizeProjectActivity, reduceExecutionRun, replayExecutionRun, replayLegacyExecutionRunForVerification, replayV2ExecutionRunForVerification } from "../../runtime/execution-run.js";

/** Owns execution replay and receipt authentication, independent of the workbench UI. */
export class ExecutionJournal {
	private readonly runs = new Map<string, ExecutionRunState>();
	constructor(private readonly hash: ExecutionHash, private readonly canonical: (value: unknown) => string) {}
	get(runId: string): ExecutionRunState | undefined { return this.runs.get(runId); }
	values(): IterableIterator<ExecutionRunState> { return this.runs.values(); }
	observe(activity: ProjectActivity, journal: readonly ProjectActivity[]): { state: ExecutionRunState; accepted: boolean } | null {
		if (!activity.nativeRefs.threadId || !activity.nativeRefs.turnId) return null;
		const event = normalizeProjectActivity(activity);
		const current = this.runs.get(event.runId) ?? createExecutionRun({ runId: event.runId, threadId: event.threadId, turnId: event.turnId, hash: this.hash });
		const reduction = reduceExecutionRun(current, event, this.hash, { journalActivities: journal });
		this.runs.set(event.runId, reduction.state);
		return reduction;
	}
	/** Bad receipts are quarantined for read-only inspection; they are never repaired or trusted. */
	restore(journal: readonly ProjectActivity[]): readonly string[] {
		const restored = new Set<string>(), invalid = new Set<string>(), issues: string[] = [];
		for (const activity of journal) {
			if (activity.payload.method !== "execution/completion-receipt") continue;
			const { threadId, turnId } = activity.nativeRefs;
			const runId = `${threadId}:${turnId}`;
			try {
				const stored = asRecord(activity.payload.receipt);
				if (!stored || !threadId || !turnId) throw new Error("저장된 실행 Receipt 형식을 확인할 수 없습니다.");
				if (restored.has(runId)) throw new Error("실행 Receipt가 중복되어 원본을 확인할 수 없습니다.");
				restored.add(runId);
				const version = stored.algorithmVersion;
				if (version !== undefined && version !== 2 && version !== 3 || version === undefined && stored.commandResults !== undefined) throw new Error("지원하지 않는 실행 Receipt 버전입니다.");
				const terminalSource = asRecord(stored.terminalSource);
				const terminalSequence = terminalSource?.sequence;
				const terminal = Number.isSafeInteger(terminalSequence) ? journal.find(candidate => candidate.sequence === terminalSequence) : undefined;
				if (!terminal || terminal.sequence >= activity.sequence || terminal.id !== terminalSource?.id || terminal.sourceDigest !== terminalSource?.sourceDigest
					|| terminal.nativeRefs.threadId !== threadId || terminal.nativeRefs.turnId !== turnId) throw new Error("저장된 실행 Receipt의 종료 원본을 확인할 수 없습니다.");
				const prefix = journal.filter(candidate => candidate.sequence <= terminal.sequence);
				const observations = prefix.filter(candidate => candidate.nativeRefs.threadId === threadId && candidate.nativeRefs.turnId === turnId && candidate.payload.method !== "execution/completion-receipt");
				const initial = createExecutionRun({ runId, threadId, turnId, hash: this.hash });
				const events = observations.map(normalizeProjectActivity);
				const run = version === undefined ? replayLegacyExecutionRunForVerification(initial, events, this.hash)
					: version === 2 ? replayV2ExecutionRunForVerification(initial, events, this.hash)
						: replayExecutionRun(initial, events, this.hash, { journalActivities: prefix });
				if (!run.receipt || this.canonical(run.receipt) !== this.canonical(stored)) throw new Error("저장된 실행 Receipt와 원본 관측이 일치하지 않습니다.");
				this.runs.set(runId, run);
			} catch (error) {
				invalid.add(runId);
				issues.push(`${activity.id}: ${error instanceof Error ? error.message : "실행 기록을 확인할 수 없습니다."}`);
			}
		}
		for (const runId of invalid) {
			const run = this.runs.get(runId);
			if (run) this.runs.set(runId, { ...run, phase: "reconciling", waitReason: "unknown", receipt: null });
		}
		return issues;
	}
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> | null {
	return value && typeof value === "object" && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : null;
}
