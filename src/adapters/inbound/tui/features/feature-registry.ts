import { approvalFeature }       from "@/adapters/inbound/tui/features/approval/registration/approval.feature";
import { authenticationFeature } from "@/adapters/inbound/tui/features/authentication/registration/authentication.feature";
import { CHAT_FEATURE }          from "@/adapters/inbound/tui/features/chat/registration/chat.feature";
import { cacheFeature }          from "@/adapters/inbound/tui/features/cache/registration/cache.feature";
import { contextFeature }        from "@/adapters/inbound/tui/features/context/registration/context.feature";
import { dashboardFeature }      from "@/adapters/inbound/tui/features/dashboard/registration/dashboard.feature";
import { modelSelectionFeature } from "@/adapters/inbound/tui/features/model-selection/registration/model-selection.feature";
import { monitoringFeature }     from "@/adapters/inbound/tui/features/monitoring/registration/monitoring.feature";
import { PLAN_FEATURE }          from "@/adapters/inbound/tui/features/plan/registration/plan.feature";
import { projectMapFeature }     from "@/adapters/inbound/tui/features/project-map/registration/project-map.feature";
import { repositoryFeature }     from "@/adapters/inbound/tui/features/repository/registration/repository.feature";
import { sessionFeature }        from "@/adapters/inbound/tui/features/session/registration/session.feature";
import { statsFeature }          from "@/adapters/inbound/tui/features/stats/registration/stats.feature";
import { testFeature }           from "@/adapters/inbound/tui/features/test/registration/test.feature";
import { TNOTE_FEATURE }         from "@/adapters/inbound/tui/features/tnote/registration/tnote.feature";
import { TRACE_FEATURE }         from "@/adapters/inbound/tui/features/trace/registration/trace.feature";
import { usageFeature }          from "@/adapters/inbound/tui/features/usage/registration/usage.feature";
import { workflowFeature }       from "@/adapters/inbound/tui/features/workflow/registration/workflow.feature";
import type {
	TuiFeatureDescriptor,
	TuiFeatureId,
	TuiFeatureProductGroup,
	TuiFeatureUnitDescriptor,
	TuiFeatureUnitId,
} from "@/adapters/inbound/tui/features/feature.types";

/** Static capability catalog. Runtime component construction remains in the shell. */
const FEATURE_CATALOG = [
	dashboardFeature,
	CHAT_FEATURE,
	PLAN_FEATURE,
	workflowFeature,
	TNOTE_FEATURE,
	TRACE_FEATURE,
	monitoringFeature,
	sessionFeature,
	statsFeature,
	usageFeature,
	projectMapFeature,
	contextFeature,
	cacheFeature,
	testFeature,
	approvalFeature,
	authenticationFeature,
	modelSelectionFeature,
	repositoryFeature,
] as const satisfies readonly TuiFeatureDescriptor[];

/** Display order is not identity: same-order features resolve by their stable catalog key. */
function compareFeatureDisplayOrder(left: TuiFeatureDescriptor, right: TuiFeatureDescriptor): number {
	if (left.order !== right.order) return left.order - right.order;
	if (left.key < right.key) return -1;
	if (left.key > right.key) return 1;
	return 0;
}

export const TUI_FEATURES = Object.freeze(
	[...FEATURE_CATALOG].sort(compareFeatureDisplayOrder),
) satisfies readonly TuiFeatureDescriptor[];

/** Retired IDs stay reserved here after their descriptors leave the navigable catalog. */
export const TUI_RETIRED_FEATURE_UNIT_IDS = Object.freeze(
	[] as const satisfies readonly TuiFeatureUnitId[],
);

export const TUI_FEATURE_UNITS = Object.freeze(
	TUI_FEATURES.flatMap((feature) => [...feature.units]),
) satisfies readonly TuiFeatureUnitDescriptor[];

const RETIRED_UNIT_IDS = new Set<TuiFeatureUnitId>(TUI_RETIRED_FEATURE_UNIT_IDS);
for (const unit of TUI_FEATURE_UNITS) {
	if (RETIRED_UNIT_IDS.has(unit.id)) {
		throw new Error(`retired TUI feature Unit ID was reused: ${unit.id}`);
	}
}

const FEATURES_BY_ID = new Map<TuiFeatureId, TuiFeatureDescriptor>(
	TUI_FEATURES.map((feature) => [feature.id, feature]),
);
const FEATURES_BY_KEY = new Map<string, TuiFeatureDescriptor>(
	TUI_FEATURES.map((feature) => [feature.key, feature]),
);
const UNITS_BY_ID = new Map<TuiFeatureUnitId, TuiFeatureUnitDescriptor>(
	TUI_FEATURE_UNITS.map((unit) => [unit.id, unit]),
);
const UNITS_BY_FEATURE_ID = new Map<TuiFeatureId, readonly TuiFeatureUnitDescriptor[]>(
	TUI_FEATURES.map((feature) => [feature.id, feature.units]),
);
const FEATURES_BY_PRODUCT_GROUP = new Map<TuiFeatureProductGroup, readonly TuiFeatureDescriptor[]>(
	(["core-work", "observability", "control", "integration"] as const).map((productGroup) => [
		productGroup,
		TUI_FEATURES.filter((feature) => feature.productGroup === productGroup),
	]),
);

assertUnique(TUI_FEATURES.map((feature) => feature.id), "TUI Feature ID");
assertUnique(TUI_FEATURES.map((feature) => feature.key), "TUI Feature key");
assertUnique(TUI_FEATURE_UNITS.map((unit) => unit.id), "TUI Feature Unit ID");

export function tuiFeatureById(id: TuiFeatureId): TuiFeatureDescriptor | undefined {
	return FEATURES_BY_ID.get(id);
}

export function tuiFeatureByKey(key: string): TuiFeatureDescriptor | undefined {
	return FEATURES_BY_KEY.get(key);
}

export function tuiFeatureUnitById(id: TuiFeatureUnitId): TuiFeatureUnitDescriptor | undefined {
	return UNITS_BY_ID.get(id);
}

export function tuiFeatureUnitsByFeatureId(featureId: TuiFeatureId): readonly TuiFeatureUnitDescriptor[] {
	return UNITS_BY_FEATURE_ID.get(featureId) ?? [];
}

export function tuiFeaturesByProductGroup(productGroup: TuiFeatureProductGroup): readonly TuiFeatureDescriptor[] {
	return FEATURES_BY_PRODUCT_GROUP.get(productGroup) ?? [];
}

function assertUnique(values: readonly string[], label: string): void {
	if (new Set(values).size !== values.length) throw new Error(`duplicate ${label} in TUI Feature catalog`);
}
