import { approvalFeature }       from "@/adapters/inbound/tui/features/approval/approval.feature";
import { authenticationFeature } from "@/adapters/inbound/tui/features/authentication/authentication.feature";
import { CHAT_FEATURE }          from "@/adapters/inbound/tui/features/chat/chat.feature";
import { cacheFeature }          from "@/adapters/inbound/tui/features/cache/cache.feature";
import { contextFeature }        from "@/adapters/inbound/tui/features/context/context.feature";
import { dashboardFeature }      from "@/adapters/inbound/tui/features/dashboard/dashboard.feature";
import { modelSelectionFeature } from "@/adapters/inbound/tui/features/model-selection/model-selection.feature";
import { monitoringFeature }     from "@/adapters/inbound/tui/features/monitoring/monitoring.feature";
import { PLAN_FEATURE }          from "@/adapters/inbound/tui/features/plan/plan.feature";
import { projectMapFeature }     from "@/adapters/inbound/tui/features/project-map/project-map.feature";
import { repositoryFeature }     from "@/adapters/inbound/tui/features/repository/repository.feature";
import { sessionFeature }        from "@/adapters/inbound/tui/features/session/session.feature";
import { statsFeature }          from "@/adapters/inbound/tui/features/stats/stats.feature";
import { testFeature }           from "@/adapters/inbound/tui/features/test/test.feature";
import { TNOTE_FEATURE }         from "@/adapters/inbound/tui/features/tnote/tnote.feature";
import { TRACE_FEATURE }         from "@/adapters/inbound/tui/features/trace/trace.feature";
import { usageFeature }          from "@/adapters/inbound/tui/features/usage/usage.feature";
import { workflowFeature }       from "@/adapters/inbound/tui/features/workflow/workflow.feature";
import type {
	TuiFeatureDescriptor,
	TuiFeatureId,
	TuiFeatureUnitDescriptor,
	TuiFeatureUnitId,
} from "@/adapters/inbound/tui/features/feature.types";

/** Static capability catalog. Runtime component construction remains in the shell. */
export const TUI_FEATURES = Object.freeze([
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
] as const satisfies readonly TuiFeatureDescriptor[]);

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
