import type { TuiFeatureDescriptor } from "@/adapters/inbound/tui/features/feature.types";
import { monitoringUnits }           from "@/adapters/inbound/tui/features/monitoring/monitoring.units";

export const monitoringFeature = {
	id     : "TUI-F006",
	key    : "monitor",
	title  : "Monitor",
	order  : 60,
	kind   : "page",
	route  : "monitor",
	status : "active",
	units  : monitoringUnits,
} as const satisfies TuiFeatureDescriptor;
