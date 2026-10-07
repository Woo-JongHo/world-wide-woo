import      { isReasoningActivityPayload                } from "@/core/domain/execution/project-activity.js"           ;
import type { ProjectActivity                           } from "@/core/domain/execution/project-activity.js"           ;
import      { redactForExternalReview                   } from "@/core/domain/review/redaction.js"                     ;
import      { sanitizeTerminalTextExcerpt               } from "@/core/domain/execution/terminal.js"                   ;
import type { PlanActivity                              } from "@/core/domain/work/workbench.js"                       ;
import type { ActivityNarrationResult, ActivityNarrator } from "@/core/application/orchestration/activity-narrator.js" ;
import      { verificationCommand                       } from "@/core/domain/observability/request-test-workspace.js" ;
import      { immediateShellSummary                     } from "@/core/domain/execution/shell-description.js"          ;

export interface PlanActivityContext {
	turnId    : string                          ;
	stepId    : string                          ;
	stepTitle : string                          ;
	goal      : string                          ;
	kind?     : "plan-progress" | "tool-action" ;
	/** Runner output or log read-back observed these names; omit when none were observed. */
	testNames?: readonly string[]
}
interface Entry {
	activity       : PlanActivity                                    ;
	input          : string                                          ;
	goal           : string                                          ;
	kind           : "plan-progress" | "tool-action" | "test-action" ;
	latestSequence : number                                          ;
	result?        : ActivityNarrationResult                         ;
	failed?: boolean
}

/** Serial, bounded interpretation queue. Native observations remain the status authority. */
export class PlanActivityNarration {
	private entries                     = new Map<string, Entry>() ;
	private queue                       = new Set<string>()        ;
	private busy                        = false                    ;
	private turnId      : string | null = null                     ;
	private activeCall? : AbortController                          ;
	public constructor(private readonly narrator: ActivityNarrator, private readonly signal: AbortSignal, private readonly changed: (stepId: string, result?: ActivityNarrationResult) => void, private readonly timeoutMs = 30_000, private readonly projection: "steps" | "actions" = "steps", private readonly language: () => "ko" | "en" = () => "ko") {}

	public select(turnId: string | null): void {
		if (this.turnId === turnId) return;
		this.turnId = turnId;
		this.entries.clear();
		this.queue.clear();
		this.activeCall?.abort();
	}

	public observe(observation: ProjectActivity, context: PlanActivityContext): void {
		if (observation.nativeRefs.turnId !== this.turnId || context.turnId !== this.turnId) return;
		const id         = `${context.turnId}:${observation.nativeRefs.itemId ?? observation.id}`                                                                                                                                 ;
		const previous   = this.entries.get(id)                                                                                                                                                                                   ;
		const item       = actionItem(observation)                                                                                                                                                                                ;
		const status     = item.status === "failed" || (typeof item.exitCode === "number" && item.exitCode !== 0) ? "failed" : observation.phase === "started" || observation.phase === "updated" ? "running" : observation.phase ;
		const testAction = context.kind === "tool-action" && observation.kind === "tool" && typeof item.command === "string" && verificationCommand(item.command)                                                                 ;
		if (testAction && !["completed", "failed", "cancelled"].includes(observation.phase)) return;
		if (previous) {
			if (observation.sequence <= previous.latestSequence) return;
			previous.latestSequence = observation.sequence;
			if (previous.activity.status === status) return;
			previous.activity = { ...previous.activity, status };
			this.changed(previous.activity.stepId);
			return;
		}
		const input = testAction ? publicTestActionInput(observation, context.testNames) : publicActionInput(observation);
		if (!input) return;
		this.entries.set(id, { activity: { id, turnId: context.turnId, stepId: context.stepId, stepTitle: context.stepTitle, summary: "", status, sequence: observation.sequence }, input, goal: safe(context.goal), kind: testAction ? "test-action" : context.kind ?? "plan-progress", latestSequence: observation.sequence });
		const summary = context.kind === "tool-action" && !testAction && typeof item.command === "string"
			? safe(immediateShellSummary(item.command, this.language()) ?? input) : null;
		if (summary) {
			const entry = this.entries.get(id)!;
			entry.activity = { ...entry.activity, summary, narrationSource: "command", narrationStatus: "pending" };
		}
		this.queue.add(id);
		// Bound memory and stale queued work even when events arrive faster than the model.
		while (this.entries.size > 20) {
			const oldest = this.entries.keys().next().value!;
			this.entries.delete(oldest);
			this.queue.delete(oldest);
		}
		if (summary) this.changed(context.stepId);
		void this.drain();
	}

	public snapshot(stepId?: string): { planActivities: readonly PlanActivity[]; planActivityStatus: "pending" | "ready" | "unavailable" } {
		const entries      = [...this.entries.values()].filter(entry => !stepId || entry.activity.stepId === stepId)                                         ;
		const interpreted  = entries.filter(entry => entry.result || (this.projection === "actions" && entry.activity.summary)).map(entry => entry.activity) ;
		const latestByStep = new Map<string, PlanActivity>()                                                                                                 ;
		if (this.projection === "steps") for (const activity of interpreted) latestByStep.set(activity.stepId, activity);
		const planActivities = (this.projection === "steps" ? [...latestByStep.values()] : interpreted).sort((a, b) => a.sequence - b.sequence).slice(this.projection === "steps" ? -5 : -20);
		return { planActivities, planActivityStatus: entries.some(entry => !entry.result && !entry.failed) ? "pending" : entries.some(entry => entry.result) ? "ready" : entries.some(entry => entry.failed) ? "unavailable" : "pending" };
	}

