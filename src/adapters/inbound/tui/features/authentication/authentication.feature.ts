import type { TuiFeatureDescriptor } from "@/adapters/inbound/tui/features/feature.types";
import { authenticationUnits }       from "@/adapters/inbound/tui/features/authentication/authentication.units";

export const authenticationFeature = {
	id     : "TUI-F014",
	key    : "authentication",
	title  : "인증",
	order  : 140,
	kind   : "interaction",
	status : "active",
	units  : authenticationUnits,
} as const satisfies TuiFeatureDescriptor;
