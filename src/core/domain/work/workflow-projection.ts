import type { ProjectActivity }                                  from "@/core/domain/execution/project-activity.js";
import { redactForExternalReview }                               from "@/core/domain/review/redaction.js";
import { sanitizeTerminalTextExcerpt }                           from "@/core/domain/execution/terminal.js";
import { classifyWorkActivity }                                  from "@/core/domain/work/activity-classification.js";
import type { ExecutionRunState }                                from "@/core/domain/execution/execution-run-contract.js";
import { readNativePlanRevision }                                from "@/core/domain/work/native-plan-revision.js";
import type { NativePlanRevisionValidationCode, WorkStepStatus } from "@/core/domain/work/native-plan-revision.js";

export type { WorkStepStatus } from "@/core/domain/work/native-plan-revision.js";

const MAX_PUBLIC_TEXT          = 1_200                                      ;
const DEFAULT_GOAL             = "현재 요청을 처리합니다."                  ;
const EMPTY_SUMMARY            = "의미 있는 실행 단계를 기다리고 있습니다." ;
const NARRATION_ACTIVITY_LIMIT = 8                                          ;
const FALLBACK_NARRATION: WorkStepNarration = {
	what         : "작업을 진행합니다.",
	why          : "요청을 안전하게 처리하고 결과를 확인하기 위해서입니다.",
	inputSummary : [],
	source       : "fallback",
};
/** Every trace relation is either backed by a native identifier or explicitly projected. */
export type TraceAttribution = "observed" | "inferred";
export type Sha256Hex = string;
export interface WorkStepNarration {
	readonly what         : string                        ;
	readonly why?         : string                        ;
	readonly inputSummary : readonly string[]             ;
	readonly source       : "model" | "plan" | "fallback" ;
}
export interface PlanProjectionInput {
	readonly expectedThreadKey : string    ;
	readonly selectedTurnId    : string    ;
	readonly hash              : DplanHash ;
}
export interface PendingGoalProjectionInput {
	readonly kind              : "pending-goal" ;
	readonly expectedThreadKey : string         ;
	readonly hash              : DplanHash      ;
}
export type WorkFlowProjectionInput =
	| PlanProjectionInput
	| PendingGoalProjectionInput;
export interface PlanRevisionRef {
	readonly sourceRevisionKeyDigest : Sha256Hex ;
	readonly activityId              : string    ;
	readonly sequence                : number    ;
	readonly sourceDigest            : string    ;
}
export interface DerivedPlanIdentity {
	readonly kind           : "deterministic-derived" ;
	readonly value          : Sha256Hex               ;
	readonly originRevision : PlanRevisionRef         ;
}
export interface NativePlanSource {
	readonly kind: "native-plan-derived";
	/** Public Plan documents remain displayable but never own executable Todo state. */
	readonly authority               : "native-checklist" | "public-plan-document" ;
	readonly expectedThreadKeyDigest : Sha256Hex                                   ;
	readonly turnId                  : string                                      ;
	readonly currentRevision         : PlanRevisionRef                             ;
	readonly algorithm               : "dplan-v1"                                  ;
}
export type PlanOrphanReason =
	| "pre_plan"
	| "no_unambiguous_running_item"
	| "deleted"
	| "ambiguous_duplicate"
	| "ambiguous_edit"
	| "replacement"
	| "invalid_revision"
	| "source_mismatch";
export type JournalIntegrityCode =
	| "duplicate_activity_id"
	| "duplicate_sequence"
	| "sequence_gap"
	| "invalid_source_digest"
	| "duplicate_revision_key";
export type RevisionValidationCode =
	| "source_turn_mismatch"
	| NativePlanRevisionValidationCode;
