import type { TuiFeatureDescriptor } from "../feature.types";
import { workflowUnits } from "./workflow.units";

export const workflowFeature = {
	id: "TUI-F017",
	key: "workflow",
	title: "Workflow",
	order: 35,
	kind: "page",
	route: "workflow",
	status: "active",
	units: workflowUnits,
} as const satisfies TuiFeatureDescriptor;
