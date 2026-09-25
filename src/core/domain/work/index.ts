export {
	WORK_REFERENCE_KINDS,
	isRepositoryPathReference,
	parseWorkTraceabilityManifest,
	referenceKey,
	relatedWorkReferences,
	type LinearIssueReference,
	type WorkReference,
	type WorkReferenceKind,
	type WorkTraceabilityLink,
	type WorkTraceabilityManifest,
} from "@/core/domain/work/traceability.js";
export {
	validateWorkTraceabilityManifest,
	type WorkTraceabilityPathProbe,
} from "@/core/domain/work/traceability-validator.js";
export {
	classifyWorkActivity,
	type WorkActivityClass,
} from "@/core/domain/work/activity-classification.js";
export {
	projectNativeDelegation,
	type NativeDelegatedTask,
	type NativeDelegationActivity,
	type NativeDelegationProjection,
	type NativeDelegationStatus,
} from "@/core/domain/work/delegation.js";
export * from "@/core/domain/work/workflow-projection.js";
