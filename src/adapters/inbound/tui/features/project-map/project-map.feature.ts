import type { TuiFeatureDescriptor } from "../feature.types";
import { projectMapUnits } from "./project-map.units";

export const projectMapFeature = {
	id: "TUI-F010",
	key: "map",
	title: "Project Map",
	order: 100,
	kind: "page",
	route: "map",
	status: "active",
	units: projectMapUnits,
} as const satisfies TuiFeatureDescriptor;
