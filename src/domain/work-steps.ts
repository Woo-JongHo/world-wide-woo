import type { ProjectActivity } from "./project-activity.js";
import { redactForExternalReview } from "./redaction.js";
import { sanitizeTerminalTextExcerpt } from "./terminal.js";

const MAX_PUBLIC_TEXT = 1_200;
const MAX_INPUT_SUMMARY = 4;

export type WorkActivityClass = "observation" | "action" | "control";
export type WorkStepStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface WorkStepNarration {
	readonly what: string;
	readonly why?: string;
	readonly inputSummary: readonly string[];
	readonly source: "model" | "plan" | "fallback";
}

export interface SemanticWorkStep {
	readonly id: string;
	readonly number: number;
	readonly title: string;
	readonly status: WorkStepStatus;
	readonly activityIds: readonly string[];
	readonly observationCount: number;
	readonly narration: WorkStepNarration;
}

export interface WorkFlowProjection {
	readonly goal: string;
	readonly steps: readonly SemanticWorkStep[];
	readonly completedCount: number;
	readonly currentStepNumber: number | null;
	readonly observationCount: number;
	readonly summary: string;
}

interface MutablePlanStep {
	id: string;
	title: string;
	status: WorkStepStatus;
	activityIds: string[];
	observationCount: number;
}

interface MutableActivityStep {
	id: string;
	title: string;
	activities: ProjectActivity[];
	observationCount: number;
}

/**
 * Projects a Native activity journal into user-facing semantic steps. Plan
 * state and activity lifecycle remain authoritative; narration only supplies
 * presentation text.
 */
export function projectWorkFlow(
	activities: readonly ProjectActivity[],
	narrations: ReadonlyMap<string, WorkStepNarration> = new Map(),
): WorkFlowProjection {
	const history = [...activities].sort((left, right) => left.sequence - right.sequence);
	const scope = latestTurnScope(history);
	const ordered = scope.activities;
	const planSteps: MutablePlanStep[] = [];
	const inferredSteps = new Map<string, MutableActivityStep>();
	let latestPlan: readonly PlanEntry[] = [];
	let hasPlan = false;
	let goal = scope.goal;
	let planExplanation = "";
	let observationCount = 0;

	for (const activity of ordered) {
		const outboundGoal = outboundUserText(activity);
		if (outboundGoal) goal = outboundGoal;

		const update = planUpdate(activity);
		if (update) {
			if (!hasPlan && inferredSteps.size > 0) {
				const targetIndex = activePlanIndex(update.entries);
				const target = ensurePlanStep(planSteps, update.entries, targetIndex, activity);
				for (const inferred of inferredSteps.values()) {
					target.activityIds.push(...inferred.activities.map((item) => item.id));
					target.observationCount += inferred.observationCount;
				}
				inferredSteps.clear();
			}
			hasPlan = true;
			latestPlan = update.entries;
			planExplanation = update.explanation || planExplanation;
			for (const [index, entry] of update.entries.entries()) {
				const step = ensurePlanStep(planSteps, update.entries, index, activity);
				step.title = entry.title;
				step.status = entry.status;
			}
			continue;
		}

		const classification = classifyWorkActivity(activity);
		if (classification === "control") continue;
		if (classification === "observation") {
			observationCount += 1;
			if (hasPlan && latestPlan.length > 0) {
				const index = activePlanIndex(latestPlan);
				ensurePlanStep(planSteps, latestPlan, index, activity).observationCount += 1;
			}
			continue;
		}

		if (hasPlan && latestPlan.length > 0) {
			const index = activePlanIndex(latestPlan);
			ensurePlanStep(planSteps, latestPlan, index, activity).activityIds.push(activity.id);
			continue;
		}
		const key = workItemKey(activity);
		const inferred = inferredSteps.get(key) ?? {
			id: `activity:${key}`,
			title: fallbackStepTitle(activity),
			activities: [],
			observationCount: 0,
		};
		inferred.title = fallbackStepTitle(activity);
		inferred.activities.push(activity);
		inferredSteps.set(key, inferred);
	}

	const sourceSteps = hasPlan
		? planSteps.slice(0, latestPlan.length).map((step) => ({
			id: step.id,
			title: step.title,
			status: step.status,
			activityIds: unique(step.activityIds),
			observationCount: step.observationCount,
			fallback: planNarration(step.title, latestActivity(step.activityIds, ordered)),
		}))
		: [...inferredSteps.values()].map((step) => {
			const latest = step.activities.at(-1)!;
			return {
				id: step.id,
				title: step.title,
				status: activityStatus(latest),
				activityIds: unique(step.activities.map((activity) => activity.id)),
				observationCount: step.observationCount,
				fallback: activityNarration(latest),
			};
		});

	const steps: SemanticWorkStep[] = sourceSteps.map((step, index) => Object.freeze({
		id: step.id,
		number: index + 1,
		title: step.title,
		status: step.status,
		activityIds: Object.freeze(step.activityIds),
		observationCount: step.observationCount,
		narration: freezeNarration(narrations.get(step.id) ?? step.fallback),
	}));
	const completedCount = steps.filter((step) => step.status === "completed").length;
	const current = steps.find((step) => step.status === "running")
		?? steps.find((step) => step.status === "failed" || step.status === "cancelled")
		?? steps.find((step) => step.status === "pending")
		?? null;
	const publicGoal = publicText(goal || planExplanation || "현재 요청을 처리합니다.");
	const summary = current
		? `${steps.length}단계 중 ${completedCount}단계를 완료했고, 현재 ${current.number}단계를 진행하고 있습니다.`
		: steps.length > 0
			? `${steps.length}단계를 모두 완료했습니다.`
			: "의미 있는 실행 단계를 기다리고 있습니다.";
	return Object.freeze({
		goal: publicGoal,
		steps: Object.freeze(steps),
		completedCount,
		currentStepNumber: current?.number ?? null,
		observationCount,
		summary,
	});
}

