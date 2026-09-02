import type { ProjectActivity } from "./project-activity.js";
import { redactForExternalReview } from "./redaction.js";
import { sanitizeTerminalTextExcerpt } from "./terminal.js";

const MAX_PUBLIC_TEXT = 1_200;
const FALLBACK_NARRATION: WorkStepNarration = {
	what: "작업을 진행합니다.",
	why: "요청을 안전하게 처리하고 결과를 확인하기 위해서입니다.",
	inputSummary: [],
	source: "fallback",
};
export type WorkActivityClass = "observation" | "action" | "control";
/** Every trace relation is either backed by a native identifier or explicitly projected. */
export type TraceAttribution = "observed" | "inferred";
export type WorkStepStatus =
	| "pending"
	| "running"
	| "completed"
	| "failed"
	| "cancelled";
export type Sha256Hex = string;
export interface WorkStepNarration {
	readonly what: string;
	readonly why?: string;
	readonly inputSummary: readonly string[];
	readonly source: "model" | "plan" | "fallback";
}
export interface PlanProjectionInput {
	readonly expectedThreadKey: string;
	readonly selectedTurnId: string;
	readonly hash: DplanHash;
}
export interface PendingGoalProjectionInput {
	readonly kind: "pending-goal";
	readonly expectedThreadKey: string;
	readonly hash: DplanHash;
}
export type WorkFlowProjectionInput =
	| PlanProjectionInput
	| PendingGoalProjectionInput;