export type PlanRejection = {
	readonly kind                 : "journal_integrity"  ;
	readonly code                 : JournalIntegrityCode ;
	readonly offendingActivityId? : string               ;
	readonly offendingSequence?   : number               ;
} | {
	readonly kind       : "revision"             ;
	readonly code       : RevisionValidationCode ;
	readonly activityId : string                 ;
	readonly sequence   : number                 ;
};
export interface PlanAssociation {
	readonly attribution            : "inferred"        ;
	readonly activityIds            : readonly string[] ;
	readonly observationActivityIds : readonly string[] ;
	/** Each native Plan revision interval and the activities it permits. */
	readonly sources: ReadonlyArray<{
		readonly turnId                 : string            ;
		readonly startSequence          : number            ;
		readonly endSequence            : number | null     ;
		readonly activityIds            : readonly string[] ;
		readonly observationActivityIds : readonly string[] ;
	}>;
}
export interface PlanRetirement {
	readonly identity: DerivedPlanIdentity;
	readonly retiredBy: PlanRevisionRef;
	readonly reason:
		| "deleted"
		| "ambiguous_duplicate"
		| "ambiguous_edit"
		| "replacement";
}
export interface PlanOrphan {
	readonly activityId      : string                   ;
	readonly activityKind    : "action" | "observation" ;
	readonly reason          : PlanOrphanReason         ;
	readonly priorIdentity   : Sha256Hex | null         ;
	readonly currentRevision : PlanRevisionRef | null   ;
}
export type PlanReconciliation = {
	readonly kind: "minted";
	readonly evidence: {
		readonly kind                  : "mint"    ;
		readonly tokenDigest           : Sha256Hex ;
		readonly sourceRevisionOrdinal : number    ;
		readonly sourcePosition        : number    ;
	};
} | {
	readonly kind: "retained";
	readonly evidence: {
		readonly kind             : "exact_unique" | "isolated_edit" ;
		readonly previousIdentity : Sha256Hex                        ;
		readonly previousRevision : PlanRevisionRef                  ;
		readonly tokenDigest      : Sha256Hex                        ;
		readonly distance?        : number                           ;
		readonly limit?           : number                           ;
	};
};
export interface SemanticWorkStep {
	readonly id               : Sha256Hex              ;
	readonly identity         : DerivedPlanIdentity    ;
	readonly currentRevision  : PlanRevisionRef        ;
	readonly reconciliation   : PlanReconciliation     ;
	readonly association      : PlanAssociation | null ;
	readonly number           : number                 ;
	readonly title            : string                 ;
	readonly status           : WorkStepStatus         ;
	readonly activityIds      : readonly string[]      ;
	readonly observationCount : number                 ;
	readonly narration        : WorkStepNarration      ;
}
export interface WorkFlowProjection {
	readonly source            : NativePlanSource | null     ;
	readonly retirements       : readonly PlanRetirement[]   ;
	readonly orphans           : readonly PlanOrphan[]       ;
	readonly rejections        : readonly PlanRejection[]    ;
	readonly goal              : string                      ;
	readonly steps             : readonly SemanticWorkStep[] ;
	readonly completedCount    : number                      ;
	readonly currentStepNumber : number | null               ;
	readonly observationCount  : number                      ;
	readonly summary           : string                      ;
}
export interface DplanHash {
	sha256Hex(input: Uint8Array): Sha256Hex;
}
export class DplanIdentityCollisionError extends Error {
	constructor() {
		super("dplan identity collision");
		this.name = "DplanIdentityCollisionError";
	}
}
const encoder = new TextEncoder();
function frame(...parts: readonly (string | Uint8Array)[]): Uint8Array {
	const encoded = parts.map((part) => typeof part === "string" ? encoder.encode(part) : part);
	const output = new Uint8Array(
		encoded.reduce((size, part) => size + 4 + part.length, 0),
	);
	const view = new DataView(output.buffer);
	let offset = 0;
	for (const part of encoded) {
		view.setUint32(offset, part.length);
		offset += 4;
		output.set(part, offset);
		offset += part.length;
	}
	return output;
}
function decimal(value: number): string {
	if (!Number.isSafeInteger(value) || value < 0) {
		throw new Error("invalid dplan number");
	}
	return String(value);
}
function digest(
	hash: DplanHash,
	...parts: readonly (string | Uint8Array)[]
): string {
	return hash.sha256Hex(frame(...parts));
}
function revision(
	activity: ProjectActivity,
	threadDigest: string,
	hash: DplanHash,
): PlanRevisionRef {
	return {
		sourceRevisionKeyDigest: digest(
			hash,
			"dplan-v1",
			"source-revision",
			threadDigest,
			activity.id,
			decimal(activity.sequence),
			activity.sourceDigest,
		),
		activityId   : activity.id,
		sequence     : activity.sequence,
		sourceDigest : activity.sourceDigest,
	};
}
interface Entry {
	raw         : string         ;
	title       : string         ;
	status      : WorkStepStatus ;
	tokenDigest : string         ;
}
interface State {
	entry           : Entry               ;
	identity        : DerivedPlanIdentity ;
	currentRevision : PlanRevisionRef     ;
	reconciliation  : PlanReconciliation  ;
	association: {
		actions: string[];
		observations: string[];
		sources: {
			startSequence : number        ;
			endSequence   : number | null ;
			actions       : string[]      ;
			observations  : string[]      ;
		}[];
	};
	canonicalSeed: string;
}

