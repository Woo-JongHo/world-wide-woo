import { REQUEST_STAGES }                    from "@/core/domain/execution/request-runtime";
import type { NativeAdditionalContextEntry } from "@/core/domain/execution/native-session";

/** Public results and plans; Native retains its own private reasoning and workers. */
export function requestProtocolContext(requestId: string, version: 1 | 2 = 1): NativeAdditionalContextEntry {
	return { kind: "application", value: JSON.stringify({
		protocol: "www-request-runtime", version, requestId, stages: REQUEST_STAGES,
		instructions: [
			"Keep internal reasoning private. Choose your own workers, capabilities and implementation methods. Record public results only, never chain of thought.",
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
			"UNDERSTAND records intent/constraints/success. DECOMPOSE records stage task breakdown. GROUND obtains evidence or states why supplied context is sufficient. DECIDE needs decision, rationale (brief public justification), selectedApproach, rejectedAlternatives and executionPlan.",
			"EXECUTE completed requires actual tool/file-change evidence IDs. VERIFY completed requires actual check/read-back evidence IDs. Use Native item IDs or WWW activity IDs from this turn; never invent IDs or use future results. Stage completion means work recorded, not independent certification.",
			"If no action or external check is needed, skip EXECUTE/VERIFY with an honest reason. Tool names do not dictate stages. Respect existing permissions for every external mutation.",
			"For DELIVER report running then provide the normal final answer. WWW records chat delivery. External deliveries need target, artifact and actual tool/read-back evidence. Never claim a publication without a real result.",
		],
		example       : { requestId, stage: "UNDERSTAND", status: "completed", summary: "Public intent, constraints and success", input: ["user request"], agents: [], tools: [], evidence: [] },
		planShape     : [{ stage: "VERIFY", tasks: [{ id: "blackbox", title: "Run the real user command", status: "pending", dependsOn: [], verification: { kind: "black-box", purpose: "Prove the requested behavior through the public interface" } }] }],
		decisionShape : { decision: "public choice", rationale: "brief justification", selectedApproach: "approach", rejectedAlternatives: [], executionPlan: ["action"] },
		deliveryShape : { target: "linear | github | obsidian | files | another target", artifact: "actual identity", evidence: ["actual item ID"] },
	}) };
}