export interface PlanRevisionRef {
	readonly sourceRevisionKeyDigest: Sha256Hex;
	readonly activityId: string;
	readonly sequence: number;
	readonly sourceDigest: string;
}
export interface DerivedPlanIdentity {
	readonly kind: "deterministic-derived";
	readonly value: Sha256Hex;
	readonly originRevision: PlanRevisionRef;
}
export interface NativePlanSource {
	readonly kind: "native-plan-derived";
	readonly expectedThreadKeyDigest: Sha256Hex;
	readonly turnId: string;
	readonly currentRevision: PlanRevisionRef;
	readonly algorithm: "dplan-v1";
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
	| "non_string_entry"
	| "blank_entry";
export type PlanRejection = {
	readonly kind: "journal_integrity";
	readonly code: JournalIntegrityCode;
	readonly offendingActivityId?: string;
	readonly offendingSequence?: number;
} | {
	readonly kind: "revision";
	readonly code: RevisionValidationCode;
	readonly activityId: string;
	readonly sequence: number;
};
export interface PlanAssociation {
	readonly attribution: "inferred";
	readonly activityIds: readonly string[];
	readonly observationActivityIds: readonly string[];
	/** Each native Plan revision interval and the activities it permits. */
	readonly sources: ReadonlyArray<{
		readonly turnId: string;
		readonly startSequence: number;
		readonly endSequence: number | null;
		readonly activityIds: readonly string[];
		readonly observationActivityIds: readonly string[];
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
	readonly activityId: string;
	readonly activityKind: "action" | "observation";
	readonly reason: PlanOrphanReason;
	readonly priorIdentity: Sha256Hex | null;
	readonly currentRevision: PlanRevisionRef | null;
}
export type PlanReconciliation = {
	readonly kind: "minted";
	readonly evidence: {
		readonly kind: "mint";
		readonly tokenDigest: Sha256Hex;
		readonly sourceRevisionOrdinal: number;
		readonly sourcePosition: number;
	};
} | {
	readonly kind: "retained";
	readonly evidence: {
		readonly kind: "exact_unique" | "isolated_edit";
		readonly previousIdentity: Sha256Hex;
		readonly previousRevision: PlanRevisionRef;
		readonly tokenDigest: Sha256Hex;
		readonly distance?: number;
		readonly limit?: number;
	};
};
export interface SemanticWorkStep {
	readonly id: Sha256Hex;
	readonly identity: DerivedPlanIdentity;
	readonly currentRevision: PlanRevisionRef;
	readonly reconciliation: PlanReconciliation;
	readonly association: PlanAssociation | null;
	readonly number: number;
	readonly title: string;
	readonly status: WorkStepStatus;
	readonly activityIds: readonly string[];
	readonly observationCount: number;
	readonly narration: WorkStepNarration;
}
export interface WorkFlowProjection {
	readonly source: NativePlanSource | null;
	readonly retirements: readonly PlanRetirement[];
	readonly orphans: readonly PlanOrphan[];
	readonly rejections: readonly PlanRejection[];
	readonly goal: string;
	readonly steps: readonly SemanticWorkStep[];
	readonly completedCount: number;
	readonly currentStepNumber: number | null;
	readonly observationCount: number;
	readonly summary: string;
}
export interface DplanHash {
	sha256Hex(input: Uint8Array): Sha256Hex;
}
export type NativeDelegationStatus = "pending" | "running" | "completed" | "failed";
export interface NativeDelegationActivity {
	readonly activityId: string;
	readonly itemId: string;
	readonly kind: string;
	readonly message: string | null;
	readonly attribution: "observed";
	readonly source: {
		readonly turnId: string;
		readonly itemId: string;
	};
}
export interface NativeDelegatedTask {
	readonly id: string;
	readonly parentId: string | null;
	readonly status: NativeDelegationStatus;
	readonly task: string | null;
	readonly model: string | null;
	readonly reasoningEffort: string | null;
	readonly activities: readonly NativeDelegationActivity[];
}
export interface NativeDelegationProjection {
	readonly turnId: string;
	readonly tasks: readonly NativeDelegatedTask[];
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
		activityId: activity.id,
		sequence: activity.sequence,
		sourceDigest: activity.sourceDigest,
	};
}
function token(value: string): string {
	return value.normalize("NFKC").replace(/\r\n?/gu, "\n").trim().replace(
		/\s+/gu,
		" ",
	);
}
interface Entry {
	raw: string;
	title: string;
	status: WorkStepStatus;
	tokenDigest: string;
}
interface State {
	entry: Entry;
	identity: DerivedPlanIdentity;
	currentRevision: PlanRevisionRef;
	reconciliation: PlanReconciliation;
	association: {
		actions: string[];
		observations: string[];
		sources: {
			startSequence: number;
			endSequence: number | null;
			actions: string[];
			observations: string[];
		}[];
	};
	canonicalSeed: string;
}

export function projectWorkFlow(
	activities: readonly ProjectActivity[],
	narrations: ReadonlyMap<string, WorkStepNarration> = new Map(),
	input?: WorkFlowProjectionInput,
): WorkFlowProjection {
	const empty = (): WorkFlowProjection => ({
		source: null,
		retirements: [],
		orphans: [],
		rejections: [],
		goal: "현재 요청을 처리합니다.",
		steps: [],
		completedCount: 0,
		currentStepNumber: null,
		observationCount: 0,
		summary: "의미 있는 실행 단계를 기다리고 있습니다.",
	});
	if (!input) return empty();
	if ("kind" in input) {
		const pendingGoal = activities.slice().reverse().find((activity) =>
			activity.nativeRefs.threadId === input.expectedThreadKey &&
			activity.kind === "message" &&
			activity.payload.direction === "outbound" &&
			typeof activity.payload.text === "string"
		);
		return {
			...empty(),
			goal: pendingGoal ? publicText(pendingGoal.payload.text as string) : empty().goal,
		};
	}
	const checked = validateJournal(
		activities,
		input.expectedThreadKey,
		input.hash,
	);
	const rejections: PlanRejection[] = checked.rejection ? [checked.rejection] : [];
	const selectedTurnId = input.selectedTurnId;
	const start = checked.activities.findIndex((activity) =>
		isTurnStart(activity) &&
		activity.nativeRefs.threadId === input.expectedThreadKey &&
		activity.nativeRefs.turnId === selectedTurnId
	);
	if (start < 0) return { ...empty(), rejections };
	const end = checked.activities.findIndex((activity, index) =>
		index > start &&
		isTurnStart(activity) &&
		activity.nativeRefs.threadId === input.expectedThreadKey &&
		typeof activity.nativeRefs.turnId === "string" &&
		activity.nativeRefs.turnId !== input.selectedTurnId
	);
	const interval = checked.activities.slice(start, end < 0 ? undefined : end);
	const goalActivity = checked.activities.slice(0, start).reverse().find(
		(activity) =>
			activity.nativeRefs.threadId === input.expectedThreadKey &&
			(activity.nativeRefs.turnId === undefined ||
				activity.nativeRefs.turnId === selectedTurnId) &&
			activity.kind === "message" &&
			activity.payload.direction === "outbound" &&
			typeof activity.payload.text === "string",
	);
	const goal = goalActivity ? publicText(goalActivity.payload.text as string) : "현재 요청을 처리합니다.";
	const threadDigest = digest(
		input.hash,
		"dplan-v1",
		"native-thread",
		input.expectedThreadKey,
	);
	const retirements: PlanRetirement[] = [], orphans: PlanOrphan[] = [];
	let current: State[] = [],
		currentRevision: PlanRevisionRef | null = null,
		invalid = false,
		ordinal = 0;
	const seeds = new Map<string, string>();
	const emitOrphan = (
		activity: ProjectActivity,
		reason: PlanOrphanReason,
		state?: State,
	) => {
		const kind = classifyWorkActivity(activity);
		if (kind !== "control") {
			orphans.push({
				activityId: activity.id,
				activityKind: kind,
				reason,
				priorIdentity: state?.identity.value ?? null,
				currentRevision: state?.currentRevision ?? currentRevision,
			});
		}
	};
	for (const activity of interval) {
		if (activity.payload.method === "turn/plan/updated") {
			if (
				activity.nativeRefs.threadId !== input.expectedThreadKey ||
				activity.nativeRefs.turnId !== input.selectedTurnId
			) {
				rejections.push({
					kind: "revision",
					code: "source_turn_mismatch",
					activityId: activity.id,
					sequence: activity.sequence,
				});
				continue;
			}
			const parsed = parsePlan(activity, input.hash);
			if (parsed.error) {
				rejections.push({
					kind: "revision",
					code: parsed.error,
					activityId: activity.id,
					sequence: activity.sequence,
				});
				invalid = true;
				continue;
			}
			invalid = false;
			ordinal++;
			const nextRevision = revision(activity, threadDigest, input.hash);
			for (const state of current) {
				for (const source of state.association.sources) {
					if (source.endSequence === null) source.endSequence = nextRevision.sequence;
				}
			}
			current = reconcile(
				current,
				parsed.entries!,
				nextRevision,
				ordinal,
				threadDigest,
				input.hash,
				retirements,
				orphans,
				seeds,
			);
			currentRevision = nextRevision;
			continue;
		}
		const kind = classifyWorkActivity(activity);
		if (kind === "control") continue;
		if (
			activity.nativeRefs.threadId !== input.expectedThreadKey ||
			activity.nativeRefs.turnId !== input.selectedTurnId
		) {
			emitOrphan(activity, "source_mismatch");
			continue;
		}
		if (invalid) {
			emitOrphan(activity, "invalid_revision");
			continue;
		}
		const running = current.filter((state) => state.entry.status === "running");
		if (!currentRevision) emitOrphan(activity, "pre_plan");
		else if (running.length !== 1) {
			emitOrphan(activity, "no_unambiguous_running_item");
		} else {
			const state = running[0]!;
			let source = state.association.sources.at(-1);
			if (!source || source.startSequence !== currentRevision.sequence) {
				source = {
					startSequence: currentRevision.sequence,
					endSequence: null,
					actions: [],
					observations: [],
				};
				state.association.sources.push(source);
			}
			if (kind === "action") {
				state.association.actions.push(activity.id);
				source.actions.push(activity.id);
			} else {
				state.association.observations.push(activity.id);
				source.observations.push(activity.id);
			}
		}
	}
	const activityById = new Map(
		checked.activities.map((activity) => [activity.id, activity]),
	);
	const steps = current.map((state, index): SemanticWorkStep => ({
		id: state.identity.value,
		identity: state.identity,
		currentRevision: state.currentRevision,
		reconciliation: state.reconciliation,
		association: state.association.actions.length || state.association.observations.length
			? {
				attribution: "inferred",
				activityIds: state.association.actions,
				observationActivityIds: state.association.observations,
				sources: state.association.sources.map((source) => ({
					turnId: selectedTurnId,
					startSequence: source.startSequence,
					endSequence: source.endSequence,
					activityIds: source.actions,
					observationActivityIds: source.observations,
				})),
			}
			: null,
		number: index + 1,
		title: state.entry.title,
		status: state.entry.status,
		activityIds: state.association.actions,
		observationCount: state.association.observations.length,
		narration: narration(
			narrations.get(state.identity.value),
			state.entry.title,
			[...state.association.actions, ...state.association.observations].slice(
				-8,
			).flatMap((id) => activitySummary(activityById.get(id))),
		),
	}));
	const completedCount = steps.filter((step) => step.status === "completed").length;
	const currentStep = steps.find((step) => step.status === "running") ??
		steps.find((step) => step.status === "pending") ?? null;
	return {
		source: currentRevision
			? {
				kind: "native-plan-derived",
				expectedThreadKeyDigest: threadDigest,
				turnId: selectedTurnId,
				currentRevision,
				algorithm: "dplan-v1",
			}
			: null,
		retirements,
		orphans,
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
			: "의미 있는 실행 단계를 기다리고 있습니다.",
	};
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
		} else if (
			activity.payload.method === "turn/plan/updated" &&
			isParseablePlanEnvelope(activity)
		) {
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
		const state = old[oldIndex]!;
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
		const prior = old[unmatchedOld[0]!]!, candidate = next[unmatchedNew[0]!];
		if (!blocked.has(prior.entry.title) && !blocked.has(candidate!.title)) {
			const maxLength = Math.max(
				[...prior.entry.raw].length,
				[...candidate!.raw].length,
			);
			const limit = Math.min(8, Math.max(1, Math.floor(maxLength * .2)));
			const distance = lev(prior.entry.raw, candidate!.raw, limit);
			if (distance <= limit && distance / maxLength <= .2) {
				matches.set(unmatchedNew[0]!, unmatchedOld[0]!);
			}
		}
	}
	unmatchedOld = old.map((_, index) => index).filter((index) => ![...matches.values()].includes(index));
	unmatchedNew = next.map((_, index) => index).filter((index) => !matches.has(index));
	for (const index of unmatchedOld) {
		const state = old[index]!;
		const duplicate = oldCounts.get(state.entry.tokenDigest)! > 1 ||
			nextCounts.get(state.entry.tokenDigest)! > 1 ||
			blocked.has(state.entry.title);
		const hasEditCandidate = unmatchedNew.some((newIndex) => isEditLike(state.entry.raw, next[newIndex]!.raw));
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
			const state = old[oldIndex]!;
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
							kind: "exact_unique",
							previousIdentity: state.identity.value,
							previousRevision: state.currentRevision,
							tokenDigest: entry.tokenDigest,
						}
						: {
							kind: "isolated_edit",
							previousIdentity: state.identity.value,
							previousRevision: state.currentRevision,
							tokenDigest: entry.tokenDigest,
							distance: lev(state.entry.raw, entry.raw, limit),
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
					kind: "mint",
					tokenDigest: entry.tokenDigest,
					sourceRevisionOrdinal: ordinal,
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
function isParseablePlanEnvelope(activity: ProjectActivity): boolean {
	return !planValidationError(activity);
}
function planValidationError(
	activity: ProjectActivity,
): RevisionValidationCode | undefined {
	const params = record(activity.payload.params);
	if (!params || !Array.isArray(params.plan) || params.plan.length > 256) {
		return "non_string_entry";
	}
	const values = params.plan.map(record);
	if (values.some((entry) => typeof entry?.step !== "string")) {
		return "non_string_entry";
	}
	for (const value of values) {
		const step = value!.step as string;
		if ([...step].length > 4_096 || !token(step)) return "blank_entry";
	}
	return undefined;
}
function parsePlan(
	activity: ProjectActivity,
	hash: DplanHash,
): { entries?: Entry[]; error?: RevisionValidationCode } {
	const error = planValidationError(activity);
	if (error) return { error };
	const values = (record(activity.payload.params)!.plan as readonly unknown[])
		.map(record);
	const entries = values.map((value) => {
		const step = value!.step as string;
		const raw = token(step);
		return {
			raw,
			title: publicText(step),
			status: planStatus(value!.status),
			tokenDigest: digest(hash, raw),
		};
	});
	return { entries };
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
		let minimum = next[0]!;
		for (let j = 0; j < b.length; j++) {
			const value = Math.min(
				next[j]! + 1,
				previous[j + 1]! + 1,
				previous[j]! + (a[i] === b[j] ? 0 : 1),
			);
			next.push(value);
			minimum = Math.min(minimum, value);
		}
		if (minimum > limit) return limit + 1;
		previous = next;
	}
	return previous.at(-1)!;
}
function isEditLike(left: string, right: string): boolean {
	const maxLength = Math.max([...left].length, [...right].length);
	const limit = Math.min(8, Math.max(1, Math.floor(maxLength * .2)));
	const distance = lev(left, right, limit);
	return distance <= limit && distance / maxLength <= .2;
}
function isTurnStart(activity: ProjectActivity): boolean {
	return activity.payload.method === "turn/start" ||
		activity.payload.method === "turn/started";
}
function planStatus(value: unknown): WorkStepStatus {
	return value === "completed"
		? "completed"
		: value === "inProgress" || value === "running"
		? "running"
		: value === "failed"
		? "failed"
		: value === "cancelled"
		? "cancelled"
		: "pending";
}
/**
 * A lossless-enough, display-neutral projection of App Server's collaboration
 * items. It observes native payloads only; it does not select or direct agents.
 */
export function projectNativeDelegation(
	activities: readonly ProjectActivity[],
): readonly NativeDelegationProjection[] {
	const byTurn = new Map<string, ProjectActivity[]>();
	for (const activity of activities) {
		const item = record(record(activity.payload.params)?.item);
		const type = (delegationText(item?.type) ?? "").replace(/[^a-z]/giu, "").toLowerCase();
		if (type !== "collabagenttoolcall" && type !== "subagentactivity") continue;
		// A collaboration payload alone is not an observed trace relation.  Keep
		// it out rather than manufacturing an observed edge from display fields.
		if (!activity.nativeRefs.turnId || !activity.nativeRefs.itemId) continue;
		const turnId = activity.nativeRefs.turnId;
		if (!turnId) continue;
		const entries = byTurn.get(turnId) ?? [];
		entries.push(activity);
		byTurn.set(turnId, entries);
	}
	return Object.freeze([...byTurn.entries()].map(([turnId, entries]) => {
		const tasks = new Map<string, {
			parentId: string | null; status: NativeDelegationStatus; task: string | null;
			model: string | null; reasoningEffort: string | null; activities: NativeDelegationActivity[];
		}>();
		const ensure = (id: string, parentId: string | null) => {
			const existing = tasks.get(id);
			if (existing) return existing;
			const created = { parentId, status: "pending" as NativeDelegationStatus, task: null, model: null, reasoningEffort: null, activities: [] };
			tasks.set(id, created);
			return created;
		};
		for (const activity of entries.sort((left, right) => left.sequence - right.sequence)) {
			const item = record(record(activity.payload.params)?.item)!;
			const type = (delegationText(item.type) ?? "").replace(/[^a-z]/giu, "").toLowerCase();
			if (type === "collabagenttoolcall") {
				const parentId = delegationText(item.senderThreadId);
				const receivers = Array.isArray(item.receiverThreadIds)
					? item.receiverThreadIds.flatMap((value) => delegationText(value) ?? [])
					: [];
				for (const id of receivers) {
					const task = ensure(id, parentId);
					task.task ??= delegationText(item.prompt);
					task.model ??= delegationText(item.model) ?? delegationText(record(item.settings)?.model);
					task.reasoningEffort ??= delegationText(item.reasoningEffort) ??
						delegationText(item.reasoning_effort) ?? delegationText(record(item.settings)?.reasoning_effort);
					const state = record(record(item.agentsStates)?.[id]);
					task.status = delegationStatus(state?.status ?? item.status);
					const message = delegationText(state?.message) ??
						delegationText(item.message) ?? delegationText(item.input);
					if (message) task.activities.push(delegationActivity(activity, item, message));
				}
				continue;
			}
			const id = delegationText(item.agentThreadId);
			if (!id) continue;
			const task = ensure(id, null);
			task.status = delegationStatus(item.kind);
			const message = delegationText(item.message) ?? delegationText(item.text);
			task.activities.push(delegationActivity(activity, item, message));
		}
		return {
			turnId,
			tasks: Object.freeze([...tasks.entries()].map(([id, task]) => ({
				id, ...task, activities: Object.freeze(task.activities),
			}))),
		};
	}));
}
function delegationActivity(
	activity: ProjectActivity,
	item: Readonly<Record<string, unknown>>,
	message: string | null,
): NativeDelegationActivity {
	const turnId = activity.nativeRefs.turnId;
	const itemId = activity.nativeRefs.itemId;
	if (!turnId || !itemId) throw new Error("native delegation activity requires turn and item references");
	return {
		activityId: activity.id,
		itemId,
		kind: delegationText(item.kind) ?? delegationText(item.tool) ?? "activity",
		message,
		attribution: "observed",
		source: { turnId, itemId },
	};
}
function delegationText(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value.trim() : null;
}
function delegationStatus(value: unknown): NativeDelegationStatus {
	if (value === "completed") return "completed";
	if (value === "failed" || value === "errored" || value === "interrupted" || value === "cancelled" || value === "canceled") return "failed";
	if (value === "running" || value === "started" || value === "interacted" || value === "inProgress") return "running";
	return "pending";
}
export function classifyWorkActivity(
	activity: ProjectActivity,
): WorkActivityClass {
	if (activity.kind === "file-change") return "action";
	if (activity.kind !== "tool") return "control";
	const item = record(record(activity.payload.params)?.item) ??
		record(activity.payload.params) ?? activity.payload;
	const command = typeof (item.command ?? item.cmd) === "string" ? String(item.command ?? item.cmd) : "";
	if (command) return isReadOnlyShell(command) ? "observation" : "action";
	const tool = typeof (item.tool ?? item.toolName ?? item.name) === "string"
		? String(item.tool ?? item.toolName ?? item.name)
		: "";
	if (!tool) return "action";
	const normalized = tool.replace(/[-_.]/gu, " ").toLowerCase();
	if (
		/\b(?:create|update|delete|remove|write|edit|apply|send|post|put|deploy|execute|run)\b/u
			.test(normalized)
	) return "action";
	if (
		/\b(?:read|get|list|search|find|view|inspect|fetch|query|lookup|show)\b/u
			.test(normalized)
	) return "observation";
	return "action";
}
function isReadOnlyShell(command: string): boolean {
	const value = command.trim().replace(/\b\d?>\s*\/dev\/null\b/gu, "");
	if (!value) return true;
	if (
		/(?:^|\s)(?:rm|mv|cp|mkdir|rmdir|touch|chmod|chown|tee|truncate|install|patch|apply_patch)(?:\s|$)/u
			.test(value) ||
		/\b(?:npm|pnpm|yarn|bun)\s+(?:add|install|remove|uninstall|update)\b/u.test(
			value,
		) ||
		/\bgit\s+(?:add|commit|push|pull|merge|rebase|reset|checkout|switch|restore|clean|tag)\b/u
			.test(value) ||
		/\bfind\b[^\n]*(?:-delete|-exec|-execdir)\b/u.test(value) ||
		/\bsed\b[^\n]*(?:-i\b|--in-place\b)/u.test(value) ||
		/(?:^|[^<])>(?:>|&)?/u.test(value)
	) return false;
	const segments = value.split(/&&|\|\||[;|]/u).map((part) => part.trim())
		.filter(Boolean);
	return segments.length > 0 &&
		segments.every((part) =>
			/^(?:cd\b|pwd\b|ls\b|eza\b|tree\b|rg\b|grep\b|cat\b|head\b|tail\b|wc\b|sort\b|stat\b|file\b|which\b|whereis\b|type\b|find\b|readlink\b|realpath\b|sed\s+-n\b|git\s+(?:status|diff|log|show|rev-parse)\b|bun\s+test\b|echo\b|printf\b|true\b)/u
				.test(
					part.replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=[^\s]+\s+)*/u, "").replace(
						/^\(?\s*/u,
						"",
					).trim(),
				)
		);
}
function record(value: unknown): Readonly<Record<string, unknown>> | undefined {
	return value && typeof value === "object" && !Array.isArray(value)
		? value as Readonly<Record<string, unknown>>
		: undefined;
}
function publicText(value: string): string {
	return redactForExternalReview(
		sanitizeTerminalTextExcerpt(value, MAX_PUBLIC_TEXT, "head-tail"),
	).text.trim();
}
