import type { TuiFeatureDescriptor } from "../feature.types";
import { sessionUnits } from "./session.units";

export const sessionFeature = {
	id: "TUI-F007",
	key: "session",
	title: "Session",
	order: 70,
	kind: "interaction",
	status: "active",
	units: sessionUnits,
} as const satisfies TuiFeatureDescriptor;
