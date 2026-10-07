import      { LEGACY_REQUEST_CHECKPOINTS, REQUEST_STAGES } from "@/core/domain/execution/request-runtime" ;
import type { NativeAdditionalContextEntry               } from "@/core/domain/execution/native-session"  ;

export interface RequestProtocolEntryDecision {
	readonly kind        : "queued-follow-up" ;
	readonly currentGoal : string | null       ;
}

/** Public results and plans; Native retains its own private reasoning and workers. */
export function requestProtocolContext(requestId: string, version: 1 | 2 | 4 = 1, entry?: RequestProtocolEntryDecision, planMode = false): NativeAdditionalContextEntry {
	return { kind: "application", value: JSON.stringify({
		protocol: "www-request-runtime", version, requestId,
		...(version === 1 ? { checkpoints: LEGACY_REQUEST_CHECKPOINTS } : version === 4 ? { checkpoints: ["UNDERSTAND", "WORK", "RESULT"] } : { stages: REQUEST_STAGES }),
		...(entry ? { entry } : {}),
		instructions: version === 4 ? [
			"Every request follows UNDERSTAND, WORK, RESULT in order. Emit each control report as one standalone public commentary message prefixed [www-runtime] with a JSON object. Keep private reasoning out of reports.",
			planMode
				? "This is Native Plan mode. During UNDERSTAND emit a concise goal, planRequired false, and explain that an execution checklist is not applicable while planning. Do not call update_plan or execute the proposed work. Write the reviewable proposed plan in the final public response; WWW projects that document into PLAN after the turn completes."
				: "During UNDERSTAND, inspect enough context to decide whether execution needs a Native checklist. Before changes, emit UNDERSTAND with requestId, checkpoint: UNDERSTAND, a public summary, concise goal, planRequired boolean, and a concrete planReason. For multi-step execution set planRequired true, then create the Native checklist with update_plan. WORK begins only after that checklist is observed. For simple work set planRequired false; do not create an empty checklist.",
			planMode
				? "Before the final proposed plan, emit RESULT with a public summary of planning and context reviewed. Then provide the normal final plan response. A missing or rejected report remains unobserved."
				: "Update each Native checklist item as work finishes. Before the final answer, emit RESULT with requestId, checkpoint: RESULT, and a public summary of observed work. Then provide the normal final answer. A missing or rejected report remains unobserved; do not claim the phase advanced.",
			"Do not use another request's Plan. A plan decision or report does not grant tool or publication permission. Follow existing approval rules.",
		] : version === 1 ? [
			"Keep internal reasoning private. Record only three public checkpoints: INTENT before work, WORK after work, and RESULT before the final answer.",
			...(entry ? ["For a queued follow-up, preserve entry.currentGoal when the request continues the same goal; otherwise set a revised goal in INTENT."] : []),
			"Emit one standalone commentary message per checkpoint as [www-runtime] followed by JSON. INTENT requires requestId, checkpoint, summary and a concise goal derived from the request. Include plan only when the work needs multiple steps; Native Plan owns the actionable checklist and its progress. WORK requires requestId, checkpoint and summary; include evidence IDs for changes, verification IDs for checks actually performed, and decision only when a meaningful choice was made. Choose whether and how to test or verify based on the work. RESULT requires requestId, checkpoint and summary, then provide the normal final answer.",
			"For multi-step work, create the Native Plan with update_plan before execution and update each item as its work finishes. PROGRESS reads your WORK summary directly; no second model interprets Bash output. Before a command group, give brief public commentary describing the intended action. After the group, write one concise WORK summary in the selected response language describing only observed results. Intent is not a completed result. PROGRESS reports do not complete PLAN items by themselves.",
			"Before WORK, call www_runtime_evidence({requestId}) to list this request's completed tool/file-change Activity IDs. Use only returned activityId values for evidence and verification; choose distinct IDs for execution and checks actually performed. Shell output chunk IDs and source digests are not Activity IDs. Read-only work may omit both fields. Never invent IDs or claim external publication without an observed receipt.",
			"WWW records these checkpoints internally. Do not emit the seven internal stages in observe mode or duplicate Native Plan items as progress reports.",
		] : [
			"Keep internal reasoning private. Choose your own workers, capabilities and implementation methods. Record public results only, never chain of thought.",
			...(entry ? ["This request was queued while another turn was running. Before starting stage work, compare it with entry.currentGoal and decide whether UNDERSTAND must run again. If entry.currentGoal is non-null and the request only adds detail or continues that same goal, report UNDERSTAND as pass with a concrete continuity reason and set goal exactly to entry.currentGoal so the Runtime objective is preserved. If currentGoal is null or the request changes the goal, constraints, or success conditions, complete UNDERSTAND and set a revised concise goal. Never restart UNDERSTAND merely because the input was queued."] : []),
			version === 2
				? "Use www_runtime_inspect({requestId}) first. Use www_runtime_propose({requestId,expectedRevision,report}) for every stage transition. A report has the example shape below. Use returned revision for the next call; on rejection inspect and correct, never claim acceptance. Chat JSON is not authoritative. Complete or explicitly skip all seven stages without extra model calls or forced interviews."
				: "Emit a standalone public commentary message at each stage transition: [www-runtime] followed by one JSON object. No code fence. Complete or explicitly skip all seven stages in order. No additional model calls or interviews are required.",
			...(version === 2 ? ["www_runtime_act accepts {requestId,expectedRevision,operationId,stage,capability,arguments}. Use only capabilities returned by inspect. Unavailable capabilities are blocked; do not bypass a denial using shell/MCP. This lane is brokered, not certified isolated. Never claim strict enforcement. If an operation becomes uncertain, do not retry with another operationId; request reconciliation."] : []),
			...(version === 2 ? ["For an uncertain action use www_runtime_reconcile({requestId,expectedRevision,operationId}). WWW reads only the recorded target, without repeating the action. Only a confirmed desired state clears the blocker; unavailable or inconclusive read-back requires user intervention. A reconciliation receipt proves current state, not who historically changed it."] : []),
			...(version === 2 ? ["When verification fails or an earlier decision needs revision, use www_runtime_replan({requestId,expectedRevision,stage,reason}). Pick an already-started stage. WWW archives the current attempt and resets this stage and all downstream tasks/results. Prior receipts remain history but cannot complete the reset stages. Replanning does not undo effects or renew write authorization. Use fresh operation IDs and approved inputs for genuinely new actions; never use replan to bypass an uncertain action."] : []),
			...(version === 2 ? ["Register required external destinations with www_runtime_require_delivery({requestId,expectedRevision,target,artifact}) once exact identities are known. Registration is not publication permission. Obligations survive replan and cannot be skipped. EXECUTE/VERIFY completion needs a successful Runtime action receipt from that exact stage, not an ordinary Native tool log. External DELIVER evidence must be a publish receipt with matching target/artifact. Obtain a distinct verification receipt in VERIFY. For failed/blocked stage retries use replan, not a running report."] : []),
			"Report running before stage work and completed with the public result afterwards. Use status pass when a stage is unnecessary; WWW stores it as skipped and requires a concrete reason in summary. Do not mark unperformed stages completed.",
			"Todo uses these seven stages as its fixed top level. Plan the actual work within stages using plan entries in DECOMPOSE/DECIDE, and update the current stage tasks while performing it. Keep task IDs stable. Declare dependencies; parallel workers may work inside the active stage. At most eight tasks per stage.",
			"For every planned VERIFY task, include verification {kind,purpose}. kind is black-box|integration|regression|unit|static-analysis|read-back|manual|unclassified. title says what is tested; purpose says the observable goal. Prefer black-box for real user-boundary behavior. WWW presents exactly kind -> test -> goal, never deeper than three levels.",
			"UNDERSTAND records intent/constraints/success and must set a concise goal derived from that understanding; do not copy the user's input verbatim. DECOMPOSE records stage task breakdown. GROUND obtains evidence or states why supplied context is sufficient. DECIDE needs decision, rationale (brief public justification), selectedApproach, rejectedAlternatives and executionPlan.",
			"EXECUTE completed requires actual tool/file-change evidence IDs. VERIFY completed requires actual check/read-back evidence IDs. Use Native item IDs or WWW activity IDs from this turn; never invent IDs or use future results. Stage completion means work recorded, not independent certification.",
			"The evidence field contains identifiers only. Omit it when no actual Native item ID or WWW activity ID is available; never put labels, filenames, summaries or test names in evidence.",
			"If no action or external check is needed, skip EXECUTE/VERIFY with an honest reason. Tool names do not dictate stages. Respect existing permissions for every external mutation.",
			"For DELIVER report running then provide the normal final answer. WWW records chat delivery. Put external delivery records in deliveries: [{target, artifact, evidence}]. Never place target or artifact at the report top level, and never claim a publication without a real result.",
		],
		...(version === 4 ? {
			example: { requestId, checkpoint: "UNDERSTAND", summary: "Public request understanding", goal: "Concise outcome", planRequired: false, planReason: "One direct answer is sufficient" },
			resultShape: { requestId, checkpoint: "RESULT", summary: "Observed work and response outcome" },
		} : version === 1 ? {
			example: { requestId, checkpoint: "INTENT", summary: "Public intent and success condition", goal: "Concise outcome" },
			workShape: { requestId, checkpoint: "WORK", summary: "Observed work result", evidence: ["change activity ID"], verification: ["check activity ID"] },
		} : {
			example       : { requestId, stage: "UNDERSTAND", status: "completed", summary: "Public intent, constraints and success", goal: "Concise outcome derived from the understood request", input: ["user request"], agents: [], tools: [], evidence: [] },
			planShape     : [{ stage: "VERIFY", tasks: [{ id: "blackbox", title: "Run the real user command", status: "pending", dependsOn: [], verification: { kind: "black-box", purpose: "Prove the requested behavior through the public interface" } }] }],
			decisionShape : { decision: "public choice", rationale: "brief justification", selectedApproach: "approach", rejectedAlternatives: [], executionPlan: ["action"] },
			deliveryShape : { deliveries: [{ target: "github | files | another target", artifact: "actual identity", evidence: ["actual item ID"] }] },
		}),
	}) };
}