type AssociationSource = State["association"]["sources"][number];

function emptyWorkFlow(rejections: readonly PlanRejection[] = []): WorkFlowProjection {
	return {
		source      : null,
		retirements : [],
		orphans     : [],
		rejections,
		goal              : DEFAULT_GOAL,
		steps             : [],
		completedCount    : 0,
		currentStepNumber : null,
		observationCount  : 0,
		summary           : EMPTY_SUMMARY,
	};
}

function pendingGoal(activities: readonly ProjectActivity[], expectedThreadKey: string): string {
	const activity = activities.findLast((candidate) =>
		candidate.nativeRefs.threadId === expectedThreadKey &&
		candidate.kind === "message" &&
		candidate.payload.direction === "outbound" &&
		typeof candidate.payload.text === "string"
	);
	const text = activity?.payload.text;
	return typeof text === "string" ? publicText(text) : DEFAULT_GOAL;
}

function selectedTurnActivities(
	activities: readonly ProjectActivity[],
	expectedThreadKey: string,
	selectedTurnId: string,
): { readonly interval: readonly ProjectActivity[]; readonly goal: string } | null {
	const start = activities.findIndex((activity) =>
		isTurnStart(activity) &&
		activity.nativeRefs.threadId === expectedThreadKey &&
		activity.nativeRefs.turnId === selectedTurnId
	);
	if (start < 0) return null;
	const end = activities.findIndex((activity, index) =>
		index > start &&
		isTurnStart(activity) &&
		activity.nativeRefs.threadId === expectedThreadKey &&
		typeof activity.nativeRefs.turnId === "string" &&
		activity.nativeRefs.turnId !== selectedTurnId
	);
	const goalActivity = activities.slice(0, start).findLast((activity) =>
		activity.nativeRefs.threadId === expectedThreadKey &&
		(activity.nativeRefs.turnId === undefined || activity.nativeRefs.turnId === selectedTurnId) &&
		activity.kind === "message" &&
		activity.payload.direction === "outbound" &&
		typeof activity.payload.text === "string"
	);
	return {
		interval: activities.slice(start, end < 0 ? activities.length : end),
		goal: typeof goalActivity?.payload.text === "string" ? publicText(goalActivity.payload.text) : DEFAULT_GOAL,
	};
}

function newAssociationSource(startSequence: number): AssociationSource {
	return { startSequence, endSequence: null, actions: [], observations: [] };
}

function associateActivity(state: State, source: AssociationSource, activity: ProjectActivity): void {
	const target = classifyWorkActivity(activity) === "action" ? "actions" : "observations";
	state.association[target].push(activity.id);
	source[target].push(activity.id);
}

function projectSteps(
	states: readonly State[],
	selectedTurnId: string,
	activities: readonly ProjectActivity[],
	narrations: ReadonlyMap<string, WorkStepNarration>,
): SemanticWorkStep[] {
	const activityById = new Map(activities.map((activity) => [activity.id, activity]));
	return states.map((state, index): SemanticWorkStep => ({
		id              : state.identity.value,
		identity        : state.identity,
		currentRevision : state.currentRevision,
		reconciliation  : state.reconciliation,
		association: state.association.actions.length || state.association.observations.length
			? {
				attribution            : "inferred",
				activityIds            : state.association.actions,
				observationActivityIds : state.association.observations,
				sources: state.association.sources.map((source) => ({
					turnId                 : selectedTurnId,
					startSequence          : source.startSequence,
					endSequence            : source.endSequence,
					activityIds            : source.actions,
					observationActivityIds : source.observations,
				})),
			}
			: null,
		number           : index + 1,
		title            : state.entry.title,
		status           : state.entry.status,
		activityIds      : state.association.actions,
		observationCount : state.association.observations.length,
		narration: narration(
			narrations.get(state.identity.value),
			state.entry.title,
			[...state.association.actions, ...state.association.observations]
				.slice(-NARRATION_ACTIVITY_LIMIT)
				.flatMap((id) => activitySummary(activityById.get(id))),
		),
	}));
}