interface WorkFlowTurnScope {
	readonly activities: readonly ProjectActivity[];
	readonly goal: string;
}

/**
 * Chat history is thread-scoped, while semantic execution steps are turn-scoped.
 * A resumed thread can contain many plans, so reusing the whole thread here would
 * attach prior activity and narration IDs to the latest plan by array index.
 */
function latestTurnScope(history: readonly ProjectActivity[]): WorkFlowTurnScope {
	const latestOutbound = [...history].reverse().find((activity) => outboundUserText(activity));
	let latestTurnId: string | undefined;
	let latestTurnStartSequence = Number.POSITIVE_INFINITY;
	for (const activity of history) {
		const turnId = activity.nativeRefs.turnId;
		if (!turnId || !isTurnStart(activity)) continue;
		latestTurnId = turnId;
		latestTurnStartSequence = activity.sequence;
	}
	if (!latestTurnId) {
		const latestTurnActivity = [...history].reverse().find((activity) => activity.nativeRefs.turnId);
		latestTurnId = latestTurnActivity?.nativeRefs.turnId;
		latestTurnStartSequence = latestTurnActivity?.sequence ?? Number.POSITIVE_INFINITY;
	}
	if (latestOutbound && latestOutbound.sequence > latestTurnStartSequence) {
		return {
			activities: history.filter((activity) => activity.sequence >= latestOutbound.sequence),
			goal: outboundUserText(latestOutbound),
		};
	}

	let goal = "";
	for (const activity of history) {
		if (activity.sequence > latestTurnStartSequence) break;
		const outboundGoal = outboundUserText(activity);
		if (outboundGoal) goal = outboundGoal;
	}
	if (!latestTurnId) return { activities: history, goal };
	return {
		activities: history.filter((activity) => activity.nativeRefs.turnId === latestTurnId),
		goal,
	};
}

function isTurnStart(activity: ProjectActivity): boolean {
	return activity.payload.method === "turn/start" || activity.payload.method === "turn/started";
}

/** Deterministic visibility policy. Uncertain operations stay visible. */
export function classifyWorkActivity(activity: ProjectActivity): WorkActivityClass {
	if (activity.kind === "file-change") return "action";
	if (activity.kind !== "tool") return "control";
	const item = activityItem(activity);
	const command = stringField(item, ["command", "cmd"]);
	if (command) return isReadOnlyShell(command) ? "observation" : "action";
	const tool = stringField(item, ["tool", "toolName", "name"]);
	if (!tool) return "action";
	const normalized = tool.replace(/[-_.]/gu, " ").toLowerCase();
	if (/\b(?:create|update|delete|remove|write|edit|apply|send|post|put|deploy|execute|run)\b/u.test(normalized)) return "action";
	if (/\b(?:read|get|list|search|find|view|inspect|fetch|query|lookup|show)\b/u.test(normalized)) return "observation";
	return "action";
}

