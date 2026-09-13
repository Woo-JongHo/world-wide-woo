import type { TuiFeatureDescriptor } from "../feature.types";
import { statsUnits } from "./stats.units";

export const statsFeature = {
	id: "TUI-F008",
	key: "stats",
	title: "Stats",
	order: 80,
	kind: "page",
	route: "stats",
	status: "active",
	units: statsUnits,
} as const satisfies TuiFeatureDescriptor;