type PlanRevision = ReturnType<typeof readNativePlanRevision>;
type ValidPlanRevision = Extract<PlanRevision, { readonly kind: "valid-plan-revision" }>;

class PlanScan {
	public readonly retirements : PlanRetirement[]       = []   ;
	public readonly orphans     : PlanOrphan[]           = []   ;
	public current              : State[]                = []   ;
	public currentRevision      : PlanRevisionRef | null = null ;

	private invalid        = false                     ;
	private ordinal        = 0                         ;
	private readonly seeds = new Map<string, string>() ;

	public constructor(
		private readonly interval: readonly ProjectActivity[],
		private readonly input: PlanProjectionInput,
		private readonly threadDigest: string,
		private readonly rejections: PlanRejection[],
	) {}

	public accept(activity: ProjectActivity): void {
		const planRevision = readNativePlanRevision(activity);
		if (planRevision.kind === "not-plan-revision") this.acceptObservedActivity(activity);
		else this.acceptPlanRevision(activity, planRevision);
	}

	private acceptPlanRevision(activity: ProjectActivity, planRevision: Exclude<PlanRevision, { readonly kind: "not-plan-revision" }>): void {
		if (activity.nativeRefs.threadId !== this.input.expectedThreadKey || activity.nativeRefs.turnId !== this.input.selectedTurnId) {
			this.rejections.push({ kind: "revision", code: "source_turn_mismatch", activityId: activity.id, sequence: activity.sequence });
			return;
		}
		if (planRevision.kind === "invalid-plan-revision") {
			this.rejections.push({ kind: "revision", code: planRevision.code, activityId: activity.id, sequence: activity.sequence });
			this.invalid = true;
			return;
		}
		this.applyValidRevision(activity, planRevision);
	}

	private applyValidRevision(activity: ProjectActivity, planRevision: ValidPlanRevision): void {
		const entries: Entry[] = planRevision.entries.map((entry) => ({
			raw         : entry.identityText,
			title       : publicText(entry.sourceTitle),
			status      : entry.status,
			tokenDigest : digest(this.input.hash, entry.identityText),
		}));
		this.invalid = false;
		const firstRevision = this.currentRevision === null;
		this.ordinal += 1;
		const nextRevision = revision(activity, this.threadDigest, this.input.hash);
		this.closeAssociationSources(nextRevision.sequence);
		this.current = reconcile(
			this.current,
			entries,
			nextRevision,
			this.ordinal,
			this.threadDigest,
			this.input.hash,
			this.retirements,
			this.orphans,
			this.seeds,
		);
		this.currentRevision = nextRevision;
		if (activity.payload.method === "turn/plan/public-fallback" || firstRevision) {
			this.associatePrecedingActivities(activity, nextRevision, firstRevision);
		}
	}

	private closeAssociationSources(endSequence: number): void {
		for (const state of this.current) {
			for (const source of state.association.sources) {
				if (source.endSequence === null) source.endSequence = endSequence;
			}
		}
	}

	private associatePrecedingActivities(activity: ProjectActivity, revisionRef: PlanRevisionRef, firstRevision: boolean): void {
		const sourceActivityId = activity.payload.sourceActivityId;
		const sourceActivity = typeof sourceActivityId === "string"
			? this.interval.find(candidate => candidate.id === sourceActivityId)
			: firstRevision ? this.interval.find(isTurnStart) : undefined;
		const running           = this.current.filter(state => state.entry.status === "running")                                             ;
		const missingPlan       = activity.payload.source === "public-user-request"                                                          ;
		const associationTarget = running.length === 1 ? running[0] : missingPlan && this.current.length === 1 ? this.current[0] : undefined ;
		if (!sourceActivity || !associationTarget) return;

		const associationSource = newAssociationSource(revisionRef.sequence);
		for (const candidate of this.interval) {
			if (candidate.sequence <= sourceActivity.sequence || candidate.sequence >= activity.sequence) continue;
			if (candidate.nativeRefs.threadId !== this.input.expectedThreadKey || candidate.nativeRefs.turnId !== this.input.selectedTurnId) continue;
			if (classifyWorkActivity(candidate) === "control") continue;
			const orphanIndex = this.orphans.findIndex(orphan => orphan.activityId === candidate.id);
			if (orphanIndex >= 0) this.orphans.splice(orphanIndex, 1);
			associateActivity(associationTarget, associationSource, candidate);
		}
		if (associationSource.actions.length > 0 || associationSource.observations.length > 0) {
			associationTarget.association.sources.push(associationSource);
		}
	}

