import type { TuiFeatureDescriptor } from "@/adapters/inbound/tui/features/feature.types";
import { monitoringUnits }           from "@/adapters/inbound/tui/features/monitoring/registration/monitoring.units";

export const monitoringFeature = {
	id           : "TUI-F006",
	key          : "monitor",
	title        : "Monitor",
	order        : 60,
	kind         : "page",
	productGroup : "observability",
	route        : "monitor",
	status       : "active",
	units        : monitoringUnits,
} as const satisfies TuiFeatureDescriptor;
