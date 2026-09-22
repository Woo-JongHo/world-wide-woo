import type { TuiFeatureDescriptor } from "../feature.types";
import { cacheUnits } from "./cache.units";

export const cacheFeature = {
	id: "TUI-F018",
	key: "cache",
	title: "Cache",
	order: 120,
	kind: "page",
	route: "cache",
	status: "active",
	units: cacheUnits,
} as const satisfies TuiFeatureDescriptor;
