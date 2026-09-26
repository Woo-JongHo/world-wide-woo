import type { TuiFeatureDescriptor } from "@/adapters/inbound/tui/features/feature.types";
import { cacheUnits }                from "@/adapters/inbound/tui/features/cache/registration/cache.units";

export const cacheFeature = {
	id           : "TUI-F018",
	key          : "cache",
	title        : "Cache",
	order        : 120,
	kind         : "page",
	productGroup : "observability",
	route        : "cache",
	status       : "active",
	units        : cacheUnits,
} as const satisfies TuiFeatureDescriptor;
