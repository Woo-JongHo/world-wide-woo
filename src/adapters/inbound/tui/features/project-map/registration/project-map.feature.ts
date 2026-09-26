import type { TuiFeatureDescriptor } from "@/adapters/inbound/tui/features/feature.types";
import { projectMapUnits }           from "@/adapters/inbound/tui/features/project-map/registration/project-map.units";

export const projectMapFeature = {
	id           : "TUI-F010",
	key          : "map",
	title        : "Project Map",
	order        : 100,
	kind         : "page",
	productGroup : "core-work",
	route        : "map",
	status       : "active",
	units        : projectMapUnits,
} as const satisfies TuiFeatureDescriptor;
