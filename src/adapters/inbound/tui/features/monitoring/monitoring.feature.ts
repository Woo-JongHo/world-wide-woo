import type { TuiFeatureDescriptor } from "../feature.types";
import { monitoringUnits } from "./monitoring.units";

export const monitoringFeature = {
	id: "TUI-F006",
	key: "monitor",
	title: "Monitor",
	order: 60,
	kind: "page",
	route: "monitor",
	status: "active",
	units: monitoringUnits,
} as const satisfies TuiFeatureDescriptor;