function isReadOnlyShell(command: string): boolean {
	const normalized = command.trim();
	if (!normalized) return true;
	const withoutNullRedirects = normalized.replace(/\b\d?>\s*\/dev\/null\b/gu, "");
	if (/(?:^|\s)(?:rm|mv|cp|mkdir|rmdir|touch|chmod|chown|tee|truncate|install|patch|apply_patch)(?:\s|$)/u.test(withoutNullRedirects)) return false;
	if (/\b(?:npm|pnpm|yarn|bun)\s+(?:add|install|remove|uninstall|update)\b/u.test(withoutNullRedirects)) return false;
	if (/\bgit\s+(?:add|commit|push|pull|merge|rebase|reset|checkout|switch|restore|clean|tag)\b/u.test(withoutNullRedirects)) return false;
	if (/\bfind\b[^\n]*(?:-delete|-exec|-execdir)\b/u.test(withoutNullRedirects)) return false;
	if (/\bsed\b[^\n]*(?:-i\b|--in-place\b)/u.test(withoutNullRedirects)) return false;
	if (/(?:^|[^<])>(?:>|&)?/u.test(withoutNullRedirects)) return false;

	const segments = withoutNullRedirects.split(/&&|\|\||[;|]/u).map((segment) => segment.trim()).filter(Boolean);
	return segments.length > 0 && segments.every((segment) => {
		const executable = segment
			.replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=[^\s]+\s+)*/u, "")
			.replace(/^\(?\s*/u, "")
			.trim();
		return /^(?:cd\b|pwd\b|ls\b|eza\b|tree\b|rg\b|grep\b|cat\b|head\b|tail\b|wc\b|stat\b|file\b|which\b|whereis\b|type\b|find\b|readlink\b|realpath\b|sed\s+-n\b|git\s+(?:status|diff|log|show|rev-parse)\b|echo\b|printf\b|true\b)/u.test(executable);
	});
}

interface PlanEntry {
	title: string;
	status: WorkStepStatus;
}

function planUpdate(activity: ProjectActivity): { explanation: string; entries: readonly PlanEntry[] } | null {
	if (activity.payload.method !== "turn/plan/updated") return null;
	const params = record(activity.payload.params);
	if (!params || !Array.isArray(params.plan)) return null;
	const entries = params.plan.flatMap((candidate): PlanEntry[] => {
		const entry = record(candidate);
		const title = typeof entry?.step === "string" ? publicText(entry.step) : "";
		if (!title) return [];
		return [{ title, status: planStatus(entry?.status) }];
	});
	if (entries.length === 0) return null;
	return {
		explanation: typeof params.explanation === "string" ? publicText(params.explanation) : "",
		entries: Object.freeze(entries),
	};
}

function planStatus(value: unknown): WorkStepStatus {
	if (value === "completed") return "completed";
	if (value === "inProgress" || value === "in_progress" || value === "running") return "running";
	if (value === "failed") return "failed";
	if (value === "cancelled" || value === "canceled") return "cancelled";
	return "pending";
}

function activePlanIndex(entries: readonly PlanEntry[]): number {
	const running = entries.findIndex((entry) => entry.status === "running");
	if (running >= 0) return running;
	const pending = entries.findIndex((entry) => entry.status === "pending");
	if (pending >= 0) return pending;
	return Math.max(0, entries.length - 1);
}

function ensurePlanStep(
	steps: MutablePlanStep[],
	entries: readonly PlanEntry[],
	index: number,
	activity: ProjectActivity,
): MutablePlanStep {
	const entry = entries[index] ?? { title: `Step ${index + 1}`, status: "pending" as const };
	const existing = steps[index];
	if (existing) return existing;
	const step: MutablePlanStep = {
		id: `plan:${activity.nativeRefs.turnId ?? activity.nativeRefs.threadId ?? "current"}:${index + 1}`,
		title: entry.title,
		status: entry.status,
		activityIds: [],
		observationCount: 0,
	};
	steps[index] = step;
	return step;
}