	private async drain(): Promise<void> {
		if (this.busy) return;
		this.busy = true;
		try {
			while (this.queue.size && !this.signal.aborted) {
				const id = this.queue.values().next().value!;
				this.queue.delete(id);
				const entry = this.entries.get(id);
				if (!entry) continue;
				try {
					const result = await this.narrate(entry);
					if (this.signal.aborted || this.entries.get(id) !== entry) continue;
					const summary = conciseSentence(result.what);
					if (!summary || /\b(?:item|turn)\/(?:started|completed|updated)|commandExecution|function_call|tool_call/iu.test(result.what) || summary === "[redacted:local-path]") throw new Error("Technical event is not an activity summary");
					const why = result.why ? conciseSentence(result.why) : "";
					entry.result = { what: summary, inputSummary: result.inputSummary, ...(why ? { why } : {}) };
					entry.activity = { ...entry.activity, summary, narrationSource: "model", narrationStatus: "ready", ...(why ? { why } : {}) };
					this.changed(entry.activity.stepId, entry.result);
				} catch {
					if (this.signal.aborted || this.entries.get(id) !== entry) continue;
					entry.failed = true;
					entry.activity = { ...entry.activity, narrationStatus: "unavailable" };
					this.changed(entry.activity.stepId);
				}
			}
		} finally { this.busy = false; }
	}

	private async narrate(entry: Entry): Promise<ActivityNarrationResult> {
		const timeout = new AbortController();
		this.activeCall = timeout;
		const signal = AbortSignal.any([this.signal, timeout.signal]) ;
		let timer   : ReturnType<typeof setTimeout> | undefined       ;
		let onAbort : (() => void) | undefined                        ;
		try {
			return await Promise.race([
				this.narrator.narrate({ kind: entry.kind, goal: entry.goal, stepTitle: safe(entry.activity.stepTitle), inputSummary: [entry.input] }, signal),
				new Promise<never>((_, reject) => {
					onAbort = () => reject(new Error("Activity interpretation cancelled or timed out"));
					if (signal.aborted) onAbort();
					else signal.addEventListener("abort", onAbort, { once: true });
					timer = setTimeout(() => timeout.abort(), this.timeoutMs);
				}),
			]);
		} finally {
			clearTimeout(timer);
			if (onAbort) signal.removeEventListener("abort", onAbort);
			if (this.activeCall === timeout) delete this.activeCall;
		}
	}
}

function safe(text: string): string { return redactForExternalReview(sanitizeTerminalTextExcerpt(text, 600, "head-tail")).text.trim(); }

/** One display sentence is derived from model narration; the source Activity remains untouched. */
function conciseSentence(text: string): string {
	const normalized = safe(text).replace(/\s+/gu, " ").trim()                     ;
	const sentence   = /^.*?[.!?。！？](?=\s|$)/u.exec(normalized)?.[0] ?? normalized ;
	const characters = Array.from(sentence)                                        ;
	return characters.length <= 120 ? sentence : `${characters.slice(0, 119).join("")}…`;
}

function publicActionInput(activity: ProjectActivity): string | null {
	if (isReasoningActivityPayload(activity.payload) || !["tool", "file-change"].includes(activity.kind)) return null;
	const item = actionItem(activity);
	// Only invocation metadata: never command output, tool results, or private reasoning.
	const values = [item.command, item.name, item.tool, item.toolName, item.path].filter((value): value is string => typeof value === "string") ;
	const args   = item.arguments && typeof item.arguments === "object" ? item.arguments as Record<string, unknown> : {}                        ;
	for (const field of ["command", "path", "query"]) if (typeof args[field] === "string") values.push(args[field] as string);
	if (Array.isArray(item.changes)) for (const change of item.changes.slice(0, 4)) {
		if (change && typeof change === "object" && typeof change.path === "string") values.push(`file: ${change.path}`);
	}
	if (!values.length) return null;
	return safe(values.join(" · ")) || null;
}

function publicTestActionInput(activity: ProjectActivity, observedNames: readonly string[] = []): string | null {
	const command = publicActionInput(activity);
	if (!command) return null;
	const item   = actionItem(activity)                                                   ;
	const output = typeof item.aggregatedOutput === "string" ? item.aggregatedOutput : "" ;
	const cases = [...output.matchAll(/^\((?:pass|fail|skip)\)\s+(.+?)(?:\s+\[[^\]]+\])?\s*$/gmu)]
		.slice(0, 8).map(match => safe(match[1] ?? "")).filter(Boolean);
	const names   = cases.length ? cases : observedNames.slice(0, 8).map(safe).filter(Boolean)       ;
	const outcome = typeof item.exitCode === "number" ? `exit ${item.exitCode}` : "종료 코드 미관측" ;
	return safe([command, names.length ? `관측된 테스트: ${names.join("; ")}` : "테스트 이름 미관측", outcome].join(" · "));
}

function actionItem(activity: ProjectActivity): Record<string, unknown> {
	const params = activity.payload.params as Record<string, unknown> | undefined;
	return (params?.item ?? activity.payload.item ?? params ?? activity.payload) as Record<string, unknown>;
}
