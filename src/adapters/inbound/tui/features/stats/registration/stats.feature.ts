import type { TuiFeatureDescriptor } from "@/adapters/inbound/tui/features/feature.types";
import { statsUnits }                from "@/adapters/inbound/tui/features/stats/registration/stats.units";

export const statsFeature = {
	id           : "TUI-F008",
	key          : "stats",
	title        : "Stats",
	order        : 80,
	kind         : "page",
	productGroup : "observability",
	route        : "stats",
	status       : "active",
	units        : statsUnits,
} as const satisfies TuiFeatureDescriptor;
