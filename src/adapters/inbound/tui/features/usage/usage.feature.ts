import type { TuiFeatureDescriptor } from "../feature.types";
import { usageUnits } from "./usage.units";

export const usageFeature = {
	id: "TUI-F009",
	key: "usage",
	title: "Usage",
	order: 90,
	kind: "embedded",
	status: "active",
	units: usageUnits,
} as const satisfies TuiFeatureDescriptor;
