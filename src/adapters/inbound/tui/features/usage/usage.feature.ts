import type { TuiFeatureDescriptor } from "@/adapters/inbound/tui/features/feature.types";
import { usageUnits }                from "@/adapters/inbound/tui/features/usage/usage.units";

export const usageFeature = {
	id     : "TUI-F009",
	key    : "usage",
	title  : "Usage",
	order  : 90,
	kind   : "embedded",
	status : "active",
	units  : usageUnits,
} as const satisfies TuiFeatureDescriptor;
