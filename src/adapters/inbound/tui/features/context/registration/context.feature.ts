import type { TuiFeatureDescriptor } from "@/adapters/inbound/tui/features/feature.types";
import { contextUnits }              from "@/adapters/inbound/tui/features/context/registration/context.units";

export const contextFeature = {
	id           : "TUI-F011",
	key          : "context",
	title        : "Context",
	order        : 110,
	kind         : "page",
	productGroup : "control",
	route        : "context",
	status       : "active",
	units        : contextUnits,
} as const satisfies TuiFeatureDescriptor;
