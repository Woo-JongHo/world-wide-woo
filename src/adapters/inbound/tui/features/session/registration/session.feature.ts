import type { TuiFeatureDescriptor } from "@/adapters/inbound/tui/features/feature.types";
import { sessionUnits }              from "@/adapters/inbound/tui/features/session/registration/session.units";

export const sessionFeature = {
	id           : "TUI-F007",
	key          : "session",
	title        : "Session",
	order        : 70,
	kind         : "interaction",
	productGroup : "control",
	status       : "active",
	units        : sessionUnits,
} as const satisfies TuiFeatureDescriptor;
