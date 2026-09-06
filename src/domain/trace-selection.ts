import type { ProjectActivity, ProjectActivityNativeRefs } from "./project-activity.js";
import type { WorkFlowProjection } from "./work-steps.js";

export interface TraceSelectionCoverage {
	readonly mode: "fresh" | "partial-local-journal";
	readonly processAttachedAt: string;
	readonly priorProviderHistoryHydrated: false;
	readonly observedActivityCount: number;
	readonly observedSequenceFrom: number | null;
	readonly observedSequenceThrough: number | null;
}

export type TraceSelectionFailureCode =
	| "activity_not_found"
	| "outside_observed_journal"
	| "duplicate_activity_id"
	| "no_execution_context"
	| "thread_mismatch"
	| "plan_unavailable"
	| "missing_turn_ref"
	| "missing_item_ref"
	| "turn_mismatch"
	| "plan_membership_mismatch"
	| "ambiguous_plan_association";

export interface TraceSelectionFailure {
	readonly code: TraceSelectionFailureCode;
	readonly activityId: string;
	readonly expected?: Readonly<ProjectActivityNativeRefs>;
	readonly actual?: Readonly<ProjectActivityNativeRefs>;
}

export type ActivitySelectionResult = {
	readonly state: "selected";
	readonly identity: {
		readonly activityId: string;
		readonly threadId: string | null;
		readonly turnId: string | null;
		readonly itemId: string | null;
	};
	readonly attribution: {
		readonly identity: "observed";
		readonly planAssociation: "inferred" | null;
	};
	readonly planItemId: string | null;
	readonly coverage: TraceSelectionCoverage;
} | {
	readonly state: "failed";
	readonly failure: TraceSelectionFailure;
	readonly coverage: TraceSelectionCoverage;
};

export interface SelectionCoverageInput {
	readonly mode: "fresh" | "partial-local-journal";
	readonly processAttachedAt: string;
	readonly priorProviderHistoryHydrated: false;
}

export interface ActivitySelectionInput {
	readonly activityId: string;
	readonly activities: readonly ProjectActivity[];
	readonly currentThreadId: string | null;
	readonly resumeCoverage: SelectionCoverageInput;
}

export interface TraceSelectionInput extends ActivitySelectionInput {
	readonly workFlow: WorkFlowProjection;
}

/**
 * Resolves one exact ProjectActivity and preserves its observed Native identity.
 * It never substitutes another activity by item id, title, ordinal, or recency.
 * @linear WOO-705 4738e3c5-c5b3-4cc2-9cea-ff9bf600367d
 */
export function resolveActivitySelection(input: ActivitySelectionInput): ActivitySelectionResult {
	const coverage = selectionCoverage(input);
	const matches = input.activities.filter((activity) => activity.id === input.activityId);
	if (matches.length === 0) {
		return failed(
			input.activityId,
			input.resumeCoverage.mode === "partial-local-journal" ? "outside_observed_journal" : "activity_not_found",
			coverage,
		);
	}
	if (matches.length !== 1) return failed(input.activityId, "duplicate_activity_id", coverage);
	const activity = matches[0]!;
	if (input.currentThreadId && activity.nativeRefs.threadId !== input.currentThreadId) {
		return failed(input.activityId, "thread_mismatch", coverage, { threadId: input.currentThreadId }, activity.nativeRefs);
	}
	return selected(activity, coverage, null, null);
}

/** Resolves an exact activity only when it belongs to the selected Plan execution. */
export function resolveTraceSelection(input: TraceSelectionInput): ActivitySelectionResult {
	const direct = resolveActivitySelection(input);
	if (direct.state === "failed") return direct;
	const coverage = direct.coverage;
	const activity = input.activities.find((candidate) => candidate.id === input.activityId)!;
	if (!input.currentThreadId) return failed(input.activityId, "no_execution_context", coverage);
	if (!input.workFlow.source) return failed(input.activityId, "plan_unavailable", coverage);
	if (!activity.nativeRefs.turnId) {
		return failed(input.activityId, "missing_turn_ref", coverage, { threadId: input.currentThreadId, turnId: input.workFlow.source.turnId }, activity.nativeRefs);
	}
	if (!activity.nativeRefs.itemId) {
		return failed(input.activityId, "missing_item_ref", coverage, { threadId: input.currentThreadId, turnId: input.workFlow.source.turnId }, activity.nativeRefs);
	}
	if (activity.nativeRefs.turnId !== input.workFlow.source.turnId) {
		return failed(
			input.activityId,
			"turn_mismatch",
			coverage,
			{ threadId: input.currentThreadId, turnId: input.workFlow.source.turnId },
			activity.nativeRefs,
		);
	}
	const associatedSteps = input.workFlow.steps.filter((step) => step.association?.sources.some((source) =>
		source.turnId === activity.nativeRefs.turnId
		&& (source.activityIds.includes(input.activityId) || source.observationActivityIds.includes(input.activityId)),
	));
	if (associatedSteps.length === 0) {
		return failed(input.activityId, "plan_membership_mismatch", coverage, {
			threadId: input.currentThreadId,
			turnId: input.workFlow.source.turnId,
			itemId: activity.nativeRefs.itemId,
		}, activity.nativeRefs);
	}
	if (associatedSteps.length !== 1) return failed(input.activityId, "ambiguous_plan_association", coverage);
	return selected(activity, coverage, associatedSteps[0]!.id, "inferred");
}

function selectionCoverage(input: ActivitySelectionInput): TraceSelectionCoverage {
	const observed = input.currentThreadId
		? input.activities.filter((activity) => activity.nativeRefs.threadId === input.currentThreadId)
		: input.activities;
	const sequences = observed.map((activity) => activity.sequence);
	return Object.freeze({
		...input.resumeCoverage,
		observedActivityCount: observed.length,
		observedSequenceFrom: sequences.length ? Math.min(...sequences) : null,
		observedSequenceThrough: sequences.length ? Math.max(...sequences) : null,
	});
}

function selected(
	activity: ProjectActivity,
	coverage: TraceSelectionCoverage,
	planItemId: string | null,
	planAssociation: "inferred" | null,
): ActivitySelectionResult {
	return Object.freeze({
		state: "selected",
		identity: Object.freeze({
			activityId: activity.id,
			threadId: activity.nativeRefs.threadId ?? null,
			turnId: activity.nativeRefs.turnId ?? null,
			itemId: activity.nativeRefs.itemId ?? null,
		}),
		attribution: Object.freeze({ identity: "observed", planAssociation }),
		planItemId,
		coverage,
	});
}

function failed(
	activityId: string,
	code: TraceSelectionFailureCode,
	coverage: TraceSelectionCoverage,
	expected?: Readonly<ProjectActivityNativeRefs>,
	actual?: Readonly<ProjectActivityNativeRefs>,
): ActivitySelectionResult {
	return Object.freeze({
		state: "failed",
		failure: Object.freeze({ code, activityId, ...(expected ? { expected } : {}), ...(actual ? { actual } : {}) }),
		coverage,
	});
}
