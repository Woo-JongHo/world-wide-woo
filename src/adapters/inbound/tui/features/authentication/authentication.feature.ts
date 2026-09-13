import type { TuiFeatureDescriptor } from "../feature.types";
import { authenticationUnits } from "./authentication.units";

export const authenticationFeature = {
	id: "TUI-F014",
	key: "authentication",
	title: "인증",
	order: 140,
	kind: "interaction",
	status: "active",
	units: authenticationUnits,
} as const satisfies TuiFeatureDescriptor;
