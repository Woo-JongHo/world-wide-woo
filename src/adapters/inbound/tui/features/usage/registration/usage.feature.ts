import type { TuiFeatureDescriptor } from "@/adapters/inbound/tui/features/feature.types";
import { usageUnits }                from "@/adapters/inbound/tui/features/usage/registration/usage.units";

export const usageFeature = {
	id           : "TUI-F009",
	key          : "usage",
	title        : "Usage",
	order        : 90,
	kind         : "embedded",
	productGroup : "observability",
	status       : "active",
	units        : usageUnits,
} as const satisfies TuiFeatureDescriptor;