	private acceptObservedActivity(activity: ProjectActivity): void {
		const kind = classifyWorkActivity(activity);
		if (kind === "control") return;
		if (activity.nativeRefs.threadId !== this.input.expectedThreadKey || activity.nativeRefs.turnId !== this.input.selectedTurnId) {
			this.emitOrphan(activity, "source_mismatch");
			return;
		}
		if (this.invalid) {
			this.emitOrphan(activity, "invalid_revision");
			return;
		}
		const running = this.current.filter(state => state.entry.status === "running");
		const state = running.length === 1 ? running[0] : undefined;
		if (!this.currentRevision) this.emitOrphan(activity, "pre_plan");
		else if (!state) this.emitOrphan(activity, "no_unambiguous_running_item");
		else {
			let source = state.association.sources.at(-1);
			if (!source || source.startSequence !== this.currentRevision.sequence) {
				source = newAssociationSource(this.currentRevision.sequence);
				state.association.sources.push(source);
			}
			associateActivity(state, source, activity);
		}
	}

	private emitOrphan(activity: ProjectActivity, reason: PlanOrphanReason, state?: State): void {
		const kind = classifyWorkActivity(activity);
		if (kind === "control") return;
		this.orphans.push({
			activityId: activity.id,
			activityKind: kind,
			reason,
			priorIdentity: state?.identity.value ?? null,
			currentRevision: state?.currentRevision ?? this.currentRevision,
		});
	}
}

export function projectWorkFlow(
	activities: readonly ProjectActivity[],
	narrations: ReadonlyMap<string, WorkStepNarration> = new Map(),
	input?: WorkFlowProjectionInput,
): WorkFlowProjection {
	if (!input) return emptyWorkFlow();
	if ("kind" in input) {
		return { ...emptyWorkFlow(), goal: pendingGoal(activities, input.expectedThreadKey) };
	}
	const checked = validateJournal(
		activities,
		input.expectedThreadKey,
		input.hash,
	);
	const rejections : PlanRejection[] = checked.rejection ? [checked.rejection] : []                                        ;
	const selectedTurnId               = input.selectedTurnId                                                                ;
	const selectedTurn                 = selectedTurnActivities(checked.activities, input.expectedThreadKey, selectedTurnId) ;
	if (!selectedTurn) return emptyWorkFlow(rejections);
	const { interval, goal } = selectedTurn;
	const threadDigest = digest(
		input.hash,
		"dplan-v1",
		"native-thread",
		input.expectedThreadKey,
	);
	const scan = new PlanScan(interval, input, threadDigest, rejections);
	for (const activity of interval) scan.accept(activity);
	const steps = projectSteps(scan.current, selectedTurnId, checked.activities, narrations);
	const completedCount = steps.filter((step) => step.status === "completed").length;
	const currentStep = steps.find((step) => step.status === "running") ??
		steps.find((step) => step.status === "pending") ?? null;
	return {
		source: scan.currentRevision
			? {
				kind: "native-plan-derived",
				authority: isPublicPlanRevision(scan.currentRevision.activityId, interval)
					? "public-plan-document"
					: "native-checklist",
				expectedThreadKeyDigest : threadDigest,
				turnId                  : selectedTurnId,
				currentRevision         : scan.currentRevision,
				algorithm               : "dplan-v1",
			}
			: null,
		retirements: scan.retirements,
		orphans: scan.orphans,
		rejections,
		goal,
		steps,
		completedCount,
		currentStepNumber: currentStep?.number ?? null,
		observationCount: steps.reduce(
			(count, step) => count + step.observationCount,
			0,
		),
		summary: steps.length
			? `${completedCount}/${steps.length} 단계를 완료했습니다.`
			: EMPTY_SUMMARY,
	};
}

function isPublicPlanRevision(activityId: string, activities: readonly ProjectActivity[]): boolean {
	return activities.find((activity) => activity.id === activityId)?.payload.method === "turn/plan/public-fallback";
}