function activityStatus(activity: ProjectActivity): WorkStepStatus {
	if (activity.phase === "failed") return "failed";
	if (activity.phase === "cancelled") return "cancelled";
	if (activity.phase === "started" || activity.phase === "updated") return "running";
	const item = activityItem(activity);
	const status = typeof item.status === "string" ? item.status.toLowerCase() : "";
	const exitCode = typeof item.exitCode === "number" ? item.exitCode : 0;
	if (exitCode !== 0 || /fail|error/iu.test(status)) return "failed";
	if (/cancel|declin/iu.test(status)) return "cancelled";
	return "completed";
}

function outboundUserText(activity: ProjectActivity): string {
	if (activity.kind !== "message" || activity.payload.direction !== "outbound" || typeof activity.payload.text !== "string") return "";
	return publicText(activity.payload.text);
}

function fallbackStepTitle(activity: ProjectActivity): string {
	const item = activityItem(activity);
	const command = stringField(item, ["command", "cmd"]);
	if (command) {
		if (/\b(?:test|check|lint|build|typecheck)\b/iu.test(command)) return "변경 결과 검증";
		return "실행 입력 해석 중";
	}
	if (activity.kind === "file-change") {
		const paths = changePaths(item);
		return paths.length === 1 ? `${paths[0]} 변경` : "작업 파일 변경";
	}
	const tool = stringField(item, ["tool", "toolName", "name"]);
	return tool ? `${publicText(tool)} 입력 해석 중` : "작업 입력 해석 중";
}

function planNarration(title: string, activity: ProjectActivity | undefined): WorkStepNarration {
	return {
		what: title,
		inputSummary: Object.freeze(activity ? activityInputSummary(activity) : []),
		source: "plan",
	};
}

function activityNarration(activity: ProjectActivity): WorkStepNarration {
	return {
		what: fallbackStepTitle(activity),
		inputSummary: Object.freeze(activityInputSummary(activity)),
		source: "fallback",
	};
}

function activityInputSummary(activity: ProjectActivity): string[] {
	const item = activityItem(activity);
	const command = stringField(item, ["command", "cmd"]);
	if (command) return [`command: ${publicText(command)}`];
	const paths = changePaths(item);
	if (paths.length > 0) return paths.slice(0, MAX_INPUT_SUMMARY).map((path) => `path: ${path}`);
	const args = item.arguments ?? item.args ?? item.input;
	if (args !== undefined) return [`args: ${publicText(typeof args === "string" ? args : JSON.stringify(args))}`];
	return [];
}

function changePaths(item: Readonly<Record<string, unknown>>): string[] {
	if (!Array.isArray(item.changes)) return [];
	return item.changes.flatMap((change): string[] => {
		const value = record(change);
		return typeof value?.path === "string" ? [publicText(value.path)] : [];
	});
}

function workItemKey(activity: ProjectActivity): string {
	return activity.nativeRefs.itemId ? `item:${activity.nativeRefs.itemId}` : `activity:${activity.id}`;
}

function activityItem(activity: ProjectActivity): Readonly<Record<string, unknown>> {
	const params = record(activity.payload.params);
	return record(params?.item) ?? params ?? activity.payload;
}

function stringField(source: Readonly<Record<string, unknown>>, keys: readonly string[]): string {
	for (const key of keys) {
		const value = source[key];
		if (typeof value === "string" && value.trim()) return publicText(value);
	}
	return "";
}

function publicText(value: string): string {
	return redactForExternalReview(sanitizeTerminalTextExcerpt(value, MAX_PUBLIC_TEXT, "head-tail")).text.trim();
}

function freezeNarration(value: WorkStepNarration): WorkStepNarration {
	return Object.freeze({
		what: publicText(value.what),
		...(value.why ? { why: publicText(value.why) } : {}),
		inputSummary: Object.freeze(value.inputSummary.slice(0, MAX_INPUT_SUMMARY).map(publicText).filter(Boolean)),
		source: value.source,
	});
}

function unique(values: readonly string[]): string[] {
	return [...new Set(values)];
}

function latestActivity(ids: readonly string[], activities: readonly ProjectActivity[]): ProjectActivity | undefined {
	const selected = new Set(ids);
	return [...activities].reverse().find((activity) => selected.has(activity.id));
}

function record(value: unknown): Readonly<Record<string, unknown>> | undefined {
	return value && typeof value === "object" && !Array.isArray(value)
		? value as Readonly<Record<string, unknown>>
		: undefined;
}
