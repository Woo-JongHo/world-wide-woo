import type { TuiFeatureDescriptor } from "../feature.types";
import { contextUnits } from "./context.units";

export const contextFeature = {
	id: "TUI-F011",
	key: "context",
	title: "Context",
	order: 110,
	kind: "page",
	route: "context",
	status: "active",
	units: contextUnits,
} as const satisfies TuiFeatureDescriptor;