/**
 * Compatibility projection for consumers that still require the dplan-v1 trace
 * shape. ExecutionRunState owns event ordering; this adapter only projects its
 * durable activity evidence.
 */
export function projectWorkFlowFromExecutionRun(
	run: ExecutionRunState,
	narrations: ReadonlyMap<string, WorkStepNarration> = new Map(),
	input?: WorkFlowProjectionInput,
	/** The append-only journal supplies global sequence integrity and foreign-run context. */
	journalActivities: readonly ProjectActivity[] = run.activities,
): WorkFlowProjection {
	return projectWorkFlow(journalActivities, narrations, input);
}

function validateJournal(
	activities: readonly ProjectActivity[],
	expectedThreadKey: string,
	hash: DplanHash,
): { activities: ProjectActivity[]; rejection?: PlanRejection } {
	const accepted: ProjectActivity[] = [],
		ids = new Set<string>(),
		sequences = new Set<number>(),
		revisionKeys = new Set<string>();
	let expected = 1;
	const threadDigest = digest(
		hash,
		"dplan-v1",
		"native-thread",
		expectedThreadKey,
	);
	for (const activity of activities) {
		let code: JournalIntegrityCode | undefined;
		if (ids.has(activity.id)) code = "duplicate_activity_id";
		else if (sequences.has(activity.sequence)) code = "duplicate_sequence";
		else if (activity.sequence !== expected) code = "sequence_gap";
		else if (!/^sha256:[0-9a-f]{64}$/u.test(activity.sourceDigest)) {
			code = "invalid_source_digest";
		} else if (readNativePlanRevision(activity).kind === "valid-plan-revision") {
			const key = revision(activity, threadDigest, hash).sourceRevisionKeyDigest;
			if (revisionKeys.has(key)) code = "duplicate_revision_key";
			else revisionKeys.add(key);
		}
		if (code) {
			return {
				activities: accepted,
				rejection: {
					kind: "journal_integrity",
					code,
					offendingActivityId: activity.id,
					offendingSequence: activity.sequence,
				},
			};
		}
		ids.add(activity.id);
		sequences.add(activity.sequence);
		expected += 1;
		accepted.push(activity);
	}
	return { activities: accepted };
}

