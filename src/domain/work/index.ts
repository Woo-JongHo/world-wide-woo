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
} from "./traceability.js";
export {
	validateWorkTraceabilityManifest,
	type WorkTraceabilityPathProbe,
} from "./traceability-validator.js";
export {
	classifyWorkActivity,
	type WorkActivityClass,
} from "./activity-classification.js";
export {
	projectNativeDelegation,
	type NativeDelegatedTask,
	type NativeDelegationActivity,
	type NativeDelegationProjection,
	type NativeDelegationStatus,
} from "./delegation.js";
export * from "./workflow-projection.js";
