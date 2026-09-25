import type { TuiFeatureDescriptor } from "@/adapters/inbound/tui/features/feature.types";
import { cacheUnits }                from "@/adapters/inbound/tui/features/cache/cache.units";

export const cacheFeature = {
	id     : "TUI-F018",
	key    : "cache",
	title  : "Cache",
	order  : 120,
	kind   : "page",
	route  : "cache",
	status : "active",
	units  : cacheUnits,
} as const satisfies TuiFeatureDescriptor;
