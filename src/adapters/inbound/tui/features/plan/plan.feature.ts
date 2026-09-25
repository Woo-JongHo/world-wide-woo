import type { TuiFeatureDescriptor } from "@/adapters/inbound/tui/features/feature.types";
import { planUnits }                 from "@/adapters/inbound/tui/features/plan/plan.units";

export const PLAN_FEATURE = {
	id     : "TUI-F003",
	key    : "plan",
	title  : "Plan",
	order  : 30,
	kind   : "page",
	route  : "plan",
	status : "active",
	units  : planUnits,
} as const satisfies TuiFeatureDescriptor;