function reconcile(
	old: State[],
	next: Entry[],
	ref: PlanRevisionRef,
	ordinal: number,
	threadDigest: string,
	hash: DplanHash,
	retirements: PlanRetirement[],
	orphans: PlanOrphan[],
	seeds: Map<string, string>,
): State[] {
	for (const state of old) {
		const known = seeds.get(state.identity.value);
		if (known !== undefined && known !== state.canonicalSeed) {
			throw new DplanIdentityCollisionError();
		}
		seeds.set(state.identity.value, state.canonicalSeed);
	}
	const oldCounts = count(old.map((state) => state.entry.tokenDigest));
	const nextCounts = count(next.map((entry) => entry.tokenDigest));
	const blocked = collisionTitles([
		...old.map((state) => state.entry),
		...next,
	]);
	const matches = new Map<number, number>();
	for (let oldIndex = 0; oldIndex < old.length; oldIndex++) {
		const state = old[oldIndex];
		if (!state) throw new Error("invalid prior Plan state index");
		if (
			oldCounts.get(state.entry.tokenDigest) !== 1 ||
			blocked.has(state.entry.title)
		) continue;
		const newIndex = next.findIndex((entry, index) =>
			!matches.has(index) && entry.tokenDigest === state.entry.tokenDigest &&
			nextCounts.get(entry.tokenDigest) === 1 && !blocked.has(entry.title)
		);
		if (newIndex >= 0) matches.set(newIndex, oldIndex);
	}
	let unmatchedOld = old.map((_, index) => index).filter((index) => ![...matches.values()].includes(index));
	let unmatchedNew = next.map((_, index) => index).filter((index) => !matches.has(index));
	if (unmatchedOld.length === 1 && unmatchedNew.length === 1) {
		const priorIndex     = unmatchedOld[0]                                                 ;
		const candidateIndex = unmatchedNew[0]                                                 ;
		const prior          = priorIndex === undefined ? undefined : old[priorIndex]          ;
		const candidate      = candidateIndex === undefined ? undefined : next[candidateIndex] ;
		if (prior
			&& candidate
			&& !blocked.has(prior.entry.title)
			&& !blocked.has(candidate.title)) {
			const maxLength = Math.max(
				[...prior.entry.raw].length,
				[...candidate.raw].length,
			);
			const limit = Math.min(8, Math.max(1, Math.floor(maxLength * .2)));
			const distance = lev(prior.entry.raw, candidate.raw, limit);
			if (distance <= limit && distance / maxLength <= .2) {
				matches.set(candidateIndex, priorIndex);
			}
		}
	}
	unmatchedOld = old.map((_, index) => index).filter((index) => ![...matches.values()].includes(index));
	unmatchedNew = next.map((_, index) => index).filter((index) => !matches.has(index));
	for (const index of unmatchedOld) {
		const state = old[index];
		if (!state) throw new Error("invalid retired Plan state index");
		const duplicate = (oldCounts.get(state.entry.tokenDigest) ?? 0) > 1 ||
			(nextCounts.get(state.entry.tokenDigest) ?? 0) > 1 ||
			blocked.has(state.entry.title);
		const hasEditCandidate = unmatchedNew.some((newIndex) => {
			const entry = next[newIndex];
			return entry ? isEditLike(state.entry.raw, entry.raw) : false;
		});
		const reason: PlanRetirement["reason"] = unmatchedNew.length === 0
			? "deleted"
			: duplicate
			? "ambiguous_duplicate"
			: hasEditCandidate
			? "ambiguous_edit"
			: "replacement";
		retirements.push({ identity: state.identity, retiredBy: ref, reason });
		for (const activityId of state.association.actions) {
			orphans.push({
				activityId,
				activityKind: "action",
				reason,
				priorIdentity: state.identity.value,
				currentRevision: ref,
			});
		}
		for (const activityId of state.association.observations) {
			orphans.push({
				activityId,
				activityKind: "observation",
				reason,
				priorIdentity: state.identity.value,
				currentRevision: ref,
			});
		}
	}
	return next.map((entry, sourcePosition) => {
		const oldIndex = matches.get(sourcePosition);
		if (oldIndex !== undefined) {
			const state = old[oldIndex];
			if (!state) throw new Error("invalid retained Plan state index");
			const exact = state.entry.tokenDigest === entry.tokenDigest;
			const maxLength = Math.max(
				[...state.entry.raw].length,
				[...entry.raw].length,
			);
			const limit = Math.min(8, Math.max(1, Math.floor(maxLength * .2)));
			return {
				...state,
				entry,
				currentRevision: ref,
				reconciliation: {
					kind: "retained",
					evidence: exact
						? {
							kind             : "exact_unique",
							previousIdentity : state.identity.value,
							previousRevision : state.currentRevision,
							tokenDigest      : entry.tokenDigest,
						}
						: {
							kind             : "isolated_edit",
							previousIdentity : state.identity.value,
							previousRevision : state.currentRevision,
							tokenDigest      : entry.tokenDigest,
							distance         : lev(state.entry.raw, entry.raw, limit),
							limit,
						},
				},
			};
		}
		const nonce = frame(
			"source-revision-ordinal",
			decimal(ordinal),
			"source-position",
			decimal(sourcePosition),
		);
		const value = digest(
			hash,
			"dplan-v1",
			"plan-item",
			threadDigest,
			ref.sourceRevisionKeyDigest,
			entry.tokenDigest,
			nonce,
		);
		const seed = `${ref.sourceRevisionKeyDigest}:${entry.tokenDigest}:${ordinal}:${sourcePosition}`;
		const known = seeds.get(value);
		if (known !== undefined && known !== seed) {
			throw new DplanIdentityCollisionError();
		}
		seeds.set(value, seed);
		const identity: DerivedPlanIdentity = {
			kind: "deterministic-derived",
			value,
			originRevision: ref,
		};
		return {
			entry,
			identity,
			currentRevision: ref,
			reconciliation: {
				kind: "minted",
				evidence: {
					kind                  : "mint",
					tokenDigest           : entry.tokenDigest,
					sourceRevisionOrdinal : ordinal,
					sourcePosition,
				},
			},
			association: { actions: [], observations: [], sources: [] },
			canonicalSeed: seed,
		};
	});
}
function collisionTitles(entries: Entry[]): Set<string> {
	const values = new Map<string, Set<string>>();
	for (const entry of entries) {
		const set = values.get(entry.title) ?? new Set<string>();
		set.add(entry.tokenDigest);
		values.set(entry.title, set);
	}
	return new Set(
		[...values].filter(([, digests]) => digests.size > 1).map(([title]) => title),
	);
}
function narration(
	value: WorkStepNarration | undefined,
	title: string,
	inputSummary: readonly string[],
): WorkStepNarration {
	if (!value) return { what: title, inputSummary, source: "plan" };
	return technicalNarration(value.what) ||
			value.why && technicalNarration(value.why)
		? FALLBACK_NARRATION
		: value;
}
function activitySummary(activity: ProjectActivity | undefined): string[] {
	if (!activity) return [];
	const params = record(activity.payload.params);
	const item = record(params?.item) ?? params;
	if (!item) return [];
	if (item.arguments && typeof item.arguments === "object") {
		return [`args: ${publicText(JSON.stringify(item.arguments))}`];
	}
	const value = typeof item.command === "string"
		? item.command
		: typeof item.tool === "string"
		? item.tool
		: typeof item.toolName === "string"
		? item.toolName
		: activity.payload.method;
	return typeof value === "string" ? [publicText(value)] : [];
}
function technicalNarration(value: string): boolean {
	return /`|\b(?:command|cmd|args?|input|path)\s*[:=]/iu.test(value) ||
		/(?:^|[\s;|&])\$?\s*(?:apply_patch|bash|bun|cat|cd|find|git|grep|node|npm|npx|pnpm|python|rg|sed|sh|yarn)\b/iu
			.test(value) ||
		/(?:^|[\s"'`])(?:[~/][A-Za-z0-9_.-]+(?:[\\/][A-Za-z0-9_.-]+)*|\.{1,2}[\\/]|[A-Za-z0-9_-]+(?:[\\/][A-Za-z0-9_.-]+)+)/u
			.test(value) ||
		/\b[A-Za-z0-9_-]+\.(?:cjs|css|go|html|java|js|json|jsx|md|mjs|py|rb|rs|sh|sql|toml|ts|tsx|yaml|yml|zsh)\b/iu
			.test(value) ||
		/(?:^|\s)--[A-Za-z0-9_-]+/u.test(value);
}
function count(values: string[]): Map<string, number> {
	const counts = new Map<string, number>();
	for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
	return counts;
}
function lev(left: string, right: string, limit = 8): number {
	const a = [...left], b = [...right];
	if (Math.abs(a.length - b.length) > limit) return limit + 1;
	let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
	for (let i = 0; i < a.length; i++) {
		const next = [i + 1];
		let minimum = next[0] ?? 0;
		for (let j = 0; j < b.length; j++) {
			const leftDistance     = next[j]         ;
			const upperDistance    = previous[j + 1] ;
			const diagonalDistance = previous[j]     ;
			if (leftDistance === undefined || upperDistance === undefined || diagonalDistance === undefined) {
				throw new Error("invalid edit-distance matrix index");
			}
			const value = Math.min(
				leftDistance + 1,
				upperDistance + 1,
				diagonalDistance + (a[i] === b[j] ? 0 : 1),
			);
			next.push(value);
			minimum = Math.min(minimum, value);
		}
		if (minimum > limit) return limit + 1;
		previous = next;
	}
	return previous.at(-1) ?? 0;
}
function isEditLike(left: string, right: string): boolean {
	const maxLength = Math.max([...left].length, [...right].length)        ;
	const limit     = Math.min(8, Math.max(1, Math.floor(maxLength * .2))) ;
	const distance  = lev(left, right, limit)                              ;
	return distance <= limit && distance / maxLength <= .2;
}
function isTurnStart(activity: ProjectActivity): boolean {
	return activity.payload.method === "turn/start" ||
		activity.payload.method === "turn/started";
}
function record(value: unknown): Readonly<Record<string, unknown>> | undefined {
	return value && typeof value === "object" && !Array.isArray(value)
		? Object.fromEntries(Object.entries(value))
		: undefined;
}
function publicText(value: string): string {
	return redactForExternalReview(
		sanitizeTerminalTextExcerpt(value, MAX_PUBLIC_TEXT, "head-tail"),
	).text.trim();
}
